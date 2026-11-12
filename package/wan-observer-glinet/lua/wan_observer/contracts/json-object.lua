-- SPDX-License-Identifier: MIT
local function object(value)
  return type(value) == 'table' and (next(value) == nil or type(next(value)) == 'string')
end

local function decodeObject(json, input)
  if type(input) ~= 'string' or not input:match('^%s*{') then
    return nil
  end
  local value = json.decode(input)
  if object(value) then
    return value
  end
end

return { isObject = object, decode = decodeObject }
