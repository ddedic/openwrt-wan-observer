#!/usr/bin/env python3
"""Build script-only OpenWrt 21.02 IPKs, with an optional GL.iNet admin package."""
import gzip
import io
from pathlib import Path, PurePosixPath
import tarfile

ROOT = Path(__file__).resolve().parents[1]
VERSION = '0.5.0-1'
OUT = ROOT / 'dist'


def archive(files):
    stream = io.BytesIO()
    with tarfile.open(fileobj=stream, mode='w', format=tarfile.GNU_FORMAT) as tar:
        directories = {str(parent) for path in files for parent in PurePosixPath(path).parents if str(parent) != '.'}
        for directory in sorted(directories):
            info = tarfile.TarInfo('./' + directory)
            info.type = tarfile.DIRTYPE
            info.mode = 0o755
            info.uname = info.gname = 'root'
            tar.addfile(info)
        for path, (content, mode) in sorted(files.items()):
            info = tarfile.TarInfo('./' + path)
            info.mode = mode
            info.size = len(content)
            info.uname = info.gname = 'root'
            tar.addfile(info, io.BytesIO(content))
    return gzip.compress(stream.getvalue(), mtime=0)


def build(name, description, depends, files, conffiles=()):
    data = archive(files)
    control = f'''Package: {name}
Version: {VERSION}
Architecture: all
Depends: {depends}
Section: net
Maintainer: Danijel Dedic
License: MIT
Installed-Size: {sum(len(content) for content, _ in files.values())}
Description: {description}
'''.encode()
    controls = {'control': (control, 0o644)}
    if conffiles:
        controls['conffiles'] = ((''.join(path + '\n' for path in conffiles)).encode(), 0o644)
    output = OUT / f'{name}_{VERSION}_all.ipk'
    output.write_bytes(archive({'debian-binary': (b'2.0\n', 0o644),
                                'control.tar.gz': (archive(controls), 0o644),
                                'data.tar.gz': (data, 0o644)}))
    print(f'{output.name} ({output.stat().st_size:,} bytes)')


def read(path, mode=0o644):
    return (ROOT / path).read_bytes(), mode


if __name__ == '__main__':
    core = 'package/wan-observer/files/'
    gl = 'package/wan-observer-glinet/'
    bundle = (ROOT / (gl + 'ui/dist/view.js')).read_bytes()
    OUT.mkdir(exist_ok=True)
    build('wan-observer', 'Local WAN measurement history and opt-in collector.',
          'jq, coreutils-timeout', {
              'usr/bin/wan-observer': read(core + 'wan-observer', 0o755),
              'usr/bin/wan-observer-collect': read(core + 'wan-observer-collect', 0o755),
              'usr/bin/wan-observer-readiness': read(core + 'wan-observer-readiness', 0o755),
              'usr/bin/wan-observer-quality': read(core + 'wan-observer-quality', 0o755),
              'usr/share/wan-observer/quality.jq': read(core + 'quality.jq'),
              'lib/upgrade/keep.d/wan-observer': read(core + 'wan-observer.keep'),
              'usr/share/wan-observer/record.jq': read(core + 'record.jq'),
              'usr/share/wan-observer/collector.jq': read(core + 'collector.jq'),
              'usr/share/licenses/wan-observer/LICENSE': read('LICENSE'),
          }, conffiles=['/etc/wan-observer/collector.json'])
    build('wan-observer-glinet', 'GL.iNet dashboard, schedule controls and direct PDF export.',
          'wan-observer, gl-sdk4-ui-core, gl-oui-rpc, lua, lua-cjson, libubus-lua', {
              'www/cgi-bin/wan-observer': read(gl + 'files/wan-observer.cgi', 0o755),
              'usr/share/oui/menu.d/wan-observer.json': read(gl + 'files/menu.json'),
              'www/views/gl-sdk4-ui-wan-observer.common.js.gz': (gzip.compress(bundle, mtime=0), 0o644),
              'usr/share/licenses/wan-observer-glinet/browser-bundle.txt': read(gl + 'ui/dist/view.js.LEGAL.txt'),
              'usr/share/licenses/wan-observer-glinet/octicons.txt': read(gl + 'files/OCTICONS-LICENSE.txt'),
              'usr/share/licenses/wan-observer-glinet/THIRD_PARTY_NOTICES.md': read('THIRD_PARTY_NOTICES.md'),
              'usr/share/licenses/wan-observer-glinet/LICENSE': read('LICENSE'),
          })
