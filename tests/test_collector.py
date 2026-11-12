import json
import os
from pathlib import Path
import subprocess
import shutil
import tempfile
import time
from datetime import datetime, timezone
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

    def test_mixed_attempt_retention_exceeds_200_and_reports_legacy_gap(self):
        self.configure()
        self.run_cli('run')
        path = self.path/'runtime/state.json'
        state = json.loads(path.read_text())
        state.pop('coverage', None)
        state['events'] = [dict(epoch=1767225300+i, reason='manual',
                                outcome='failed' if i%2 else 'healthy') for i in range(250)]
        path.write_text(json.dumps(state))
        original = path.read_bytes()
        self.assertTrue(self.status()['coverage']['legacy_incomplete'])
        self.assertEqual(path.read_bytes(), original)  # status migration is read only
        self.assertEqual(self.run_cli('run',1767225601).returncode, 0)
        s = self.status()
        self.assertEqual(len(s['events']), 251)
        self.assertEqual(s['coverage']['complete_since_epoch'],1767225601)
        self.assertEqual(s['coverage']['coverage_from_epoch'],1767225601)
        self.env['WAN_OBSERVER_MAX_RECORDS']='251'
        self.run_cli('run',1767225602)
        s=self.status()
        self.assertEqual(len(s['events']),251)
        self.assertEqual(s['events'][0]['epoch'],1767225301)
        (self.path/'runtime/state.json').unlink()
        self.assertEqual(self.status()['coverage'], s['coverage'])

    def test_failure_categories_do_not_create_zero_measurements(self):
        self.configure()
        for code, script in [('backend_exit','echo PRIVATE_ERROR >&2; exit 7'),
                             ('invalid_result','echo PRIVATE_RESULT')]:
            self.fake.write_text('#!/bin/sh\n'+script+'\n')
            self.assertEqual(self.run_cli('run').returncode,0)
            s=self.status()
            self.assertEqual(s['events'][-1]['failure_code'],code)
            self.assertNotIn('PRIVATE',json.dumps(s))
        self.fake.write_text('#!/bin/sh\ncat "$FAKE_RESULT"\n')
        (self.path/'history/.lock').mkdir()
        self.assertEqual(self.run_cli('run').returncode,0)
        self.assertEqual(self.status()['events'][-1]['failure_code'],'storage_error')
        self.assertFalse((self.path/'history/measurements.jsonl').exists())

    def test_timeout_status_is_sanitized_and_distinct(self):
        self.configure()
        bindir=self.path/'bin';bindir.mkdir()
        stub=bindir/'timeout';stub.write_text('#!/bin/sh\necho PRIVATE_TIMEOUT >&2; exit 124\n');stub.chmod(0o700)
        self.env['PATH']=str(bindir)+os.pathsep+os.environ['PATH']
        r=self.run_cli('run')
        self.assertEqual(r.returncode,0,r.stderr)
        self.assertEqual(self.status()['events'][-1]['failure_code'],'timeout')
        self.assertNotIn('PRIVATE',r.stdout+r.stderr)
        self.assertFalse((self.path/'history/measurements.jsonl').exists())

    def test_pending_attempt_is_reserved_before_backend_and_finalized_once(self):
        self.configure()
        self.fake.write_text('#!/bin/sh\nwhile [ -e "$FAKE_RESULT.hold" ]; do sleep 0.05; done\ncat "$FAKE_RESULT"\n')
        (self.path/'result.hold').touch()
        self.addCleanup(lambda: (self.path/'result.hold').unlink(missing_ok=True))
        self.assertEqual(self.run_cli('start').returncode,0)
        deadline=time.time()+5
        while not self.status()['events'] and time.time()<deadline: time.sleep(0.05)
        s=self.status()
        self.assertTrue(s['busy'])
        self.assertEqual(s['events'][-1]['failure_code'],'interrupted')
        self.assertTrue(s['events'][-1]['pending'])
        saved=json.loads((self.path/'history/collector-events.json').read_text())
        self.assertEqual(len(saved['events']),1)
        attempt_id=saved['events'][0].get('attempt_id')
        self.assertIsNotNone(attempt_id)
        self.assertRegex(attempt_id,'^[0-9a-f]{32}$')
        (self.path/'result.hold').unlink()
        while self.status()['busy'] and time.time()<deadline: time.sleep(0.05)
        s=self.status()
        self.assertFalse(s['busy'])
        self.assertEqual(len(s['events']),1)
        self.assertFalse(s['events'][-1]['pending'])
        row=json.loads((self.path/'history/measurements.jsonl').read_text())
        self.assertEqual(s['events'][0]['attempt_id'],attempt_id)
        self.assertEqual(row['attempt_id'],attempt_id)
        self.assertEqual(s['events'][-1]['outcome'],'healthy')

    def test_migration_keeps_original_event_file_and_measurements(self):
        self.configure()
        store=self.path/'history';store.mkdir()
        original='{"events":[{"epoch":1767225500,"reason":"manual","outcome":"failed"}]}'
        (store/'collector-events.json').write_text(original)
        normalized=subprocess.run(['sh',str(LIB/'wan-observer'),'normalize-ookla'],
                                  input=json.dumps(fixture()),text=True,capture_output=True,env=self.env).stdout
        (store/'measurements.jsonl').write_text(normalized)
        self.run_cli('run')
        self.assertEqual((store/'collector-events.legacy.json').read_text(),original)
        self.assertEqual((store/'measurements.jsonl').read_text().splitlines()[0],normalized.strip())
        self.assertTrue(self.status()['coverage']['legacy_incomplete'])
        self.run_cli('run')
        self.assertEqual((store/'collector-events.legacy.json').read_text(),original)

    def test_final_persistence_failure_is_reported_without_losing_reservation(self):
        self.configure()
        self.fake.write_text('#!/bin/sh\nmkdir "$WAN_OBSERVER_STORE/collector-events.next"\ncat "$FAKE_RESULT"\n')
        r=self.run_cli('run')
        self.assertNotEqual(r.returncode,0)
        self.assertNotIn('healthy',r.stdout)
        s=self.status()
        self.assertEqual(s['events'][-1]['failure_code'],'storage_error')
        self.assertTrue(s['coverage']['persistence_error'])
        saved=json.loads((self.path/'history/collector-events.json').read_text())
        self.assertEqual(saved['events'][-1]['failure_code'],'interrupted')
        row=json.loads((self.path/'history/measurements.jsonl').read_text())
        self.assertIsNotNone(row.get('attempt_id'))
        self.assertEqual(row['attempt_id'],saved['events'][-1]['attempt_id'])
        self.assertEqual(row['attempt_id'],s['events'][-1]['attempt_id'])

    def test_attempt_ids_are_new_for_each_run_and_generation_failure_stops_backend(self):
        self.configure()
        self.env['WAN_OBSERVER_ATTEMPT_ID']='f'*32  # collector never reuses inherited identity
        self.assertEqual(self.run_cli('run').returncode,0)
        self.assertEqual(self.run_cli('run').returncode,0)
        ids=[e['attempt_id'] for e in self.status()['events']]
        self.assertEqual(len(set(ids)),2)
        self.assertNotIn('f'*32,ids)
        bindir=self.path/'bin';bindir.mkdir()
        self.env['WAN_OBSERVER_UUID_SOURCE']=str(self.path/'missing-uuid')
        stub=bindir/'od';stub.write_text('#!/bin/sh\necho PRIVATE_RANDOM_ERROR >&2; exit 1\n');stub.chmod(0o700)
        self.env['PATH']=str(bindir)+os.pathsep+os.environ['PATH']
        result=self.run_cli('run')
        self.assertNotEqual(result.returncode,0)
        self.assertNotIn('PRIVATE_RANDOM_ERROR',result.stdout+result.stderr)
        self.assertEqual(len(self.status()['events']),2)
        self.assertEqual(len((self.path/'history/measurements.jsonl').read_text().splitlines()),2)

    def test_usage_month_validation_requires_ascii_real_month_and_supported_year(self):
        usage=dict(schema_version=1,month='2026-11',known_bytes=0,unknown_attempts=0,
                   accounting_since_epoch=1767225600,pending=False,accounting_error=False)
        for month, expected in [('2026-11',True),('2024-01',True),('9999-12',True),
                                ('2026-13',False),('2026-00',False),('2026-1x',False),
                                ('２０２６-11',False),('2026/11',False),('2023-12',False),
                                ('10000-01',False),('PRIVATE_MONTH',False), (None,False)]:
            usage['month']=month
            result=subprocess.run(['jq','-L',str(LIB),'import "collector" as c; c::usage_valid'],
                                  input=json.dumps(usage),text=True,capture_output=True)
            self.assertEqual(result.returncode,0,result.stderr)
            self.assertEqual(json.loads(result.stdout),expected,repr(month))

    def test_kernel_uuid_source_works_without_od_and_rejects_malformed_identity(self):
        self.configure()
        bindir=self.path/'no-od';bindir.mkdir()
        for command in ['cat','chmod','cp','cut','date','head','jq','mkdir','mktemp','mv','rm','rmdir','sh','tail','timeout','tr','wc']:
            (bindir/command).symlink_to(shutil.which(command))
        self.env['PATH']=str(bindir)
        source=self.path/'kernel-uuid'
        self.env['WAN_OBSERVER_UUID_SOURCE']=str(source)
        source.write_text('12345678-9abc-4def-8123-456789abcdef\n')
        r=self.run_cli('run')
        self.assertEqual(r.returncode,0,r.stderr)
        s=self.status()
        self.assertEqual(s['events'][-1]['attempt_id'],'123456789abc4def8123456789abcdef')
        row=json.loads((self.path/'history/measurements.jsonl').read_text())
        self.assertEqual(row['attempt_id'],s['events'][-1]['attempt_id'])
        for invalid in ['PRIVATE_UUID','a'*32,'12345678-9abc-4def-8123-456789abcdeg',
                        '12345678-9ABC-4def-8123-456789abcdef']:
            source.write_text(invalid)
            r=self.run_cli('run')
            self.assertNotEqual(r.returncode,0)
            self.assertNotIn('PRIVATE_UUID',r.stdout+r.stderr)
            self.assertEqual(len(self.status()['events']),1)

    def test_optional_defaults_do_not_rewrite_or_retime_legacy_configuration(self):
        self.configure();self.run_cli('tick')
        raw=dict(self.config);raw.pop('monthly_budget_bytes',None)
        path=self.path/'config.json';path.write_text(json.dumps(raw))
        original=path.read_bytes();before=self.status()['next_epoch'];normal=self.status()['next_normal']
        status=self.status()
        self.assertFalse(status['config'].get('quality_history_enabled',True))
        self.assertEqual(status['config'].get('window_timezone'),'UTC')
        self.assertEqual(path.read_bytes(),original)
        r=self.run_cli('configure',value=self.config)
        self.assertEqual(r.returncode,0,r.stderr)
        self.assertEqual(path.read_bytes(),original)
        self.assertEqual(self.status()['next_epoch'],before)
        self.assertEqual(self.status()['next_normal'],normal)

    def test_extended_schedule_patch_validation_and_old_clients_preserve_options(self):
        initial=fixture();initial['download']['bytes']=120;initial['upload']['bytes']=30
        (self.path/'result').write_text(json.dumps(initial))
        self.configure();self.run_cli('tick');before=self.status()['next_epoch']
        patch=dict(enabled=True,adaptive=True,interval_minutes=30,start_hour=0,end_hour=24)
        expanded=dict(patch,threshold_percent=90,monthly_budget_bytes=123456,
                      quality_history_enabled=True,window_timezone='router')
        r=self.run_cli('schedule',value=expanded)
        self.assertEqual(r.returncode,0,r.stderr)
        self.assertEqual(self.status()['next_epoch'],before)  # all-day timezone edits do not retime
        self.run_cli('tick')
        before=self.status()['next_epoch']
        for bad in [dict(expanded,quality_history_enabled=1),dict(expanded,window_timezone='Europe/Vienna'),
                    dict(expanded,threshold_percent=0),dict(expanded,monthly_budget_bytes=-1),
                    dict(expanded,binary='/tmp/no'),dict(expanded,download_mbps=250),
                    dict(expanded,start_hour=5,end_hour=5)]:
            self.assertNotEqual(self.run_cli('schedule',value=bad).returncode,0)
        self.assertEqual(self.run_cli('configure',value=self.config).returncode,0)
        config=self.status()['config']
        self.assertTrue(config['quality_history_enabled'])
        self.assertEqual(config['window_timezone'],'router')
        self.assertEqual(config['monthly_budget_bytes'],123456)
        self.assertEqual(self.status()['next_epoch'],before)
        self.assertEqual(self.run_cli('schedule',value=dict(expanded,threshold_percent=70)).returncode,0)
        self.assertEqual(self.status()['next_epoch'],before)
        bad=fixture();bad['download']['bandwidth']=10000000
        bad['download']['bytes']=120;bad['upload']['bytes']=30
        (self.path/'result').write_text(json.dumps(bad))
        self.assertEqual(self.run_cli('run').returncode,0)
        self.assertEqual(self.status()['events'][-1]['outcome'],'healthy')
        self.assertEqual(self.run_cli('schedule',value=expanded).returncode,0)
        self.assertEqual(self.run_cli('run').returncode,0)
        self.assertEqual(self.status()['events'][-1]['outcome'],'degraded')

    def test_long_intervals_and_overnight_window_keep_utc_epoch_grid(self):
        self.config.update(adaptive=False,start_hour=22,end_hour=6)
        for interval in [180,240,360,720]:
            self.config['interval_minutes']=interval
            self.configure()
        self.config['interval_minutes']=180;self.configure()
        base=1767225600
        self.assertEqual(self.run_cli('tick',base+21*3600).returncode,0)
        self.assertEqual(self.status()['events'],[])
        self.run_cli('tick',base+22*3600)
        self.assertEqual(self.status()['next_epoch'],base+24*3600)
        self.run_cli('tick',base+26*3600)
        self.assertEqual(len(self.status()['events']),2)
        self.run_cli('tick',base+30*3600)
        self.assertEqual(len(self.status()['events']),2)

    def test_router_timezone_dst_eligibility_and_legacy_utc_independence(self):
        epoch=lambda text:int(datetime.fromisoformat(text).replace(tzinfo=timezone.utc).timestamp())
        self.env['TZ']='CET-1CEST,M3.5.0,M10.5.0/3'
        self.config.update(adaptive=False,interval_minutes=60,start_hour=1,end_hour=3,window_timezone='router')
        self.configure()
        for date,count in [('2026-03-29T00:30:00',1),('2026-03-29T01:30:00',1),
                           ('2026-10-25T00:30:00',2),('2026-10-25T01:30:00',3)]:
            self.assertEqual(self.run_cli('tick',epoch(date)).returncode,0)
            self.assertEqual(len(self.status()['events']),count,date)
        s=json.loads(self.run_cli('status',epoch('2026-07-01T00:00:00')).stdout)
        native=subprocess.run(['date','+%z'],env=self.env,text=True,capture_output=True).stdout.strip()
        self.assertEqual(s['router_timezone']['utc_offset'],native)
        self.config.update(start_hour=0,end_hour=1,window_timezone='UTC');self.configure()
        self.run_cli('tick',epoch('2026-10-26T00:30:00'))
        self.assertEqual(len(self.status()['events']),4)

    def test_quality_history_is_opt_in_once_per_minute_independent_of_full_schedule_and_budget(self):
        script=self.path/'quality'
        script.write_text('#!/bin/sh\nprintf "%s %s %s\\n" "$1" "$WAN_OBSERVER_QUALITY_NOW" "$WAN_OBSERVER_QUALITY_STORE" >> "$QUALITY_LOG"\nexit 1\n')
        self.env.update(WAN_OBSERVER_QUALITY_CLI=str(script),WAN_OBSERVER_QUALITY_STORE=str(self.path/'quality-store'),
                        QUALITY_LOG=str(self.path/'quality-calls'))
        self.config.update(enabled=False,quality_history_enabled=False);self.configure()
        self.run_cli('tick')
        log=self.path/'quality-calls';self.assertFalse(log.exists())
        self.config.update(quality_history_enabled=True);self.configure()
        for offset in [0,1,60]:
            self.assertEqual(self.run_cli('tick',1767225600+offset).returncode,0)
        self.assertEqual(len(log.read_text().splitlines()),2)
        self.assertIn('tick 1767225600 '+str(self.path/'quality-store'),log.read_text())
        self.run_cli('run',1767225661);self.status()
        self.assertEqual(len(log.read_text().splitlines()),2)
        self.assertEqual(self.run_cli('start',1767225662).returncode,0)
        deadline=time.time()+5
        while self.status()['busy'] and time.time()<deadline: time.sleep(0.05)
        self.assertEqual(len(log.read_text().splitlines()),2)
        self.config.update(enabled=True,monthly_budget_bytes=1);self.configure()
        self.assertEqual(self.run_cli('tick',1767225720).returncode,0)  # unknown bytes block full test only
        self.assertEqual(len(log.read_text().splitlines()),3)
        self.assertEqual(len(self.status()['events']),2)

    def test_missing_quality_cli_does_not_block_due_full_test(self):
        self.env['WAN_OBSERVER_QUALITY_CLI']=str(self.path/'absent-quality')
        self.config.update(quality_history_enabled=True)
        self.configure()
        r=self.run_cli('tick')
        self.assertEqual(r.returncode,0,r.stderr)
        self.assertEqual(self.status()['events'][-1]['outcome'],'healthy')
        failed=self.path/'failed-quality';failed.write_text('#!/bin/sh\nexit 1\n')
        self.env['WAN_OBSERVER_QUALITY_CLI']=str(failed)
        self.assertEqual(self.run_cli('tick',self.status()['next_epoch']).returncode,0)
        self.assertEqual(len(self.status()['events']),2)

    def test_trusted_router_timezone_file_is_data_and_overrides_ambient_tz(self):
        self.env['TZ']='UTC'
        tz_file=self.path/'router-TZ';tz_file.write_text('CET-1CEST,M3.5.0,M10.5.0/3\n')
        self.env['WAN_OBSERVER_TZ_FILE']=str(tz_file)
        self.config.update(adaptive=False,start_hour=1,end_hour=2,window_timezone='router')
        self.configure();self.run_cli('tick',1767225600)  # UTC00:00 is router01:00
        self.assertEqual(len(self.status()['events']),1)
        native=subprocess.run(['date','+%z'],env=dict(self.env,TZ=tz_file.read_text().strip()),text=True,capture_output=True).stdout.strip()
        self.assertEqual(self.status()['router_timezone']['utc_offset'],native)

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
        before={k:v for k,v in self.status().items() if k not in ('events','usage')}
        r=self.run_cli('run',1767227500);self.assertEqual(r.returncode,0,r.stderr)
        self.assertEqual(r.stdout,'Manual test degraded.\n')
        (self.path/'result').write_text('PRIVATE_ERROR')
        self.assertEqual(self.run_cli('run',1767227600).stdout,'Manual test failed.\n')
        s=self.status()
        self.assertEqual({k:v for k,v in s.items() if k not in ('events','usage')},before)
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

    def test_dashboard_start_uses_account_home_for_backend_license(self):
        # GL.iNet fcgiwrap runs `start` with HOME=/ (or none); Ookla CLI then can't find
        # its accepted license under $HOME/.config/ookla and exits with a license prompt.
        self.configure()
        home=self.path/'account-home';(home/'.config/ookla').mkdir(parents=True)
        (home/'.config/ookla/speedtest-cli.json').write_text('{}')
        (self.path/'passwd').write_text(f'other:x:{os.getuid()+1}:0::/nowhere:/bin/sh\nme:x:{os.getuid()}:0::{home}:/bin/sh\n')
        self.env['WAN_OBSERVER_PASSWD']=str(self.path/'passwd')
        self.fake.write_text('#!/bin/sh\n[ -f "$HOME/.config/ookla/speedtest-cli.json" ] || exit 1\ncat "$FAKE_RESULT"\n')
        for start_home in ('/', None):
            if start_home: self.env['HOME']=start_home
            else: self.env.pop('HOME', None)
            r=self.run_cli('start');self.assertEqual(r.stdout,'Manual test started.\n',r.stderr)
            deadline=time.time()+10
            while self.status()['busy'] and time.time()<deadline: time.sleep(0.05)
            event=self.status()['events'][-1]
            self.assertEqual((event['reason'],event['outcome'],event['failure_code']),('manual','healthy',None),start_home)

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
