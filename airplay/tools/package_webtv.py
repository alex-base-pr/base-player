"""Pack the Web TV bundle (.build/webtv/bundle) as an optional MGU Store tool.

No systemd units: the app starts bin/base-player-webtv itself. Files land in
/var/opt/base-player-webtv/current/ (the path build_webtv.py patched into
WebKit). Output: dist/base-player-webtv@<version>.tgz, reproducible (sorted
members, owner 0:0, fixed mtime, gzip mtime 0), plus a size report.
"""
import argparse
import gzip
import hashlib
import io
import json
import os
from pathlib import Path
import tarfile

ROOT = Path(__file__).resolve().parents[2]
BUNDLE = ROOT / '.build/webtv/bundle'
TOOL = 'base-player-webtv'
MTIME = int(os.environ.get('SOURCE_DATE_EPOCH', '1767225600'))
EXECUTABLE_DIRS = ('bin/', 'runtime/libexec/')
EXECUTABLES = {'runtime/lib/ld-linux-x86-64.so.2', 'wpe/WPEWebProcess', 'wpe/WPENetworkProcess'}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def collect(bundle=BUNDLE):
    manifest = json.loads((bundle / 'build-manifest.json').read_text())
    entries = []
    for name, proof in sorted(manifest['files'].items()):
        data = (bundle / name).read_bytes()
        if sha(data) != proof['sha256']:
            raise SystemExit('webtv_input_changed: ' + name)
        mode = 0o755 if name.startswith(EXECUTABLE_DIRS) or name in EXECUTABLES else 0o644
        entries.append((name, data, mode))
    entries.append(('build-manifest.json', (bundle / 'build-manifest.json').read_bytes(), 0o644))
    entries.append(('check.sh', (ROOT / 'airplay/webtv/check.sh').read_bytes(), 0o755))
    entries.append(('NOTICE.md', (bundle / 'runtime/NOTICE.md').read_bytes(), 0o644))
    entries.append(('LICENSE', (ROOT / 'LICENSE').read_bytes(), 0o644))
    return manifest, entries


def component(version, entries):
    return {
        'id': TOOL, 'kind': 'tool', 'version': version,
        'title': 'Base Player Web TV (experimental)',
        'description': 'Optional WPE WebKit runtime for Base Player Web TV (YouTube TV page)',
        'mguHmi': ['ID7'], 'uninstallable': True,
        'requires': {'mgu-deploy': '0.7.17'},
        'files': [{'path': n, 'mode': format(m, '04o'), 'sha256': sha(b)} for n, b, m in entries],
        'restart': [], 'check': ['check.sh'],
        'crashNames': ['base-player-webtv', 'WPEWebProcess', 'WPENetworkProcess'],
    }


def size_report(entries, artifact):
    groups = {}
    for name, data, _ in entries:
        parts = name.split('/')
        key = '/'.join(parts[:2]) if parts[0] == 'runtime' and len(parts) > 2 else parts[0]
        groups[key] = groups.get(key, 0) + len(data)
    largest = sorted(entries, key=lambda e: -len(e[1]))[:10]
    return {'artifact_bytes': artifact.stat().st_size, 'unpacked_bytes': sum(len(e[1]) for e in entries),
            'files': len(entries), 'by_dir': dict(sorted(groups.items(), key=lambda kv: -kv[1])),
            'largest': {n: len(d) for n, d, _ in largest}}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--version', help='defaults to the bundle build version')
    parser.add_argument('--out', default=str(ROOT / 'dist'))
    args = parser.parse_args()
    manifest, entries = collect()
    args.version = args.version or manifest.get('version')
    if manifest.get('version') != args.version:
        raise SystemExit('Web TV build version %s differs from %s' % (manifest.get('version'), args.version))
    spec = component(args.version, entries)
    members = [('component.json', json.dumps(spec, indent=2).encode() + b'\n', 0o644)] + \
              [('files/' + n, b, m) for n, b, m in entries]
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    artifact = out / (TOOL + '@' + args.version + '.tgz')
    with artifact.open('wb') as raw, gzip.GzipFile(fileobj=raw, filename='', mode='wb', mtime=0) as zipped, \
            tarfile.open(fileobj=zipped, mode='w', format=tarfile.GNU_FORMAT) as archive:
        for name, data, mode in sorted(members):
            item = tarfile.TarInfo(name)
            item.size, item.mode, item.mtime = len(data), mode, MTIME
            item.uid = item.gid = 0
            item.uname = item.gname = 'root'
            archive.addfile(item, io.BytesIO(data))
    report = size_report(entries, artifact)
    (out / (TOOL + '@' + args.version + '.size.json')).write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(dict(report, artifact=str(artifact), sha256=sha(artifact.read_bytes())), indent=2))


if __name__ == '__main__':
    main()
