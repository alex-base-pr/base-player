# Native side — plan and state

Two fixes come first, because existing solutions lack them.

## 1. Say the real cause

A typical playbin/GStreamer player reduces every network failure to one code.
Base Player tells them apart and sends `error <code>` to the UI, which shows
the text `err_<code>` from `i18n.js`:

| Code | Meaning |
| --- | --- |
| `certificate` | certificate refused for its dates — on this head unit, the clock |
| `certificate_untrusted` | certificate refused for chain, host name or signature |
| `offline` | no route, connection refused or timed out |
| `dns` | the name does not resolve although a route exists |
| `forbidden`, `not_found` | HTTP 401/403/407, 404/410 |
| `unsupported`, `decode` | container/codec not handled, decoding failed |
| `media_failed` | nothing more specific is known |

## 2. Tolerate certificate dates only (optional)

When the head unit's clock is wrong, valid certificates look expired. With the
setting `cert_date_tolerance` on, only `G_TLS_CERTIFICATE_EXPIRED` and
`G_TLS_CERTIFICATE_NOT_ACTIVATED` are forgiven. Chain, signature and host name
are verified as always. Off by default.

## What is implemented (`native/`)

- `bp_error.c` — plain C, no GLib: `BpErrorInput` -> code. Order: exact
  certificate flags, stream kind, HTTP status, own probe of the host, error text.
- `bp_gst.c` — GStreamer glue: certificate policy, reading `GST_MESSAGE_ERROR`,
  the host probe.
- `bp_player.c` — direct-video player: commands on stdin, `BP …` event lines on
  stdout; `apps/base_player/player_proto.js` turns them into state for `view.js`.

## Findings that shaped it

- **libsoup 3 puts no cause on the bus.** DNS failure, refused connection and
  TLS failure all arrive as STREAM/FAILED "Internal data stream error"; the
  GError is only logged. So when a message names no cause, `bp_net_probe()`
  resolves, connects and does a TLS handshake to the URL's host itself (up to
  5 s, accepting nothing) and reports the step that failed. This does not
  depend on the libsoup version.
- **libsoup 2** puts transport pseudo-statuses into `http-status-code`
  (2 cannot resolve, 4 cannot connect, 6 TLS) and reports an unresolvable host
  as RESOURCE/NOT_FOUND. Both are handled.
- **"DNS" or "no internet"?** Without a route the resolver fails too.
  `bp_route_probe()` asks the kernel for a route (UDP `connect()`, no packet
  sent); without one, a DNS failure is shown as `offline`.
- **`souphttpsrc` has no `tls-validation-flags` property** (`rtspsrc` has). So
  `bp_tls_attach()` uses, per source, the first hook that exists:
  1. the `tls-validation-flags` property;
  2. the `accept-certificate` signal (libsoup 3, GStreamer >= 1.24);
  3. the `tls-database` property, wrapped in a delegating database that runs
     the full verification and then only changes the verdict on dates (works
     with libsoup 2 as well).

  `ssl-strict` is never turned off. Sources are caught through `source-setup`
  and `deep-element-added`, because an HLS demuxer creates its own HTTP sources
  that `source-setup` never sees.
- Hooks 2 and 3 give exact flags, so `certificate` and `certificate_untrusted`
  are told apart reliably. Hook 1 gives none; the host probe supplies them.

## Checks

- `make -C native test` — classifier and policy (plain cc).
- `make -C native test-gst` — hook 1 on `rtspsrc`.
- `node tests/test_app.js` — codes <-> strings <-> error screen.
- `node tests/e2e_player.js` — live: badssl.com expired / wrong.host /
  self-signed / untrusted-root, a host that does not exist, a refused
  connection, a 404; hooks 2 and 3.

Host used: macOS, GStreamer 1.28, libsoup 3, GnuTLS.

## Not verified — needs the car

- Building for the MGU (x86-64 Linux with its own GStreamer runtime).
- Which of the three hooks the head unit's GStreamer offers.
- Whether a default route through the telematics unit exists while the phone
  hotspot is off; if so, a DNS failure shows as `dns`, not `offline`.
- The MGU video sink and audio output in `bp_player`.

## Next

The AirPlay receiver (UxPlay-based) and its packaging as a Store tool built
in CI. The app side of the Store install exists: `docs/STORE.md`.
