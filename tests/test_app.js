'use strict';
/* Offline checks tying the native error codes to the UI. `node tests/test_app.js`
 * (builds native/build/test_error with cc if needed). */

const assert = require('assert');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const APP = path.join(ROOT, 'apps', 'base_player');
const { STRINGS, t } = require(path.join(APP, 'i18n.js'));
const { drawHome } = require(path.join(APP, 'view.js'));
const { applyLine, settingsCommands, ERRORS } = require(path.join(APP, 'player_proto.js'));
const appJson = require(path.join(APP, 'app.json'));

let checks = 0;
const ok = (cond, what) => { checks++; assert.ok(cond, what); };

// 1. Every code the native side can emit has a text in every language, and the
//    text fits the three lines drawError() shows (same wrap rule as view.js).
execFileSync('make', ['-s', '-C', path.join(ROOT, 'native'), 'build/test_error']);
const names = execFileSync(path.join(ROOT, 'native', 'build', 'test_error'), ['--names']).toString().trim().split('\n');
ok(names.length >= 9, 'native names listed');
function wrap(reason) {
    const lines = []; let line = '';
    for (const w of reason.split(' ')) { if ((line + ' ' + w).length > 64) { lines.push(line); line = w; } else line = line ? line + ' ' + w : w; }
    if (line) lines.push(line);
    return lines;
}
for (const lang of Object.keys(STRINGS)) {
    for (const name of names) {
        const text = STRINGS[lang]['err_' + name];
        ok(typeof text === 'string' && text.length > 0, `${lang}: err_${name} exists`);
        ok(wrap(text).length <= 3, `${lang}: err_${name} fits 3 lines (${wrap(text).length})`);
    }
}
for (const name of names) ok(ERRORS.includes(name), `player_proto knows ${name}`);

// 2. Each code renders its own text on the error screen.
for (const lang of Object.keys(STRINGS)) {
    t.set(lang);
    for (const name of names) {
        const drawn = [];
        const c = { w: 1920, h: 720 };
        ['clear', 'fillRect', 'gradientRect', 'roundRect', 'strokeRoundRect', 'line', 'circle', 'quad', 'image'].forEach(m => { c[m] = () => {}; });
        c.text = s => drawn.push(String(s));
        drawHome(c, Object.assign({}, applyLine({}, 'BP error ' + name)), t);
        ok(drawn.join(' ').includes(wrap(STRINGS[lang]['err_' + name])[0]), `${lang}: ${name} screen shows its reason`);
    }
}
t.set('en');

// 3. Line protocol.
assert.deepStrictEqual(applyLine({}, 'BP error dns'), { phase: 'error', error: 'dns' }); checks++;
assert.deepStrictEqual(applyLine({}, 'BP error network_failed'), { phase: 'error', error: 'media_failed' }); checks++;
assert.deepStrictEqual(applyLine({ phase: 'error', error: 'dns' }, 'BP phase idle'), {}); checks++;
assert.deepStrictEqual(applyLine({ phase: 'video' }, 'BP phase idle'), { phase: 'idle', mode: null }); checks++;
ok(applyLine({}, 'BP phase buffering').buffering === true, 'buffering');
ok(applyLine({}, 'BP phase video').phase === 'video', 'playing');
ok(applyLine({}, 'BP tls date_tolerated').certDateTolerated === true, 'tolerated flag');
ok(applyLine({}, 'garbage') === null && applyLine({}, 'BP ready') === null, 'unknown lines ignored');

// 4. The tolerance is a setting, off by default.
const setting = appJson.settings.find(s => s.key === 'cert_date_tolerance');
ok(setting && setting.type === 'bool' && setting.default === false, 'cert_date_tolerance off by default');
assert.deepStrictEqual(settingsCommands({}), ['certdate off']); checks++;
assert.deepStrictEqual(settingsCommands({ cert_date_tolerance: true }), ['certdate on']); checks++;

// 5. The kit adapter: what view.js draws must arrive in the kit canvas's own terms.
const { wrap: kitWrap, drawable } = require(path.join(APP, 'kit_canvas.js'));
for (const key of Object.keys(STRINGS.en)) ok(drawable(STRINGS.en[key]), `en: ${key} uses only glyphs the kit fonts have`);
{
    const calls = [];
    const kit = {};
    ['fillRect', 'gradientRect', 'roundRect', 'strokeRoundRect', 'line', 'circle', 'quad'].forEach(m => { kit[m] = (...a) => { calls.push([m, a]); return kit; }; });
    kit.text = (str, x, y, size, color, o) => { calls.push(['text', [str, x, y, size, color, o]]); return str.length * size * 0.5; };
    kit.textWidth = (str, size) => str.length * size * 0.5;
    const c = kitWrap(kit, 1600, 520);
    ok(c.h === 720 && Math.abs(c.w - 1600 * 720 / 520) < 1e-9, 'logical size keeps the 720-high design');
    t.set('en');
    for (const scene of require(path.join(ROOT, 'emulator', 'fixtures.js'))) {
        calls.length = 0;
        drawHome(c, scene.state, t);
        const inside = calls.every(([m, a]) => m === 'quad' || m === 'line' || m === 'circle' || m === 'text' || (a[0] >= -1 && a[1] >= -1 && a[0] + a[2] <= 1601 && a[1] + a[3] <= 521));
        ok(inside, `${scene.name}: every box lands inside 1600x520`);
        const texts = calls.filter(x => x[0] === 'text').map(x => x[1]);
        ok(texts.length > 0 && texts.every(a => ['label', 'bold'].includes(a[5].font) && a[5].literal === true), `${scene.name}: text uses kit fonts, literally`);
        ok(texts.every(a => !/[\u2018\u2019\u201c\u201d]/.test(a[0])), `${scene.name}: no typographic quotes reach the kit`);
        ok(texts.every(a => a[2] > 0 && a[2] <= 520 && a[1] >= 0 && a[1] <= 1600), `${scene.name}: text anchors inside the page`);
    }
    calls.length = 0;
    c.gradientRect(0, 0, 100, 100, '#000', '#fff', true);
    assert.deepStrictEqual(calls[0][1][4], [[0, '#000'], [1, '#fff']]); checks++;
    calls.length = 0;
    c.text('x', 0, 100, 20, '#fff');
    ok(Math.abs(calls[0][1][2] - (100 + 20 * 0.82) * 520 / 720) < 1e-9, 'text y is converted from line top to baseline');
}

console.log(`test_app: ${checks}/${checks} passed`);
