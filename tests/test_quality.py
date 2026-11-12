"""Local-only passive quality contract tests; fixtures never make network calls."""

import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
CLI = ROOT / 'package/wan-observer/files/wan-observer-quality'
LIB = CLI.parent


class QualityTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.base = Path(self.tmp.name)
        self.store = self.base / 'history'
        self.payload = self.base / 'snapshot'
        self.payload.write_text(
            json.dumps(
                {
                    'responsiveness': dict.fromkeys(
                        [
                            'wan_gateway_latency',
                            'internet_latency',
                            'dns_lookup_latency',
                            'typical_latency',
                            'worst_latency',
                            'jitter_latency',
                            'score',
                        ],
                        12,
                    ),
                    'reliability': {
                        'score': 95,
                        'packet_loss_percent': 2,
                        'status_label': 'private.example',
                        'status': [1] * 30,
                    },
                    'rate': {'total_current': 13, 'upload_current': 3, 'download_current': 10},
                    'target': '192.0.2.1',
                }
            )
        )
        self.ubus = self.base / 'ubus'
        self.ubus.write_text(
            '#!/bin/sh\nprintf "%s\\n" "$*" >> "$CALL_LOG"\n'
            'case "$*" in *list*) [ "${MISSING:-0}" != 1 ] || exit 1; echo network-quality;;\n'
            '*snapshot*) [ "${PROBE_ERROR:-0}" != 1 ] || exit 1; cat "$PAYLOAD";; *) exit 9;; esac\n'
        )
        self.uci = self.base / 'uci'
        self.uci.write_text('#!/bin/sh\nprintf "%s\\n" "${ENABLED:-1}"\n')
        self.ubus.chmod(0o700)
        self.uci.chmod(0o700)
        self.env = dict(
            os.environ,
            WAN_OBSERVER_LIB=str(LIB),
            WAN_OBSERVER_QUALITY_STORE=str(self.store),
            WAN_OBSERVER_QUALITY_UBUS=str(self.ubus),
            WAN_OBSERVER_QUALITY_UCI=str(self.uci),
            WAN_OBSERVER_QUALITY_NOW='1794355200',
            PAYLOAD=str(self.payload),
            CALL_LOG=str(self.base / 'calls'),
        )

    def run_cli(self, *args, good=True):
        result = subprocess.run(
            ['sh', str(CLI), *args], env=self.env, text=True, capture_output=True
        )
        if good:
            self.assertEqual(result.returncode, 0, result.stderr)
        else:
            self.assertNotEqual(result.returncode, 0)
        return result

    def tick(self):
        return json.loads(self.run_cli('tick').stdout)

    def test_sample_private_and_duplicate_minute(self):
        a = self.tick()
        self.assertEqual(a['state'], 'available')
        self.assertTrue(a['stored'])
        self.assertFalse(self.tick()['stored'])
        rows = self.run_cli('list').stdout
        self.assertEqual(len(rows.splitlines()), 1)
        self.assertNotIn('private.example', rows)
        self.assertNotIn('192.0.2.1', rows)
        self.assertNotIn('status_label', rows)
        self.assertEqual(self.store.stat().st_mode & 0o777, 0o700)
        self.assertEqual(next(self.store.glob('*.jsonl')).stat().st_mode & 0o777, 0o600)
        calls = (self.base / 'calls').read_text()
        self.assertNotIn('set_speedtest', calls)
        self.assertNotIn('reload_config', calls)

    def test_current_failure_does_not_reuse_healthy_state(self):
        self.tick()
        self.env['PROBE_ERROR'] = '1'
        status = json.loads(self.run_cli('status').stdout)
        self.assertEqual(status['state'], 'error')
        self.assertEqual(status['latest_observation']['state'], 'available')
        self.assertEqual(status['source_freshness'], 'unknown')
        self.env['WAN_OBSERVER_QUALITY_NOW'] = '1794355260'
        self.assertEqual(self.tick()['observation']['error_category'], 'snapshot_failed')

    def test_missing_and_disabled(self):
        self.env['MISSING'] = '1'
        self.assertEqual(self.tick()['state'], 'unsupported')
        self.env.pop('MISSING')
        self.env['ENABLED'] = '0'
        self.assertEqual(json.loads(self.run_cli('status').stdout)['state'], 'disabled')

    def test_invalid_json_and_numeric_values(self):
        for payload in [
            'not json',
            '{}',
            '{"responsiveness":null}',
            self.payload.read_text().replace('12', '-1'),
            self.payload.read_text().replace('12', 'NaN'),
            self.payload.read_text().replace('12', '1e999'),
        ]:
            self.payload.write_text(payload)
            status = json.loads(self.run_cli('status').stdout)
            self.assertEqual(status['state'], 'error')
            self.assertIsNone(status['current_observation']['responsiveness'])

    def test_retention_and_limits(self):
        self.tick()
        self.env['WAN_OBSERVER_QUALITY_NOW'] = str(1794355200 + 31 * 86400)
        self.tick()
        self.assertEqual(len(list(self.store.glob('*.jsonl'))), 1)
        self.assertEqual(json.loads(self.run_cli('status').stdout)['sample_count'], 1)
        self.run_cli('list', '0', good=False)
        self.run_cli('list', '43201', good=False)
        self.run_cli('list', '1;touch x', good=False)

    def test_lock_and_corrupt_history_preserved(self):
        self.tick()
        (self.store / '.lock').mkdir()
        self.run_cli('tick', good=False)
        (self.store / '.lock').rmdir()
        day = next(self.store.glob('*.jsonl'))
        day.write_text(day.read_text() + 'broken\n')
        original = day.read_bytes()
        self.run_cli('list', good=False)
        self.run_cli('tick', good=False)
        self.assertEqual(day.read_bytes(), original)

    def test_full_day_is_bounded_and_validated(self):
        self.tick()
        day = next(self.store.glob('*.jsonl'))
        observation = json.loads(day.read_text())
        rows = []
        for minute in range(1440):
            rows.append(json.dumps(dict(observation, sampled_at=1794355200 + minute * 60)))
        day.write_text('\n'.join(rows) + '\n')
        self.assertFalse(self.tick()['stored'])
        self.assertEqual(json.loads(self.run_cli('status').stdout)['sample_count'], 1440)
        self.assertEqual(len(self.run_cli('list', '3').stdout.splitlines()), 3)
        day.write_text(day.read_text() + json.dumps(observation) + '\n')
        self.run_cli('list', good=False)

    def test_history_rejects_unknown_fields_and_symlinks(self):
        self.tick()
        day = next(self.store.glob('*.jsonl'))
        observation = json.loads(day.read_text())
        observation['target'] = 'private.example'
        day.write_text(json.dumps(observation) + '\n')
        self.run_cli('list', good=False)
        day.unlink()
        outside = self.base / 'outside'
        outside.write_text('unchanged')
        day.symlink_to(outside)
        self.run_cli('tick', good=False)
        self.run_cli('list', good=False)
        self.assertEqual(outside.read_text(), 'unchanged')

    def test_bounds_reject_native_strings_and_large_values(self):
        original = self.payload.read_text()
        for metric in [-1, 101, '12', True, None, 1e30]:
            payload = json.loads(original)
            payload['reliability']['score'] = metric
            self.payload.write_text(json.dumps(payload))
            self.assertEqual(json.loads(self.run_cli('status').stdout)['state'], 'error')

    def test_jq16_reserved_identifiers_are_not_used(self):
        # jq1.8 accepts variables that jq1.6 tokenizes as keywords before '$'.
        # Keep this check even on newer hosts; real target compilation is required too.
        import re

        keywords = {
            'as',
            'import',
            'include',
            'module',
            'def',
            'if',
            'then',
            'else',
            'elif',
            'and',
            'or',
            'end',
            'reduce',
            'foreach',
            'try',
            'catch',
            'label',
            'break',
            '__loc__',
        }
        variables = set(re.findall(r'\$([A-Za-z_][A-Za-z_0-9]*)', (LIB / 'quality.jq').read_text()))
        self.assertEqual(variables & keywords, set())

    def test_series_bounds_and_empty_bins(self):
        for days in [1, 7, 30]:
            series = json.loads(self.run_cli('series', str(days)).stdout)
            self.assertEqual(len(series['points']), 180)
            self.assertEqual(series['end_epoch'] - series['start_epoch'], days * 86400)
            self.assertEqual(series['observations'], 0)
            self.assertIsNone(series['observed_since_epoch'])
            self.assertTrue(
                all(p['sample_count'] == p['valid_count'] == 0 for p in series['points'])
            )
            self.assertTrue(all(p['latency_median_ms'] is None for p in series['points']))
            self.assertFalse(self.store.exists())
        for days in ['', '0', '2', '31', '01', '7;touch x']:
            self.run_cli('series', days, good=False)

    def test_series_median_loss_errors_and_partial_coverage(self):
        original = json.loads(self.payload.read_text())
        start = 1794355200
        for minute, latency, jitter, loss, dns in [(0, 10, 2, 1, 8), (1, 30, 6, 9, 12)]:
            payload = json.loads(json.dumps(original))
            payload['responsiveness'].update(
                internet_latency=latency, jitter_latency=jitter, dns_lookup_latency=dns
            )
            payload['reliability']['packet_loss_percent'] = loss
            self.payload.write_text(json.dumps(payload))
            self.env['WAN_OBSERVER_QUALITY_NOW'] = str(start + minute * 60)
            self.tick()
        self.env['PROBE_ERROR'] = '1'
        self.env['WAN_OBSERVER_QUALITY_NOW'] = str(start + 120)
        self.tick()
        self.env['WAN_OBSERVER_QUALITY_NOW'] = str(start + 400)
        result = self.run_cli('series', '1')
        series = json.loads(result.stdout)
        self.assertEqual(
            (series['observations'], series['available_count'], series['error_count']), (3, 2, 1)
        )
        self.assertEqual(series['observed_since_epoch'], start)
        point = next(p for p in series['points'] if p['sample_count'])
        self.assertEqual((point['sample_count'], point['valid_count']), (3, 2))
        self.assertEqual(point['latency_median_ms'], 20)
        self.assertEqual(point['jitter_median_ms'], 4)
        self.assertEqual(point['dns_median_ms'], 10)
        self.assertEqual(point['loss_max_percent'], 9)
        self.assertNotIn('private.example', result.stdout)
        self.assertNotIn('rate_native', result.stdout)
        self.env['WAN_OBSERVER_QUALITY_NOW'] = str(start + 86400 + 400)
        late = json.loads(self.run_cli('series', '1').stdout)
        self.assertEqual(late['observations'], 0)
        self.assertEqual(late['observed_since_epoch'], start)
        self.assertTrue(all(p['loss_max_percent'] is None for p in late['points']))

    def test_series_error_only_is_not_success_and_retention_applies(self):
        self.env['PROBE_ERROR'] = '1'
        self.tick()
        result = json.loads(self.run_cli('series', '30').stdout)
        point = next(p for p in result['points'] if p['sample_count'])
        self.assertEqual(point['valid_count'], 0)
        self.assertIsNone(point['latency_median_ms'])
        self.env['WAN_OBSERVER_QUALITY_NOW'] = str(1794355200 + 31 * 86400)
        result = json.loads(self.run_cli('series', '30').stdout)
        self.assertEqual(result['observations'], 0)
        self.assertIsNone(result['observed_since_epoch'])

    def test_series_odd_median_and_window_boundaries(self):
        self.tick()
        day = next(self.store.glob('*.jsonl'))
        observation = json.loads(day.read_text())
        # Three available observations in the final bin; median must be middle, not mean.
        rows = []
        for minute, latency in [(0, 10), (1, 20), (2, 90)]:
            row = json.loads(json.dumps(observation))
            row['sampled_at'] += minute * 60
            row['responsiveness']['internet_latency'] = latency
            rows.append(json.dumps(row))
        day.write_text('\n'.join(rows) + '\n')
        self.env['WAN_OBSERVER_QUALITY_NOW'] = str(1794355200 + 400)
        series = json.loads(self.run_cli('series', '7').stdout)
        self.assertEqual(series['observations'], 3)
        point = next(p for p in series['points'] if p['sample_count'])
        self.assertEqual(point['latency_median_ms'], 20)
        epochs = [p['epoch'] for p in series['points']]
        self.assertEqual(epochs, sorted(set(epochs)))
        self.assertEqual(epochs[1] - epochs[0], 3360)
        # Later records in the same UTC day are outside a query whose clock moved back.
        self.env['WAN_OBSERVER_QUALITY_NOW'] = '1794355200'
        series = json.loads(self.run_cli('series', '7').stdout)
        self.assertEqual(series['observations'], 1)

    def test_uninitialized_clock_never_writes_or_prunes(self):
        self.env['WAN_OBSERVER_QUALITY_NOW'] = '1704067199'
        self.run_cli('tick', good=False)
        self.assertFalse(self.store.exists())
        self.env['WAN_OBSERVER_QUALITY_NOW'] = '1794355200'
        self.tick()
        before = {p.name: p.read_bytes() for p in self.store.glob('*.jsonl')}
        self.env['WAN_OBSERVER_QUALITY_NOW'] = '1'
        self.run_cli('tick', good=False)
        self.run_cli('series', '1', good=False)
        self.assertEqual({p.name: p.read_bytes() for p in self.store.glob('*.jsonl')}, before)

    def test_no_state_directory_created_by_reads_and_bad_enable_is_unknown(self):
        self.env['ENABLED'] = 'unknown'
        status = json.loads(self.run_cli('status').stdout)
        self.assertEqual(status['state'], 'error')
        self.assertEqual(status['sample_count'], 0)
        self.assertFalse(self.store.exists())


if __name__ == '__main__':
    unittest.main()
