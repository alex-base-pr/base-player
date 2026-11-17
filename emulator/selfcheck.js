'use strict';
/* Headless sanity check: evaluate the real app modules against a stub canvas
 * that records call counts, for several fixtures and both languages. Asserts
 * drawHome never throws and makes a healthy number of draw calls. */

const path = require('path');
const APP = path.join(__dirname, '..', 'apps', 'base_player');

const { drawHome } = require(path.join(APP, 'view.js'));
const { t } = require(path.join(APP, 'i18n.js'));
const fixtures = require(path.join(__dirname, 'fixtures.js'));

function stubCanvas(w, h) {
    const c = { w, h, calls: 0, _targets: [] };
    const methods = ['clear', 'fillRect', 'gradientRect', 'roundRect', 'strokeRoundRect',
        'line', 'circle', 'quad', 'image', 'text'];
    methods.forEach(m => { c[m] = function () { c.calls++; }; });
    c.textWidth = function (s, size) { return String(s).length * (size || 10) * 0.5; };
    c.target = function (x, y, ww, hh, onClick, id, radius) { c._targets.push({ id }); };
    return c;
}

let throws = 0;
const results = [];
const langs = ['uk', 'en'];
const heights = [720, 520];
const richByLang = { uk: 0, en: 0 }; // fixtures (at 720) with >20 draw calls

langs.forEach(lang => {
    t.set(lang);
    fixtures.forEach(scene => {
        heights.forEach(h => {
            const c = stubCanvas(1920, h);
            let ok = true, err = null;
            try {
                drawHome(c, scene.state || {}, t);
            } catch (e) { ok = false; err = e; throws++; }
            if (ok && h === 720 && c.calls > 20) richByLang[lang]++;
            results.push({ lang, h, name: scene.name, calls: c.calls, ok });
            if (!ok) console.error('THREW', lang, h, scene.name, err && err.message);
        });
    });
});

const total = results.length;
const noThrow = results.filter(r => r.ok).length;
const minCalls = Math.min(...results.map(r => r.calls));
const maxCalls = Math.max(...results.map(r => r.calls));
console.log(`selfcheck: ${noThrow}/${total} renders did not throw ` +
    `(${langs.length} langs x ${fixtures.length} fixtures x ${heights.length} heights); ` +
    `draw calls per frame ${minCalls}..${maxCalls}; ` +
    `rich (>20 calls) fixtures per lang: uk=${richByLang.uk}, en=${richByLang.en}`);

// Requirement: nothing throws, and at least 3 fixtures in BOTH languages exceed 20 draw calls.
let failed = false;
if (throws) { console.error('SELFCHECK FAILED:', throws, 'renders threw'); failed = true; }
if (richByLang.uk < 3 || richByLang.en < 3) {
    console.error('SELFCHECK FAILED: fewer than 3 rich fixtures in some language'); failed = true;
}
if (failed) process.exit(1);
console.log('SELFCHECK OK');
