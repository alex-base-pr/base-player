'use strict';
/* Canvas shim for the Base Player emulator. GPL-3.0-or-later.
 * Implements the part of the MGU app kit's canvas that view.js draws through
 * (docs/CANVAS_API.md) on top of a CanvasRenderingContext2D, with the kit's
 * conventions: text y is the baseline, gradients are colour stops top to
 * bottom. Coordinates are the kit page, 1600 wide. */

function makeCanvas(ctx, w, h) {
    var FONT = 'Ubuntu, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, system-ui, "Helvetica Neue", Arial, sans-serif';
    function fontStr(size) { return Math.round(size) + 'px ' + FONT; }
    function roundPath(x, y, ww, hh, r) {
        r = Math.max(0, Math.min(r, Math.min(ww, hh) / 2));
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + ww, y, x + ww, y + hh, r);
        ctx.arcTo(x + ww, y + hh, x, y + hh, r);
        ctx.arcTo(x, y + hh, x, y, r);
        ctx.arcTo(x, y, x + ww, y, r);
        ctx.closePath();
    }
    function stopsFill(x, y, hh, stops) {
        var g = ctx.createLinearGradient(x, y, x, y + hh);
        (stops || []).forEach(function (s) { g.addColorStop(Math.max(0, Math.min(1, s[0])), s[1]); });
        return g;
    }
    function spaced(str, spacing) { return spacing ? spacing * Math.max(0, Array.from(str).length - 1) : 0; }

    var c = {
        w: w, h: h, _targets: [],
        clear: function (color) { ctx.save(); ctx.fillStyle = color || '#000'; ctx.fillRect(0, 0, c.w, c.h); ctx.restore(); return c; },
        fillRect: function (x, y, ww, hh, color) { ctx.save(); ctx.fillStyle = color; ctx.fillRect(x, y, ww, hh); ctx.restore(); return c; },
        gradientRect: function (x, y, ww, hh, stops) { ctx.save(); ctx.fillStyle = stopsFill(x, y, hh, stops); ctx.fillRect(x, y, ww, hh); ctx.restore(); return c; },
        roundRect: function (x, y, ww, hh, r, color) { ctx.save(); roundPath(x, y, ww, hh, r); ctx.fillStyle = color; ctx.fill(); ctx.restore(); return c; },
        card: function (x, y, ww, hh, r, stops) { ctx.save(); roundPath(x, y, ww, hh, r); ctx.fillStyle = stopsFill(x, y, hh, stops); ctx.fill(); ctx.restore(); return c; },
        strokeRoundRect: function (x, y, ww, hh, r, lineWidth, color) {
            ctx.save(); roundPath(x, y, ww, hh, r); ctx.lineWidth = lineWidth; ctx.strokeStyle = color; ctx.stroke(); ctx.restore(); return c;
        },
        line: function (x1, y1, x2, y2, lineWidth, color) {
            ctx.save(); ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
            ctx.lineWidth = lineWidth; ctx.strokeStyle = color; ctx.lineCap = 'round'; ctx.stroke(); ctx.restore(); return c;
        },
        circle: function (cx, cy, radius, color) {
            ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, Math.max(0, radius), 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill(); ctx.restore(); return c;
        },
        quad: function (points, color) {
            if (!points || !points.length) return c;
            ctx.save(); ctx.beginPath(); ctx.moveTo(points[0][0], points[0][1]);
            for (var i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
            ctx.closePath(); ctx.fillStyle = color; ctx.fill(); ctx.restore(); return c;
        },
        /* The kit draws a registered RGBA image by id; here the app mark is redrawn. */
        image: function (id, x, y, ww, hh) {
            ctx.save();
            roundPath(x, y, ww, hh, ww * 0.22); ctx.fillStyle = '#0b1017'; ctx.fill();
            roundPath(x + ww * 0.16, y + hh * 0.24, ww * 0.68, hh * 0.46, ww * 0.07);
            ctx.lineWidth = Math.max(1.5, ww * 0.04); ctx.strokeStyle = '#ffffff'; ctx.stroke();
            ctx.beginPath(); ctx.moveTo(x + ww * 0.40, y + hh * 0.31); ctx.lineTo(x + ww * 0.66, y + hh * 0.47); ctx.lineTo(x + ww * 0.40, y + hh * 0.63);
            ctx.closePath(); ctx.fillStyle = '#2f9bff'; ctx.fill();
            ctx.fillStyle = '#ffffff'; ctx.fillRect(x + ww * 0.34, y + hh * 0.775, ww * 0.32, hh * 0.035);
            ctx.restore(); return c;
        },
        text: function (str, x, y, size, color, opts) {
            opts = opts || {};
            str = String(str);
            ctx.save();
            ctx.font = fontStr(size); ctx.fillStyle = color; ctx.textBaseline = 'alphabetic';
            if ('letterSpacing' in ctx) ctx.letterSpacing = (opts.spacing || 0) + 'px';
            var width = ctx.measureText(str).width;
            ctx.textAlign = opts.align === 'center' ? 'center' : opts.align === 'right' ? 'right' : 'left';
            ctx.fillText(str, x, y);
            ctx.restore();
            return width + ('letterSpacing' in ctx ? 0 : spaced(str, opts.spacing));
        },
        textWidth: function (str, size, opts) {
            ctx.save(); ctx.font = fontStr(size); var m = ctx.measureText(String(str)); ctx.restore();
            return m.width + spaced(String(str), opts && opts.spacing);
        },
        target: function (x, y, ww, hh, onClick, id, radius) { c._targets.push({ x: x, y: y, w: ww, h: hh, onClick: onClick, id: id, radius: radius }); },
    };
    return c;
}

if (typeof module !== 'undefined' && module.exports) module.exports = { makeCanvas: makeCanvas };
