# UX review: Base Player on iDrive 7

November 2026, version 0.2.3. Based on the code (`apps/base_player/view.js`,
`main.js`), the emulator and two photos from the car. Product facts are in
[PRODUCT.md](../PRODUCT.md).

The screen is used **while driving** (music, controls) and **parked** (video,
mirroring, settings). The test for every screen: can the driver read the one
thing that matters in a glance of under two seconds, and hit the control
without looking for it?

## 1. What the user does

| # | Flow | Steps today | Where it hurts |
|---|---|---|---|
| A | First connection | open app → read "Press Connect below" → press **Connect** in the bar → a code appears → on iPhone open Control Centre → Screen Mirroring → pick Base Player → type the code | CarPlay must be disconnected first, and nothing on screen says so. Wi-Fi is mentioned only as "BMW Wi-Fi or a shared Wi-Fi". The Connect step is an extra step on every start. |
| B | Music | phone plays → music screen with title, artist and five text buttons | buttons are words ("Back", "Play / Pause"), the same size as the shuffle/repeat toggles; no progress; a status line of 15 words under the buttons |
| C | Direct video (YouTube) | AirPlay button on the phone → loading text → full screen → tap shows the bar for 8 s | fine; "Loading video …" is the only feedback |
| D | Screen mirroring | Control Centre → Screen Mirroring → full screen | fine |
| E | Video fails | error text in small orange letters at the very bottom of the home screen | the most important message of the app (the reason, the fix) is the smallest text on the screen and is easy to miss |
| F | Settings | (0.2.3) Settings button in the header → the kit's settings sheet | only one setting; label explains itself |
| G | Leave | **Disconnect** or **Close** in the bar | two buttons that look alike; Close also disconnects |
| H | Receiver missing / starting | diagnosis text in the bottom line | same problem as E: small, at the bottom |

## 2. Screen by screen

### Home, not connected
- **Marketing hero.** "Your phone. / Your BMW." at 62 px and two "mode cards" take
  60 % of the screen and tell the user nothing they can act on. A car screen is
  not a landing page.
- **The one action (Connect) lives only in the bar**, the screen says "Press
  Connect below" instead of offering it.
- **The prerequisites are missing:** CarPlay off, which Wi-Fi.
- Status pill (top right) is the right idea, too small to read in a glance.

### Home, code shown
- The code is good: big, separate digits. It sits in a card on the right
  while the left 60 % keeps the marketing hero. The code should be the screen.
- Instructions are one line ("Choose it on your iPhone and enter the code");
  the path on the iPhone (Control Centre → Screen Mirroring) is not shown.

### Home, connected, waiting
- Shows an AirPlay glyph and "Start music or video on your iPhone". Correct
  content; again shares the screen with the hero.

### Music
- No album art frame difference between "no artwork" and "loading".
- **Transport controls are text buttons of different widths** (152, 194, 152,
  272, 332 px). Play/Pause is not visually primary. Shuffle and Repeat are the
  widest, though least used.
- No progress or time; the AirPlay metadata has none, so this is acceptable,
  but the empty band where it would be is wasted.
- The hint line "Start playback on your iPhone. The sender enables the
  controls." is a sentence to read while driving.
- "For BMW sound choose Connect again" appears in orange even when sound
  plays (seen on the car).

### Errors and notices
- One line, 24 px, orange, at y = 490: the lowest-priority position for the
  highest-priority content. Long causes are cut by the screen edge.
- No recovery action next to the cause ("Try screen mirroring" is the usual
  fix, it is not offered as a control).

### Header and bar
- Header: logo + "Base Player" in blue at 24 px, Settings, status. On the car
  the HMI shows its own red title above when it draws the screen, so the
  app's title duplicates it there.
- Bar: Connect, Stop video, To mirroring, Disconnect, Settings, Close. "Stop
  video" and "To mirroring" are meaningful only during video, yet always shown.

## 3. Against iDrive 7 conventions

iDrive 7 (Operating System 7) screens share a grammar the driver already
reads without thinking:

- near-black background with a cool blue-grey depth, no decoration;
- white primary text, cool grey secondary, one blue for selection and state;
- left-aligned title, content in a clear column or in tiles of equal height;
- line icons in white, 2 px stroke, no colour fills;
- the selected element gets a blue fill; focus has a thin light outline;
- media: cover on the left, title large, artist and album smaller under it,
  controls as icons in a row with the primary one largest.

Base Player today is a dark web landing page: big hero, mint and blue
accents, pill-shaped chips, cards with drop borders. It reads as "an app put
on the car", which PRODUCT.md rules out.

### Colour and material: the kit's M look

The apps the owner already runs from the MGU app kit (idrive7-apps) share one
look, its default theme **M Tricolour** (`kit/runtime/themes.js`,
`gauges.js`): ground `#04060a`, square panels as a faint grey overlay, each
topped by the M stripe (light blue `#81c4ff`, dark blue `#16588e`, red
`#e7222e`, the red part with an angled end) and a thin white line; bold
uppercase labels with letter spacing; the focused or selected element marked
in M red `#ef2b2d` with a red bar under it. Base Player uses the same, so it
sits beside those apps as one family.

## 4. Changes proposed

1. **One screen per state, no hero.** The state *is* the content: Ready →
   Pairing → Connected → Music / Video. Remove "Your phone. Your BMW." and
   the mode cards.
2. **Primary action on the screen.** A large Connect tile when not connected
   (the bar keeps it too). Recommendation for later, not in this redesign:
   start the receiver when the app opens, so the code is there at once.
3. **Pairing as a step list** with the real iPhone path, and the two
   prerequisites (CarPlay off, Wi-Fi) as the first step. The code large on
   the right, in iDrive's tile style.
4. **Music in the iDrive media layout:** cover left, title 44 px, artist and
   album, a source line "AirPlay · iPhone". Transport as icon buttons:
   previous, play/pause (largest, blue), next; shuffle and repeat as small
   toggles at the right, lit blue when on. No sentence under the controls.
5. **Errors get a panel, not a footnote:** an alert block in the content
   column with the cause in 30 px, one line of what to do, and the fix as a
   control where there is one ("Use screen mirroring" points the user to the
   phone; "Try again" re-sends Connect).
6. **Header as in the kit's frame:** a light bar with the app mark and the
   name in bold capitals, status as a pill with a coloured dot, Settings as a
   gear icon. Panels, labels and the red selection as in the M theme above.
7. **Copy for a glance:** at most six words per line on screens used while
   driving; full sentences only on the pairing and error screens, used parked.
8. Bar order stays (Settings stays fifth so the HMI shows it). Hiding Stop
   video / To mirroring outside video needs the kit's `hideButton`; a later
   step.

Out of scope here and noted for later: auto-start on open (2), context
buttons in the bar (8), a progress bar if the sender provides times.
