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
    @classmethod
    def setUpClass(cls):
        if not LUA:
            raise RuntimeError('Lua and lua-cjson required (CI installs lua5.1 lua-cjson)')
        probe = subprocess.run([LUA, '-e', 'require("cjson.safe")'], capture_output=True)
        if probe.returncode:
            raise RuntimeError('lua-cjson required for CGI contracts; install matching Lua module')

    def invoke(self, body='', method='GET', **overrides):
        env = dict(os.environ, HTTP_X_GL_ADMIN_TOKEN='a'*32, REQUEST_METHOD=method,
                   HTTP_HOST='router.local', HTTP_ORIGIN='http://router.local',
                   CONTENT_TYPE='application/json', CONTENT_LENGTH=str(len(body.encode())),
                   FIX_SESSION='root', FIX_STATUS='{"config":{"enabled":true}}',
                   FIX_HISTORY='{"id":1}\n\nEND\n',
                   FIX_READINESS='{"status":"ready","checks":{"config":"valid","binary":"available","scheduler":"installed"}}',
                   FIX_ACTION='Manual test started.\n')
        env.update(overrides)
        with tempfile.TemporaryDirectory() as tmp:
            harness = Path(tmp) / 'harness.lua'
            harness.write_text('''
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
 local value
 if command:find('readiness',1,true) then value=os.getenv('FIX_READINESS')
 elseif command:find(' status',1,true) then value=os.getenv('FIX_STATUS')
 elseif command:find(' list',1,true) then value=os.getenv('FIX_HISTORY')
 elseif command:find(' start',1,true) then value=os.getenv('FIX_ACTION')
 elseif command:find(' schedule',1,true) then value=os.getenv('FIX_SCHEDULE') or 'Collector configuration saved.\\n'
 else error('unexpected shell command') end
 return {read=function() return value end, close=function() return true end}
end
assert(loadfile(arg[1]))()
''')
            result = subprocess.run([LUA, str(harness), str(CGI)], input=body, text=True,
                                    capture_output=True, env=env)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertNotIn('private-session-secret', result.stdout)
        head, payload = result.stdout.split('\n\n', 1)
        self.assertIn('Cache-Control: no-store', head)
        self.assertNotIn('Access-Control-Allow-Origin', head)
        return int(head.split()[1]), json.loads(payload)

    def test_authentication_and_root_acl(self):
        for token in ('', 'a'*31, '!'*32):
            self.assertEqual(self.invoke(HTTP_X_GL_ADMIN_TOKEN=token)[0], 401)
        for session, status in [('missing',401),('error',401),('guest',403),('connect_error',503)]:
            with self.subTest(session=session):
                self.assertEqual(self.invoke(FIX_SESSION=session)[0], status)

    def test_methods_origin_type_size(self):
        self.assertEqual(self.invoke(method='DELETE')[0],405)
        for changes, status in [({'HTTP_ORIGIN':''},403),({'HTTP_ORIGIN':'https://evil'},403),
                                 ({'CONTENT_TYPE':'text/plain'},415),({'CONTENT_LENGTH':'NaN'},413),
                                 ({'CONTENT_LENGTH':'1e2'},413),({'CONTENT_LENGTH':'-1'},413),
                                 ({'CONTENT_LENGTH':'1025'},413),({'CONTENT_LENGTH':'2','body':'{}'},400)]:
            args={'body':'{"action":"run_speedtest"}','method':'POST'};args.update(changes)
            with self.subTest(changes=changes):
                self.assertEqual(self.invoke(**args)[0],status)

    def test_schedule_strict_finite_numbers_and_extra_fields(self):
        valid=dict(enabled=True,adaptive=False,interval_minutes=120,start_hour=0,end_hour=24)
        self.assertEqual(self.invoke(json.dumps(valid),'POST')[0],200)
        for field, value in [('extra',True),('start_hour',float('nan')),('end_hour',float('inf')),
                             ('enabled',1),('start_hour',0.1),('download_mbps',100)]:
            body=json.dumps(dict(valid,**{field:value}))
            with self.subTest(field=field,value=value):
                self.assertEqual(self.invoke(body,'POST')[0],400)
        for body in ('{','[]','null','true','{"action":"run_speedtest","extra":1}'):
            self.assertEqual(self.invoke(body,'POST')[0],400)

    def test_action_overlap_and_acceptance(self):
        body='{"action":"run_speedtest"}'
        self.assertEqual(self.invoke(body,'POST')[0],202)
        self.assertEqual(self.invoke(body,'POST',FIX_ACTION='')[0],409)

    def test_get_rejects_invalid_history_and_collector_without_reflection(self):
        self.assertEqual(self.invoke()[0],200)
        for value in ('private-session-secret\n\nEND\n','true\n\nEND\n','{"x":NaN}\n\nEND\n','{}\n'):
            status, payload=self.invoke(FIX_HISTORY=value)
            self.assertEqual(status,503)
            self.assertNotIn('private-session-secret',json.dumps(payload))
        self.assertEqual(self.invoke(FIX_STATUS='true')[0],503)

    def test_get_preserves_nested_empty_json_arrays(self):
        collector={'config':{'enabled':True,'download_mbps':100,'upload_mbps':20,'threshold_percent':80},
                   'events':[], 'coverage':{'gaps':[]}}
        status,payload=self.invoke(FIX_STATUS=json.dumps(collector), FIX_HISTORY='{"id":1,"samples":[]}\n\nEND\n')
        self.assertEqual(status,200)
        self.assertIsInstance(payload['collector']['events'],list)
        self.assertIsInstance(payload['collector']['coverage']['gaps'],list)
        self.assertIsInstance(payload['measurements'][0]['samples'],list)
        self.assertEqual(payload['collector'],collector)
        # Feed the actual HTTP-decoded payload to the report helper, including the
        # events.filter and for-of paths that crash if [] became {} in transit.
        script='const fs=require("node:fs"); const {reportData}=require(process.argv[1]); '+\
               'const p=JSON.parse(fs.readFileSync(0,"utf8")); '+\
               'p.measurements[0].timestamp="2026-01-02T11:00:00Z"; '+\
               'reportData(p,1,Date.parse("2026-01-02T12:00:00Z"));'
        result=subprocess.run(['node','-e',script,str(ROOT/'package/wan-observer-glinet/ui/report-data.js')],
                              input=json.dumps(payload),text=True,capture_output=True)
        self.assertEqual(result.returncode,0,result.stderr)

    def test_get_rejects_multiple_json_values_and_array_rows(self):
        for row in ('{} , {"injected":true}', '{} {"injected":true}', '[]'):
            with self.subTest(row=row):
                self.assertEqual(self.invoke(FIX_HISTORY=row+'\n\nEND\n')[0],503)
        self.assertEqual(self.invoke(FIX_STATUS='{"config":{}} , {"injected":true}')[0],503)

    def test_readiness_missing_or_invalid_config(self):
        for state in ('config_missing','config_invalid'):
            readiness={'status':state,'checks':{'config':state.split('_')[1],'binary':'unknown','scheduler':'missing'}}
            status,payload=self.invoke(FIX_READINESS=json.dumps(readiness), FIX_STATUS='')
            self.assertEqual(status,200)
            self.assertIsNone(payload['collector'])
            self.assertEqual(payload['readiness'],readiness)
