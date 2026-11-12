"""Exercise explicit Lua boundaries, command rejection and resource cleanup."""

import os
import subprocess
import unittest

from test_cgi import LUA, ROOT


class CGIModuleContracts(unittest.TestCase):
    def lua(self, source):
        self.assertIsNotNone(LUA, 'Lua 5.1 runtime required')
        result = subprocess.run(
            [LUA, '-e', source],
            text=True,
            capture_output=True,
            env=dict(
                os.environ, LUA_PATH=str(ROOT / 'package/wan-observer-glinet/lua/?.lua') + ';;'
            ),
        )
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_authentication_passes_exact_session_contract_and_closes_failures(self):
        self.lua("""
local calls, closed = 0, 0
package.preload.ubus = function() return { connect = function(path, timeout)
    assert(path == nil and timeout == 2)
    return { call = function(_, object, method, args)
        calls = calls + 1
        assert(object == 'gl-session' and method == 'session')
        assert(args.sid == string.rep('a', 32) and next(args, 'sid') == nil)
        error('private-detail')
    end, close = function() closed = closed + 1 end }
end } end
local auth = require('wan_observer.http.authentication')
assert(auth.authenticate('bad', true) == nil and calls == 0)
local identity, failure = auth.authenticate(string.rep('a', 32), true)
assert(identity == nil and failure == 'signInRequired')
assert(calls == 1 and closed == 1)
""")

    def test_command_adapter_rejects_unvalidated_input_and_closes_read_failures(self):
        self.lua("""
local calls, closed = 0, 0
io.popen = function(command, mode)
    calls = calls + 1
    assert(command == '(/usr/bin/wan-observer-quality series 7) 2>/dev/null')
    assert(mode == 'r')
    return { read = function() error('private-detail') end,
        close = function() closed = closed + 1 end }
end
local commands = require('wan_observer.adapters.commands')
assert(commands.qualitySeries('7;reboot') == nil)
assert(commands.qualitySeries(2) == nil)
assert(commands.saveSchedule({ enabled = true }) == nil)
assert(calls == 0)
assert(commands.qualitySeries(7) == nil)
assert(calls == 1 and closed == 1)
io.popen = function() error('private-detail') end
assert(commands.start() == nil)
""")

    def test_service_uses_explicit_port_without_http_environment_or_process_access(self):
        self.lua("""
local json = require('cjson.safe')
local service = require('wan_observer.services.dashboard')
os.getenv = function() error('service accessed HTTP environment') end
io.popen = function() error('service accessed process boundary') end
local called = {}
local app = service.new({
    readiness = function() called[#called + 1] = 'readiness'; return '{"status":"ready"}' end,
    collectorStatus = function() called[#called + 1] = 'status'; return '{"config":{},"events":[]}' end,
    history = function() called[#called + 1] = 'history'; return '{"id":1}\\n\\nEND\\n' end,
    start = function() error('GET started a probe') end,
    saveSchedule = function() error('GET saved settings') end,
}, json)
local outcome = app.get(7)
assert(outcome.kind == 'dashboard')
assert(json.decode(outcome.measurements[1]).id == 1)
assert(table.concat(called, ',') == 'readiness,status,history')
""")

    def test_http_rejects_invalid_requests_before_calling_service(self):
        self.lua("""
local json = require('cjson.safe')
local http = require('wan_observer.http.handler')
local env = { REQUEST_METHOD = 'GET', QUERY_STRING = 'period=7;reboot' }
local service = setmetatable({}, { __index = function() error('invalid request reached service') end })
local function getenv(key) return env[key] end
local function read() error('invalid request read body') end
assert(http.handle(getenv, read, json, service) == '400 Bad Request')
env.REQUEST_METHOD = 'POST'
assert(http.handle(getenv, read, json, service) == '403 Forbidden')
""")
