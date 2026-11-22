"""Build the optional Web TV bundle (WPE WebKit + GStreamer 1.26) in Debian 13.

Runs inside a debian:trixie amd64 container (CI: container debian:13); never
contacts the vehicle. Like build_runtime.py the bundle has its own glibc
loader and libraries; nothing relies on the head unit's glibc 2.27.

Output .build/webtv/bundle/, installed as /var/opt/base-player-webtv/current/:
  bin/base-player-webtv        static wrapper -> runtime loader + libexec ELF
  runtime/lib/                 ld-linux-x86-64.so.2, libraries, dri/, gbm/
  runtime/libexec/             real ELF programs (launcher, WPE helpers, gst tools)
  runtime/plugins/ gio/ etc/ share/fonts/ licenses/
  wpe/WPEWebProcess, wpe/WPENetworkProcess   static wrappers (../runtime)
  wpe/injected-bundle/         WebKit's injected bundle

WebKit finds its helpers only in the compile-time PKGLIBEXECDIR
(/usr/lib/x86_64-linux-gnu/wpe-webkit-2.0; WEBKIT_EXEC_PATH is developer-mode
only), so the bundled libWPEWebKit has that string rewritten in place to the
equally long or shorter WPE_DIR below. The same is done for GnuTLS's trust
store, which becomes the relative etc/ca-certificates.crt: the launcher runs
with the runtime directory as its working directory. wpesrc's web extension is
not shipped: it only carries wpesrc audio pads, which WebKit 2.48 never feeds
(WebKit plays audio itself through autoaudiosink -> our mguaudiosink).
"""
from pathlib import Path
import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[2]
BUILD = ROOT / '.build/webtv'
BUNDLE = BUILD / 'bundle'
RUNTIME = BUNDLE / 'runtime'
VERSION = '0.1.0'
INSTALL = '/var/opt/base-player-webtv/current'
WPE_DIR = INSTALL + '/wpe'
MULTIARCH = Path('/usr/lib/x86_64-linux-gnu')
APT_PACKAGES = [
    'ca-certificates', 'python3', 'build-essential', 'pkg-config', 'file',
    'libgstreamer1.0-dev', 'libgstreamer-plugins-base1.0-dev', 'gstreamer1.0-tools',
    'gstreamer1.0-wpe', 'gstreamer1.0-plugins-base', 'gstreamer1.0-plugins-good',
    'gstreamer1.0-plugins-bad', 'gstreamer1.0-libav', 'gstreamer1.0-alsa',
    'libgl1-mesa-dri', 'libegl1', 'libegl-mesa0', 'libgles2', 'libgbm1',
    'glib-networking', 'fontconfig', 'fonts-dejavu-core', 'fonts-noto-core',
]
# Expected Debian 13 versions (prebuilt_wpe.md); the build refuses others.
PINNED = {'libwpewebkit-2.0-1': '2.48.', 'gstreamer1.0-wpe': '1.26.', 'libgstreamer1.0-0': '1.26.'}
PLUGINS = [
    'wpe', 'coreelements', 'app', 'videoconvertscale', 'videofilter', 'videorate',
    'audioconvert', 'audioresample', 'audiomixer', 'interleave', 'volume', 'autodetect', 'alsa',
    'playback', 'typefindfunctions', 'pbtypes', 'rawparse', 'libav', 'videoparsersbad', 'audioparsers',
    'isomp4', 'matroska', 'opus', 'opusparse', 'vpx', 'debugutilsbad', 'audiotestsrc', 'videotestsrc',
    'audiofx', 'subenc',  # WebKit: scaletempo (playback rate), webvttenc (captions)
]
FONTS = ['truetype/dejavu', 'truetype/noto']
WPE_HELPERS = ['WPEWebProcess', 'WPENetworkProcess']
TOOLS = ['gst-inspect-1.0', 'gst-launch-1.0']
STRING_PATCHES = [
    ('lib/libWPEWebKit-2.0.so.1', b'/usr/lib/x86_64-linux-gnu/wpe-webkit-2.0', WPE_DIR.encode()),
    ('plugins/libgstwpe.so', b'libWPEBackend-fdo-1.0.so.1', b'libWPEBackend-fdo-1.0.so'),
    ('lib/libgnutls.so.30', b'/etc/ssl/certs/ca-certificates.crt', b'etc/ca-certificates.crt'),
]


