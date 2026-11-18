# Installing through the MGU Store

Base Player installs with the [MGU Store](https://github.com/robertnisipeanu/mgu-store)
on the head unit's screen. It is two components:

| Component | Kind | What it is |
| --- | --- | --- |
| `base-player-receiver` | tool | the receiver runtime: UxPlay, a private GStreamer, the players, a root supervisor that sets the firewall rules for the app |
| `base_player` | app | the iDrive app; built without BMW's SDK, which the Store adds from a stock app on the unit |

Both are built, tested and published by GitHub Actions
(`.github/workflows/store-release.yml`). A push to `main` with a version that
has no release yet publishes release `v<version>` and then updates the
`catalog` release the Store reads.

## Before the first install

1. The workflow must have run once on `main`, so that the releases exist.
   Check the repository's Releases page for `v<version>` and `catalog`.
2. From the Store's own sources the head unit needs `mgu-uplink`, `mgu-render`
   and `mgu-deploy`; the catalog asks for them and the Store installs them
   first.

## On the head unit

1. Store, Settings, sources: add the GitHub repository
   `alex-base-pr/base-player` and choose **Releases**.
2. Open **Base Player** and press Install. The Store installs the receiver
   first, then the app.
3. Disconnect CarPlay in iDrive, open Base Player, press **Connect** and pick
   "Base Player" in the iPhone's Screen Mirroring or AirPlay list.

The setting **Ignore certificate dates (wrong car clock)** is under the
**Settings** button. It applies from the next Connect.

## If another receiver is installed

Base Player uses the same network ports as the project it is derived from
(`pllana-airplay-receiver`, and its older `mgu-airplay`). Its systemd unit
declares a conflict with both, so starting Base Player's receiver stops
theirs. Nothing of theirs is uninstalled or disabled; remove one of the two
in the Store to settle it.

Base Player never stops, restarts or controls the stock CarPlay service.

## Updating

Raise `version` in `apps/base_player/app.json` and `package.json` (they must
match) and in `airplay/tools/build_runtime.py`, and push to `main`. Published
versions are never overwritten.

## Verified, and not

Verified: the workflow builds, tests and publishes both packages (releases
`v0.2.0`, `v0.2.1`); the catalog and both packages download without a token
and match the sizes and SHA-256 the catalog lists.

Not verified:

- **anything on a head unit**: install, the receiver starting, pairing, video,
  sound, the six-button bar and the settings screen.
