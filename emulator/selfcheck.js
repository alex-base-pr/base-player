'use strict';
/* Headless sanity check: run the real app view against a stub canvas that
 * counts calls, for every fixture, both languages and both page heights.
 * Asserts drawHome never throws and draws a healthy number of primitives. */

const path = require('path');
const APP = path.join(__dirname, '..', 'apps', 'base_player');

const { drawHome } = require(path.join(APP, 'view.js'));
const { t } = require(path.join(APP, 'i18n.js'));
const fixtures = require(path.join(__dirname, 'fixtures.js'));

function stubCanvas(w, h) {
    const c = { w, h, calls: 0, _targets: [] };
    ['clear', 'fillRect', 'gradientRect', 'roundRect', 'card', 'strokeRoundRect', 'line', 'circle', 'quad', 'image']
        .forEach(m => { c[m] = function () { c.calls++; return c; }; });
    c.text = function (s, x, y, size) { c.calls++; return String(s).length * (size || 10) * 0.5; };
    c.textWidth = function (s, size) { return String(s).length * (size || 10) * 0.5; };
    c.target = function (x, y, ww, hh, onClick, id) { c._targets.push({ id }); };
    return c;
}

let throws = 0;
const results = [];
const langs = ['en', 'uk'];
const heights = [520, 416];   // full page, and a short display (the view compresses itself)
const richByLang = { en: 0, uk: 0 }; // fixtures (at 520) with >20 draw calls

langs.forEach(lang => {
    t.set(lang);
    fixtures.forEach(scene => {
        heights.forEach(h => {
            const c = stubCanvas(1600, h);
            let ok = true, err = null;
            try {
                drawHome(c, scene.state || {}, scene.notice || '', null, null, () => {});
            } catch (e) { ok = false; err = e; throws++; }
            if (ok && h === 520 && c.calls > 20) richByLang[lang]++;
            results.push({ lang, h, name: scene.name, calls: c.calls, ok });
            if (!ok) console.error('THREW', lang, h, scene.name, err && err.message);
        });
    });
});
t.set('en');

const total = results.length;
const noThrow = results.filter(r => r.ok).length;
const minCalls = Math.min(...results.map(r => r.calls));
const maxCalls = Math.max(...results.map(r => r.calls));
console.log(`selfcheck: ${noThrow}/${total} renders did not throw ` +
    `(${langs.length} langs x ${fixtures.length} fixtures x ${heights.length} heights); ` +
    `draw calls per frame ${minCalls}..${maxCalls}; ` +
    `rich (>20 calls) fixtures per lang: en=${richByLang.en}, uk=${richByLang.uk}`);

let failed = false;
if (throws) { console.error('SELFCHECK FAILED:', throws, 'renders threw'); failed = true; }
if (richByLang.en < 3 || richByLang.uk < 3) {
    console.error('SELFCHECK FAILED: fewer than 3 rich fixtures in some language'); failed = true;
}
if (failed) process.exit(1);
console.log('SELFCHECK OK');