def run(args, **kwargs):
    subprocess.run([str(a) for a in args], check=True, **kwargs)


def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()


def patch_strings(path, old, new):
    """Rewrite every C string starting with `old`, in place, NUL-padded."""
    if len(new) > len(old):
        raise RuntimeError('replacement longer than original: ' + new.decode())
    data = bytearray(path.read_bytes())
    count, start = 0, 0
    while True:
        at = data.find(old, start)
        if at < 0:
            break
        if at and data[at - 1] != 0:
            raise RuntimeError('%s: %r is not at a string start' % (path.name, old))
        end = data.index(0, at)
        value = new + bytes(data[at + len(old):end])
        data[at:end] = value + b'\0' * (end - at - len(value))
        count, start = count + 1, end
    if not count:
        raise RuntimeError('%s: %r not found' % (path.name, old))
    path.write_bytes(bytes(data))
    return count


def deb_versions():
    out = subprocess.check_output(['dpkg-query', '-W', '-f', '${Package} ${Version}\n'], text=True)
    return dict(line.split(' ', 1) for line in out.splitlines() if line)


def owners(paths):
    """Debian package of each bundled file (for NOTICE and licenses)."""
    found = {}
    for p in paths:
        real = str(Path(p).resolve())
        for candidate in [str(p), real, real.replace('/usr/lib/', '/lib/', 1)]:
            result = subprocess.run(['dpkg', '-S', candidate], capture_output=True, text=True)
            lines = [l for l in result.stdout.splitlines() if not l.startswith('diversion ')]
            if result.returncode == 0 and lines:
                found[p] = lines[0].split(':', 1)[0].split(',')[0].strip()
                break
    return found


