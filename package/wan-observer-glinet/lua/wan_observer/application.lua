-- SPDX-License-Identifier: MIT
local authentication = require('wan_observer.http.authentication')
local http = require('wan_observer.http.handler')
local commands = require('wan_observer.adapters.commands')
local service = require('wan_observer.services.dashboard')

local function run()
  local jsonOk, json = pcall(require, 'cjson.safe')
  local identity, failure =
    authentication.authenticate(os.getenv('HTTP_X_GL_ADMIN_TOKEN') or '', jsonOk)
  if not identity then
    return http.reply(http.respond({ kind = failure }, json))
  end

  -- Reject non-finite JSON at every decode/encode boundary.
  json.decode_invalid_numbers(false)
  json.encode_invalid_numbers(false)
  local status, body = http.handle(os.getenv, io.read, json, service.new(commands, json))
  return http.reply(status, body)
end

return { run = run }
