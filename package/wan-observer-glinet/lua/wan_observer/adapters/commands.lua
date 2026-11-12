-- SPDX-License-Identifier: MIT
local schedule = require('wan_observer.contracts.schedule')

local function run(command)
  local opened, pipe = pcall(io.popen, '(' .. command .. ') 2>/dev/null', 'r')
  if not opened or not pipe then
    return nil
  end
  local read, output = pcall(pipe.read, pipe, '*a')
  pcall(pipe.close, pipe)
  if not read then
    return nil
  end
  return output
end

local function qualitySeries(period)
  if period ~= 1 and period ~= 7 and period ~= 30 then
    return nil
  end
  return run('/usr/bin/wan-observer-quality series ' .. tostring(period))
end

local function saveSchedule(data)
  local body = schedule.encode(data)
  if not body then
    return nil
  end
  return run("printf '%s' '" .. body .. "' | /usr/bin/wan-observer-collect schedule")
end

return {
  readiness = function()
    return run('/usr/bin/wan-observer-readiness')
  end,
  collectorStatus = function()
    return run('/usr/bin/wan-observer-collect status')
  end,
  history = function()
    return run('/usr/bin/wan-observer list && printf "\\nEND\\n"')
  end,
  qualityStatus = function()
    return run('/usr/bin/wan-observer-quality status')
  end,
  qualitySeries = qualitySeries,
  start = function()
    return run('/usr/bin/wan-observer-collect start')
  end,
  saveSchedule = saveSchedule,
}
