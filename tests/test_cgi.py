"""Exercise actual Lua CGI with real cjson and offline ubus/process boundaries."""

import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
CGI = ROOT / 'package/wan-observer-glinet/files/wan-observer.cgi'
LUA = next((shutil.which(x) for x in ('lua5.1', 'lua-5.1', 'lua') if shutil.which(x)), None)


class CGIContracts(unittest.TestCase):
    cgi_path = CGI
    module_path = ROOT / 'package/wan-observer-glinet/lua'

    @classmethod
    def setUpClass(cls):
        if not LUA:
            raise RuntimeError('Lua and lua-cjson required (CI installs lua5.1 lua-cjson)')
        probe = subprocess.run([LUA, '-e', 'require("cjson.safe")'], capture_output=True)
        if probe.returncode:
            raise RuntimeError('lua-cjson required for CGI contracts; install matching Lua module')
        lib = ROOT / 'package/wan-observer/files'
        cls.quality_series = {}
        for days in (1, 7, 30):
            result = subprocess.run(
                [
                    'jq',
                    '-nc',
                    '-L',
                    str(lib),
                    'import "quality" as q; [] | q::series(1767225600;' + str(days) + ')',
                ],
                text=True,
                capture_output=True,
            )
            if result.returncode:
                raise RuntimeError(result.stderr)
            cls.quality_series[days] = result.stdout.strip()
        native = {
            'responsiveness': dict.fromkeys(
                (
                    'wan_gateway_latency',
                    'internet_latency',
                    'dns_lookup_latency',
                    'typical_latency',
                    'worst_latency',
                    'jitter_latency',
                    'score',
                ),
                0,
            ),
            'reliability': {'score': 100, 'packet_loss_percent': 0},
            'rate': dict.fromkeys(('total_current', 'upload_current', 'download_current'), 0),
        }
        result = subprocess.run(
            [
                'jq',
                '-nc',
                '-L',
                str(lib),
                '--argjson',
                'native',
                json.dumps(native),
                'import "quality" as q; $native | q::snapshot(1767225600)',
            ],
            text=True,
            capture_output=True,
        )
        if result.returncode:
            raise RuntimeError(result.stderr)
        cls.quality_status = json.dumps(
            {
                'state': 'available',
                'source': 'gl-inet-network-quality',
                'source_freshness': 'unknown',
                'current_observation': json.loads(result.stdout),
                'latest_observation': None,
                'sample_count': 0,
                'retention_days': 30,
                'max_samples_per_day': 1440,
            }
        )

    def invoke(self, body='', method='GET', **overrides):
        env = dict(
            os.environ,
            HTTP_X_GL_ADMIN_TOKEN='a' * 32,
            REQUEST_METHOD=method,
            HTTP_HOST='router.local',
            HTTP_ORIGIN='http://router.local',
            CONTENT_TYPE='application/json',
            CONTENT_LENGTH=str(len(body.encode())),
            FIX_SESSION='root',
            FIX_STATUS='{"config":{"enabled":true}}',
            FIX_HISTORY='{"id":1}\n\nEND\n',
            FIX_READINESS='{"status":"ready","checks":{"config":"valid","binary":"available","scheduler":"installed"}}',
            FIX_ACTION='Manual test started.\n',
            QUERY_STRING='',
            FIX_QUALITY_STATUS=self.quality_status,
            FIX_QUALITY_SERIES=self.quality_series[7],
        )
        env.update(overrides)
        if 'FIX_QUALITY_SERIES' not in overrides:
            period = {'period=1': 1, 'period=7': 7, 'period=30': 30}.get(env['QUERY_STRING'], 7)
            env['FIX_QUALITY_SERIES'] = self.quality_series[period]
        with tempfile.TemporaryDirectory() as tmp:
            harness = Path(tmp) / 'harness.lua'
            env['FIX_COMMAND_LOG'] = str(Path(tmp) / 'commands')
            env['LUA_PATH'] = str(self.module_path / '?.lua') + ';;'
            harness.write_text("""
package.preload.ubus = function() return {connect=function()
 if os.getenv('FIX_SESSION')=='connect_error' then error('private-session-secret') end
 return {call=function()
  local mode=os.getenv('FIX_SESSION')
  if mode=='error' then error('private-session-secret') end
  if mode=='missing' then return {} end
  return {username='admin',aclgroup=mode}
 end,close=function() end}
end} end
io.popen = function(command)
 local log=assert(io.open(os.getenv('FIX_COMMAND_LOG'),'a')); log:write(command,'\\n'); log:close()
 local value
 if command:find('wan-observer-quality status',1,true) then value=os.getenv('FIX_QUALITY_STATUS')
 elseif command:find('wan-observer-quality series',1,true) then value=os.getenv('FIX_QUALITY_SERIES')
 elseif command:find('readiness',1,true) then value=os.getenv('FIX_READINESS')
 elseif command:find(' status',1,true) then value=os.getenv('FIX_STATUS')
 elseif command:find(' list',1,true) then value=os.getenv('FIX_HISTORY')
 elseif command:find(' start',1,true) then value=os.getenv('FIX_ACTION')
 elseif command:find(' schedule',1,true) then value=os.getenv('FIX_SCHEDULE') or 'Collector configuration saved.\\n'
 else error('unexpected shell command') end
 return {read=function() return value end, close=function() return true end}
end
assert(loadfile(arg[1]))()
""")
            result = subprocess.run(
                [LUA, str(harness), str(self.cgi_path)],
                input=body,
                text=True,
                capture_output=True,
                env=env,
            )
            log = Path(env['FIX_COMMAND_LOG'])
            self.last_commands = log.read_text() if log.exists() else ''
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertNotIn('private-session-secret', result.stdout)
        head, payload = result.stdout.split('\n\n', 1)
        self.assertIn('Cache-Control: no-store', head)
        self.assertNotIn('Access-Control-Allow-Origin', head)
        return int(head.split()[1]), json.loads(payload)

    def test_authentication_and_root_acl(self):
        for token in ('', 'a' * 31, '!' * 32):
            self.assertEqual(self.invoke(HTTP_X_GL_ADMIN_TOKEN=token)[0], 401)
        for session, status in [
            ('missing', 401),
            ('error', 401),
            ('guest', 403),
            ('connect_error', 503),
        ]:
            with self.subTest(session=session):
                self.assertEqual(self.invoke(FIX_SESSION=session)[0], status)

    def test_methods_origin_type_size(self):
        self.assertEqual(self.invoke(method='DELETE')[0], 405)
        for changes, status in [
            ({'HTTP_ORIGIN': ''}, 403),
            ({'HTTP_ORIGIN': 'https://evil'}, 403),
            ({'CONTENT_TYPE': 'text/plain'}, 415),
            ({'CONTENT_LENGTH': 'NaN'}, 413),
            ({'CONTENT_LENGTH': '1e2'}, 413),
            ({'CONTENT_LENGTH': '-1'}, 413),
            ({'CONTENT_LENGTH': '1025'}, 413),
            ({'CONTENT_LENGTH': '2', 'body': '{}'}, 400),
        ]:
            args = {'body': '{"action":"run_speedtest"}', 'method': 'POST'}
            args.update(changes)
            with self.subTest(changes=changes):
                self.assertEqual(self.invoke(**args)[0], status)

    def test_schedule_strict_finite_numbers_and_extra_fields(self):
        valid = dict(enabled=True, adaptive=False, interval_minutes=120, start_hour=0, end_hour=24)
        self.assertEqual(self.invoke(json.dumps(valid), 'POST')[0], 200)
        for field, value in [
            ('extra', True),
            ('start_hour', float('nan')),
            ('end_hour', float('inf')),
            ('enabled', 1),
            ('start_hour', 0.1),
            ('download_mbps', 100),
        ]:
            body = json.dumps(dict(valid, **{field: value}))
            with self.subTest(field=field, value=value):
                self.assertEqual(self.invoke(body, 'POST')[0], 400)
        for body in ('{', '[]', 'null', 'true', '{"action":"run_speedtest","extra":1}'):
            self.assertEqual(self.invoke(body, 'POST')[0], 400)

    def test_action_overlap_and_acceptance(self):
        body = '{"action":"run_speedtest"}'
        self.assertEqual(self.invoke(body, 'POST')[0], 202)
        self.assertEqual(self.invoke(body, 'POST', FIX_ACTION='')[0], 409)

    def test_manual_start_reports_current_budget_guard_without_claiming_running(self):
        for guard, code in [('reached', 'budget_reached'), ('unknown', 'budget_unknown')]:
            state = json.dumps(
                {'config': {'enabled': True}, 'busy': False, 'usage': {'budget_state': guard}}
            )
            status, payload = self.invoke(
                '{"action":"run_speedtest"}', 'POST', FIX_ACTION='', FIX_STATUS=state
            )
            self.assertEqual(status, 409)
            self.assertEqual(payload['code'], code)
            self.assertNotIn('already running', payload['error'])
        busy = json.dumps({'config': {}, 'busy': True, 'usage': {'budget_state': 'unknown'}})
        _, payload = self.invoke(
            '{"action":"run_speedtest"}', 'POST', FIX_ACTION='', FIX_STATUS=busy
        )
        self.assertNotIn('code', payload)

    def test_get_rejects_invalid_history_and_collector_without_reflection(self):
        self.assertEqual(self.invoke()[0], 200)
        for value in (
            'private-session-secret\n\nEND\n',
            'true\n\nEND\n',
            '{"x":NaN}\n\nEND\n',
            '{}\n',
        ):
            status, payload = self.invoke(FIX_HISTORY=value)
            self.assertEqual(status, 503)
            self.assertNotIn('private-session-secret', json.dumps(payload))
        self.assertEqual(self.invoke(FIX_STATUS='true')[0], 503)

    def test_get_preserves_nested_empty_json_arrays(self):
        collector = {
            'config': {
                'enabled': True,
                'download_mbps': 100,
                'upload_mbps': 20,
                'threshold_percent': 80,
            },
            'events': [],
            'coverage': {'gaps': []},
        }
        status, payload = self.invoke(
            FIX_STATUS=json.dumps(collector), FIX_HISTORY='{"id":1,"samples":[]}\n\nEND\n'
        )
        self.assertEqual(status, 200)
        self.assertIsInstance(payload['collector']['events'], list)
        self.assertIsInstance(payload['collector']['coverage']['gaps'], list)
        self.assertIsInstance(payload['measurements'][0]['samples'], list)
        self.assertEqual(payload['collector'], collector)
        # Feed the actual HTTP-decoded payload to the report helper, including the
        # events.filter and for-of paths that crash if [] became {} in transit.
        script = (
            'const fs=require("node:fs"); const {reportData}=require(process.argv[1]); '
            + 'const p=JSON.parse(fs.readFileSync(0,"utf8")); '
            + 'p.measurements[0].timestamp="2026-01-02T11:00:00Z"; '
            + 'reportData(p,1,Date.parse("2026-01-02T12:00:00Z"));'
        )
        result = subprocess.run(
            [
                'node',
                '-e',
                script,
                str(ROOT / 'package/wan-observer-glinet/ui/src/measurements/report-data.js'),
            ],
            input=json.dumps(payload),
            text=True,
            capture_output=True,
        )
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_get_rejects_multiple_json_values_and_array_rows(self):
        for row in ('{} , {"injected":true}', '{} {"injected":true}', '[]'):
            with self.subTest(row=row):
                self.assertEqual(self.invoke(FIX_HISTORY=row + '\n\nEND\n')[0], 503)
        self.assertEqual(self.invoke(FIX_STATUS='{"config":{}} , {"injected":true}')[0], 503)

    def test_approved_optional_schedule_fields_and_exact_budget_precision(self):
        base = dict(
            enabled=True,
            adaptive=False,
            interval_minutes=720,
            start_hour=22,
            end_hour=6,
            download_mbps=100,
            upload_mbps=20,
            quality_history_enabled=True,
            window_timezone='router',
            threshold_percent=1,
        )
        for budget in (0, 100000000000, 9007199254740991):
            self.assertEqual(
                self.invoke(json.dumps(dict(base, monthly_budget_bytes=budget)), 'POST')[0], 200
            )
            self.assertIn('"monthly_budget_bytes":' + str(budget), self.last_commands)
        for field, value in [
            ('monthly_budget_bytes', 9007199254740992),
            ('monthly_budget_bytes', -1),
            ('monthly_budget_bytes', 1.5),
            ('quality_history_enabled', 1),
            ('window_timezone', 'Europe/Berlin'),
            ('window_timezone', "router';echo injected"),
            ('threshold_percent', 0),
            ('threshold_percent', 101),
            ('end_hour', 22),
        ]:
            with self.subTest(field=field, value=value):
                self.assertEqual(
                    self.invoke(json.dumps(dict(base, **{field: value})), 'POST')[0], 400
                )
        for interval in (180, 240, 360, 720):
            self.assertEqual(
                self.invoke(json.dumps(dict(base, interval_minutes=interval)), 'POST')[0], 200
            )

    def test_quality_period_query_and_preserved_empty_arrays(self):
        enabled = json.dumps(
            {'config': {'enabled': False, 'quality_history_enabled': True}, 'events': []}
        )
        for period in ('', 'period=1', 'period=7', 'period=30'):
            status, payload = self.invoke(QUERY_STRING=period, FIX_STATUS=enabled)
            self.assertEqual(status, 200)
            self.assertEqual(payload['quality']['status']['state'], 'available')
            self.assertIsInstance(payload['quality']['series']['points'], list)
            self.assertEqual(len(payload['quality']['series']['points']), 180)
            self.assertIsNone(payload['quality']['series']['points'][0]['latency_median_ms'])
            self.assertEqual(payload['collector']['events'], [])
            self.assertIn(
                'wan-observer-quality series ' + (period.split('=')[-1] if period else '7'),
                self.last_commands,
            )
            self.assertNotIn('wan-observer-quality tick', self.last_commands)
        for query in (
            'period=0',
            'period=31',
            'period=7&extra=x',
            'period=1;reboot',
            'period=7&period=1',
            'period=%37',
        ):
            self.assertEqual(self.invoke(QUERY_STRING=query, FIX_STATUS=enabled)[0], 400)
        for raw in ('[]', '{"points":[]} {}', '{"points":[NaN]}', 'private-session-secret'):
            _, payload = self.invoke(FIX_STATUS=enabled, FIX_QUALITY_SERIES=raw)
            self.assertEqual(payload['quality']['status']['state'], 'unavailable')
        _, payload = self.invoke()
        self.assertEqual(payload['quality']['status']['state'], 'disabled')
        self.assertNotIn('wan-observer-quality', self.last_commands)

    def test_quality_transport_accepts_real_populated_cli_series_and_status(self):
        enabled = json.dumps({'config': {'quality_history_enabled': True}, 'events': []})
        state = json.loads(self.quality_status)
        observation = state['current_observation']
        result = subprocess.run(
            [
                'jq',
                '-nc',
                '-L',
                str(ROOT / 'package/wan-observer/files'),
                '--argjson',
                'observation',
                json.dumps(observation),
                'import "quality" as q; [$observation] | q::series(1767225600;7)',
            ],
            text=True,
            capture_output=True,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        state.update(sample_count=1, latest_observation=observation)
        _, payload = self.invoke(
            FIX_STATUS=enabled,
            FIX_QUALITY_STATUS=json.dumps(state),
            FIX_QUALITY_SERIES=result.stdout,
        )
        self.assertEqual(payload['quality']['series'], json.loads(result.stdout))
        self.assertEqual(payload['quality']['status'], state)
        self.assertEqual(payload['quality']['series']['available_count'], 1)
        for category, status in [
            ('source_unavailable', 'unsupported'),
            ('native_disabled', 'disabled'),
            ('snapshot_failed', 'error'),
        ]:
            result = subprocess.run(
                [
                    'jq',
                    '-nc',
                    '-L',
                    str(ROOT / 'package/wan-observer/files'),
                    '--arg',
                    'state',
                    status,
                    '--arg',
                    'category',
                    category,
                    'import "quality" as q; q::observation(1767225600;$state;$category)',
                ],
                text=True,
                capture_output=True,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            obs = json.loads(result.stdout)
            state.update(state=status, current_observation=obs, latest_observation=obs)
            _, payload = self.invoke(FIX_STATUS=enabled, FIX_QUALITY_STATUS=json.dumps(state))
            self.assertEqual(payload['quality']['status'], state)

    def test_quality_cli_structure_rejects_bad_shapes_counts_metrics_and_labels(self):
        enabled = json.dumps({'config': {'quality_history_enabled': True}, 'events': []})
        series = json.loads(self.quality_series[7])
        import copy

        mutations = []
        for points in ({'bad': 'shape'}, ['bad'], [], series['points'][:-1]):
            mutations.append(dict(series, points=points))
        mutations += [
            dict(series, source='private-target'),
            dict(series, observations='1'),
            dict(series, available_count=1),
            dict(series, unexpected_label='private-target'),
        ]
        for field, value in [
            ('latency_median_ms', 'bad'),
            ('loss_max_percent', 101),
            ('valid_count', 1),
            ('sample_count', -1),
            ('epoch', 0),
            ('unexpected_label', 'private-target'),
        ]:
            value_series = copy.deepcopy(series)
            value_series['points'][0][field] = value
            mutations.append(value_series)
        for value in mutations:
            with self.subTest(value=str(value)[:100]):
                status, payload = self.invoke(
                    FIX_STATUS=enabled, FIX_QUALITY_SERIES=json.dumps(value)
                )
                self.assertEqual(status, 200)
                self.assertEqual(payload['quality']['status']['state'], 'unavailable')
                self.assertNotIn('private-target', json.dumps(payload))
        valid_status = json.loads(self.quality_status)
        for field, value in [
            ('current_observation', 'bad'),
            ('latest_observation', 'bad'),
            ('sample_count', '0'),
            ('retention_days', 31),
            ('unexpected_label', 'private-target'),
        ]:
            _, payload = self.invoke(
                FIX_STATUS=enabled,
                FIX_QUALITY_STATUS=json.dumps(dict(valid_status, **{field: value})),
            )
            self.assertEqual(payload['quality']['status']['state'], 'unavailable')
        invalid_status = copy.deepcopy(valid_status)
        invalid_status['current_observation']['responsiveness']['internet_latency'] = 'bad'
        _, payload = self.invoke(FIX_STATUS=enabled, FIX_QUALITY_STATUS=json.dumps(invalid_status))
        self.assertEqual(payload['quality']['status']['state'], 'unavailable')

    def test_readiness_missing_or_invalid_config(self):
        for state in ('config_missing', 'config_invalid'):
            readiness = {
                'status': state,
                'checks': {
                    'config': state.split('_')[1],
                    'binary': 'unknown',
                    'scheduler': 'missing',
                },
            }
            status, payload = self.invoke(FIX_READINESS=json.dumps(readiness), FIX_STATUS='')
            self.assertEqual(status, 200)
            self.assertIsNone(payload['collector'])
            self.assertEqual(payload['readiness'], readiness)
