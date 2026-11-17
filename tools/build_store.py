#!/usr/bin/env python3
"""Build Base Player on the head unit for the MGU Store. GPL-3.0-or-later.

The Store runs this from mgu-repo.json (docs/STORE.md) as an unprivileged
user, in a copy of the repository, with:

    MGU_OUT      empty folder that must receive exactly one <id>@<version>.tgz
    oap-sdk/     the SDK module generated from the unit's donor app
    https_proxy  the only way out (mgu-repo.json asks for "network": true)

The app is written against the MGU app kit (cauliflowermossgrape/idrive7-apps,
MIT), which is not kept in this repository. One pinned commit of it is
downloaded, checked against a SHA-256 and unpacked, and its own build.py
packages the app.

On a desktop, without the SDK:

    BASE_PLAYER_KIT=/path/to/kit.tar.gz MGU_OUT=out \\
        python3 tools/build_store.py --id base_player --version 0.1.0 \\
        --dir apps/base_player --preview
"""
import argparse
import hashlib
import os
import shutil
import subprocess
import sys
import tarfile
import tempfile
import urllib.request
from pathlib import Path

KIT_COMMIT = '313463df4e7b47e64ef96fbdaa4833059c74d1c7'
KIT_SHA256 = 'd88890883c070e0b192893e02b3cb28855d7ef0aea55a46a007583ca43c9dac2'
KIT_URL = 'https://codeload.github.com/cauliflowermossgrape/idrive7-apps/tar.gz/' + KIT_COMMIT
KIT_MAX_BYTES = 64 * 1024 * 1024      # the archive is about 33 MB
UNPACK_MAX_BYTES = 96 * 1024 * 1024   # kit/ unpacked is about 33 MB; the Store allows 200 MB
WANTED = ('kit/', 'LICENSE')          # the only parts of the kit repository the build needs


def fail(message):
    raise SystemExit('build_store: ' + message)


def fetch_kit(target):
    """Write the pinned kit archive to `target`, refusing anything but the pinned bytes."""
    local = os.environ.get('BASE_PLAYER_KIT')
    source = open(local, 'rb') if local else urllib.request.urlopen(KIT_URL, timeout=60)
    digest, size = hashlib.sha256(), 0
    with source, open(target, 'wb') as out:
        while True:
            block = source.read(256 * 1024)
            if not block:
                break
            size += len(block)
            if size > KIT_MAX_BYTES:
                fail('the kit archive is larger than expected')
            digest.update(block)
            out.write(block)
    if digest.hexdigest() != KIT_SHA256:
        fail('the kit archive does not match the pinned SHA-256; not running it')


def unpack_kit(archive, root):
    """Unpack kit/ and LICENSE into `root`. Regular files and folders only."""
    total = 0
    with tarfile.open(archive, 'r:gz') as tar:
        for member in tar:
            _, _, inner = member.name.partition('/')   # drop "<repo>-<commit>/"
            if not inner.startswith(WANTED):
                continue
            parts = Path(inner).parts
            if not parts or '..' in parts or Path(inner).is_absolute():
                fail('unsafe path in the kit archive: ' + member.name)
            target = root.joinpath(*parts)
            if member.isdir():
                target.mkdir(parents=True, exist_ok=True)
            elif member.isreg():
                total += member.size
                if total > UNPACK_MAX_BYTES:
                    fail('the kit unpacks larger than expected')
                target.parent.mkdir(parents=True, exist_ok=True)
                with tar.extractfile(member) as data, open(target, 'wb') as out:
                    shutil.copyfileobj(data, out)
            else:
                fail('unexpected entry in the kit archive: ' + member.name)


def main():
    parser = argparse.ArgumentParser(description='Build one app for the MGU Store.')
    parser.add_argument('--id', required=True, help='app id the Store installs it under')
    parser.add_argument('--version', required=True)
    parser.add_argument('--dir', required=True, help="the app's folder")
    parser.add_argument('--preview', action='store_true',
                        help='desktop only: stage without the SDK, produce no package')
    args = parser.parse_args()

    app_dir = Path(args.dir).resolve()
    if not (app_dir / 'app.json').is_file() or not (app_dir / 'main.js').is_file():
        fail('%s has no app.json and main.js' % app_dir)
    if 'MGU_OUT' not in os.environ:
        fail('MGU_OUT must name the output folder')
    out_dir = Path(os.environ['MGU_OUT']).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    if any(out_dir.iterdir()):
        fail('MGU_OUT must be empty')
    sdk = Path.cwd() / 'oap-sdk'
    if not args.preview and not (sdk / 'index.js').is_file():
        fail('no oap-sdk/ here; the Store provides it (mgu-repo.json "sdk"). Use --preview on a desktop')

    with tempfile.TemporaryDirectory(prefix='base-player-build-') as tmp:
        work = Path(tmp)
        fetch_kit(work / 'kit.tar.gz')
        unpack_kit(work / 'kit.tar.gz', work)
        (work / 'kit.tar.gz').unlink()
        # The layout the kit's build.py expects: kit/, apps/<id>/, oap-sdk/, dist/.
        shutil.copytree(app_dir, work / 'apps' / args.id)
        if not args.preview:
            shutil.copytree(sdk, work / 'oap-sdk')
        command = [sys.executable, str(work / 'kit' / 'tools' / 'build.py'), args.id]
        if args.preview:
            command.append('--preview-only')
        subprocess.run(command, cwd=str(work), check=True)
        if args.preview:
            print('build_store: preview staged and discarded; nothing to install')
            return
        package = work / 'dist' / ('%s@%s.tgz' % (args.id, args.version))
        if not package.is_file():
            fail('the kit build left no %s' % package.name)
        shutil.copyfile(package, out_dir / package.name)
        print('build_store: ' + package.name)


if __name__ == '__main__':
    main()
