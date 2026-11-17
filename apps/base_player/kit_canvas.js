'use strict';
/* Base Player — view.js draws through the small canvas contract in
 * docs/CANVAS_API.md; this maps that contract onto the MGU app kit's canvas
 * (kit/runtime/canvas.js). GPL-3.0-or-later.
 *
 * Differences it hides:
 *   - view.js works in a 720-high logical screen; the kit page is 1600x520.
 *   - text y is the top of the line here, the baseline in the kit.
 *   - the kit has no 'airplay' font and its atlases are ASCII plus a few
 *     symbols, so typographic quotes are replaced.
 *   - gradientRect takes two colours here, colour stops in the kit.
 */

const LOGICAL_H = 720;
const ASCENT = 0.82; // baseline below the top of the line, as a share of the size

function plain(str) {
    return String(str).replace(/[‘’]/g, "'").replace(/[“”«»]/g, '"');
}

/* Can the kit's fonts draw this string? (Cyrillic needs an atlas the stock kit lacks.) */
function drawable(str) { return !/[^\x20-\x7e·—…→]/.test(plain(str)); }

function wrap(cv, width, height) {
    const k = height / LOGICAL_H;
    const font = size => (size >= 34 ? 'bold' : 'label');
    const pts = list => list.map(p => [p[0] * k, p[1] * k]);
    const c = {
        w: width / k,
        h: LOGICAL_H,
        clear(color) { cv.fillRect(0, 0, width, height, color); },
        fillRect(x, y, w, h, color) { cv.fillRect(x * k, y * k, w * k, h * k, color); },
        gradientRect(x, y, w, h, from, to) { cv.gradientRect(x * k, y * k, w * k, h * k, [[0, from], [1, to]]); },
        roundRect(x, y, w, h, r, color) { cv.roundRect(x * k, y * k, w * k, h * k, r * k, color); },
        strokeRoundRect(x, y, w, h, r, line, color) { cv.strokeRoundRect(x * k, y * k, w * k, h * k, r * k, Math.max(1, line * k), color); },
        line(x1, y1, x2, y2, line, color) { cv.line(x1 * k, y1 * k, x2 * k, y2 * k, Math.max(1, line * k), color); },
        circle(cx, cy, radius, color) { cv.circle(cx * k, cy * k, radius * k, color); },
        quad(points, color) { cv.quad(pts(points), color); },
        text(str, x, y, size, color, opts) {
            const o = { font: font(size), literal: true, align: opts && opts.align };
            return cv.text(plain(str), x * k, (y + size * ASCENT) * k, size * k, color, o) / k;
        },
        textWidth(str, size) { return cv.textWidth(plain(str), size * k, { font: font(size), literal: true }) / k; },
    };
    return c;
}

module.exports = { wrap, plain, drawable };
