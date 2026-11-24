'use strict';
// Draws every emulator scene with the MGU app kit's own Recorder, from the
// built app package: the emulator canvas is more lenient than the kit, and a
// throw on the car leaves the page empty.
// usage: node check_kit_render.js <unpacked package javascript dir> <fixtures.js>
const Module = require('module'), path = require('path');
const app = path.resolve(process.argv[2]), kit = path.join(app, 'kit');
const fixtures = require(path.resolve(process.argv[3]));
const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent) {
    if (request.indexOf('./kit/') === 0) request = path.join(kit, request.slice(6));
    return resolve.apply(this, [request].concat(Array.prototype.slice.call(arguments, 1)));
};
const record = require(path.join(kit, 'record.js'));
require(path.join(app, 'brand_logo')).register(record.setImage);
const { drawHome } = require(path.join(app, 'view.js')), { t } = require(path.join(app, 'i18n.js'));
let failures = 0, scenes = 0;
for (const lang of ['en', 'uk']) {
    t.set(lang);
    for (const height of [520, 416]) for (const scene of fixtures) {
        scenes++;
        const c = new record.Recorder(1600, height);
        try { drawHome(c, scene.state || {}, scene.notice || '', null, null, () => {}, () => {}); }
        catch (e) { failures++; console.error('kit render failed:', lang, height, scene.name, e.stack); }
    }
}
if (failures) { console.error(failures + ' of ' + scenes + ' scenes failed'); process.exit(1); }
console.log('kit render: ' + scenes + ' scenes drawn with the kit recorder');
