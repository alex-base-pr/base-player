# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

(An in-car app for the BMW iDrive 7 head unit, drawn with the MGU app kit's
canvas: a 1600x520 page inside the 1920x720 display, or the whole display
for video. Not a browser page, but closest to `web` of the recorded values.)

## Users

Owners of BMW cars with iDrive 7 (MGU) who already run custom apps through
the MGU Store, starting with the author's X3 G01. They install Base Player
from the Store and use it without help: the screens must explain how to
connect and what to do when something fails.

## Product Purpose

Puts the phone's screen and sound on the car: AirPlay from an iPhone
(screen mirroring, music, direct video such as YouTube), DLNA from Android.
Success: the phone connects on the first try, music plays through the car's
speakers with its title and controls on screen, and when video fails the
screen says why.

## Positioning

Built from pllanaio/bmw-airplay (GPL-3.0). What it adds: it names the real
cause of a failed video (wrong car clock, untrusted certificate, no
internet, DNS, refused, not found, format), an optional tolerance for
certificate dates where GNSS jamming throws the clock off, and an English
interface for a wider community.

## Operating Context

- Used both while driving and parked. Music and its controls are used on the
  move: readable at a glance, pressable without looking long. Video, screen
  mirroring and settings are used parked.
- Input: touch on the display and the iDrive controller (knob, press, tilt);
  the HMI's own button bar under the page.
- CarPlay must be disconnected in iDrive before AirPlay; the app does not
  control CarPlay.
- The phone joins the car's Wi-Fi or the head unit joins the phone's hotspot.

## Capabilities and Constraints

- Screens: not connected / ready with a pairing code; connected and waiting;
  music (title, artist, album, artwork, back, play/pause, next, shuffle,
  repeat); video and screen mirroring full screen; transitions (loading,
  resuming); errors with a cause; settings (certificate-date tolerance).
- Hardware buttons: Connect, Stop video, To mirroring, Disconnect, Settings,
  Close. The HMI shows five in its bar.
- Drawing: the kit canvas only (rects, rounded rects, lines, circles,
  polygons, a baked font atlas with Latin and Cyrillic, registered RGBA
  images). No arbitrary fonts, no blur, no CSS.
- Interface language: English (confirmed 2026-11-22), with Cyrillic titles
  from the phone drawn as sent.
- Web players that use Media Source send only sound over AirPlay; screen
  mirroring is the way for them.

## Brand Commitments

- Name: Base Player. Mark: a dark tile with a white screen outline and a
  blue play triangle (airplay/tools/prepare_brand.py).
- Must look native to BMW iDrive 7 (Operating System 7): requested by the
  author. Must not use BMW's or PllanaCast's logos or names as its own.

## Evidence on Hand

- Photos from the car (2026-11-18, 0.2.1): the empty first start, the music
  screen with a Cyrillic title as question marks, the HMI bar.
- No user testimonials, usage numbers or reviews exist; none may be invented.

## Product Principles

1. A glance is enough while driving: one primary state per screen, large
   targets, short words.
2. Say what is happening and what to do next, especially when it fails.
3. Look like part of the car, not like an app placed on top of it.
4. Never touch the car's own systems (CarPlay, coding, ECUs).

## Accessibility & Inclusion

In-vehicle use: driver distraction limits apply to anything shown while
moving (short glances, large text, no reading tasks).
