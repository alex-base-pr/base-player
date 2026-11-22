# Notices

Base Player is free software under the **GNU General Public License, version 3
or (at your option) any later version** — see [LICENSE](LICENSE). It comes
without warranty.

## Derived from pllanaio/bmw-airplay

Base Player is a modified copy of **PllanaCast for BMW**,
<https://github.com/pllanaio/bmw-airplay>, taken at commit
`4604be3b62909201d39de30c23bcba3081887b7b` (9 November 2026).

    Copyright (C) 2026 Leon Pllana IT-Solutions
    Licensed under GPL-3.0-or-later

Copied from it, and since changed: everything under `airplay/`,
`apps/base_player/` (their `apps/pllana_airplay/`), `assets/`, `tools/`,
`test/`, `config/`, `package.json`, `mgu-repo.json`,
`THIRD_PARTY_NOTICES.md` and `.github/workflows/store-release.yml`. Their
documentation is kept unchanged under `docs/upstream/`. The first commit that
contains this code imports it unmodified; the git history after it is the
record of changes. In summary, as of November 2026:

- renamed throughout (ids, paths, receiver name); their name, logo, app icon
  and links removed; their Android app and its build not included;
- the install hooks and supervisor logic that stopped, disabled and
  uninstalled an older runtime removed;
- the cause of a failed video reported instead of one generic code, and an
  optional tolerance for certificate dates added, in `mgu_hls_output.h`,
  `mgu_media_player.c` and `patch_hls_lifecycle.py`;
- every interface string moved to `i18n.js` and translated to English;
- a settings entry and the path that carries it to the native processes;
- the release workflow adapted to a private repository.

## Written for Base Player

Copyright (C) 2026 Alex Rudenko, GPL-3.0-or-later: `native/` (error
classification, certificate policy, host player), `apps/base_player/i18n.js`
and `app_settings.js`, `airplay/test_base_player.js`,
`airplay/tools/prepare_brand.py` and the mark it draws, `emulator/`, `tests/`,
`docs/STORE.md`, `docs/NATIVE_PLAN.md`.

## Ideas taken from mgu-updater

<https://github.com/robertnisipeanu/mgu-store> (`native/mgu-updater`,
GPL-3.0-or-later): forgiving a certificate's validity dates while checking
everything else, because the head unit's clock is often wrong, and testing
that with a private PKI where each certificate fails for its dates alone or
for its dates and something else. No code was taken; Base Player's version
is `native/bp_gst.c` and `tests/test_cert_dates.js`.

## Other components

UxPlay, mDNSResponder, GStreamer and the other parts the runtime is built
from or bundles, the Ubuntu font, and the MGU app kit and Store this targets
are listed with their licences in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Trademarks

BMW and iDrive are trademarks of BMW AG; AirPlay, CarPlay and iPhone are
trademarks of Apple Inc. "PllanaCast" belongs to its owner. Base Player is
not affiliated with or endorsed by any of them.
