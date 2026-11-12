"""Replay the actual HTTP contracts against files extracted from a built IPK."""

import importlib.util
import io
import os
from pathlib import Path
import subprocess
import tarfile
import tempfile

import test_cgi

ROOT = Path(__file__).resolve().parents[1]


class InstalledCGIContracts(test_cgi.CGIContracts):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        subprocess.run(
            ['python3', str(ROOT / 'tools/build-ipk.py')],
            check=True,
            capture_output=True,
            text=True,
        )
        spec = importlib.util.spec_from_file_location('ipk_builder', ROOT / 'tools/build-ipk.py')
        builder = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(builder)
        package = ROOT / 'dist' / f'wan-observer-glinet_{builder.VERSION}_all.ipk'
        cls.installation = tempfile.TemporaryDirectory()
        cls.addClassCleanup(cls.installation.cleanup)
        cls.install_root = Path(cls.installation.name)
        with tarfile.open(package) as ipk:
            data = ipk.extractfile('./data.tar.gz').read()
        with tarfile.open(fileobj=io.BytesIO(data), mode='r:gz') as archive:
            archive.extractall(cls.install_root, filter='data')
        cls.cgi_path = cls.install_root / 'www/cgi-bin/wan-observer'
        cls.module_path = cls.install_root / 'usr/lib/lua'

    def test_installed_namespace_complete_and_read_only(self):
        source = ROOT / 'package/wan-observer-glinet/lua'
        expected = sorted(path.relative_to(source) for path in source.rglob('*.lua'))
        actual = sorted(
            path.relative_to(self.module_path) for path in self.module_path.rglob('*.lua')
        )
        self.assertTrue(expected)
        self.assertEqual(actual, expected)
        for relative in expected:
            installed = self.module_path / relative
            self.assertEqual(installed.read_bytes(), (source / relative).read_bytes())
            self.assertEqual(installed.stat().st_mode & 0o777, 0o644)
        self.assertEqual(self.cgi_path.stat().st_mode & 0o777, 0o755)

    def test_missing_installed_module_cannot_fall_back_to_source_tree(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            namespace = root / 'wan_observer'
            namespace.mkdir()
            (namespace / 'application.lua').write_text(
                (self.module_path / 'wan_observer/application.lua').read_text()
            )
            result = subprocess.run(
                [test_cgi.LUA, str(self.cgi_path)],
                env=dict(os.environ, LUA_PATH=str(root / '?.lua')),
                text=True,
                capture_output=True,
            )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('wan_observer.http.authentication', result.stderr)
