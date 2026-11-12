-- SPDX-License-Identifier: MIT
local function encode(data)
  if type(data) ~= 'table' then
    return nil
  end
  local fields = {
    enabled = 'boolean',
    adaptive = 'boolean',
    interval_minutes = 'number',
    start_hour = 'number',
    end_hour = 'number',
  }
  local optional = {
    quality_history_enabled = 'boolean',
    window_timezone = 'string',
    threshold_percent = 'number',
    monthly_budget_bytes = 'number',
  }
  for field, expected in pairs(optional) do
    if data[field] ~= nil then
      fields[field] = expected
    end
  end
  -- Plan speeds are optional for older clients, but must be supplied together.
  local plan = data.download_mbps ~= nil or data.upload_mbps ~= nil
  if plan then
    fields.download_mbps = 'number'
    fields.upload_mbps = 'number'
  end
  for field in pairs(data) do
    if not fields[field] then
      return nil
    end
  end
  for field, expected in pairs(fields) do
    if type(data[field]) ~= expected then
      return nil
    end
  end
  local interval = data.interval_minutes
  local intervals = {
    [15] = true,
    [30] = true,
    [60] = true,
    [120] = true,
    [180] = true,
    [240] = true,
    [360] = true,
    [720] = true,
  }
  if not intervals[interval] then
    return nil
  end
  if
    data.start_hour % 1 ~= 0
    or data.end_hour % 1 ~= 0
    or data.start_hour < 0
    or data.start_hour > 23
    or data.end_hour < 1
    or data.end_hour > 24
    or data.start_hour == data.end_hour
  then
    return nil
  end
  if
    data.window_timezone ~= nil
    and data.window_timezone ~= 'UTC'
    and data.window_timezone ~= 'router'
  then
    return nil
  end
  -- Rebuild the shell input from validated booleans and bounded integers only.
  local body = string.format(
    '{"enabled":%s,"adaptive":%s,"interval_minutes":%d,"start_hour":%d,"end_hour":%d',
    tostring(data.enabled),
    tostring(data.adaptive),
    interval,
    data.start_hour,
    data.end_hour
  )
  if plan then
    for _, field in ipairs({ 'download_mbps', 'upload_mbps' }) do
      local value = data[field]
      if value % 1 ~= 0 or value < 1 or value > 100000 then
        return nil
      end
    end
    body = body
      .. string.format(',"download_mbps":%d,"upload_mbps":%d', data.download_mbps, data.upload_mbps)
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
      if field == 'monthly_budget_bytes' then
        minimum, maximum = 0, 9007199254740991
      end
      if value % 1 ~= 0 or value < minimum or value > maximum then
        return nil
      end
      -- Lua 5.1 %d may narrow to a platform integer; cjson defaults to 14 digits.
      body = body .. ',"' .. field .. '":' .. string.format('%.0f', value)
    end
  end
  body = body .. '}'

  return body
end

return { encode = encode }
