"""Loopback preview contract; synthetic data only."""
import http.client
import importlib.util
import json
from pathlib import Path
import threading
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('preview', ROOT / 'tools/preview.py')
preview = importlib.util.module_from_spec(spec)
spec.loader.exec_module(preview)


class PreviewTests(unittest.TestCase):
    def setUp(self):
        self.server = preview.make_server(0, None)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()

    def request(self, path, method='GET', headers=None):
        conn = http.client.HTTPConnection('127.0.0.1', self.server.server_port)
        conn.request(method, path, headers=headers or {})
        response = conn.getresponse()
        result = response.status, dict(response.getheaders()), response.read()
        conn.close()
        return result

    def test_synthetic_data_and_no_cache(self):
        status, headers, body = self.request('/api/measurements')
        self.assertEqual(status, 200)
        data = json.loads(body)
        self.assertEqual(data['source'], 'synthetic')
        self.assertEqual(len(data['measurements']), 12)
        self.assertEqual(headers['Cache-Control'], 'no-store')
        self.assertNotIn('Access-Control-Allow-Origin', headers)

    def test_fixed_routes_and_host_boundary(self):
        for path in ['/../README.md', '/.env', '/api/measurements?file=/etc/passwd']:
            self.assertEqual(self.request(path)[0], 404)
        self.assertEqual(self.request('/api/measurements', headers={'Host': 'evil.example'})[0], 403)
        self.assertEqual(self.request('/api/measurements', headers={'Sec-Fetch-Site': 'cross-site'})[0], 403)
        self.assertEqual(self.request('/api/measurements', method='POST')[0], 405)

    def test_dashboard_assets_and_csp(self):
        for path in ['/', '/app.js', '/style.css']:
            status, headers, body = self.request(path)
            self.assertEqual(status, 200)
            self.assertIn("frame-ancestors 'none'", headers['Content-Security-Policy'])
            self.assertTrue(body)
        self.assertNotIn(b'innerHTML', self.request('/app.js')[2])

    def test_failure_does_not_disclose_backend_details(self):
        def broken():
            raise RuntimeError('PRIVATE_MARKER')
        self.server.load = broken
        status, _, body = self.request('/api/measurements')
        self.assertEqual(status, 503)
        self.assertNotIn(b'PRIVATE_MARKER', body)

    def test_local_history_uses_cli_validation(self):
        with tempfile.TemporaryDirectory() as directory:
            self.server.load = lambda: preview.measurements(Path(directory))
            status, _, body = self.request('/api/measurements')
            self.assertEqual(status, 200)
            self.assertEqual(json.loads(body)['measurements'], [])
            (Path(directory) / 'measurements.jsonl').write_text('PRIVATE_BROKEN_HISTORY')
            status, _, body = self.request('/api/measurements')
            self.assertEqual(status, 503)
            self.assertNotIn(b'PRIVATE_BROKEN_HISTORY', body)
