"""Standard-library checks; no donor SDK or vehicle is needed."""
from pathlib import Path
import hashlib
import importlib.util
import io
import json
import os
import tarfile
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('airplay_store_build', ROOT / 'tools/build_store.py')
store = importlib.util.module_from_spec(spec)
spec.loader.exec_module(store)


def load(name, path):
    module_spec = importlib.util.spec_from_file_location(name, ROOT / path)
    module = importlib.util.module_from_spec(module_spec)
    module_spec.loader.exec_module(module)
    return module


catalog_tool = load('store_catalog', 'tools/make_catalog.py')
webtv_package = load('webtv_package', 'airplay/tools/package_webtv.py')
webtv_build = load('webtv_build', 'airplay/tools/build_webtv.py')


class StoreInputTests(unittest.TestCase):
    def test_wrong_archive_hash_is_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            fake = root / 'fake.tar.gz'
            fake.write_bytes(b'not the pinned kit')
            with patch.dict(os.environ, {'MGU_KIT_ARCHIVE': str(fake)}):
                with self.assertRaisesRegex(RuntimeError, 'checksum differs'):
                    store.kit_archive(root / 'download.tar.gz')

    def bad_member(self, name, symlink=False):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            archive = root / 'kit.tar.gz'
            with tarfile.open(archive, 'w:gz') as package:
                item = tarfile.TarInfo('idrive7-apps-' + store.KIT_COMMIT + '/' + name)
                if symlink:
                    item.type = tarfile.SYMTYPE
                    item.linkname = '/etc/passwd'
                    package.addfile(item)
                else:
                    item.size = 1
                    package.addfile(item, io.BytesIO(b'x'))
            with self.assertRaises(RuntimeError):
                store.extract_kit(archive, root / 'out')
            self.assertFalse((root / 'escape').exists())

    def test_parent_traversal_is_rejected(self):
        self.bad_member('kit/../../escape')

    def test_symlink_is_rejected(self):
        self.bad_member('kit/unsafe', symlink=True)

    def test_backslash_path_is_rejected(self):
        self.bad_member('kit/a\\b')

    def test_font_asset_provenance_and_german_glyphs(self):
        folder = ROOT / 'assets/fonts'
        record = json.loads((folder / 'atlas-manifest.json').read_text())
        atlas = (folder / 'airplay.json').read_bytes()
        self.assertEqual(hashlib.sha256(atlas).hexdigest(), record['atlas_sha256'])
        self.assertEqual(hashlib.sha256((folder / record['font']).read_bytes()).hexdigest(), record['font_sha256'])
        for size in json.loads(atlas)['sizes']:
            for ch in 'äöüÄÖÜß„“…':
                self.assertIn(str(ord(ch)), size['glyphs'])


class CatalogTests(unittest.TestCase):
    def catalog(self, extra):
        with tempfile.TemporaryDirectory() as folder:
            dist = Path(folder)
            for name in ['base_player@1.0.0.tgz', 'base-player-receiver@1.0.0.tgz', 'base-player-webtv@0.1.0.tgz']:
                (dist / name).write_bytes(name.encode())
            argv = ['make_catalog.py', '--dist', folder, '--app-version', '1.0.0', '--runtime-version', '1.0.0',
                    '--tag', 'v1.0.0'] + extra
            with patch('sys.argv', argv), patch('builtins.print'):
                catalog_tool.main()
            return {c['id']: c for c in json.loads((dist / 'catalog.json').read_text())['components']}

    def test_main_catalog_is_unchanged_without_webtv(self):
        components = self.catalog([])
        self.assertEqual(sorted(components), ['base-player-receiver', 'base_player'])
        self.assertNotIn('optional', components['base_player'])

    def test_webtv_is_an_optional_tool_the_app_does_not_require(self):
        components = self.catalog(['--webtv-version', '0.1.0'])
        webtv = components['base-player-webtv']
        self.assertEqual((webtv['kind'], webtv['version'], webtv['optional']), ('tool', '0.1.0', True))
        self.assertEqual(webtv['artifact']['name'], 'base-player-webtv@0.1.0.tgz')
        self.assertNotIn('base-player-webtv', components['base_player']['requires'])
        self.assertNotIn('base-player-webtv', json.loads((ROOT / 'mgu-repo.json').read_text())['apps']['requires'])


class WebTvPackageTests(unittest.TestCase):
    def test_component_has_no_units_and_runs_check(self):
        entries = [('bin/base-player-webtv', b'x', 0o755), ('check.sh', b'#!/bin/sh', 0o755)]
        spec_ = webtv_package.component('0.1.0', entries)
        self.assertEqual((spec_['id'], spec_['kind']), ('base-player-webtv', 'tool'))
        self.assertNotIn('units', spec_)
        self.assertNotIn('enable', spec_)
        self.assertEqual(spec_['restart'], [])
        self.assertEqual(spec_['check'], ['check.sh'])
        self.assertEqual(spec_['files'][0], {'path': 'bin/base-player-webtv', 'mode': '0755',
                                             'sha256': hashlib.sha256(b'x').hexdigest()})

    def test_launcher_lands_where_the_app_looks(self):
        self.assertEqual(webtv_build.INSTALL, '/var/opt/base-player-webtv/current')
        self.assertTrue(webtv_package.EXECUTABLE_DIRS[0] == 'bin/')

    def test_changed_bundle_file_is_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            bundle = Path(folder)
            (bundle / 'bin').mkdir()
            (bundle / 'bin/base-player-webtv').write_bytes(b'new')
            (bundle / 'build-manifest.json').write_text(json.dumps(
                {'version': '0.1.0', 'files': {'bin/base-player-webtv': {'sha256': hashlib.sha256(b'old').hexdigest()}}}))
            with self.assertRaisesRegex(SystemExit, 'webtv_input_changed'):
                webtv_package.collect(bundle)


class WebTvStringPatchTests(unittest.TestCase):
    def patched(self, data, old, new):
        with tempfile.TemporaryDirectory() as folder:
            target = Path(folder) / 'lib.so'
            target.write_bytes(data)
            count = webtv_build.patch_strings(target, old, new)
            return count, target.read_bytes()

    def test_strings_are_rewritten_in_place_and_padded(self):
        data = b'\0abc\0/usr/lib/wpe\0x\0/usr/lib/wpe/injected-bundle/\0tail'
        count, out = self.patched(data, b'/usr/lib/wpe', b'/opt/w')
        self.assertEqual(count, 2)
        self.assertEqual(len(out), len(data))
        self.assertIn(b'\0/opt/w\0', out)
        self.assertIn(b'\0/opt/w/injected-bundle/\0', out)
        self.assertTrue(out.endswith(b'\0tail'))

    def test_longer_replacement_is_refused(self):
        with self.assertRaises(RuntimeError):
            self.patched(b'\0/a\0', b'/a', b'/abc')

    def test_match_inside_another_string_is_refused(self):
        with self.assertRaises(RuntimeError):
            self.patched(b'\0x/usr/lib/wpe\0', b'/usr/lib/wpe', b'/opt')

    def test_install_paths_fit_the_original_strings(self):
        for _, old, new in webtv_build.STRING_PATCHES:
            self.assertLessEqual(len(new), len(old))


if __name__ == '__main__':
    unittest.main()
