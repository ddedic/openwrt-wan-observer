-- SPDX-License-Identifier: MIT
local objects = require('wan_observer.contracts.json-object')
local projection = require('wan_observer.services.quality-projection')

local function new(commands, json)
  local object = objects.isObject
  local function decodeObject(input)
    return objects.decode(json, input)
  end
  local qualityValidation = projection.new(json)

  local function get(period)
    local readiness = decodeObject(commands.readiness())
    if not object(readiness) or type(readiness.status) ~= 'string' then
      return { kind = 'readinessUnavailable' }
    end
    if readiness.status == 'config_missing' or readiness.status == 'config_invalid' then
      return {
        kind = 'dashboard',
        collector = 'null',
        measurements = {},
        quality = '{"status":{"state":"unconfigured","source_freshness":"unknown"},"series":null}',
        readiness = readiness,
      }
    end
    local collectorJson = commands.collectorStatus()
    local collector = decodeObject(collectorJson)
    local history = commands.history()
    if
      not object(collector)
      or not object(collector.config)
      or not history
      or history:sub(-5) ~= '\nEND\n'
    then
      return { kind = 'collectorUnavailable' }
    end
    local rows = {}
    for line in history:sub(1, -6):gmatch('[^\n]+') do
      local row = decodeObject(line)
      if not object(row) then
        return { kind = 'collectorUnavailable' }
      end
      -- Preserve validated JSON: CJSON 2.1 loses [] versus {} on round-trip.
      rows[#rows + 1] = line
    end
    local quality = '{"status":{"state":"disabled","source_freshness":"unknown"},"series":null}'
    if collector.config.quality_history_enabled == true then
      local statusJson = commands.qualityStatus()
      local seriesJson = commands.qualitySeries(period)
      local qualityStatus, series = decodeObject(statusJson), decodeObject(seriesJson)
      if
        qualityValidation.statusValid(qualityStatus)
        and qualityValidation.seriesValid(series, period)
      then
        quality = '{"status":' .. statusJson .. ',"series":' .. seriesJson .. '}'
      else
        quality = '{"status":{"state":"unavailable","source_freshness":"unknown"},"series":null}'
      end
    end
    return {
      kind = 'dashboard',
      collector = collectorJson,
      measurements = rows,
      quality = quality,
      readiness = readiness,
    }
  end

  local function start()
    if commands.start() ~= 'Manual test started.\n' then
      local current = decodeObject(commands.collectorStatus())
      if current and current.busy ~= true and object(current.usage) then
        if current.usage.budget_state == 'reached' then
          return { kind = 'budgetReached' }
        elseif current.usage.budget_state == 'unknown' then
          return { kind = 'budgetUnknown' }
        end
      end
      return { kind = 'collectorBusy' }
    end
    return { kind = 'started' }
  end

  local function save(data)
    local result = commands.saveSchedule(data)
    if
      result ~= 'Collector configuration saved.\n'
      and result ~= 'Collector configuration unchanged.\n'
    then
      return { kind = 'settingsUnavailable' }
    end
    return { kind = 'saved' }
  end

  return { get = get, start = start, save = save }
end

return { new = new }
