'use strict';
// Base Player additions on top of the imported receiver: the cause of a
// failed video reaches the screen, and the certificate-date setting reaches
// the native processes. GPL-3.0-or-later.
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
const { t, STRINGS, MEDIA_ERRORS, mediaError } = require('../apps/base_player/i18n');
const settings = require('../apps/base_player/app_settings');
const { drawHome } = require('../apps/base_player/view');

// Error codes: every native name has a text, unknown ones degrade safely.
const header = fs.readFileSync(path.join(__dirname, '../native/bp_error.c'), 'utf8');
const names = /NAMES\[BP_ERR_COUNT\] = \{([^}]*)\}/.exec(header)[1].match(/"[a-z_]+"/g).map(s => s.slice(1, -1));
assert.deepStrictEqual(names.slice().sort(), MEDIA_ERRORS.slice().sort(), 'i18n.js lists exactly the native error names');
for (const name of names) assert(STRINGS.en['err_' + name], 'English text for ' + name);
assert.strictEqual(mediaError('dns'), 'dns');
assert.strictEqual(mediaError('player_certificate'), 'certificate');
assert.strictEqual(mediaError('player_network_failed'), 'media_failed', 'the old catch-all code is no longer a cause');
assert.strictEqual(mediaError(undefined), 'media_failed');

// The baked atlas: every interface string in both languages can be drawn,
// and so can what a phone sends as a track or film title in Ukrainian.
const atlas = JSON.parse(fs.readFileSync(path.join(__dirname, '../assets/fonts/airplay.json'), 'utf8'));
const drawable = text => atlas.sizes.every(size => Array.from(text).every(ch => size.glyphs[ch.codePointAt(0)]));
for (const lang of Object.keys(STRINGS)) for (const key of Object.keys(STRINGS[lang]))
    assert(drawable(STRINGS[lang][key]), 'glyph outside the atlas in ' + lang + ':' + key);
for (const sample of ['\u0407\u0436\u0430\u043a \u0491\u0430\u043d\u043e\u043a \u0404\u0432\u0430 \u0406\u0440\u0430', '\u0401\u0436\u0438\u043a \u2116 2 \u00ab\u0421\u0435\u0437\u043e\u043d\u00bb \u2019', 'Bj\u00f6rk Caf\u00e9 \u0141\u00f3d\u017a', '\u201eGru\u00df\u201c \u2026'])
    assert(drawable(sample), 'atlas cannot draw ' + sample);
assert(atlas.cacheKey && atlas.cacheKey !== 'de-1', 'a new glyph set needs a new cache key');

// The home screen shows the cause for each code, and nothing of the old brand.
function labels(state, notice) {
    const out = [];
    const c = { h: 520 };
    ['clear', 'gradientRect', 'fillRect', 'card', 'roundRect', 'strokeRoundRect', 'line', 'circle', 'quad', 'image', 'arc'].forEach(m => { c[m] = () => {}; });
    c.text = s => { out.push(String(s)); return 0; };
    drawHome(c, state, notice || '', null, null, null);
    return out;
}
for (const name of names) {
    const shown = labels({ phase: 'waiting', mode: 'waiting', pin: '1234', error: name });
    assert(shown.join(' ').includes(t('err_' + name)), name + ' is shown with its own text');
}
assert(labels({ phase: 'waiting', error: 'something_new' }).every(s => !/undefined|err_/.test(s)), 'an unknown code shows no raw key');
assert(labels({ phase: 'idle' }).every(s => !/pllana/i.test(s)));
assert(labels({ phase: 'idle' }).some(s => s.toUpperCase() === 'BASE PLAYER'), 'the app name is in the header');

// Settings is reachable: drawn in the header with a touch target when the
// frontend passes the action, and listed before Close so the HMI's own
// five-button bar shows it too.
{
    const drawn = [], targets = [];
    const c = { h: 520, target: (x, y, w, h, fn, id) => targets.push({ id, fn }) };
    ['clear', 'gradientRect', 'fillRect', 'card', 'roundRect', 'strokeRoundRect', 'line', 'circle', 'quad', 'image', 'arc'].forEach(m => { c[m] = () => {}; });
    c.text = s => { drawn.push(String(s)); return 0; };
    let opened = 0;
    drawHome(c, { phase: 'idle' }, '', null, null, null, () => opened++);
    const target = targets.find(x => x.id === 'settings');
    assert(target, 'Settings has a touch target'); target.fn(); assert.strictEqual(opened, 1);
    const connect = targets.find(x => x.id === 'connect');
    assert(connect, 'Connect is a control on the page when not connected');
    const buttons = require('../apps/base_player/app.json').screens[0].buttons.map(b => b[0]);
    assert(buttons.indexOf('BTN_SETTINGS') >= 0 && buttons.indexOf('BTN_SETTINGS') < 5, 'BTN_SETTINGS within the first five');
}

// The setting file: off unless it clearly says on.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'base-player-settings-'));
try {
    assert.strictEqual(settings.certDateTolerance(dir), false, 'no file means off');
    assert(settings.save(dir, { certDateTolerance: true }));
    assert.strictEqual(settings.certDateTolerance(dir), true);
    assert.strictEqual(fs.statSync(path.join(dir, settings.NAME)).mode & 0o077, 0, 'private file');
    assert(settings.save(dir, { certDateTolerance: 'yes' }));
    assert.strictEqual(settings.certDateTolerance(dir), false, 'only a real true turns it on');
    fs.writeFileSync(path.join(dir, settings.NAME), '{broken');
    assert.strictEqual(settings.certDateTolerance(dir), false, 'a damaged file means off');
} finally { fs.rmSync(dir, { recursive: true, force: true }); }

// The receiver and the player hand the setting to the native side.
for (const file of ['receiver.js', 'media_player.js'])
    assert(/BP_CERT_DATE_TOLERANCE: certDateTolerance\(this\.dataDir\) \? '1' : '0'/.test(fs.readFileSync(path.join(__dirname, '../apps/base_player', file), 'utf8')), file);
assert(/g_getenv\("BP_CERT_DATE_TOLERANCE"\)/.test(fs.readFileSync(path.join(__dirname, 'native/mgu_hls_output.h'), 'utf8')));
// A tolerated date is said once, as a diagnostic (the log), by both paths.
for (const file of ['receiver.js', 'media_player.js'])
    assert(/line === 'MGU_TLS_DATE_TOLERATED'\) this\.emit\('diagnostic', 'tls_date_tolerated'\)/.test(fs.readFileSync(path.join(__dirname, '../apps/base_player', file), 'utf8')), file);
assert(/MGU_TLS_DATE_TOLERATED/.test(fs.readFileSync(path.join(__dirname, 'native/mgu_hls_output.h'), 'utf8')));
console.log('Base Player error causes, strings and certificate-date setting passed');
