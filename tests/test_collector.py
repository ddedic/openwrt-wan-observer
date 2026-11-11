import json
import os
from pathlib import Path
import subprocess
import tempfile
import time
import unittest
from test_cli import fixture

ROOT = Path(__file__).resolve().parents[1]
LIB = ROOT / 'package/wan-observer/files'
COLLECT = LIB / 'wan-observer-collect'

class CollectorTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = Path(self.tmp.name)
        self.fake = self.path / 'speedtest'
        self.fake.write_text('#!/bin/sh\ncat "$FAKE_RESULT"\n')
        self.fake.chmod(0o700)
        (self.path / 'result').write_text(json.dumps(fixture()))
        self.env = dict(os.environ, WAN_OBSERVER_LIB=str(LIB), WAN_OBSERVER_CLI=str(LIB/'wan-observer'),
                        WAN_OBSERVER_STORE=str(self.path/'history'), WAN_OBSERVER_RUNTIME=str(self.path/'runtime'),
                        WAN_OBSERVER_CONFIG=str(self.path/'config.json'), FAKE_RESULT=str(self.path/'result'))
        self.config = dict(enabled=True, interval_minutes=30, adaptive=True, start_hour=0, end_hour=24,
                           download_mbps=100, upload_mbps=20, threshold_percent=80,
                           binary=str(self.fake), server_id=123, interface='')

    def run_cli(self, command, now=1767225600, value=None):
        return subprocess.run(['sh',str(COLLECT),command],input=json.dumps(value) if value is not None else None,
                              text=True,capture_output=True,env=dict(self.env,WAN_OBSERVER_NOW=str(now)))

    def configure(self):
        r=self.run_cli('configure',value=self.config)
        self.assertEqual(r.returncode,0,r.stderr)

    def status(self):
        r=self.run_cli('status');self.assertEqual(r.returncode,0,r.stderr);return json.loads(r.stdout)

    def test_normal_schedule_no_duplicate(self):
        self.configure()
        for now in [1767225600,1767225601,1767225660]:
            r=self.run_cli('tick',now);self.assertEqual(r.returncode,0,r.stderr)
        s=self.status();self.assertEqual(len(s['events']),1);self.assertEqual(s['events'][0]['outcome'],'healthy')
        self.assertEqual(s['next_epoch'],1767227400)

    def test_degradation_burst_and_recovery(self):
        self.configure();bad=fixture();bad['download']['bandwidth']=1000000
        (self.path/'result').write_text(json.dumps(bad))
        for now in [1767225600,1767225900]:
            r=self.run_cli('tick',now);self.assertEqual(r.returncode,0,r.stderr)
        self.assertEqual(self.status()['events'][-1]['reason'],'degradation_followup')
        (self.path/'result').write_text(json.dumps(fixture()))
        self.run_cli('tick',1767226200)
        s=self.status();self.assertEqual(s['events'][-1]['outcome'],'healthy');self.assertEqual(s['next_epoch'],1767227400)

    def test_burst_limit_and_failed_results_not_zero_measurements(self):
        self.configure();(self.path/'result').write_text('PRIVATE_ERROR')
        for offset in [0,300,600,900,1200]:
            r=self.run_cli('tick',1767225600+offset);self.assertEqual(r.returncode,0,r.stderr)
        s=self.status();self.assertEqual(len(s['events']),4);self.assertEqual(s['next_epoch'],1767227400)
        self.assertTrue(all(e['outcome']=='failed' for e in s['events']))
        self.assertNotIn('PRIVATE_ERROR',json.dumps(s));self.assertFalse((self.path/'history/measurements.jsonl').exists())

    def test_disabled_invalid_config_and_lock(self):
        self.config['enabled']=False;self.configure();self.run_cli('tick');self.assertEqual(self.status()['events'],[])
        self.config['interval_minutes']=0
        self.assertNotEqual(self.run_cli('configure',value=self.config).returncode,0)
        self.assertFalse(json.loads((self.path/'config.json').read_text())['enabled'])
        self.config.update(enabled=True,interval_minutes=30);self.configure()
        (self.path/'runtime/.lock').mkdir(parents=True)
        self.assertNotEqual(self.run_cli('tick').returncode,0)

    def test_outside_window_no_test(self):
        self.config.update(start_hour=17,end_hour=22);self.configure()
        self.run_cli('tick',1767225600)
        self.assertEqual(self.status()['events'],[])

    def test_same_config_does_not_trigger_extra_test(self):
        self.configure();self.run_cli('tick')
        before=self.status()['next_epoch'];self.configure()
        self.assertEqual(self.status()['next_epoch'],before)

    def test_daily_extra_limit_preserves_normal_schedule(self):
        self.configure();self.run_cli('tick')
        path=self.path/'runtime/state.json';state=json.loads(path.read_text())
        state['extras']=24;path.write_text(json.dumps(state))
        (self.path/'result').write_text('failed')
        self.run_cli('tick',1767227400)
        self.assertEqual(self.status()['next_epoch'],1767229200)

    def test_reboot_preserves_event_history(self):
        self.configure();self.run_cli('tick')
        (self.path/'runtime/state.json').unlink()
        self.assertEqual(len(self.status()['events']),1)

    def test_schedule_updates_only_schedule_fields(self):
        self.configure()
        patch = dict(enabled=False, adaptive=True, interval_minutes=60, start_hour=0, end_hour=24)
        self.assertNotEqual(self.run_cli('schedule', value=dict(patch, binary='/tmp/other')).returncode, 0)
        self.assertEqual(self.run_cli('schedule', value=patch).returncode, 0)
        saved = json.loads((self.path/'config.json').read_text())
        self.assertFalse(saved['enabled'])
        self.assertEqual(saved['interval_minutes'], 60)
        self.assertEqual(saved['binary'], self.config['binary'])
        self.assertEqual(saved['download_mbps'], self.config['download_mbps'])

    def test_paused_manual_run_preserves_schedule_state(self):
        self.configure();self.run_cli('tick')
        bad=fixture();bad['download']['bandwidth']=1000000
        (self.path/'result').write_text(json.dumps(bad));self.run_cli('tick',1767227400)
        self.assertEqual(self.run_cli('schedule',value=dict(enabled=False,adaptive=True,interval_minutes=30,start_hour=0,end_hour=24)).returncode,0)
        before={k:v for k,v in self.status().items() if k!='events'}
        r=self.run_cli('run',1767227500);self.assertEqual(r.returncode,0,r.stderr)
        self.assertEqual(r.stdout,'Manual test degraded.\n')
        (self.path/'result').write_text('PRIVATE_ERROR')
        self.assertEqual(self.run_cli('run',1767227600).stdout,'Manual test failed.\n')
        s=self.status()
        self.assertEqual({k:v for k,v in s.items() if k!='events'},before)
        self.assertEqual([(e['reason'],e['outcome']) for e in s['events'][-2:]],[('manual','degraded'),('manual','failed')])
        self.assertEqual(len((self.path/'history/measurements.jsonl').read_text().splitlines()),3)
        self.assertNotIn('PRIVATE_ERROR',json.dumps(s))

    def test_manual_run_contention_and_background_start(self):
        self.configure();(self.path/'runtime/.lock').mkdir(parents=True)
        for command in ['run','start']:
            r=self.run_cli(command);self.assertNotEqual(r.returncode,0);self.assertNotIn('started',r.stdout)
        self.assertTrue(self.status()['busy']);self.assertEqual(self.status()['events'],[])
        (self.path/'runtime/.lock').rmdir()
        self.fake.write_text('#!/bin/sh\nwhile [ -e "$FAKE_RESULT.hold" ]; do sleep 0.05; done\ncat "$FAKE_RESULT"\n')
        (self.path/'result.hold').touch()
        r=self.run_cli('start');self.assertEqual(r.stdout,'Manual test started.\n',r.stderr)
        s=self.status();self.assertTrue(s['busy']);self.assertEqual(s['manual_started'],1767225600)
        self.assertNotEqual(self.run_cli('start').returncode,0)
        self.assertNotEqual(self.run_cli('tick').returncode,0)
        (self.path/'result.hold').unlink()
        deadline=time.time()+10
        while self.status()['busy'] and time.time()<deadline: time.sleep(0.05)
        s=self.status();self.assertFalse(s['busy']);self.assertIsNone(s['manual_started'])
        self.assertEqual([(e['reason'],e['outcome']) for e in s['events']],[('manual','healthy')])
        self.assertEqual(s['next_epoch'],0)

    def test_plan_update_persists_preserves_timing_and_drives_detection(self):
        self.configure();self.run_cli('tick');before=self.status()['next_epoch']
        patch=dict(enabled=True,adaptive=True,interval_minutes=30,start_hour=0,end_hour=24)
        for invalid in [dict(patch,download_mbps=250),dict(patch,download_mbps=0,upload_mbps=50),
                        dict(patch,download_mbps=250.5,upload_mbps=50),dict(patch,download_mbps=250,upload_mbps=50,server_id=1)]:
            self.assertNotEqual(self.run_cli('schedule',value=invalid).returncode,0)
        self.assertEqual(self.run_cli('schedule',value=dict(patch,download_mbps=250,upload_mbps=50)).stdout,'Collector configuration saved.\n')
        saved=json.loads((self.path/'config.json').read_text())
        self.assertEqual((saved['download_mbps'],saved['upload_mbps'],saved['binary']),(250,50,self.config['binary']))
        s=self.status();self.assertEqual(s['next_epoch'],before);self.assertEqual(s['config']['download_mbps'],250)
        self.run_cli('tick',before)
        self.assertEqual(self.status()['events'][-1]['outcome'],'degraded')
        self.assertEqual(self.run_cli('schedule',value=dict(patch,interval_minutes=60)).returncode,0)
        self.assertEqual(self.status()['next_epoch'],0)
