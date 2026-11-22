"""Write the Store catalog (schema 2) for a GitHub release of this repository."""
import argparse
import hashlib
import json
from pathlib import Path
from urllib.parse import quote

REPOSITORY = 'alex-base-pr/base-player'


def artifact(path, tag, urls):
    # A private repository's assets are only reachable through the API URL,
    # which the Store fetches with its token (mgu-store docs/PUBLISHING.md);
    # it is known once the asset is uploaded and passed in with --url.
    data = path.read_bytes()
    url = urls.get(path.name) or 'https://github.com/%s/releases/download/%s/%s' % (REPOSITORY, tag, quote(path.name, safe=''))
    return {'name': path.name, 'size': len(data), 'sha256': hashlib.sha256(data).hexdigest(), 'url': url}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dist', required=True)
    parser.add_argument('--app-version', required=True)
    parser.add_argument('--runtime-version', required=True)
    parser.add_argument('--tag', required=True)
    parser.add_argument('--webtv-version', help='add the optional base-player-webtv tool (its .tgz must be in --dist)')
    parser.add_argument('--url', action='append', default=[], metavar='NAME=URL',
                        help='download URL of an uploaded asset (private repository)')
    args = parser.parse_args()
    dist = Path(args.dist)
    urls = dict(item.split('=', 1) for item in args.url)
    app = dist / ('base_player@%s.tgz' % args.app_version)
    runtime = dist / ('base-player-receiver@%s.tgz' % args.runtime_version)
    catalog = {'schema': 2, 'components': [
        {'id': 'base-player-receiver', 'kind': 'tool', 'title': 'Base Player receiver',
         'description': 'UxPlay receiver, video and BMW audio output for Base Player',
         'author': 'Base Player', 'version': args.runtime_version, 'artifact': artifact(runtime, args.tag, urls),
         'requires': {'mgu-deploy': '0.7.17'}, 'uninstallable': True, 'mguHmi': ['ID7']},
        {'id': 'base_player', 'kind': 'app', 'title': 'Base Player',
         'description': 'Phone screen and sound on iDrive 7: AirPlay for iPhone, DLNA for Android',
         'author': 'Base Player', 'version': args.app_version, 'artifact': artifact(app, args.tag, urls),
         'requires': {'base-player-receiver': args.runtime_version, 'mgu-uplink': '0.7.3', 'mgu-render': '0.6.11', 'mgu-deploy': '0.7.17'},
         'uninstallable': True, 'mguHmi': ['ID7']},
    ]}
    if args.webtv_version:
        # Optional tool: listed in the Store, offered as an update only once
        # installed (mgu-store docs/PUBLISHING.md). Deliberately not in the
        # app's requires: Base Player works without Web TV.
        webtv = dist / ('base-player-webtv@%s.tgz' % args.webtv_version)
        catalog['components'].append(
            {'id': 'base-player-webtv', 'kind': 'tool', 'title': 'Base Player Web TV (experimental)',
             'description': 'Optional web engine (WPE WebKit) for the Web TV mode of Base Player',
             'author': 'Base Player', 'version': args.webtv_version, 'artifact': artifact(webtv, args.tag, urls),
             'requires': {'mgu-deploy': '0.7.17'}, 'optional': True, 'uninstallable': True, 'mguHmi': ['ID7']})
    (dist / 'catalog.json').write_text(json.dumps(catalog, indent=2) + '\n')
    print(json.dumps(catalog, indent=2))


if __name__ == '__main__':
    main()
