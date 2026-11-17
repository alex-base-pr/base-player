# Base Player

Phone screen and sound on the BMW **iDrive 7 (MGU)** head unit — AirPlay, plus
DLNA for Android. English by default, Ukrainian as a second language.

## Why

When direct video fails, existing receivers say "could not play". Base Player
says **why**: the car's clock is wrong and the certificate looks expired, the
head unit has no internet, DNS is unreachable, the server refused, the format
is not supported. Where GNSS jamming throws the head unit's clock years ahead,
an optional setting tolerates the certificate's **dates only** — chain,
signature and host name are still verified.

Base Player builds on the work of others: its interface is adapted from
[pllanaio/bmw-airplay](https://github.com/pllanaio/bmw-airplay) and it targets
the [idrive7-apps](https://github.com/cauliflowermossgrape/idrive7-apps) kit.
See [NOTICE.md](NOTICE.md) for what came from where.

## Status

Early. Done:

- the interface (`apps/base_player/view.js`), strings (`i18n.js`), manifest (`app.json`);
- a browser **emulator** (`emulator/`) that renders the real app code;
- from the native side (`native/`): error classification and certificate-date
  tolerance for direct video, verified on a development host, **not yet on a
  head unit** (`docs/NATIVE_PLAN.md`).

Not done: the AirPlay receiver itself (UxPlay-based), the app entry point
(`main.js`), packaging for the MGU Store.

## Layout

```
apps/base_player/
  app.json         MGU manifest: screen, buttons, settings
  view.js          all rendering; drawHome(c, state, t)
  i18n.js          strings en/uk; t(key), t.set('en'|'uk')
  player_proto.js  event lines of the native player -> state for view.js
native/            C + GStreamer: error cause, certificate policy, direct-video player
emulator/          browser emulator of the HMI with scene and language pickers
tests/             native <-> UI checks and a live run of the player
docs/              CANVAS_API.md (drawing contract), NATIVE_PLAN.md
```

## Try it

```sh
node emulator/build.js       # writes emulator/index.html; open it in a browser
node emulator/selfcheck.js   # 40/40
make -C native test          # classifier, needs only cc
node tests/test_app.js       # error codes <-> strings <-> error screen
```

With GStreamer development files installed:

```sh
make -C native && make -C native test-gst
node tests/e2e_player.js     # live, needs internet
```

## Licence

GPL-3.0-or-later — [LICENSE](LICENSE), [NOTICE.md](NOTICE.md).
