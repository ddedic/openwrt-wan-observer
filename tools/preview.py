#!/usr/bin/env python3
"""Disposable loopback preview. Never deploy this development server on a router."""
import argparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
ASSETS = Path(__file__).parent / 'preview'


def measurements(store):
    if store is None:
        rows = []
        for i, speed in enumerate([99, 102, 97, 55, 23, 18, 41, 74, 99, 104, 101, 100]):
            rows.append(dict(timestamp=f'2026-01-02T{i + 8:02d}:00:00Z',
                             download_mbps=speed, upload_mbps=19 + i % 3,
                             idle_latency_ms=8 + (100 - min(speed, 100)) / 5,
                             packet_loss_percent=None if i == 5 else 0,
                             server_id=123))
        return dict(source='synthetic', measurements=rows)
    lib = ROOT / 'package/wan-observer/files'
    result = subprocess.run(['sh', str(lib / 'wan-observer'), 'list'],
                            env=dict(os.environ, WAN_OBSERVER_LIB=str(lib),
                                     WAN_OBSERVER_STORE=str(store)),
                            capture_output=True, text=True, timeout=10, check=True)
    return dict(source='local imported history',
                measurements=[json.loads(line) for line in result.stdout.splitlines()])


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def reply(self, status, body, kind='application/json'):
        self.send_response(status)
        self.send_header('Content-Type', kind)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Content-Security-Policy', "default-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        allowed = {f'127.0.0.1:{self.server.server_port}', f'localhost:{self.server.server_port}'}
        if (self.headers.get_all('Host', []) not in [[host] for host in allowed]
                or self.headers.get('Sec-Fetch-Site') == 'cross-site'):
            self.reply(403, b'{"error":"Request refused"}')
            return
        if self.path == '/api/measurements':
            try:
                body = json.dumps(self.server.load(), allow_nan=False).encode()
            except Exception:
                self.reply(503, b'{"error":"History unavailable; inspect it locally"}')
                return
            self.reply(200, body)
            return
        routes = {'/': ('index.html', 'text/html; charset=utf-8'),
                  '/app.js': ('app.js', 'text/javascript; charset=utf-8'),
                  '/style.css': ('style.css', 'text/css; charset=utf-8')}
        if self.path not in routes:
            self.reply(404, b'{"error":"Not found"}')
            return
        name, kind = routes[self.path]
        self.reply(200, (ASSETS / name).read_bytes(), kind)

    def do_POST(self):
        self.reply(405, b'{"error":"Read only"}')


def make_server(port, store):
    server = ThreadingHTTPServer(('127.0.0.1', port), Handler)
    server.load = lambda: measurements(store)
    return server


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8765)
    parser.add_argument('--store', type=Path, help='Existing imported history directory; default is synthetic')
    args = parser.parse_args()
    if args.store is not None and not args.store.is_dir():
        parser.error('History directory must already exist')
    server = make_server(args.port, args.store)
    print(f'WAN Observer preview: http://127.0.0.1:{server.server_port} (read only)', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