def install_deps():
    env = dict(os.environ, DEBIAN_FRONTEND='noninteractive')
    run(['apt-get', 'update'], env=env)
    run(['apt-get', 'install', '-y', '--no-install-recommends'] + APT_PACKAGES, env=env)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--install-deps', action='store_true', help='apt-get the Debian 13 build packages first')
    args = parser.parse_args()
    if os.name != 'posix' or os.uname().machine != 'x86_64':
        raise SystemExit('Run in a debian:trixie amd64 container')
    if args.install_deps:
        install_deps()
    if not Path('/etc/debian_version').read_text().startswith('13.'):
        raise SystemExit('Debian 13 (trixie) required: WPE 2.48 needs GStreamer >= 1.25')
    versions = deb_versions()
    for name, prefix in PINNED.items():
        if not versions.get(name, '').startswith(prefix):
            raise RuntimeError('Unexpected %s %s' % (name, versions.get(name)))
    if BUNDLE.exists():
        shutil.rmtree(BUNDLE)
    for d in ['bin', 'wpe/injected-bundle']:
        (BUNDLE / d).mkdir(parents=True)
    for d in ['lib/dri', 'lib/gbm', 'libexec', 'plugins', 'gio', 'etc/fonts', 'etc/egl', 'share/fonts', 'licenses']:
        (RUNTIME / d).mkdir(parents=True)
    native = ROOT / 'airplay/native'
    cflags = ['-O2', '-march=x86-64', '-mtune=generic', '-Wall', '-Wextra', '-Werror']
    # Wrappers are static: they run before the private loader exists for them.
    run(['gcc', '-static'] + cflags + ['-DRUNTIME_REL="../runtime"', native / 'bundle_exec.c', '-o', BUNDLE / 'bin/base-player-webtv'])
    for name in WPE_HELPERS:
        run(['gcc', '-static'] + cflags + ['-DRUNTIME_REL="../runtime"', native / 'bundle_exec.c', '-o', BUNDLE / 'wpe' / name])
        shutil.copy2(MULTIARCH / 'wpe-webkit-2.0' / name, RUNTIME / 'libexec' / name)
    for name in TOOLS:
        run(['gcc', '-static'] + cflags + ['-DRUNTIME_REL="../runtime"', native / 'bundle_exec.c', '-o', BUNDLE / 'bin' / name])
        shutil.copy2(Path('/usr/bin') / name, RUNTIME / 'libexec' / name)
    gst = subprocess.check_output(['pkg-config', '--cflags', '--libs', 'gstreamer-1.0', 'gstreamer-video-1.0'], text=True).split()
    app = subprocess.check_output(['pkg-config', '--cflags', '--libs', 'gstreamer-app-1.0'], text=True).split()
    # -rdynamic: the launcher interposes webkit_web_view_get_settings (user agent).
    run(['gcc', '-rdynamic'] + cflags + [native / 'mgu_webtv.c', '-o', RUNTIME / 'libexec/base-player-webtv'] + gst + app)
    # Same source as the receiver's 1.22 sink; the define adds "westerossink"
    # (WebKit hole-punch) and "mguaudiosink" (WebKit audio -> MGU_HLS_AUDIO_SINK).
    run(['gcc', '-shared', '-fPIC'] + cflags + ['-DMGU_WESTEROS_SINK', '-DPACKAGE="base-player-webtv"',
         native / 'gstmguvideosink.c', '-o', RUNTIME / 'plugins/libgstmguvideo.so'] + gst)
    shutil.copy2(MULTIARCH / 'wpe-webkit-2.0/injected-bundle/libWPEInjectedBundle.so', BUNDLE / 'wpe/injected-bundle')
    for name in PLUGINS:
        src = MULTIARCH / 'gstreamer-1.0' / ('libgst' + name + '.so')
        if not src.is_file():
            raise RuntimeError('Missing build plugin ' + str(src))
        shutil.copy2(src, RUNTIME / 'plugins' / src.name)
    # Mesa llvmpipe: EGL through glvnd, swrast DRI, GBM; all dlopened.
    for name in ['swrast_dri.so', 'kms_swrast_dri.so']:
        shutil.copy2((MULTIARCH / 'dri' / name).resolve(), RUNTIME / 'lib/dri' / name)
    shutil.copy2(MULTIARCH / 'gbm/dri_gbm.so', RUNTIME / 'lib/gbm/dri_gbm.so')
    (RUNTIME / 'etc/egl/50_mesa.json').write_text(json.dumps(
        {'file_format_version': '1.0.0', 'ICD': {'library_path': 'libEGL_mesa.so.0'}}, indent=2) + '\n')
    tls = MULTIARCH / 'gio/modules/libgiognutls.so'
    shutil.copy2(tls, RUNTIME / 'gio' / tls.name)
    shutil.copy2('/etc/ssl/certs/ca-certificates.crt', RUNTIME / 'etc/ca-certificates.crt')
    fonts = []
    for folder in FONTS:
        src = Path('/usr/share/fonts') / folder
        dest = RUNTIME / 'share/fonts' / Path(folder).name
        shutil.copytree(src, dest)
        fonts += [p for p in src.rglob('*') if p.is_file()]
    (RUNTIME / 'etc/fonts/fonts.conf').write_text(
        '<?xml version="1.0"?>\n<!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd">\n<fontconfig>\n'
        '  <dir prefix="relative">../../share/fonts</dir>\n  <cachedir prefix="xdg">fontconfig</cachedir>\n'
        '  <alias><family>sans-serif</family><prefer><family>Noto Sans</family><family>DejaVu Sans</family></prefer></alias>\n'
        '  <alias><family>serif</family><prefer><family>Noto Serif</family><family>DejaVu Serif</family></prefer></alias>\n'
        '  <alias><family>monospace</family><prefer><family>DejaVu Sans Mono</family></prefer></alias>\n'
        '</fontconfig>\n')
    roots = ([RUNTIME / 'libexec' / n for n in WPE_HELPERS + TOOLS + ['base-player-webtv']] +
             list((RUNTIME / 'plugins').glob('*.so')) + list((RUNTIME / 'lib/dri').glob('*.so')) +
             [RUNTIME / 'lib/gbm/dri_gbm.so', RUNTIME / 'gio' / tls.name,
              BUNDLE / 'wpe/injected-bundle/libWPEInjectedBundle.so',
              MULTIARCH / 'libEGL_mesa.so.0', MULTIARCH / 'libGLESv2.so.2'])
    # dlopen()ed glibc pieces: never fall back to the head unit's glibc 2.27 ones.
    libraries = {name: MULTIARCH / name for name in ['libdl.so.2', 'libpthread.so.0', 'librt.so.1', 'libutil.so.1',
                                                     'libresolv.so.2', 'libanl.so.1', 'libnss_dns.so.2', 'libnss_files.so.2']}
    # dlopened by Mesa/glvnd and WebKit (libepoxy).
    for name in ['libEGL_mesa.so.0', 'libGLESv2.so.2']:
        libraries[name] = MULTIARCH / name
    for item in roots:
        output = subprocess.check_output(['ldd', str(item)], text=True)
        if 'not found' in output:
            raise RuntimeError('Unresolved dependency of %s: %s' % (item, output))
        for name in re.findall(r'(?:=>\s*)?(/[^\s()]+)', output):
            p = Path(name)
            if p.is_file():
                libraries[p.name] = p
    for name, src in sorted(libraries.items()):
        if name == 'libasound.so.2':
            continue  # keep the head unit's ALSA paired with its SmartX plugin
        shutil.copy2(src, RUNTIME / 'lib' / name)
    # libgstwpe links libWPEBackend-fdo-1.0.so.1 and also wpe_loader_init()s
    # "libWPEBackend-fdo-1.0.so". Two files would be two library instances in
    # one process (Debian uses a symlink; Store packages carry plain files),
    # which crashes on EGL init. One file, named .so, and libgstwpe's
    # DT_NEEDED shortened to match (STRING_PATCHES).
    (RUNTIME / 'lib/libWPEBackend-fdo-1.0.so.1').rename(RUNTIME / 'lib/libWPEBackend-fdo-1.0.so')
    if not (RUNTIME / 'lib/ld-linux-x86-64.so.2').is_file():
        raise RuntimeError('Private glibc loader missing')
    patched = {}
    for rel, old, new in STRING_PATCHES:
        target = RUNTIME / rel
        patched[rel] = {'from': old.decode(), 'to': new.decode(), 'count': patch_strings(target, old, new)}
    # Licenses: the Debian copyright file of every package a bundled file came from.
    sources = [MULTIARCH / 'wpe-webkit-2.0' / n for n in WPE_HELPERS] + [Path('/usr/bin') / n for n in TOOLS]
    sources += [MULTIARCH / 'gstreamer-1.0' / ('libgst' + n + '.so') for n in PLUGINS if n != 'mguvideo']
    sources += [p for p in libraries.values()] + [tls, MULTIARCH / 'gbm/dri_gbm.so', MULTIARCH / 'dri/swrast_dri.so',
                MULTIARCH / 'wpe-webkit-2.0/injected-bundle/libWPEInjectedBundle.so',
                Path('/etc/ssl/certs/ca-certificates.crt')] + fonts
    by_file = owners([str(p) for p in sources])
    packages = sorted(set(by_file.values()) | {'ca-certificates', 'libc6'})
    for name in packages:
        copyright_file = Path('/usr/share/doc') / name / 'copyright'
        if copyright_file.is_file():
            shutil.copy2(copyright_file, RUNTIME / 'licenses' / (name + '.copyright'))
    shutil.copy2(ROOT / 'LICENSE', RUNTIME / 'licenses/base-player.LICENSE')
    notice = ['# Base Player Web TV: third-party components', '',
              'Binary packages from Debian 13 "trixie" (amd64), unmodified except as noted.',
              'Sources: `apt-get source <package>=<version>` or https://snapshot.debian.org/.',
              'Copyright and license texts: runtime/licenses/<package>.copyright.', '',
              'Main licenses: WPE WebKit, libwpe, WPEBackend-fdo, GStreamer, glib, libsoup, '
              'glib-networking, GnuTLS, FFmpeg (libav*) - LGPL-2.1+ (parts BSD-2-Clause); '
              'Mesa - MIT; LLVM - Apache-2.0 WITH LLVM-exception; ICU - Unicode-3.0; '
              'glibc - LGPL-2.1+; fonts - Bitstream Vera/DejaVu and SIL OFL-1.1; '
              'CA bundle - MPL-2.0.', '',
              '## Modifications (LGPL section 2)', '',
              'Only literal path strings were rewritten in place (same length or shorter, NUL padded) '
              'so the libraries find their files in the install directory; no code was changed. '
              'Replacing a bundled library with a rebuilt one works as with any shared library.', '']
    for rel, info in patched.items():
        notice.append('- `runtime/%s`: `%s` -> `%s` (%d string(s))' % (rel, info['from'], info['to'], info['count']))
    notice += ['', '## Debian packages', '', '| Package | Version |', '|---|---|']
    notice += ['| %s | %s |' % (name, versions.get(name, '?')) for name in packages]
    notice += ['', 'Base Player\'s own code (wrappers, launcher, mguvideosink/westerossink): see licenses/base-player.LICENSE.', '']
    (RUNTIME / 'NOTICE.md').write_text('\n'.join(notice))
    for p in list((BUNDLE / 'bin').iterdir()) + [BUNDLE / 'wpe' / n for n in WPE_HELPERS] + \
            list((RUNTIME / 'libexec').iterdir()) + [RUNTIME / 'lib/ld-linux-x86-64.so.2']:
        p.chmod(0o755)
    files = {p.relative_to(BUNDLE).as_posix(): {'sha256': sha(p), 'bytes': p.stat().st_size}
             for p in sorted(BUNDLE.rglob('*')) if p.is_file() and p.name != 'build-manifest.json'}
    groups = {}
    for name, info in files.items():
        key = name.split('/')[0] if not name.startswith('runtime/') else '/'.join(name.split('/')[:2])
        groups[key] = groups.get(key, 0) + info['bytes']
    record = {
        'format': 'base-player-webtv-v1', 'version': VERSION, 'architecture': 'x86_64', 'install': INSTALL,
        'debian': Path('/etc/debian_version').read_text().strip(),
        'packages': {name: versions.get(name) for name in ['libwpewebkit-2.0-1', 'gstreamer1.0-wpe', 'libgstreamer1.0-0',
                                                           'libwpe-1.0-1', 'libwpebackend-fdo-1.0-1', 'mesa-libgallium', 'libc6']},
        'string_patches': patched,
        'sources_sha256': {n: sha(native / n) for n in ['mgu_webtv.c', 'bundle_exec.c', 'gstmguvideosink.c']},
        'env': {'WEBKIT_GST_HOLE_PUNCH_QUIRK': 'westeros', 'LIBGL_ALWAYS_SOFTWARE': '1',
                'WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS': '1'},
        'hardware_qualified': False,
        'size_by_dir': dict(sorted(groups.items(), key=lambda kv: -kv[1])),
        'files': files,
    }
    (BUNDLE / 'build-manifest.json').write_text(json.dumps(record, indent=2) + '\n')
    print(json.dumps({'bundle': str(BUNDLE), 'files': len(files), 'bytes': sum(v['bytes'] for v in files.values()),
                      'size_by_dir': record['size_by_dir']}, indent=2))


if __name__ == '__main__':
    main()
