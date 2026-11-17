# Notices

Base Player is free software under the **GNU General Public License, version 3
or (at your option) any later version** — see [LICENSE](LICENSE). It comes
without warranty.

Copyright (C) 2026 Alex Rudenko, for everything not listed below.

## Adapted from pllanaio/bmw-airplay

<https://github.com/pllanaio/bmw-airplay> — Copyright (C) 2026 Leon Pllana
IT-Solutions, GPL-3.0-or-later. The following parts of Base Player are adapted
from it and remain under that licence:

| Here | Adapted from | What was taken, what changed |
| --- | --- | --- |
| `apps/base_player/view.js` | `apps/pllana_airplay/view.js` | Screen layout (pairing card, three mode cards, now-playing row), the state model it renders and the `text()` helper. Changed: all text goes through i18n, an error screen that names the cause, palette, icons. |
| `apps/base_player/app.json` | `apps/pllana_airplay/app.json` | Screen definition, hardware button ids and resource limits. Changed: identity, English labels, settings. |
| `apps/base_player/i18n.js` | strings in `apps/pllana_airplay/*.js` | Several status texts are translations of the German originals. The error texts are new. |

Written for Base Player and not derived from that project: everything in
`native/`, `apps/base_player/player_proto.js`, `main.js`, `kit_canvas.js`,
`tools/`, `emulator/`, `tests/`. The idea
of a line-based player driven over stdin, and the observation that every
network failure there ends up as one `network_failed` code, come from reading
its `airplay/native/mgu_media_player.c`; no code was taken from it.

No name, logo or branding of that project is used.

## Built for the MGU app kit

<https://github.com/cauliflowermossgrape/idrive7-apps> — MIT. The app targets
that kit's runtime and canvas API (`docs/CANVAS_API.md` describes the part it
uses). No kit code is included in this repository; `tools/build_store.py`
downloads a pinned commit of it at build time.

## Trademarks

BMW and iDrive are trademarks of BMW AG; AirPlay and iPhone are trademarks of
Apple Inc. This project is not affiliated with or endorsed by either.
