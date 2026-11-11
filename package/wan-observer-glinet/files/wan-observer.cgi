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

-- Match the fixed quality CLI protocol before reflecting its raw JSON. CJSON 2.1
-- cannot distinguish empty arrays from objects, but the series always has 180 bins.
local function finite(value, maximum)
    return type(value) == 'number' and value >= 0 and value <= maximum
end
local function integer(value, maximum)
    return finite(value, maximum) and value % 1 == 0
end
local function exact_fields(value, names)
    if not object(value) then return false end
    local allowed = {}
    for name in names:gmatch('%S+') do
        allowed[name] = true
        if value[name] == nil then return false end
    end
    for name in pairs(value) do if not allowed[name] then return false end end
    return true
end
local function metrics(value, limits)
    if not object(value) then return false end
    for field, maximum in pairs(limits) do
        if not finite(value[field], maximum) then return false end
    end
    for field in pairs(value) do if not limits[field] then return false end end
    return true
end
local responsiveness_limits = { wan_gateway_latency=3600000, internet_latency=3600000,
    dns_lookup_latency=3600000, typical_latency=3600000, worst_latency=3600000,
    jitter_latency=3600000, score=100 }
local function observation(value)
    if not exact_fields(value, 'schema source sampled_at source_freshness state error_category responsiveness reliability rate_native')
        or value.schema ~= 1 or value.source ~= 'gl-inet-network-quality'
        or value.source_freshness ~= 'unknown' or not integer(value.sampled_at, 4102444799) then return false end
    if value.state == 'available' then
        return value.error_category == json.null and metrics(value.responsiveness, responsiveness_limits)
            and metrics(value.reliability, { score=100, packet_loss_percent=100 })
            and metrics(value.rate_native, { total_current=1e12, upload_current=1e12, download_current=1e12 })
    end
    local category = ({ unsupported='source_unavailable', disabled='native_disabled' })[value.state]
    local failed = value.state == 'error' and
        ({ enable_state_unknown=true, snapshot_failed=true, invalid_snapshot=true })[value.error_category]
    return (failed or (category ~= nil and value.error_category == category))
        and value.responsiveness == json.null and value.reliability == json.null and value.rate_native == json.null
end
local function quality_status_valid(value)
    if not exact_fields(value, 'state source source_freshness current_observation latest_observation sample_count retention_days max_samples_per_day')
        or value.source ~= 'gl-inet-network-quality' or value.source_freshness ~= 'unknown'
        or not integer(value.retention_days, 30) or value.retention_days < 1
        or value.max_samples_per_day ~= 1440
        or not integer(value.sample_count, value.retention_days * 1440)
        or not observation(value.current_observation) or value.current_observation.state ~= value.state then return false end
    if value.sample_count == 0 then return value.latest_observation == json.null end
    return observation(value.latest_observation)
end
local function quality_series_valid(value, period)
    if not exact_fields(value, 'source source_freshness start_epoch end_epoch observed_since_epoch observations available_count error_count points')
        or value.source ~= 'gl-inet-network-quality' or value.source_freshness ~= 'unknown'
        or not integer(value.start_epoch, 4102444800) or not integer(value.end_epoch, 4102444800)
        or value.end_epoch - value.start_epoch ~= period * 86400
        or not (value.observed_since_epoch == json.null or integer(value.observed_since_epoch, 4102444799))
        or not integer(value.observations, 43200) or not integer(value.available_count, value.observations)
        or not integer(value.error_count, value.observations)
        or value.available_count + value.error_count ~= value.observations
        or type(value.points) ~= 'table' then return false end
    local count = 0
    for key in pairs(value.points) do
        if not integer(key, 180) or key < 1 then return false end
        count = count + 1
    end
    if count ~= 180 then return false end
    local step = math.ceil(period * 1440 / 180) * 60
    local samples, valid = 0, 0
    for index=1,180 do
        local point = value.points[index]
        if not exact_fields(point, 'epoch sample_count valid_count latency_median_ms jitter_median_ms loss_max_percent dns_median_ms')
            or point.epoch ~= value.start_epoch + (index - 1) * step
            or not integer(point.sample_count, 43200) or not integer(point.valid_count, point.sample_count) then return false end
        for _, field in ipairs({ 'latency_median_ms', 'jitter_median_ms', 'loss_max_percent', 'dns_median_ms' }) do
            local metric = point[field]
            if point.valid_count == 0 then
                if metric ~= json.null then return false end
            elseif not finite(metric, field == 'loss_max_percent' and 100 or 3600000) then return false end
        end
        samples, valid = samples + point.sample_count, valid + point.valid_count
    end
    return samples == value.observations and valid == value.available_count
end

