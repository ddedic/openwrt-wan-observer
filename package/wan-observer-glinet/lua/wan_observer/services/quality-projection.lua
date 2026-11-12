-- SPDX-License-Identifier: MIT
local object = require('wan_observer.contracts.json-object').isObject

local function new(json)
  -- Match the fixed quality CLI protocol before reflecting its raw JSON. CJSON 2.1
  -- cannot distinguish empty arrays from objects, but the series always has 180 bins.
  local function finite(value, maximum)
    return type(value) == 'number' and value >= 0 and value <= maximum
  end
  local function integer(value, maximum)
    return finite(value, maximum) and value % 1 == 0
  end
  local function exactFields(value, names)
    if not object(value) then
      return false
    end
    local allowed = {}
    for name in names:gmatch('%S+') do
      allowed[name] = true
      if value[name] == nil then
        return false
      end
    end
    for name in pairs(value) do
      if not allowed[name] then
        return false
      end
    end
    return true
  end
  local function metrics(value, limits)
    if not object(value) then
      return false
    end
    for field, maximum in pairs(limits) do
      if not finite(value[field], maximum) then
        return false
      end
    end
    for field in pairs(value) do
      if not limits[field] then
        return false
      end
    end
    return true
  end
  local RESPONSIVENESS_LIMITS = {
    wan_gateway_latency = 3600000,
    internet_latency = 3600000,
    dns_lookup_latency = 3600000,
    typical_latency = 3600000,
    worst_latency = 3600000,
    jitter_latency = 3600000,
    score = 100,
  }
  local function observation(value)
    if
      not exactFields(
        value,
        'schema source sampled_at source_freshness state error_category responsiveness reliability rate_native'
      )
      or value.schema ~= 1
      or value.source ~= 'gl-inet-network-quality'
      or value.source_freshness ~= 'unknown'
      or not integer(value.sampled_at, 4102444799)
    then
      return false
    end
    if value.state == 'available' then
      return value.error_category == json.null
        and metrics(value.responsiveness, RESPONSIVENESS_LIMITS)
        and metrics(value.reliability, { score = 100, packet_loss_percent = 100 })
        and metrics(
          value.rate_native,
          { total_current = 1e12, upload_current = 1e12, download_current = 1e12 }
        )
    end
    local category = ({ unsupported = 'source_unavailable', disabled = 'native_disabled' })[value.state]
    local failed = value.state == 'error'
      and ({ enable_state_unknown = true, snapshot_failed = true, invalid_snapshot = true })[value.error_category]
    return (failed or (category ~= nil and value.error_category == category))
      and value.responsiveness == json.null
      and value.reliability == json.null
      and value.rate_native == json.null
  end
  local function qualityStatusValid(value)
    if
      not exactFields(
        value,
        'state source source_freshness current_observation latest_observation sample_count retention_days max_samples_per_day'
      )
      or value.source ~= 'gl-inet-network-quality'
      or value.source_freshness ~= 'unknown'
      or not integer(value.retention_days, 30)
      or value.retention_days < 1
      or value.max_samples_per_day ~= 1440
      or not integer(value.sample_count, value.retention_days * 1440)
      or not observation(value.current_observation)
      or value.current_observation.state ~= value.state
    then
      return false
    end
    if value.sample_count == 0 then
      return value.latest_observation == json.null
    end
    return observation(value.latest_observation)
  end
  local function qualitySeriesValid(value, period)
    if
      not exactFields(
        value,
        'source source_freshness start_epoch end_epoch observed_since_epoch observations available_count error_count points'
      )
      or value.source ~= 'gl-inet-network-quality'
      or value.source_freshness ~= 'unknown'
      or not integer(value.start_epoch, 4102444800)
      or not integer(value.end_epoch, 4102444800)
      or value.end_epoch - value.start_epoch ~= period * 86400
      or not (value.observed_since_epoch == json.null or integer(
        value.observed_since_epoch,
        4102444799
      ))
      or not integer(value.observations, 43200)
      or not integer(value.available_count, value.observations)
      or not integer(value.error_count, value.observations)
      or value.available_count + value.error_count ~= value.observations
      or type(value.points) ~= 'table'
    then
      return false
    end
    local count = 0
    for key in pairs(value.points) do
      if not integer(key, 180) or key < 1 then
        return false
      end
      count = count + 1
    end
    if count ~= 180 then
      return false
    end
    local step = math.ceil(period * 1440 / 180) * 60
    local samples, valid = 0, 0
    for index = 1, 180 do
      local point = value.points[index]
      if
        not exactFields(
          point,
          'epoch sample_count valid_count latency_median_ms jitter_median_ms loss_max_percent dns_median_ms'
        )
        or point.epoch ~= value.start_epoch + (index - 1) * step
        or not integer(point.sample_count, 43200)
        or not integer(point.valid_count, point.sample_count)
      then
        return false
      end
      for _, field in ipairs({
        'latency_median_ms',
        'jitter_median_ms',
        'loss_max_percent',
        'dns_median_ms',
      }) do
        local metric = point[field]
        if point.valid_count == 0 then
          if metric ~= json.null then
            return false
          end
        elseif not finite(metric, field == 'loss_max_percent' and 100 or 3600000) then
          return false
        end
      end
      samples, valid = samples + point.sample_count, valid + point.valid_count
    end
    return samples == value.observations and valid == value.available_count
  end

  return { statusValid = qualityStatusValid, seriesValid = qualitySeriesValid }
end

return { new = new }
