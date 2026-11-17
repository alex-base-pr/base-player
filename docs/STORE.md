# Installing through the MGU Store

Base Player installs from this repository with the
[MGU Store](https://github.com/robertnisipeanu/mgu-store) — on the head unit's
screen, no computer. The Store reads `mgu-repo.json` ("repo tree" layout in its
`docs/PUBLISHING.md`) and builds the app on the head unit.

**What you get today: the interface only.** There is no receiver in this build;
the screen says so. Nothing is received from a phone yet.

## On the head unit

1. Store → Settings → sources → add the GitHub repository
   `alex-base-pr/base-player`, channel **branch `main`**.
   The repository is private, so the Store needs a GitHub token for it (the
   Store's installer has a `token` command; its Settings have "Accounts").
2. The head unit needs internet for the build (the Store's uplink: phone
   hotspot, tethered phone, LTE stick). The build downloads about 33 MB.
3. Open **Base Player** in the Store and press Install.

Without internet in the car: the Store's `mgu-install.js usb-repo` copies a
repository to a USB stick, but this build would still need to download the kit,
so that route does not work yet.

## What the build does

`mgu-repo.json` tells the Store to run `tools/build_store.py` for every folder
in `apps/`. The script:

1. downloads one pinned commit of the app kit
   ([idrive7-apps](https://github.com/cauliflowermossgrape/idrive7-apps), MIT)
   through the proxy the Store provides, and refuses it unless its SHA-256
   matches the pinned value;
2. unpacks only `kit/` and `LICENSE` from it;
3. runs the kit's own `build.py` with this app and the `oap-sdk` module the
   Store generated from the head unit's donor app;
4. leaves `<id>@<version>.tgz` in `MGU_OUT`.

No BMW SDK and no kit code is kept in this repository.

To move to a newer kit, change `KIT_COMMIT` and `KIT_SHA256` in
`tools/build_store.py` together. GitHub does not promise that a commit's
archive stays byte-identical for ever; if the build starts failing on the
checksum with an unchanged pin, that is the cause.

## How the app sits on the kit

`main.js` is the entry point (`mgu.run`). `view.js` draws through the small
contract in `docs/CANVAS_API.md`; `kit_canvas.js` maps it onto the kit's
canvas: the 720-high design is scaled into the kit's 1600x520 page, text y is
converted from line top to baseline, and the kit's `label` and `bold` fonts are
used.

**English only on the head unit.** The kit's font atlases are ASCII plus a few
symbols. Ukrainian needs a Cyrillic atlas with і, ї, є, ґ baked and shipped
with the app; until then the on-unit build has no language setting. The
emulator shows both languages.

## Verified, and not

Verified on a desktop:

- the kit's `build.py` stages the app from `app.json` + `main.js` (preview
  mode, no SDK), through `tools/build_store.py` with the pinned archive;
- the script refuses a wrong archive and a missing SDK;
- `tests/test_app.js`: every English string uses only glyphs the kit fonts
  have, every box and text anchor lands inside the 1600x520 page.

Not verified:

- **the build on a head unit** (Python 3.12 there, the proxy, the 10-minute
  and 200 MB limits, the generated `oap-sdk`);
- **a rendered frame with the kit's real fonts** — text widths differ from the
  browser emulator, so lines may run longer or shorter than there;
- the buttons and settings screen the kit generates from `app.json`.

## Still to come

The receiver. Native programs reach the head unit as a Store *tool* (a prebuilt
x86-64 kit with `component.json`, built in CI), listed beside the app.
