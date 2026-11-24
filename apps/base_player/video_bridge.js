'use strict';
// mgu-render/1 message 13 and draw op 19; uses the SDK's existing GPU connection.
function message(type, payload) {
    const b = Buffer.alloc(8 + ((payload.length + 3) & ~3));
    b.writeUInt32LE(type, 0); b.writeUInt32LE(b.length - 8, 4); payload.copy(b, 8);
    return b;
}
class VideoBridge {
    constructor(display) { this.display = display; this.gpu = null; this.socket = null; this.file = ''; }
    ready() {
        const gpu = this.display && this.display.gpu;
        return !!(gpu && gpu.ready && gpu.native && gpu.info && gpu.info.video);
    }
    attach(file, generation) {
        const gpu = this.display && this.display.gpu;
        if (!this.ready()) { this.gpu = null; this.socket = null; this.file = ''; return false; }
        // PLACE can discard native video resources; HLS transitions can replace
        // the file at the same pathname. Both require defining the video again.
        const p = gpu.placement || {};
        const layout = [p.w, p.h, p.scale].join(':');
        if (gpu === this.gpu && gpu.sock === this.socket && this.file === file &&
            generation === this.generation && layout === this.layout) return true;
        const name = Buffer.from(file, 'utf8'), payload = Buffer.alloc(4 + name.length);
        payload.writeUInt32LE(1, 0); name.copy(payload, 4);
        gpu._write(message(13, payload));
        this.gpu = gpu; this.socket = gpu.sock; this.file = file;
        this.generation = generation; this.layout = layout;
        return true;
    }
    detach() {
        if (this.gpu && this.gpu.ready && this.gpu.sock === this.socket) {
            const id = Buffer.alloc(4); id.writeUInt32LE(1, 0); this.gpu._write(message(14, id));
        }
        this.gpu = null; this.socket = null; this.file = '';
    }
    draw(canvas, x, y, w, h, frame, fit) {
        // Native HLS frames are already stretched to 1920x504 without a crop.
        // OP_VIDEO contains its input: it has no documented stretch flag.
        // Keep that exact destination for every fit (including old callers),
        // so a legacy frame or a different viewport keeps all source content.
        // Never enlarge/clip the video or repurpose OP19's corner-radius word.
        if (!(w > 0 && h > 0) || !frame || !(frame.width > 0 && frame.height > 0)) return;
        canvas._grow(7); const i = canvas.n;
        canvas.u[i] = 19;
        canvas.f[i + 1] = x; canvas.f[i + 2] = y;
        canvas.f[i + 3] = w; canvas.f[i + 4] = h;
        canvas.f[i + 5] = 0; canvas.u[i + 6] = 1; canvas.n += 7;
    }
}
// Brightest of a few luma rows in the current frame (0..255), or null. A
// phone with its screen locked keeps mirroring a black picture: the page
// must not stay black and without buttons then.
function frameLuma(file) {
    const fs = require('fs');
    let fd;
    try {
        fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
        const head = Buffer.alloc(64);
        if (fs.readSync(fd, head, 0, 64, 0) !== 64 || head.readUInt32LE(0) !== 0x4656474d) return null;
        const w = head.readUInt32LE(8), h = head.readUInt32LE(12), slot = head.readUInt32LE(20), slots = head.readUInt32LE(24);
        if (w < 16 || h < 16 || w > 2048 || h > 2048 || slots < 1 || slots > 4 || slot >= slots) return null;
        const base = 64 + slot * w * h * 3 / 2, row = Buffer.alloc(w);
        let max = 0;
        for (let i = 1; i <= 7; i++) {
            const y = Math.floor(h * i / 8);
            if (fs.readSync(fd, row, 0, w, base + y * w) !== w) return null;
            for (let x = 0; x < w; x += 8) if (row[x] > max) max = row[x];
        }
        return max;
    } catch (e) { return null; }
    finally { if (fd !== undefined) try { fs.closeSync(fd); } catch (e) {} }
}
module.exports = { VideoBridge, message, frameLuma };
