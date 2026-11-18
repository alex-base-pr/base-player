# Base Player

Phone screen and sound on the BMW **iDrive 7 (MGU)** head unit: AirPlay for
iPhone (mirroring, music, direct video), DLNA for Android. English interface.

Base Player is built from **[pllanaio/bmw-airplay](https://github.com/pllanaio/bmw-airplay)**
(GPL-3.0-or-later, Copyright (C) 2026 Leon Pllana IT-Solutions): its receiver
runtime and its app were copied into this repository and changed. What came
from where is in [NOTICE.md](NOTICE.md).

## What Base Player changes

- **It says why a video failed.** The original reports every network failure
  as one code. Base Player tells apart: the car's clock is wrong and the
  certificate looks expired, the certificate is not trusted, no internet, DNS,
  the server refused, not found, unsupported format, decode error.
- **Optional tolerance for certificate dates.** Where GNSS jamming throws the
  head unit's clock years ahead, a setting forgives a certificate's dates
  only. Chain, signature and host name are still verified. Off by default.
- **English interface** through `i18n.js` (Ukrainian strings exist, but the
  baked font has no Cyrillic yet, so the head unit shows English).
- **Nothing of another receiver is touched on install.** The original stops,
  disables and uninstalls an older runtime of its own; that is removed.
- Its own name, mark and ids, so it installs beside nothing it would clash
  with by name. It uses the same network ports as the original, so run one
  of the two.

## Status

Not yet installed on a head unit. Checked on a development machine:

- 22 JavaScript test files pass on Linux (Node 20);
- the native player and the HLS output build with `gcc -Wall -Wextra -Werror`
  on Debian 12 with GStreamer 1.22, the versions the runtime ships;
- the error classifier (178 cases) and a live run against deliberately broken
  HTTPS hosts (19 cases) pass on the host build;
- the emulator renders every scene (`node emulator/selfcheck.js`, 40/40).

The complete runtime (UxPlay, GStreamer, the tool package) is built, tested
and released by GitHub Actions; see the repository's Releases.

Limits carried over from the original, unchanged: AirPlay works only while
CarPlay is disconnected in iDrive (the app never stops or controls CarPlay);
DRM-protected video does not play; it was developed against one head unit.

## Install

Through the [MGU Store](https://github.com/robertnisipeanu/mgu-store), on the
head unit's screen: see [docs/STORE.md](docs/STORE.md).

## Layout

```
apps/base_player/   the app: UI (view.js, i18n.js), backend, receiver control
airplay/            the receiver runtime: native sources, UxPlay patches,
                    root supervisor and firewall rules, build and test tools
native/             Base Player's own C: error cause, certificate policy
tools/              Store build of the app, catalog
emulator/           browser emulator of the app's screen
tests/              live run of the host player against test endpoints
docs/               STORE.md, NATIVE_PLAN.md; docs/upstream/ is the original
                    project's documentation (German), kept for reference
.github/workflows/  build, test and release of app and runtime
```

## Develop

```sh
npm test                     # JavaScript tests (five need Linux)
make -C native test          # error classifier, needs only cc
node emulator/build.js && node emulator/selfcheck.js
```

With GStreamer development files:

```sh
make -C native && make -C native test-gst && node tests/e2e_player.js
```

## Licence

GPL-3.0-or-later — [LICENSE](LICENSE), [NOTICE.md](NOTICE.md),
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
