"""Synthetic fixtures only. Never use real router output in this suite."""
import csv
import io
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
CLI = ROOT / 'package/wan-observer/files/wan-observer'


def fixture():
    return {
        'type': 'result', 'timestamp': '2026-01-02T03:04:05Z',
        'download': {'bandwidth': 12500000},
        'upload': {'bandwidth': 2500000},
        'ping': {'latency': 12.5, 'jitter': 1.2},
        'packetLoss': 0,
        'interface': {'externalIp': '192.0.2.9', 'macAddr': '02:00:00:00:00:01'},
        'isp': 'SYNTHETIC_PRIVATE_MARKER',
        'server': {'id': 123, 'host': 'private.example'},
        'result': {'url': 'https://example.invalid/private-result'},
    }


class CLITests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.env = dict(os.environ, WAN_OBSERVER_LIB=str(CLI.parent),
                        WAN_OBSERVER_STORE=self.temp.name + '/history',
                        WAN_OBSERVER_MAX_RECORDS='2')

    def run_cli(self, command, value=None):
        return subprocess.run(['sh', str(CLI), command],
                              input=None if value is None else json.dumps(value),
                              text=True, capture_output=True, env=self.env)

    def test_normalize_converts_bytes_and_strips_private_fields(self):
        r = self.run_cli('normalize-ookla', fixture())
        self.assertEqual(r.returncode, 0, r.stderr)
        data = json.loads(r.stdout)
        self.assertEqual(data['download_mbps'], 100)
        self.assertEqual(data['upload_mbps'], 20)
        self.assertEqual(data['packet_loss_percent'], 0)
        for private in ['192.0.2.9', 'macAddr', 'PRIVATE_MARKER', 'private.example', 'private-result']:
            self.assertNotIn(private, r.stdout + r.stderr)

    def test_missing_optional_metrics_remain_unknown(self):
        value = fixture()
        del value['packetLoss']
        del value['ping']
        r = self.run_cli('normalize-ookla', value)
        self.assertEqual(r.returncode, 0, r.stderr)
        data = json.loads(r.stdout)
        self.assertIsNone(data['packet_loss_percent'])
        self.assertIsNone(data['idle_latency_ms'])

    def test_rejects_partial_negative_and_untrusted_values(self):
        variants = []
        for field, replacement in [('type', 'download'), ('timestamp', '=HYPERLINK("secret")'),
                                   ('download', {'bandwidth': -1}), ('upload', {}),
                                   ('packetLoss', 101), ('ping', {'latency': 'secret'})]:
            value = fixture()
            value[field] = replacement
            variants.append(value)
        for value in variants:
            with self.subTest(value=value):
                r = self.run_cli('normalize-ookla', value)
                self.assertNotEqual(r.returncode, 0)
                self.assertEqual(r.stdout, '')
                self.assertNotIn('secret', r.stderr)

    def test_import_retention_permissions_and_csv(self):
        for seconds in [5, 6, 7]:
            value = fixture()
            value['timestamp'] = f'2026-01-02T03:04:{seconds:02d}Z'
            r = self.run_cli('import-ookla', value)
            self.assertEqual(r.returncode, 0, r.stderr)
        r = self.run_cli('list')
        self.assertEqual(r.returncode, 0, r.stderr)
        rows = [json.loads(line) for line in r.stdout.splitlines()]
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0]['timestamp'], '2026-01-02T03:04:06Z')
        path = Path(self.env['WAN_OBSERVER_STORE']) / 'measurements.jsonl'
        self.assertEqual(path.stat().st_mode & 0o777, 0o600)
        exported = self.run_cli('export-csv')
        records = list(csv.DictReader(io.StringIO(exported.stdout)))
        self.assertEqual(len(records), 2)
        self.assertEqual(records[0]['download_mbps'], '100')
        self.assertNotIn('PRIVATE_MARKER', exported.stdout)

    def test_actual_transfer_bytes_are_optional_validated_and_exportable(self):
        value = fixture()
        value['download']['bytes'] = 123456
        value['upload']['bytes'] = 23456
        r = self.run_cli('import-ookla', value)
        self.assertEqual(r.returncode, 0, r.stderr)
        row = json.loads(self.run_cli('list').stdout)
        self.assertEqual((row['download_bytes'], row['upload_bytes']), (123456, 23456))
        self.assertEqual(list(csv.DictReader(io.StringIO(self.run_cli('export-csv').stdout)))[0]['download_bytes'], '123456')
        for bad in [-1, 'PRIVATE_VALUE', 1.5, 9007199254740992]:
            value['download']['bytes'] = bad
            row = json.loads(self.run_cli('normalize-ookla', value).stdout)
            self.assertIsNone(row['download_bytes'])

    def test_attempt_id_is_local_validated_and_provider_ids_are_stripped(self):
        value=fixture()
        value['attempt_id']='fedcba9876543210fedcba9876543210'
        value['result']['id']='PRIVATE_PROVIDER_ID'
        self.assertIsNone(json.loads(self.run_cli('normalize-ookla',value).stdout).get('attempt_id'))
        local_id='0123456789abcdef0123456789abcdef'
        self.env['WAN_OBSERVER_ATTEMPT_ID']=local_id
        self.assertEqual(self.run_cli('import-ookla',value).returncode,0)
        row=json.loads(self.run_cli('list').stdout)
        self.assertEqual(row.get('attempt_id'),local_id)
        csv_row=list(csv.DictReader(io.StringIO(self.run_cli('export-csv').stdout)))[0]
        self.assertEqual(csv_row.get('attempt_id'),local_id)
        self.assertNotIn('PRIVATE_PROVIDER_ID',json.dumps(row))
        for invalid in ['', 'a'*31, 'a'*33, 'A'*32, 'g'*32, 'PRIVATE_BAD_ID', 'é'*32]:
            self.env['WAN_OBSERVER_ATTEMPT_ID']=invalid
            result=self.run_cli('import-ookla',value)
            self.assertNotEqual(result.returncode,0)
            self.assertNotIn('PRIVATE_BAD_ID',result.stderr)
        self.env.pop('WAN_OBSERVER_ATTEMPT_ID')
        path=Path(self.env['WAN_OBSERVER_STORE'])/'measurements.jsonl'
        old=dict(row);old.pop('attempt_id')
        path.write_text(json.dumps(old)+'\n')
        legacy=json.loads(self.run_cli('list').stdout)
        self.assertIsNone(legacy.get('attempt_id'))
        old['attempt_id']='PRIVATE_BAD_ID'
        original=json.dumps(old)+'\n';path.write_text(original)
        result=self.run_cli('list')
        self.assertNotEqual(result.returncode,0)
        self.assertNotIn('PRIVATE_BAD_ID',result.stderr)
        self.assertEqual(path.read_text(),original)

    def test_failed_import_preserves_history(self):
        r = self.run_cli('import-ookla', fixture())
        self.assertEqual(r.returncode, 0, r.stderr)
        before = self.run_cli('list').stdout
        self.assertNotEqual(self.run_cli('import-ookla', {}).returncode, 0)
        self.assertEqual(self.run_cli('list').stdout, before)

    def test_corrupt_history_is_not_overwritten(self):
        self.assertEqual(self.run_cli('import-ookla', fixture()).returncode, 0)
        path = Path(self.env['WAN_OBSERVER_STORE']) / 'measurements.jsonl'
        path.write_text('PRIVATE_BROKEN_HISTORY')
        r = self.run_cli('import-ookla', fixture())
        self.assertNotEqual(r.returncode, 0)
        self.assertNotIn('PRIVATE_BROKEN_HISTORY', r.stdout + r.stderr)
        self.assertEqual(path.read_text(), 'PRIVATE_BROKEN_HISTORY')

    def test_invalid_retention_is_rejected(self):
        for value in ['0', '10001', '-1', 'not-a-number']:
            self.env['WAN_OBSERVER_MAX_RECORDS'] = value
            self.assertNotEqual(self.run_cli('import-ookla', fixture()).returncode, 0)

    def test_multiple_results_and_oversized_input_are_rejected(self):
        for data in [json.dumps(fixture()) * 2, ' ' * 1048577]:
            r = subprocess.run(['sh', str(CLI), 'normalize-ookla'], input=data,
                               text=True, capture_output=True, env=self.env)
            self.assertNotEqual(r.returncode, 0)
            self.assertEqual(r.stdout, '')

    def test_concurrent_writer_is_refused(self):
        store = Path(self.env['WAN_OBSERVER_STORE'])
        (store / '.lock').mkdir(parents=True)
        r = self.run_cli('import-ookla', fixture())
        self.assertNotEqual(r.returncode, 0)
        self.assertFalse((store / 'measurements.jsonl').exists())


if __name__ == '__main__':
    unittest.main()
