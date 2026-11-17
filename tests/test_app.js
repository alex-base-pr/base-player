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
t.set('uk');

// 3. Line protocol.
assert.deepStrictEqual(applyLine({}, 'BP error dns'), { phase: 'error', error: 'dns' }); checks++;
assert.deepStrictEqual(applyLine({}, 'BP error network_failed'), { phase: 'error', error: 'media_failed' }); checks++;
assert.deepStrictEqual(applyLine({ phase: 'error', error: 'dns' }, 'BP state stopped'), {}); checks++;
assert.deepStrictEqual(applyLine({ phase: 'video' }, 'BP state stopped'), { phase: 'idle', mode: null }); checks++;
ok(applyLine({}, 'BP state buffering').buffering === true, 'buffering');
ok(applyLine({}, 'BP state playing').phase === 'video', 'playing');
ok(applyLine({}, 'BP tls date_tolerated').certDateTolerated === true, 'tolerated flag');
ok(applyLine({}, 'garbage') === null && applyLine({}, 'BP ready') === null, 'unknown lines ignored');

// 4. The tolerance is a setting, off by default.
const setting = appJson.settings.find(s => s.id === 'cert_date_tolerance');
ok(setting && setting.type === 'bool' && setting.default === false, 'cert_date_tolerance off by default');
assert.deepStrictEqual(settingsCommands({}), ['certdate 0']); checks++;
assert.deepStrictEqual(settingsCommands({ cert_date_tolerance: true }), ['certdate 1']); checks++;

console.log(`test_app: ${checks}/${checks} passed`);
