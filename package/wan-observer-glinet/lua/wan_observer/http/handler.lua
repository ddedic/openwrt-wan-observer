-- SPDX-License-Identifier: MIT
local object = require('wan_observer.contracts.json-object').isObject
local schedule = require('wan_observer.contracts.schedule')

local function reply(status, body)
  io.write(
    'Status: ',
    status,
    '\r\nContent-Type: application/json\r\n',
    'Cache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\n\r\n',
    body,
    '\n'
  )
end

local RESPONSES = {
  signInRequired = { '401 Unauthorized', '{"error":"Sign in to the router"}' },
  sessionUnavailable = {
    '503 Service Unavailable',
    '{"error":"Router session service unavailable"}',
  },
  administratorRequired = { '403 Forbidden', '{"error":"Router administrator required"}' },
  budgetReached = {
    '409 Conflict',
    '{"code":"budget_reached","error":"Monthly test budget reached. Review the budget in Settings before starting another test."}',
  },
  budgetUnknown = {
    '409 Conflict',
    '{"code":"budget_unknown","error":"Test-byte accounting is unknown. Review usage accounting before starting another test."}',
  },
  collectorBusy = {
    '409 Conflict',
    '{"error":"Collector is busy or unavailable. Wait a moment and try again."}',
  },
  started = { '202 Accepted', '{"started":true}' },
  settingsUnavailable = {
    '409 Conflict',
    '{"error":"Settings unavailable. Retry after the current test finishes."}',
  },
  saved = { '200 OK', '{"saved":true}' },
  readinessUnavailable = { '503 Service Unavailable', '{"error":"Readiness unavailable"}' },
  collectorUnavailable = {
    '503 Service Unavailable',
    '{"error":"Collector or history unavailable"}',
  },
}

local function respond(outcome, json)
  if outcome.kind == 'dashboard' then
    return '200 OK',
      '{"collector":' .. outcome.collector .. ',"measurements":[' .. table.concat(
        outcome.measurements,
        ','
      ) .. '],"quality":' .. outcome.quality .. ',"readiness":' .. json.encode(
        outcome.readiness
      ) .. '}'
  end
  local response = RESPONSES[outcome.kind]
  return response[1], response[2]
end

local function handle(getenv, read, json, service)
  local method = getenv('REQUEST_METHOD')
  if method == 'GET' then
    local query = getenv('QUERY_STRING') or ''
    local period = ({ [''] = 7, ['period=1'] = 1, ['period=7'] = 7, ['period=30'] = 30 })[query]
    if not period then
      return '400 Bad Request', '{"error":"Invalid period"}'
    end

    return respond(service.get(period), json)
  end
  if method ~= 'POST' then
    return '405 Method Not Allowed', '{"error":"Method not allowed"}'
  end

  -- The explicit session header is required even when the browser sends a cookie.
  -- Reject cross-origin writes and never offer CORS headers.
  local origin = getenv('HTTP_ORIGIN')
  local host = getenv('HTTP_HOST') or ''
  local scheme = getenv('HTTPS') == 'on' and 'https' or 'http'
  if not origin or host == '' or origin ~= scheme .. '://' .. host then
    return '403 Forbidden', '{"error":"Same-origin request required"}'
  end
  if getenv('CONTENT_TYPE') ~= 'application/json' then
    return '415 Unsupported Media Type', '{"error":"JSON required"}'
  end
  local rawLength = getenv('CONTENT_LENGTH') or ''
  local length = tonumber(rawLength)
  if not rawLength:match('^%d+$') or not length or length < 1 or length > 1024 then
    return '413 Content Too Large', '{"error":"Invalid request size"}'
  end
  local input = read(length) or ''
  local data = json.decode(input)
  if #input ~= length or not input:match('^%s*{') or not object(data) then
    return '400 Bad Request', '{"error":"Invalid request"}'
  end

  if data.action ~= nil then
    if data.action ~= 'run_speedtest' or next(data, next(data)) ~= nil then
      return '400 Bad Request', '{"error":"Invalid action"}'
    end
    return respond(service.start(), json)
  end
  if not schedule.encode(data) then
    return '400 Bad Request', '{"error":"Invalid schedule"}'
  end
  return respond(service.save(data), json)
end

return { handle = handle, reply = reply, respond = respond }
