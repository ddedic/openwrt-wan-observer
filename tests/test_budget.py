import json
import shutil
import subprocess
import time
import unittest
import test_collector
from test_cli import fixture


class UsageTests(unittest.TestCase):
    setUp = test_collector.CollectorTests.setUp
    run_cli = test_collector.CollectorTests.run_cli
    configure = test_collector.CollectorTests.configure
    status = test_collector.CollectorTests.status

    def result_bytes(self, download=120, upload=30):
        result = fixture()
        result['download']['bytes'] = download
        result['upload']['bytes'] = upload
        (self.path/'result').write_text(json.dumps(result))

    def usage(self, now=1767225600):
        result = self.run_cli('status', now)
        self.assertEqual(result.returncode, 0, result.stderr)
        return json.loads(result.stdout)['usage']

    def test_passive_quality_continues_after_test_budget_is_reached(self):
        script=self.path/'quality';script.write_text('#!/bin/sh\necho tick >> "$QUALITY_LOG"\nexit 1\n')
        self.env.update(WAN_OBSERVER_QUALITY_CLI=str(script),QUALITY_LOG=str(self.path/'quality-log'))
        self.config.update(monthly_budget_bytes=100,quality_history_enabled=True)
        self.configure();self.result_bytes()
        self.assertEqual(self.run_cli('run').returncode,0)
        self.assertFalse((self.path/'quality-log').exists())
        self.assertEqual(self.run_cli('tick',1767225660).returncode,0)
        self.assertEqual((self.path/'quality-log').read_text(),'tick\n')
        self.assertEqual(self.usage()['known_bytes'],150)
        self.assertEqual(len(self.status()['events']),1)

    def test_actual_bytes_survive_reboot_and_retention_without_estimate(self):
        self.configure()
        self.env['WAN_OBSERVER_MAX_RECORDS'] = '1'
        self.result_bytes()
        for command, now in [('tick',1767225600),('run',1767225601),('tick',1767227400)]:
            r=self.run_cli(command,now); self.assertEqual(r.returncode,0,r.stderr)
        shutil.rmtree(self.path/'runtime')
        u=self.usage()
        self.assertEqual((u['known_bytes'],u['unknown_attempts']),(450,0))
        self.assertEqual(u['accounting_since_epoch'],1767225600)
        self.assertEqual((u['budget_bytes'],u['budget_state'],u['partial'],u['limit_semantics']),
                         (0,'unset',True,'start_guard'))
        self.assertEqual(len(self.status()['events']),1)

    def test_null_invalid_and_partial_byte_counts_remain_unknown(self):
        self.configure()
        for down,up in [(None,None),(-1,30),(1.5,30),('100',30),(9007199254740992,30)]:
            self.result_bytes(down,up)
            self.assertEqual(self.run_cli('run').returncode,0)
        u=self.usage()
        self.assertEqual((u['known_bytes'],u['unknown_attempts']),(120,5))
        self.config['monthly_budget_bytes']=1000
        self.configure()
        for command in ['run','start']:
            r=self.run_cli(command); self.assertNotEqual(r.returncode,0); self.assertIn('usage accounting unknown',r.stderr)
        self.assertEqual(self.run_cli('tick',1767229200).returncode,0)
        self.assertEqual(len(self.status()['events']),5)

    def test_budget_guards_future_regular_manual_and_followup_starts_allows_overshoot(self):
        self.config['monthly_budget_bytes']=100
        self.configure(); self.result_bytes()
        bad=json.loads((self.path/'result').read_text()); bad['download']['bandwidth']=1
        (self.path/'result').write_text(json.dumps(bad))
        self.assertEqual(self.run_cli('tick').returncode,0)
        self.assertEqual(self.usage()['known_bytes'],150)
        self.assertEqual(self.usage()['budget_state'],'reached')
        for now in [1767225900,1767227400]: self.assertEqual(self.run_cli('tick',now).returncode,0)
        for command in ['run','start']:
            r=self.run_cli(command); self.assertNotEqual(r.returncode,0); self.assertIn('monthly test budget reached',r.stderr)
        self.assertEqual(len(self.status()['events']),1)

    def test_month_rollover_and_legacy_config_patch_preserves_budget(self):
        self.config['monthly_budget_bytes']=100
        self.configure(); self.result_bytes(); self.run_cli('run')
        patch={k:self.config[k] for k in ['enabled','adaptive','interval_minutes','start_hour','end_hour']}
        self.assertEqual(self.run_cli('schedule',value=patch).returncode,0)
        self.assertEqual(self.usage()['budget_bytes'],100)
        self.config.pop('monthly_budget_bytes')
        self.configure()
        self.assertEqual(self.usage()['budget_bytes'],100)
        feb=1769904000
        self.assertEqual(self.usage(feb)['month'],'2026-02')
        self.assertEqual(self.usage(feb)['known_bytes'],0)
        self.assertEqual(self.run_cli('run',feb).returncode,0)
        self.assertEqual(self.usage(feb)['known_bytes'],150)

    def test_budget_configuration_rejects_invalid_values(self):
        for value in [-1,1.5,'100',None,9007199254740992]:
            self.config['monthly_budget_bytes']=value
            self.assertNotEqual(self.run_cli('configure',value=self.config).returncode,0)

    def test_reservation_failure_does_not_start_backend(self):
        self.configure(); self.result_bytes()
        history=self.path/'history'; history.mkdir()
        (history/'collector-usage.next').mkdir()
        self.fake.write_text('#!/bin/sh\ntouch "$FAKE_RESULT.started"\ncat "$FAKE_RESULT"\n')
        self.assertNotEqual(self.run_cli('run').returncode,0)
        self.assertFalse((self.path/'result.started').exists())
        (history/'collector-usage.next').rmdir()
        self.assertEqual(self.run_cli('run').returncode,0)
        self.assertEqual(self.usage()['known_bytes'],150)

    def test_settlement_write_failure_keeps_unknown_reservation_no_double_charge(self):
        self.config['monthly_budget_bytes']=1000
        self.configure(); self.result_bytes()
        self.fake.write_text('#!/bin/sh\nmkdir "$WAN_OBSERVER_STORE/collector-usage.next"\ncat "$FAKE_RESULT"\n')
        self.assertNotEqual(self.run_cli('run').returncode,0)
        (self.path/'history/collector-usage.next').rmdir()
        shutil.rmtree(self.path/'runtime')
        u=self.usage()
        self.assertEqual((u['known_bytes'],u['unknown_attempts'],u['budget_state']),(0,1,'unknown'))
        self.assertEqual(len((self.path/'history/measurements.jsonl').read_text().splitlines()),1)
        events=self.status()['events']
        self.assertEqual(len(events),1)
        self.assertEqual((events[0]['pending'],events[0]['outcome'],events[0]['failure_code']),
                         (True,'failed','interrupted'))
        self.assertNotEqual(self.run_cli('run').returncode,0)
        self.assertEqual(self.usage()['unknown_attempts'],1)

    def test_inflight_reservation_visible_and_crash_conservative(self):
        self.config['monthly_budget_bytes']=1000
        self.configure(); self.result_bytes()
        self.fake.write_text('#!/bin/sh\nwhile [ -e "$FAKE_RESULT.hold" ]; do sleep 0.05; done\ncat "$FAKE_RESULT"\n')
        (self.path/'result.hold').touch()
        self.assertEqual(self.run_cli('start').returncode,0)
        deadline=time.time()+10
        while self.usage()['unknown_attempts']==0 and time.time()<deadline: time.sleep(.05)
        self.assertEqual(self.usage()['budget_state'],'unknown')
        (self.path/'result.hold').unlink()
        while self.status()['busy'] and time.time()<deadline: time.sleep(.05)
        self.assertEqual(self.usage()['known_bytes'],150)
        self.assertEqual(self.usage()['unknown_attempts'],0)

    def test_backend_error_unknown_and_import_failure_still_counts_actual_bytes(self):
        self.configure(); self.result_bytes()
        (self.path/'history').mkdir()
        (self.path/'history/.lock').mkdir()
        self.assertEqual(self.run_cli('run').returncode,0)
        self.assertEqual(self.usage()['known_bytes'],150)
        (self.path/'history/.lock').rmdir()
        self.fake.write_text('#!/bin/sh\nexit 7\n')
        self.assertEqual(self.run_cli('run').returncode,0)
        self.assertEqual((self.usage()['known_bytes'],self.usage()['unknown_attempts']),(150,1))
        self.config['monthly_budget_bytes']=1000
        self.configure()
        self.assertEqual(self.usage()['budget_state'],'unknown')
        self.config['monthly_budget_bytes']=0
        self.configure()
        self.assertEqual(self.run_cli('run').returncode,0)
        self.assertEqual(self.usage()['unknown_attempts'],2)

    def test_corrupt_ledger_is_preserved_and_cap_fails_closed(self):
        self.config['monthly_budget_bytes']=1000
        self.configure()
        history=self.path/'history'; history.mkdir()
        path=history/'collector-usage.json'; path.write_text('PRIVATE CORRUPTION')
        self.assertEqual(self.usage()['budget_state'],'unknown')
        for command in ['run','start']:
            self.assertNotEqual(self.run_cli(command).returncode,0)
        self.assertEqual(self.run_cli('tick').returncode,0)
        self.assertEqual(path.read_text(),'PRIVATE CORRUPTION')
        self.assertNotIn('PRIVATE',json.dumps(self.status()))

    def test_pending_reservation_survives_month_rollover_fail_closed(self):
        self.config['monthly_budget_bytes']=1000
        self.configure(); self.result_bytes()
        self.fake.write_text('#!/bin/sh\nmkdir "$WAN_OBSERVER_STORE/collector-usage.next"\ncat "$FAKE_RESULT"\n')
        self.assertNotEqual(self.run_cli('run').returncode,0)
        (self.path/'history/collector-usage.next').rmdir()
        shutil.rmtree(self.path/'runtime')
        feb=1769904000
        u=self.usage(feb)
        self.assertEqual((u['month'],u['known_bytes'],u['unknown_attempts'],u['budget_state']),('2026-02',0,1,'unknown'))
        self.assertNotEqual(self.run_cli('run',feb).returncode,0)

    def test_usage_status_does_not_write_history_or_infer_legacy_bytes(self):
        self.configure()
        history=self.path/'history'; history.mkdir()
        (history/'collector-events.json').write_text(json.dumps({'events':[{'epoch':1767225500,'reason':'manual','outcome':'healthy'}]}))
        u=self.usage()
        self.assertEqual((u['known_bytes'],u['unknown_attempts'],u['accounting_since_epoch']),(0,0,None))
        self.assertFalse((history/'collector-usage.json').exists())
        self.result_bytes()
        self.assertEqual(self.run_cli('run').returncode,0)
        self.assertEqual(self.usage()['known_bytes'],150)

    def test_background_start_reservation_failure_returns_error_without_started_claim(self):
        self.configure(); self.result_bytes()
        history=self.path/'history'; history.mkdir()
        (history/'collector-usage.next').mkdir()
        self.fake.write_text('#!/bin/sh\ntouch "$FAKE_RESULT.started"\ncat "$FAKE_RESULT"\n')
        r=self.run_cli('start')
        self.assertNotEqual(r.returncode,0)
        self.assertNotIn('started',r.stdout)
        self.assertFalse((self.path/'result.started').exists())

    def test_completed_test_spanning_utc_month_is_unknown_not_fabricated_allocation(self):
        self.configure(); self.result_bytes(); self.run_cli('run')
        ledger=json.loads((self.path/'history/collector-usage.json').read_text())
        ledger.update(pending=True,unknown_attempts=1)
        r=subprocess.run(['jq','-L',self.env['WAN_OBSERVER_LIB'],'--argjson','now','1769904000',
                          'import "collector" as c; c::usage_finish({download_bytes:120,upload_bytes:30};$now)'],
                         input=json.dumps(ledger),text=True,capture_output=True)
        self.assertEqual(r.returncode,0,r.stderr)
        value=json.loads(r.stdout)
        self.assertEqual((value['month'],value['known_bytes'],value['unknown_attempts'],value['pending']),
                         ('2026-02',0,1,False))

    def test_adaptive_followup_accounts_actual_bytes(self):
        self.configure(); self.result_bytes(120,30)
        result=json.loads((self.path/'result').read_text())
        result['download']['bandwidth']=1
        (self.path/'result').write_text(json.dumps(result))
        self.assertEqual(self.run_cli('tick').returncode,0)
        self.result_bytes(90,10)
        self.assertEqual(self.run_cli('tick',1767225900).returncode,0)
        self.assertEqual([event['reason'] for event in self.status()['events']],['scheduled','degradation_followup'])
        self.assertEqual((self.usage()['known_bytes'],self.usage()['unknown_attempts']),(250,0))
