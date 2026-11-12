#!/usr/bin/env python3
"""Disposable loopback preview. Never deploy this development server on a router."""

import argparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
import secrets
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
ASSETS = Path(__file__).parent / 'preview'


def measurements(store):
    if store is None:
        rows = []
        for i, speed in enumerate([99, 102, 97, 55, 23, 18, 41, 74, 99, 104, 101, 100]):
            rows.append(
                dict(
                    timestamp=f'2026-01-02T{i + 8:02d}:00:00Z',
                    download_mbps=speed,
                    upload_mbps=19 + i % 3,
                    idle_latency_ms=8 + (100 - min(speed, 100)) / 5,
                    packet_loss_percent=None if i == 5 else 0,
                    server_id=123,
                )
            )
        return dict(source='synthetic', measurements=rows)
    lib = ROOT / 'package/wan-observer/files'
    result = subprocess.run(
        ['sh', str(lib / 'wan-observer'), 'list'],
        env=dict(os.environ, WAN_OBSERVER_LIB=str(lib), WAN_OBSERVER_STORE=str(store)),
        capture_output=True,
        text=True,
        timeout=10,
        check=True,
    )
    return dict(
        source='local imported history',
        measurements=[json.loads(line) for line in result.stdout.splitlines()],
    )


class Router:
    """Explicit SSH target; no addresses or credentials embedded in project files."""

    def __init__(self, target, identity=None):
        if target.startswith('-') or not target or any(c.isspace() for c in target):
            raise ValueError('Invalid SSH target')
        self.args = ['ssh', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8']
        if identity:
            self.args += ['-o', 'IdentitiesOnly=yes', '-i', str(identity.expanduser())]
        self.args += [target]

    def run(self, command, data=None):
        return subprocess.run(
            self.args + [command],
            input=data,
            text=True,
            capture_output=True,
            check=True,
            timeout=20,
        ).stdout

    def load(self):
        command = 'records=$(wan-observer list) || exit 1; status=$(wan-observer-collect status) || exit 1; printf \'%s\\n\' "$records" | jq -s --argjson status "$status" \'{measurements:.,collector:$status}\''
        data = json.loads(self.run(command))
        data['source'] = 'router collection'
        return data

    def configure(self, patch):
        # Only schedule fields can be changed by the preview, never executable or interface paths.
        keys = {'enabled', 'adaptive', 'interval_minutes', 'start_hour', 'end_hour'}
        if not isinstance(patch, dict) or set(patch) != keys:
            raise ValueError('Invalid schedule fields')
        if type(patch['enabled']) is not bool or type(patch['adaptive']) is not bool:
            raise ValueError('Invalid switches')
        if any(type(patch[k]) is not int for k in ['interval_minutes', 'start_hour', 'end_hour']):
            raise ValueError('Invalid schedule')
        if (
            patch['interval_minutes'] not in [15, 30, 60, 120]
            or not 0 <= patch['start_hour'] < patch['end_hour'] <= 24
        ):
            raise ValueError('Invalid schedule')
        # Remote CLI validates again and serializes configuration updates against active tests.
        command = 'patch=$(cat); jq --argjson patch "$patch" \'. + $patch\' /etc/wan-observer/collector.json | wan-observer-collect configure'
        self.run(command, json.dumps(patch))


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def reply(self, status, body, kind='application/json'):
        self.send_response(status)
        self.send_header('Content-Type', kind)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header(
            'Content-Security-Policy',
            "default-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
        )
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        allowed = {f'127.0.0.1:{self.server.server_port}', f'localhost:{self.server.server_port}'}
        if (
            self.headers.get_all('Host', []) not in [[host] for host in allowed]
            or self.headers.get('Sec-Fetch-Site') == 'cross-site'
        ):
            self.reply(403, b'{"error":"Request refused"}')
            return
        if self.path == '/api/measurements':
            try:
                data = self.server.load()
                data['schedule_token'] = self.server.token if self.server.router else None
                body = json.dumps(data, allow_nan=False).encode()
            except Exception:
                self.reply(503, b'{"error":"History unavailable; inspect it locally"}')
                return
            self.reply(200, body)
            return
        routes = {
            '/': ('index.html', 'text/html; charset=utf-8'),
            '/app.js': ('app.js', 'text/javascript; charset=utf-8'),
            '/style.css': ('style.css', 'text/css; charset=utf-8'),
        }
        if self.path not in routes:
            self.reply(404, b'{"error":"Not found"}')
            return
        name, kind = routes[self.path]
        self.reply(200, (ASSETS / name).read_bytes(), kind)

    def do_POST(self):
        if self.path != '/api/schedule' or not self.server.router:
            self.reply(405, b'{"error":"Read only"}')
            return
        host = f'127.0.0.1:{self.server.server_port}'
        if (
            self.headers.get_all('Host', []) != [host]
            or self.headers.get('Origin') != f'http://{host}'
            or self.headers.get('X-Schedule-Token') != self.server.token
            or self.headers.get('Content-Type') != 'application/json'
        ):
            self.reply(403, b'{"error":"Request refused"}')
            return
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if not 0 < size <= 4096:
                raise ValueError('Invalid size')
            self.connection.settimeout(5)
            patch = json.loads(self.rfile.read(size))
            self.server.router.configure(patch)
        except Exception:
            self.reply(
                400, b'{"error":"Schedule not saved; collector may be busy. Try again shortly."}'
            )
            return
        self.reply(200, b'{"saved":true}')


def make_server(port, store, router=None):
    server = ThreadingHTTPServer(('127.0.0.1', port), Handler)
    server.router = router
    server.token = secrets.token_urlsafe(32)
    server.load = router.load if router else lambda: measurements(store)
    return server


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8765)
    parser.add_argument(
        '--store', type=Path, help='Existing imported history directory; default is synthetic'
    )
    parser.add_argument(
        '--ssh-target', help='Explicit SSH target for live collection and schedule controls'
    )
    parser.add_argument(
        '--identity', type=Path, help='Existing SSH private key path (never copied)'
    )
    args = parser.parse_args()
    if args.ssh_target and args.store:
        parser.error('Choose either SSH target or local store')
    if args.store is not None and not args.store.is_dir():
        parser.error('History directory must already exist')
    router = Router(args.ssh_target, args.identity) if args.ssh_target else None
    server = make_server(args.port, args.store, router)
    print(
        f'WAN Observer preview: http://127.0.0.1:{server.server_port} (loopback only)', flush=True
    )
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
