'use strict';
/* Canvas shim for the MGU emulator. Implements the exact `c.*` surface the app
 * draws through (see docs/CANVAS_API.md) on top of a CanvasRenderingContext2D.
 * All coordinates are in the 1920x720 logical space; the harness sets a
 * setTransform scale so drawing maps straight into the scaled backing canvas. */

function makeCanvas(ctx, w, h) {
    var FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, system-ui, "Helvetica Neue", Arial, sans-serif';

    function fontStr(size) { return Math.round(size) + 'px ' + FONT; }

    var c = {
        w: w,
        h: h,
        _targets: [],

        clear: function (color) {
            ctx.save();
            ctx.fillStyle = color || '#000';
            ctx.fillRect(0, 0, c.w, c.h);
            ctx.restore();
        },

        fillRect: function (x, y, ww, hh, color) {
            ctx.save();
            ctx.fillStyle = color;
            ctx.fillRect(x, y, ww, hh);
            ctx.restore();
        },

        gradientRect: function (x, y, ww, hh, from, to, vertical) {
            ctx.save();
            var g = vertical
                ? ctx.createLinearGradient(x, y, x, y + hh)
                : ctx.createLinearGradient(x, y, x + ww, y);
            g.addColorStop(0, from);
            g.addColorStop(1, to);
            ctx.fillStyle = g;
            ctx.fillRect(x, y, ww, hh);
            ctx.restore();
        },

        _roundPath: function (x, y, ww, hh, r) {
            r = Math.max(0, Math.min(r, Math.min(ww, hh) / 2));
            ctx.beginPath();
            ctx.moveTo(x + r, y);
            ctx.arcTo(x + ww, y, x + ww, y + hh, r);
            ctx.arcTo(x + ww, y + hh, x, y + hh, r);
            ctx.arcTo(x, y + hh, x, y, r);
            ctx.arcTo(x, y, x + ww, y, r);
            ctx.closePath();
        },

        roundRect: function (x, y, ww, hh, r, color) {
            ctx.save();
            c._roundPath(x, y, ww, hh, r);
            ctx.fillStyle = color;
            ctx.fill();
            ctx.restore();
        },

        strokeRoundRect: function (x, y, ww, hh, r, lineWidth, color) {
            ctx.save();
            c._roundPath(x, y, ww, hh, r);
            ctx.lineWidth = lineWidth;
            ctx.strokeStyle = color;
            ctx.stroke();
            ctx.restore();
        },

        line: function (x1, y1, x2, y2, lineWidth, color) {
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.lineWidth = lineWidth;
            ctx.strokeStyle = color;
            ctx.lineCap = 'round';
            ctx.stroke();
            ctx.restore();
        },

        circle: function (cx, cy, radius, color) {
            ctx.save();
            ctx.beginPath();
            ctx.arc(cx, cy, Math.max(0, radius), 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.fill();
            ctx.restore();
        },

        quad: function (points, color) {
            if (!points || !points.length) return;
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(points[0][0], points[0][1]);
            for (var i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
            ctx.closePath();
            ctx.fillStyle = color;
            ctx.fill();
            ctx.restore();
        },

        image: function (img, x, y, ww, hh) {
            if (!img) return;
            ctx.save();
            try { ctx.drawImage(img, x, y, ww, hh); } catch (e) { /* ignore */ }
            ctx.restore();
        },

        text: function (str, x, y, size, color, opts) {
            opts = opts || {};
            ctx.save();
            ctx.font = fontStr(size);
            ctx.fillStyle = color;
            ctx.textBaseline = 'top';
            ctx.textAlign = opts.align === 'center' ? 'center' : opts.align === 'right' ? 'right' : 'left';
            ctx.fillText(String(str), x, y);
            ctx.restore();
        },

        textWidth: function (str, size, opts) {
            ctx.save();
            ctx.font = fontStr(size);
            var m = ctx.measureText(String(str));
            ctx.restore();
            return m.width;
        },

        target: function (x, y, ww, hh, onClick, id, radius) {
            c._targets.push({ x: x, y: y, w: ww, h: hh, onClick: onClick, id: id, radius: radius });
        },
    };

    return c;
}

if (typeof module !== 'undefined' && module.exports) module.exports = { makeCanvas: makeCanvas };
