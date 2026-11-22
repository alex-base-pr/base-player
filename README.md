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
- **English interface** through `i18n.js`. The font atlas covers Latin and
  Cyrillic, so titles a phone sends in Ukrainian or Russian are drawn
  (0.2.2; before that they showed as question marks).
- **Nothing of another receiver is touched on install.** The original stops,
  disables and uninstalls an older runtime of its own; that is removed.
- Its own name, mark and ids, so it installs beside nothing it would clash
  with by name. It uses the same network ports as the original, so run one
  of the two.

## Status

Installed through the MGU Store and used on one car: a BMW X3 G01 (2022,
iDrive 7), November 2026, version 0.2.1.

Works there:

- install from the Store (receiver and app);
- connecting an iPhone; AirPlay audio through the car's speakers, with track
  title, artist and the music controls on screen;
- direct video from YouTube with the AirPlay button.

Seen there, not yet explained:

- **On the first start the page under the title stayed empty and video was
  black** while the sound worked. Some time later it started to draw and has
  worked since. What changed in between is not known yet; if it happens,
  check in the Store that the renderer (`mgu-render`) is installed and up to
  date, and restart the head unit.
- **The Settings button does not appear** in the button bar, so the
  certificate-date setting cannot be reached on the unit yet. The kit shows
  a limited number of buttons and Settings is the sixth.
- "For BMW sound choose Connect again" was shown while the sound did play.

Not yet tried on the car: screen mirroring picture, the cause of a failed
video on screen, the certificate-date setting, Cyrillic titles (0.2.2),
DLNA from Android.

Known limits:

- Some web players send **only the sound** over AirPlay: those that play
  through Media Source Extensions (for example hls.js) switch off AirPlay
  video (`disableremoteplayback`). Use screen mirroring for them.
- AirPlay works only while CarPlay is disconnected in iDrive; the app never
  stops or controls CarPlay.
- DRM-protected video does not play.

Checked on a development machine for every release: 22 JavaScript test files
on Linux, the native sources with `gcc -Wall -Wextra -Werror` on Debian 12 /
GStreamer 1.22, the error classifier (178 cases), certificate dates on a
private PKI (36 cases), the emulator (40 scenes). GitHub Actions builds the
full runtime, runs the native tests and publishes the release.

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
