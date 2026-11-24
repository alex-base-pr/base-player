'use strict';
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
const { frameLuma } = require('../apps/base_player/video_bridge');
// An MGVF file as mguvideosink writes it: 64-byte header, then I420 slots.
function frame(file, w, h, slot, slots, luma) {
    const b = Buffer.alloc(64 + slots * w * h * 3 / 2);
    b.writeUInt32LE(0x4656474d, 0); b.writeUInt32LE(1, 4); b.writeUInt32LE(w, 8); b.writeUInt32LE(h, 12);
    b.writeUInt32LE(7, 16); b.writeUInt32LE(slot, 20); b.writeUInt32LE(slots, 24);
    b.fill(16, 64, b.length);
    const base = 64 + slot * w * h * 3 / 2;
    b.fill(luma, base + (h / 2) * w, base + (h / 2) * w + w);
    fs.writeFileSync(file, b);
}
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-luma-')), file = path.join(dir, 'f');
frame(file, 64, 32, 1, 2, 16); assert.strictEqual(frameLuma(file), 16, 'black frame');
frame(file, 64, 32, 1, 2, 200); assert.strictEqual(frameLuma(file), 200, 'the current slot is read');
frame(file, 64, 32, 0, 2, 200); assert.strictEqual(frameLuma(file), 200);
fs.writeFileSync(file, 'nonsense'); assert.strictEqual(frameLuma(file), null, 'no frame, no answer');
assert.strictEqual(frameLuma(path.join(dir, 'missing')), null);
console.log('Frame brightness from MGVF files passed');
