#!/usr/bin/lua
-- SPDX-License-Identifier: MIT
local function reply(status, body)
    io.write('Status: ', status, '\r\nContent-Type: application/json\r\n',
        'Cache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\n\r\n', body, '\n')
end

local sid = os.getenv('HTTP_X_GL_ADMIN_TOKEN') or ''
if #sid ~= 32 or not sid:match('^[A-Za-z0-9]+$') then
    return reply('401 Unauthorized', '{"error":"Sign in to the router"}')
end

local ok, ubus = pcall(require, 'ubus')
local json_ok, json = pcall(require, 'cjson.safe')
local connected, conn = false, nil
if ok then connected, conn = pcall(ubus.connect, nil, 2) end
if not connected or not conn or not json_ok then
    return reply('503 Service Unavailable', '{"error":"Router session service unavailable"}')
end
-- CJSON otherwise accepts NaN/Infinity, which are invalid JSON and unsafe in checks.
json.decode_invalid_numbers(false)
json.encode_invalid_numbers(false)
local called, session = pcall(conn.call, conn, 'gl-session', 'session', { sid = sid })
pcall(conn.close, conn)
if not called or type(session) ~= 'table' or type(session.username) ~= 'string' then
    return reply('401 Unauthorized', '{"error":"Sign in to the router"}')
end
if session.aclgroup ~= 'root' then
    return reply('403 Forbidden', '{"error":"Router administrator required"}')
end

local function run(command)
    local opened, pipe = pcall(io.popen, '(' .. command .. ') 2>/dev/null', 'r')
    if not opened or not pipe then return nil end
    local read, output = pcall(pipe.read, pipe, '*a')
    pcall(pipe.close, pipe)
    if not read then return nil end
    return output
end

local function object(value)
    return type(value) == 'table' and (next(value) == nil or type(next(value)) == 'string')
end

local function decode_object(input)
    if type(input) ~= 'string' or not input:match('^%s*{') then return nil end
    local value = json.decode(input)
    if object(value) then return value end
end

local method = os.getenv('REQUEST_METHOD')
if method == 'GET' then
    local readiness = decode_object(run('/usr/bin/wan-observer-readiness'))
    if not object(readiness) or type(readiness.status) ~= 'string' then
        return reply('503 Service Unavailable', '{"error":"Readiness unavailable"}')
    end
    if readiness.status == 'config_missing' or readiness.status == 'config_invalid' then
        return reply('200 OK', '{"collector":null,"measurements":[],"readiness":' .. json.encode(readiness) .. '}')
    end
    local collector_json = run('/usr/bin/wan-observer-collect status')
    local collector = decode_object(collector_json)
    local history = run('/usr/bin/wan-observer list && printf "\\nEND\\n"')
    if not object(collector) or not object(collector.config) or not history or history:sub(-5) ~= '\nEND\n' then
        return reply('503 Service Unavailable', '{"error":"Collector or history unavailable"}')
    end
    local rows = {}
    for line in history:sub(1, -6):gmatch('[^\n]+') do
        local row = decode_object(line)
        if not object(row) then
            return reply('503 Service Unavailable', '{"error":"Collector or history unavailable"}')
        end
        -- Preserve validated JSON: CJSON 2.1 loses [] versus {} on round-trip.
        rows[#rows + 1] = line
    end
    return reply('200 OK', '{"collector":' .. collector_json .. ',"measurements":[' .. table.concat(rows, ',') .. '],"readiness":' .. json.encode(readiness) .. '}')
end
if method ~= 'POST' then
    return reply('405 Method Not Allowed', '{"error":"Method not allowed"}')
end

-- The explicit session header is required even when the browser sends a cookie.
-- Reject cross-origin writes and never offer CORS headers.
local origin = os.getenv('HTTP_ORIGIN')
local host = os.getenv('HTTP_HOST') or ''
local scheme = os.getenv('HTTPS') == 'on' and 'https' or 'http'
if not origin or host == '' or origin ~= scheme .. '://' .. host then
    return reply('403 Forbidden', '{"error":"Same-origin request required"}')
end
if os.getenv('CONTENT_TYPE') ~= 'application/json' then
    return reply('415 Unsupported Media Type', '{"error":"JSON required"}')
end
local raw_length = os.getenv('CONTENT_LENGTH') or ''
local length = tonumber(raw_length)
if not raw_length:match('^%d+$') or not length or length < 1 or length > 1024 then
    return reply('413 Content Too Large', '{"error":"Invalid request size"}')
end
local input = io.read(length) or ''
local data = json.decode(input)
if #input ~= length or not input:match('^%s*{') or not object(data) then
    return reply('400 Bad Request', '{"error":"Invalid request"}')
end
-- Fixed action: no request data reaches the shell. The collector lock rejects overlap.
if data.action ~= nil then
    if data.action ~= 'run_speedtest' or next(data, next(data)) ~= nil then
        return reply('400 Bad Request', '{"error":"Invalid action"}')
    end
    if run('/usr/bin/wan-observer-collect start') ~= 'Manual test started.\n' then
        return reply('409 Conflict', '{"error":"A speed test is already running or the collector is unavailable. Try again shortly."}')
    end
    return reply('202 Accepted', '{"started":true}')
end
local fields = { enabled = 'boolean', adaptive = 'boolean', interval_minutes = 'number',
    start_hour = 'number', end_hour = 'number' }
local function invalid()
    return reply('400 Bad Request', '{"error":"Invalid schedule"}')
end
-- Plan speeds are optional for older clients, but must be supplied together.
local plan = data.download_mbps ~= nil or data.upload_mbps ~= nil
if plan then
    fields.download_mbps = 'number'
    fields.upload_mbps = 'number'
end
for field in pairs(data) do
    if not fields[field] then return invalid() end
end
for field, expected in pairs(fields) do
    if type(data[field]) ~= expected then return invalid() end
end
local interval = data.interval_minutes
if interval ~= 15 and interval ~= 30 and interval ~= 60 and interval ~= 120 then return invalid() end
if data.start_hour % 1 ~= 0 or data.end_hour % 1 ~= 0 or data.start_hour < 0
    or data.end_hour > 24 or data.start_hour >= data.end_hour then return invalid() end
-- Rebuild the shell input from validated booleans and bounded integers only.
local body = string.format('{"enabled":%s,"adaptive":%s,"interval_minutes":%d,"start_hour":%d,"end_hour":%d',
    tostring(data.enabled), tostring(data.adaptive), interval, data.start_hour, data.end_hour)
if plan then
    for _, field in ipairs({ 'download_mbps', 'upload_mbps' }) do
        local value = data[field]
        if value % 1 ~= 0 or value < 1 or value > 100000 then return invalid() end
    end
    body = body .. string.format(',"download_mbps":%d,"upload_mbps":%d', data.download_mbps, data.upload_mbps)
end
body = body .. '}'
local result = run("printf '%s' '" .. body .. "' | /usr/bin/wan-observer-collect schedule")
if result ~= 'Collector configuration saved.\n' and result ~= 'Collector configuration unchanged.\n' then
    return reply('409 Conflict', '{"error":"Settings unavailable. Retry after the current test finishes."}')
end
return reply('200 OK', '{"saved":true}')
