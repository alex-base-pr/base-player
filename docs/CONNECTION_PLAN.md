# Connection, network and YouTube: findings and plan

> **Corrected by [ARCHITECTURE_RESEARCH.md](ARCHITECTURE_RESEARCH.md)
> (November 2026):** on this car wireless CarPlay and the same iPhone's
> Personal Hotspot work at the same time (mgu-uplink keeps `wlan0` joined
> on 2.4 GHz, it only limits scanning during CarPlay); hotspot discovery
> still exists in `airplay/network.js` (only the 0.4.8 own responder was
> reverted); a phone in CarPlay has a second path to the receiver through
> the hotspot link, so answering on `p2p-*` is dropped from the plan.

November 2026, after 0.3.0. From three read-only reviews of the code, the
original project's documentation (`docs/upstream/`), the MGU Store sources and
public material. Nothing here has been measured on the car yet; items marked
**[car]** need a measurement there before or after the change.

## 1. How a phone connects today

1. At boot the root service (`airplay/runtime/launch.js`) finds the app's
   UID, sets firewall rules (`airplay/network.js`) and starts the backend
   (`apps/base_player/backend.js`). The backend does **not** start the
   receiver.
2. The app connects to the backend. Only when the user presses **Connect**
   does the backend start UxPlay, the DLNA renderer and the Android cast
   receiver, and it **takes the BMW audio route at once**, before any phone
   is there (`backend.js:348`).
3. UxPlay gets a **new random 6-digit code on every start**
   (`receiver.js:139`), held in memory only. Direct YouTube video (`-hls`) is
   enabled only if an internet uplink exists **at that moment**
   (`receiver.js:162`).
4. Discovery goes through BMW's own mdnsd. On the car's Wi-Fi this works. On
   the phone's hotspot (head unit as a client) BMW's mdnsd does not announce;
   the upstream fix for that was reverted, so hotspot discovery is unproven.
5. Car restart: everything is lost; open the app, press Connect, type a new
   code on the phone.

## 2. What is wrong with it

| # | Problem | Cause |
|---|---|---|
| A | Connect must be pressed on every start, and a new code typed every time | design choice; code not stored (`receiver.js:139`) |
| B | Pressing Connect cuts the radio even before a phone is connected | audio route taken at Connect, not when media starts (`backend.js:348`) |
| C | "For BMW sound choose Connect again" while sound plays (seen on the car) | `audio_route.js:37-44` marks the route owned before it is confirmed; a slow confirmation leaves the warning stuck, and Connect cannot clear it. Also a leftover route from a previous backend, and a suspended route during a call or navigation prompt |
| D | Internet that appears after Connect is not used for YouTube until Disconnect/Connect | HLS decided once per session |
| E | If mdnsd restarts, the receiver disappears from the phone silently | UxPlay registers once |
| F | A second phone is refused without a word on screen | UxPlay default; Android cast answers "busy" |
| G | The app says nothing about the network state | mgu-uplink publishes it (`/run/mgu-uplink/status.json`), nobody reads it |

## 3. CarPlay

- Wireless CarPlay runs on a **Wi-Fi Direct group (`p2p-*`)**, not on the
  car's normal Wi-Fi. The receiver listens on neither that interface nor
  does it announce there, so a phone in wireless CarPlay cannot reach it.
- The same iPhone is most likely **blocked by iOS itself**: CarPlay video is
  AirPlay, and the phone already uses its one screen-sink for CarPlay. No
  source shows Screen Mirroring to a second receiver working while CarPlay
  is on. Audio-only AirPlay in that state is unconfirmed. **[car]**
- Wireless CarPlay and the iPhone's Personal Hotspot do not run together in
  practice, and mgu-uplink pauses its Wi-Fi while CarPlay is active.
- What can work without touching `carplay.service`:
  1. **a second phone** (passenger iPhone, or Android over DLNA) on the
     car's Wi-Fi while the driver's phone is in CarPlay — the only blockers
     are the head unit's audio route and screen; **[car]** whether BMW grants
     our audio route while CarPlay audio plays;
  2. **wired CarPlay + internet from an LTE stick** (`usb_phone=off`), which
     frees the phone's Wi-Fi;
  3. answering on `p2p-*` behind a setting, only if the measurement shows
     iOS would offer the receiver there.
- A "release CarPlay" button through BMW's DevicePresentation interface was
  built and removed by the original author at his owner's request; it does
  not stop the service but acts on the CarPlay connection. **Not proposed
  without an explicit decision.**

## 4. YouTube "like on a TV"

- The real Cast picker for third-party TVs is **DIAL + YouTube's Lounge
  API** (Google Cast itself needs Google-signed certificates). An open
  implementation exists (`yt-cast-receiver`), but:
  - it needs Node 18+ (the head unit's apps run on Node 8; a newer Node would
    have to ship in the runtime, 40–100 MB);
  - the receiver must turn a video id into a stream itself (youtubei.js or
    yt-dlp), which breaks every few weeks;
  - the Lounge API is undocumented and fetching streams outside YouTube's
    player is against YouTube's terms by name. Acceptable as a private
    experiment, not for a published Store app.
- "Just run YouTube" means a browser on the head unit. The only one is
  pllanaio/mgu-browser (Chromium, 180 MB, frames sent as JPEG, YouTube not
  yet tested, youtube.com/tv blocks non-TV browsers).
- **AirPlay direct video stays the best path**: the phone's own YouTube app
  hands over the stream, it already works on the car, no extra parts, no
  terms issue. It must stay untouched by every change below.

## 5. Plan, in order

| Step | Change | Files | Risk | Check |
|---|---|---|---|---|
| 1 | **Stored pairing code** (created once, "New code" in Settings) and a stored server key, so the phone reconnects after a car restart without typing | `receiver.js`, `backend.js`, `app_settings.js`, `i18n.js` | low | test: same `-pw` across starts and new instances; **[car]** reconnect after restart |
| 2 | **Audio route only when media starts**, not at Connect | `backend.js` | low | test: no route call before `media`; **[car]** radio keeps playing after Connect |
| 3 | **Fix the false sound warning**: confirm the route before marking it owned, clear the warning when the check passes, treat "suspended" as healthy, adopt or remove a leftover route at start; reword it | `audio_route.js`, `backend.js`, `i18n.js` | low–medium | scripted route tests (slow confirm, leftover, suspended) |
| 4 | **Start the receiver when the app opens** (no Connect needed); later an "Always visible" setting that starts it at boot | `main.js`, `backend.js` | very low / medium | test: start sent on open; with 1–2 in place, boot start does not touch audio |
| 5 | **Restart an idle receiver when internet or mdnsd changes**, never during a session | `backend.js`, `receiver.js` | medium | fake lease / mdnsd tests, idle and connected |
| 6 | **Show the network state** from mgu-uplink: no internet, CarPlay pausing Wi-Fi, hotspot not found, with one line of advice | `backend.js`, `view.js`, `i18n.js` | low | fixture states in the emulator |
| 7 | **Second phone**: say so on screen, or let the newcomer take over (`-nohold`) | `receiver.js`, `view.js` | low | test |
| 8 | **[car] measurements** before any CarPlay work: interfaces during wireless/wired CarPlay, whether the iPhone lists the receiver with CarPlay on, whether BMW grants the audio route then, which interfaces mdnsd binds | — | none | read-only commands over SSH |

YouTube: no change. A DIAL/Lounge receiver only as a separate, private
experiment if wanted after steps 1–7.
