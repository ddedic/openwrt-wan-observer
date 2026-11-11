"""Offline readiness and native OpenWrt preservation contracts."""
import gzip
import io
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
import importlib.util
import tarfile

ROOT = Path(__file__).resolve().parents[1]
CORE = ROOT/'package/wan-observer/files'


class ReadinessContracts(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.path=Path(self.tmp.name)
        self.config=self.path/'collector.json'; self.cron=self.path/'cron'
        self.binary=self.path/'private-binary';self.binary.write_text('#!/bin/sh\nexit 1\n');self.binary.chmod(0o700)
        self.env=dict(os.environ,WAN_OBSERVER_CONFIG=str(self.config),WAN_OBSERVER_CRONTAB=str(self.cron),
                      WAN_OBSERVER_LIB=str(CORE))
        self.value=dict(enabled=True,adaptive=False,interval_minutes=120,start_hour=0,end_hour=24,
                        download_mbps=100,upload_mbps=20,threshold_percent=80,binary=str(self.binary),server_id=1,interface='private-interface')

    def status(self):
        result=subprocess.run(['sh',str(CORE/'wan-observer-readiness')],env=self.env,text=True,capture_output=True)
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertNotIn(str(self.binary),result.stdout);self.assertNotIn('private-interface',result.stdout)
        return json.loads(result.stdout)

    def test_setup_missing_invalid_and_symlink(self):
        self.assertEqual(self.status()['status'],'config_missing')
        self.config.write_text('private-invalid-config')
        self.assertEqual(self.status()['status'],'config_invalid')
        self.config.unlink();self.config.symlink_to(self.binary)
        self.assertEqual(self.status()['status'],'config_invalid')

    def test_only_canonical_minute_tick_is_verified(self):
        self.config.write_text(json.dumps(self.value))
        fakebin=self.path/'bin';fakebin.mkdir()
        pidof=fakebin/'pidof';pidof.write_text('#!/bin/sh\nexit 0\n');pidof.chmod(0o700)
        self.env['PATH']=str(fakebin)+os.pathsep+self.env['PATH']
        for line in ('61 * * * * /usr/bin/wan-observer-collect tick',
                     '* * * * /usr/bin/wan-observer-collect tick',
                     '* * * * * * /usr/bin/wan-observer-collect tick',
                     '  # * * * * * /usr/bin/wan-observer-collect tick',
                     '* * * * * /usr/bin/wan-observer-collect tick unexpected',
                     '*/1 * * * * /usr/bin/wan-observer-collect tick',
                     '0 * * * * /usr/bin/wan-observer-collect tick',
                     '61 * * * * /usr/bin/wan-observer-collect tick # label',
                     '* * * * * /usr/bin/wan-observer-collect tick unexpected # label',
                     '* * * * * /usr/bin/wan-observer-collect tick#label',
                     '* * * * * /usr/bin/wan-observer-collect tick \\#label'):
            with self.subTest(line=line):
                self.cron.write_text(line+'\n')
                self.assertEqual(self.status()['status'],'scheduler_missing')
                self.assertEqual(self.status()['checks']['scheduler'],'missing')
        for line in ('  * * * * * /usr/bin/wan-observer-collect tick >/dev/null 2>&1',
                     '* * * * * /usr/bin/wan-observer-collect tick # label',
                     '* * * * * /usr/bin/wan-observer-collect tick >/dev/null 2>&1 # label',
                     '* * * * * /usr/bin/wan-observer-collect tick #label command ignored'):
            with self.subTest(line=line):
                self.cron.write_text(line+'\n')
                self.assertEqual(self.status()['status'],'ready')
                self.assertEqual(self.status()['checks']['scheduler'],'installed')

    def test_enabled_requires_binary_and_active_cron(self):
        self.config.write_text(json.dumps(self.value))
        fakebin=self.path/'bin';fakebin.mkdir()
        pidof=fakebin/'pidof';pidof.write_text('#!/bin/sh\nexit 0\n');pidof.chmod(0o700)
        self.env['PATH']=str(fakebin)+os.pathsep+self.env['PATH']
        self.assertEqual(self.status()['status'],'scheduler_missing')
        self.cron.write_text('# * * * * * /usr/bin/wan-observer-collect tick\n')
        self.assertEqual(self.status()['checks']['scheduler'],'missing')
        self.cron.write_text('* * * * * /usr/bin/wan-observer-collect tick\n')
        self.assertEqual(self.status()['status'],'ready')
        self.assertEqual(self.status()['checks']['scheduler_service'],'running')
        pidof.write_text('#!/bin/sh\nexit 1\n')
        self.assertEqual(self.status()['status'],'scheduler_stopped')
        self.assertEqual(self.status()['checks']['scheduler_service'],'stopped')
        self.binary.chmod(0o600)
        self.assertEqual(self.status()['status'],'binary_missing')
        self.value['enabled']=False;self.config.write_text(json.dumps(self.value))
        self.assertEqual(self.status()['status'],'disabled')


class PreservationContracts(unittest.TestCase):
    def test_native_keep_list_covers_all_persistent_state_excludes_runtime(self):
        keep=(CORE/'wan-observer.keep').read_text().splitlines()
        paths=[x for x in keep if x and not x.startswith('#')]
        self.assertEqual(paths,['/etc/wan-observer/'])
        for state in ('collector.json','history/records.jsonl','history/collector-events.json','history/attempts.jsonl','history/collector-usage.json','quality/2026-11-11.jsonl'):
            self.assertTrue(('/etc/wan-observer/'+state).startswith(paths[0]))
        self.assertFalse('/tmp/wan-observer-collector/state.json'.startswith(paths[0]))

    def test_ipk_conffiles_and_no_operational_config_or_lifecycle_scripts(self):
        spec=importlib.util.spec_from_file_location('builder', ROOT/'tools/build-ipk.py')
        builder=importlib.util.module_from_spec(spec);spec.loader.exec_module(builder)
        with tempfile.TemporaryDirectory() as tmp:
            builder.OUT=Path(tmp)
            builder.build('wan-observer','test','jq',{'lib/upgrade/keep.d/wan-observer':(b'/etc/wan-observer/\n',0o644)},conffiles=['/etc/wan-observer/collector.json'])
            with tarfile.open(next(Path(tmp).glob('*.ipk')),'r:gz') as outer:
                with tarfile.open(fileobj=io.BytesIO(outer.extractfile('./control.tar.gz').read()),mode='r:gz') as control:
                    self.assertEqual(control.extractfile('./conffiles').read(),b'/etc/wan-observer/collector.json\n')
                    self.assertFalse(any(x.name.endswith(('postinst','preinst','prerm','postrm')) for x in control))
                with tarfile.open(fileobj=io.BytesIO(outer.extractfile('./data.tar.gz').read()),mode='r:gz') as data:
                    self.assertNotIn('./etc/wan-observer/collector.json',data.getnames())