local method = os.getenv('REQUEST_METHOD')
if method == 'GET' then
    local query = os.getenv('QUERY_STRING') or ''
    local period = ({ [''] = 7, ['period=1'] = 1, ['period=7'] = 7, ['period=30'] = 30 })[query]
    if not period then return reply('400 Bad Request', '{"error":"Invalid period"}') end
    local readiness = decode_object(run('/usr/bin/wan-observer-readiness'))
    if not object(readiness) or type(readiness.status) ~= 'string' then
        return reply('503 Service Unavailable', '{"error":"Readiness unavailable"}')
    end
    if readiness.status == 'config_missing' or readiness.status == 'config_invalid' then
        return reply('200 OK', '{"collector":null,"measurements":[],"quality":{"status":{"state":"unconfigured","source_freshness":"unknown"},"series":null},"readiness":' .. json.encode(readiness) .. '}')
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
    local quality = '{"status":{"state":"disabled","source_freshness":"unknown"},"series":null}'
    if collector.config.quality_history_enabled == true then
        local status_json = run('/usr/bin/wan-observer-quality status')
        local series_json = run('/usr/bin/wan-observer-quality series ' .. tostring(period))
        local quality_status, series = decode_object(status_json), decode_object(series_json)
        if quality_status_valid(quality_status) and quality_series_valid(series, period) then
            quality = '{"status":' .. status_json .. ',"series":' .. series_json .. '}'
        else
            quality = '{"status":{"state":"unavailable","source_freshness":"unknown"},"series":null}'
        end
    end
    return reply('200 OK', '{"collector":' .. collector_json .. ',"measurements":[' .. table.concat(rows, ',') .. '],"quality":' .. quality .. ',"readiness":' .. json.encode(readiness) .. '}')
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
        local current = decode_object(run('/usr/bin/wan-observer-collect status'))
        if current and current.busy ~= true and object(current.usage) then
            if current.usage.budget_state == 'reached' then
                return reply('409 Conflict', '{"code":"budget_reached","error":"Monthly test budget reached. Review the budget in Settings before starting another test."}')
            elseif current.usage.budget_state == 'unknown' then
                return reply('409 Conflict', '{"code":"budget_unknown","error":"Test-byte accounting is unknown. Review usage accounting before starting another test."}')
            end
        end
        return reply('409 Conflict', '{"error":"Collector is busy or unavailable. Wait a moment and try again."}')
    end
    return reply('202 Accepted', '{"started":true}')
end
local fields = { enabled = 'boolean', adaptive = 'boolean', interval_minutes = 'number',
    start_hour = 'number', end_hour = 'number' }
local function invalid()
    return reply('400 Bad Request', '{"error":"Invalid schedule"}')
end
local optional = { quality_history_enabled = 'boolean', window_timezone = 'string',
    threshold_percent = 'number', monthly_budget_bytes = 'number' }
for field, expected in pairs(optional) do
    if data[field] ~= nil then fields[field] = expected end
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
local intervals = { [15]=true, [30]=true, [60]=true, [120]=true,
    [180]=true, [240]=true, [360]=true, [720]=true }
if not intervals[interval] then return invalid() end
if data.start_hour % 1 ~= 0 or data.end_hour % 1 ~= 0 or data.start_hour < 0
    or data.start_hour > 23 or data.end_hour < 1 or data.end_hour > 24
    or data.start_hour == data.end_hour then return invalid() end
if data.window_timezone ~= nil and data.window_timezone ~= 'UTC' and data.window_timezone ~= 'router' then return invalid() end
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
if data.quality_history_enabled ~= nil then
    body = body .. ',"quality_history_enabled":' .. tostring(data.quality_history_enabled)
end
if data.window_timezone ~= nil then
    -- Only the two fixed enum values can reach this string position.
    body = body .. ',"window_timezone":"' .. data.window_timezone .. '"'
end
for _, field in ipairs({ 'threshold_percent', 'monthly_budget_bytes' }) do
    local value = data[field]
    if value ~= nil then
        local minimum, maximum = 1, 100
        if field == 'monthly_budget_bytes' then minimum, maximum = 0, 9007199254740991 end
        if value % 1 ~= 0 or value < minimum or value > maximum then return invalid() end
        -- Lua 5.1 %d may narrow to a platform integer; cjson defaults to 14 digits.
        body = body .. ',"' .. field .. '":' .. string.format('%.0f', value)
    end
end
body = body .. '}'
local result = run("printf '%s' '" .. body .. "' | /usr/bin/wan-observer-collect schedule")
if result ~= 'Collector configuration saved.\n' and result ~= 'Collector configuration unchanged.\n' then
    return reply('409 Conflict', '{"error":"Settings unavailable. Retry after the current test finishes."}')
end
return reply('200 OK', '{"saved":true}')
