'use strict';
/* Base Player — the app's page, drawn in the grammar of BMW iDrive 7.
 * GPL-3.0-or-later; derived from apps/pllana_airplay/view.js of
 * pllanaio/bmw-airplay (Copyright (C) 2026 Leon Pllana IT-Solutions), redrawn
 * for Base Player (see NOTICE.md and docs/UX_REVIEW.md).
 *
 * <!-- THESIS: one state per screen, as iDrive shows one task: Ready, Pair,
 *      Connected, Music. The state is the content; no hero, no mode cards.
 *      OWN-WORLD: the M Tricolour theme of the MGU app kit's gauges
 *      (idrive7-apps kit/runtime/themes.js, gauges.js): near-black ground,
 *      square panels as a faint grey overlay, each topped by the M stripe
 *      (light blue, dark blue, red with an angled end) and a thin white
 *      line; bold uppercase labels with letter spacing; the selected or
 *      primary element marked in M red with a red bar under it. Amber only
 *      for problems.
 *      STORY: the driver sees what is happening and the one thing to do next;
 *      when video fails, the reason and the fix are the largest text.
 *      FIRST VIEWPORT: title and steps on the left, the primary panel
 *      (Connect, or the code) on the right; music: cover, title, transport.
 *      FORM: pinned by the brief (look of the kit's M apps), no concept roll. -->
 *
 * drawHome(c, state, notice, logo, artwork, onControl, onButton)
 *   c         kit canvas (docs: apps/base_player/kit/canvas.js), page 1600 x H
 *   onControl music action ('previous', 'playPause', 'next', 'shuffle', 'repeat')
 *   onButton  presses a bar button by id ('BTN_START', 'BTN_SETTINGS'); optional
 */
const { ID: LOGO } = require('./brand_logo');
const { t, MEDIA_ERRORS } = require('./i18n');

const W = 1600, H = 520, X0 = 40, X1 = 1560;
// The kit's M Tricolour theme (themes.js), plus amber for problems.
const C = {
    bg: '#04060a', panel: '#b4bccc12', line: '#ffffffe6', bar: '#ffffff12', barLine: '#ffffff2e', hair: '#ffffff1a',
    track: '#1b212b', tick: '#4c5666',
    ink: '#f4f7fb', sub: '#b9c2ce', dim: '#8a95a6', off: '#4c5666',
    mLight: '#81c4ff', mDark: '#16588e', mRed: '#e7222e', sel: '#ef2b2d', selTint: '#ef2b2d38', selFade: '#ef2b2d00',
    amber: '#ffb020', amberText: '#ffd083',
};
const STROKE = 3;

/* ---------- text ---------- */
function text(c, str, x, y, size, color, opts) {
    return c.text(String(str), x, y, size, color, Object.assign({ font: 'airplay', literal: true }, opts));
}
function shorten(value, count) {
    const chars = Array.from(value || '');
    return chars.length > count ? chars.slice(0, Math.max(1, count - 1)).join('') + '…' : chars.join('');
}
function width(c, str, size, font) {
    return c.textWidth ? c.textWidth(str, size, { font: font || 'airplay', literal: true }) : Array.from(str).length * size * 0.5;
}
function fit(c, value, size, max) {
    let count = Array.from(value || '').length, result = shorten(value, count);
    while (count > 1 && width(c, result, size) > max) result = shorten(value, --count);
    return result;
}
function wrap(c, value, size, max, lines) {
    const out = []; let line = '';
    for (const word of String(value || '').split(/\s+/).filter(Boolean)) {
        const next = line ? line + ' ' + word : word;
        if (line && width(c, next, size) > max) { out.push(line); line = word; } else line = next;
    }
    if (line) out.push(line);
    if (out.length > lines) { out.length = lines; out[lines - 1] = fit(c, out[lines - 1] + '…', size, max); }
    return out;
}

/* ---------- line icons, one stroke, drawn around a centre ---------- */
const icon = {
    airplay(c, x, y, s, col) {
        // a screen open at the bottom, where the triangle enters it
        const l = x - s / 2, r = x + s / 2, top = y - s * 0.42, bot = y + s * 0.20, gap = s * 0.20, w = Math.max(2, Math.min(STROKE, s * 0.06));
        c.line(l, top, r, top, w, col); c.line(l, top, l, bot, w, col); c.line(r, top, r, bot, w, col);
        c.line(l, bot, x - gap, bot, w, col); c.line(x + gap, bot, r, bot, w, col);
        c.quad([[x, y + s * 0.02], [x + s * 0.24, y + s * 0.42], [x - s * 0.24, y + s * 0.42]], col);
    },
    note(c, x, y, s, col) {
        const w = Math.max(STROKE, s * 0.07);
        c.line(x - s * 0.18, y - s * 0.30, x - s * 0.18, y + s * 0.26, w, col);
        c.line(x + s * 0.28, y - s * 0.40, x + s * 0.28, y + s * 0.16, w, col);
        c.line(x - s * 0.18, y - s * 0.30, x + s * 0.28, y - s * 0.40, w, col);
        c.circle(x - s * 0.29, y + s * 0.27, s * 0.12, col);
        c.circle(x + s * 0.17, y + s * 0.17, s * 0.12, col);
    },
    phone(c, x, y, s, col) {
        c.strokeRoundRect(x - s * 0.27, y - s * 0.46, s * 0.54, s * 0.92, s * 0.09, STROKE, col);
        c.line(x - s * 0.08, y + s * 0.34, x + s * 0.08, y + s * 0.34, STROKE, col);
    },
    play(c, x, y, s, col) { c.quad([[x - s * 0.28, y - s * 0.38], [x + s * 0.40, y], [x - s * 0.28, y + s * 0.38]], col); },
    pause(c, x, y, s, col) {
        c.roundRect(x - s * 0.30, y - s * 0.36, s * 0.20, s * 0.72, s * 0.04, col);
        c.roundRect(x + s * 0.10, y - s * 0.36, s * 0.20, s * 0.72, s * 0.04, col);
    },
    skip(c, x, y, s, col, back) {
        const d = back ? -1 : 1;
        c.quad([[x - d * s * 0.32, y - s * 0.32], [x + d * s * 0.18, y], [x - d * s * 0.32, y + s * 0.32]], col);
        c.roundRect(back ? x - s * 0.30 : x + s * 0.20, y - s * 0.32, s * 0.10, s * 0.64, s * 0.03, col);
    },
    shuffle(c, x, y, s, col) {
        const a = s * 0.42, b = s * 0.24;
        c.line(x - a, y + b, x + a * 0.6, y - b, STROKE, col);
        c.line(x - a, y - b, x - s * 0.06, y - s * 0.02, STROKE, col);
        c.line(x + s * 0.06, y + s * 0.08, x + a * 0.6, y + b, STROKE, col);
        c.quad([[x + a, y - b], [x + a * 0.55, y - b - s * 0.13], [x + a * 0.55, y - b + s * 0.13]], col);
        c.quad([[x + a, y + b], [x + a * 0.55, y + b - s * 0.13], [x + a * 0.55, y + b + s * 0.13]], col);
    },
    repeat(c, x, y, s, col, one) {
        c.strokeRoundRect(x - s * 0.42, y - s * 0.26, s * 0.84, s * 0.52, s * 0.16, STROKE, col);
        c.fillRect(x - s * 0.06, y - s * 0.30, s * 0.16, s * 0.09, C.bg);
        c.quad([[x + s * 0.12, y - s * 0.26], [x - s * 0.04, y - s * 0.38], [x - s * 0.04, y - s * 0.14]], col);
        if (one) text(c, '1', x, y + s * 0.13, s * 0.36, col, { align: 'center' });
    },
    gear(c, x, y, s, col) {
        const r = s / 2;
        if (c.arc) c.arc(x, y, r * 0.34, r * 0.62, 0, 360, col);
        else { c.circle(x, y, r * 0.62, col); c.circle(x, y, r * 0.34, C.bg); }
        for (let i = 0; i < 8; i++) {
            const a = i * Math.PI / 4, ca = Math.cos(a), sa = Math.sin(a), w = r * 0.16;
            const p = (d, o) => [x + ca * d - sa * o, y + sa * d + ca * o];
            c.quad([p(r * 0.55, -w), p(r * 0.98, -w * 0.8), p(r * 0.98, w * 0.8), p(r * 0.55, w)], col);
        }
    },
    alert(c, x, y, s, col) {
        c.quad([[x, y - s * 0.46], [x + s * 0.5, y + s * 0.40], [x - s * 0.5, y + s * 0.40]], col);
        c.roundRect(x - s * 0.05, y - s * 0.18, s * 0.10, s * 0.32, s * 0.04, C.bg);
        c.circle(x, y + s * 0.26, s * 0.06, C.bg);
    },
};

/* ---------- building blocks (after gauges.js) ---------- */
function label(c, str, x, y, size, color, opts) {
    return text(c, String(str).toUpperCase(), x, y, size, color || C.dim, Object.assign({ font: 'bold', spacing: 2 }, opts));
}
function stripe(c, x, y, w) {
    // the M stripe: light blue, dark blue, red with an angled end, then a thin white line
    const BW = 78, gap = 3, sw = (BW - gap * 2) / 3;
    [C.mLight, C.mDark, C.mRed].forEach((col, i) => {
        const sx = x + i * (sw + gap);
        if (i === 2) c.quad([[sx, y], [sx + sw, y], [sx + sw - 8, y + 5], [sx, y + 5]], col);
        else c.fillRect(sx, y, sw, 5, col);
    });
    c.fillRect(x + BW + 2, y + 2, w - BW - 2, 1.5, C.line);
}
function tile(c, x, y, w, h, title) {
    c.fillRect(x, y, w, h, C.panel);
    stripe(c, x, y, w);
    if (title) text(c, title, x + 18, y + 44, 26, C.ink, { font: 'bold' });
}
function selected(c, x, y, w, h) {
    // as the kit marks the focused bar button: a red rise and a red bar at the foot
    c.gradientRect(x, y, w, h, [[0, C.selFade], [1, C.selTint]]);
    c.fillRect(x, y + h - 4, w, 4, C.sel);
}
function stepRows(c, rows, top) {
    // numbered rows: the order is the instruction, so the numbers carry information
    rows.forEach((row, i) => {
        const y = top + i * 76;
        text(c, String(i + 1), X0 + 14, y + 50, 32, C.mLight, { font: 'bold', align: 'center' });
        text(c, fit(c, row, 28, 840), X0 + 52, y + 48, 28, C.ink);
        c.fillRect(X0, y + 76, 920, 1, C.hair);
    });
}
function listRows(c, rows, top) {
    rows.forEach((row, i) => {
        const y = top + i * 76;
        row[0](c, X0 + 26, y + 38, 36, C.mLight);
        text(c, fit(c, row[1], 28, 1400), X0 + 76, y + 48, 28, C.ink);
        c.fillRect(X0, y + 76, X1 - X0, 1, C.hair);
    });
}
function problem(c, title, cause, tip) {
    // the reason a thing failed is the most important text on the page
    tile(c, X0, 214, 920, 246);
    icon.alert(c, X0 + 40, 262, 38, C.amber);
    text(c, fit(c, title, 30, 800), X0 + 82, 272, 30, C.ink, { font: 'bold' });
    wrap(c, cause, 26, 860, tip ? 3 : 4).forEach((line, i) => text(c, line, X0 + 22, 328 + i * 36, 26, C.sub));
    if (tip) text(c, fit(c, tip, 22, 870), X0 + 22, 438, 22, C.amberText);
}

/* ---------- header ---------- */
function header(c, state, status, statusColor, logo, onButton) {
    c.fillRect(0, 0, W, 64, C.bar);
    c.fillRect(0, 63, W, 1, C.barLine);
    if (logo) logo.draw(c, X0, 14, 36, 36);
    else c.image(LOGO, X0, 14, 36, 36);
    label(c, t('app_title'), X0 + 52, 41, 22, C.ink);
    let right = X1;
    if (onButton) {
        icon.gear(c, X1 - 20, 32, 32, C.dim);
        if (c.target) c.target(X1 - 50, 6, 58, 52, () => onButton('BTN_SETTINGS'), 'settings', 8);
        right = X1 - 70;
    }
    // a status pill as the kit draws them, in normal case
    const w = width(c, status, 20) + 46;
    c.roundRect(right - w, 14, w, 36, 10, statusColor + '2e');
    c.circle(right - w + 18, 32, 5, statusColor);
    text(c, status, right - 14, 39, 20, C.ink, { align: 'right' });
}

/* ---------- screens ---------- */
function drawReady(c, state, busy, onButton, failure) {
    text(c, t('ready_title'), X0, 140, 40, C.ink, { font: 'bold' });
    text(c, t('hero_sub'), X0, 182, 24, C.dim);
    if (failure) problem(c, failure.title, failure.cause, failure.tip);
    else stepRows(c, [t('step_carplay'), t('step_wifi'), t('step_connect')], 214);
    tile(c, 1000, 96, 560, 364);
    if (busy) {
        icon.airplay(c, 1280, 236, 96, C.off);
        label(c, t('preparing'), 1280, 352, 22, C.dim, { align: 'center' });
        return;
    }
    selected(c, 1000, 102, 560, 358);
    icon.airplay(c, 1280, 228, 104, C.ink);
    label(c, t('btn_start'), 1280, 346, 40, C.ink, { align: 'center', spacing: 4 });
    text(c, t('connect_sub'), 1280, 390, 24, C.sub, { align: 'center' });
    if (onButton && c.target) c.target(1000, 96, 560, 364, () => onButton('BTN_START'), 'connect', 0);
}
function drawPairing(c, state, failure) {
    text(c, t('pair_title'), X0, 140, 40, C.ink, { font: 'bold' });
    text(c, state.directVideo === false ? t('no_uplink') : t('same_wifi'), X0, 182, 24, C.dim);
    if (failure) problem(c, failure.title, failure.cause, failure.tip);
    else stepRows(c, [t('step_mirror'), t('step_choose'), t('step_code')], 214);
    tile(c, 1000, 96, 560, 364);
    label(c, t('code'), 1018, 140, 22);
    const code = String(state.pin), n = code.length, gap = 14;
    const cell = Math.min(110, (480 - (n - 1) * gap) / n), left = 1280 - (n * cell + (n - 1) * gap) / 2;
    for (let i = 0; i < n; i++) {
        const x = left + i * (cell + gap);
        c.fillRect(x, 176, cell, 156, C.track);
        c.fillRect(x, 328, cell, 4, i === n - 1 ? C.mRed : i === 0 ? C.mLight : C.mDark);
        text(c, code[i], x + cell / 2, 292, Math.min(96, cell * 0.95), C.ink, { align: 'center', font: 'light' });
    }
    text(c, fit(c, t('android_hint'), 22, 500), 1018, 412, 22, C.dim);
}
function drawConnected(c, state, android, failure) {
    const loading = state.phase === 'loading';
    text(c, android ? t('conn_android') : t('conn_iphone'), X0, 140, 40, C.ink, { font: 'bold' });
    const media = state.mode === 'hls' ? (loading ? t('media_loading') : t('media_playing')) : state.mode === 'mirror' && state.frame ? t('media_mirror') : t('media_waiting');
    label(c, media, X0, 182, 20, C.mLight);
    if (failure) { problem(c, failure.title, failure.cause, failure.tip); return; }
    listRows(c, android
        ? [[icon.phone, t('from_android')], [icon.note, t('control_on_phone')]]
        : [[icon.note, t('row_music')], [icon.airplay, t('row_video')], [icon.phone, t('row_mirror')]], 214);
}

function transport(c, x, y, size, draw, enabled, primary, key, action, onControl) {
    const h = size, w = size * 1.25, l = x - w / 2, top = y - h / 2;
    c.fillRect(l, top, w, h, C.panel);
    if (primary && enabled) selected(c, l, top, w, h);
    draw(c, x, y - 2, size * 0.42, enabled ? C.ink : C.off);
    if (enabled && onControl && c.target) c.target(l, top, w, h, () => onControl(action), key, 0);
}
function toggle(c, x, labelText, draw, enabled, active, key, action, onControl) {
    const y = 356, w = 176, h = 72;
    c.fillRect(x, y, w, h, C.panel);
    if (active && enabled) selected(c, x, y, w, h);
    const col = !enabled ? C.off : active ? C.ink : C.dim;
    draw(c, x + 34, y + h / 2 - 2, 30, col);
    text(c, fit(c, labelText, 22, w - 60), x + 60, y + 43, 22, enabled ? (active ? C.ink : C.dim) : C.off, { font: 'bold' });
    if (enabled && onControl && c.target) c.target(x, y, w, h, () => onControl(action), key, 0);
}
function drawMusic(c, state, artwork, onControl) {
    const music = state.music || {}, controls = music.controls || {}, android = state.sender === 'android';
    tile(c, X0, 96, 344, 352);
    if (!artwork || !artwork.draw(c, X0 + 2, 104, 340, 340)) icon.note(c, X0 + 172, 278, 150, C.tick);
    const x = 420, max = X1 - x;
    text(c, fit(c, music.title || t('music_default_title'), 44, max), x, 152, 44, C.ink);
    text(c, fit(c, music.artist || (state.connected ? t('music_pick_on_phone') : state.pin ? t('music_choose_audio') : t('press_connect')), 28, max), x, 198, 28, C.sub);
    const album = music.album || (state.connected ? t('audio_connected') : state.pin && !music.title ? t('app_title') + ' · ' + t('code') + ' ' + state.pin : '');
    if (album) text(c, fit(c, album, 24, max), x, 238, 24, C.dim);
    icon.airplay(c, x + 12, 282, 24, C.mLight);
    label(c, android ? t('source_android') : t('source_iphone'), x + 36, 290, 18, C.mLight);

    const playing = music.playbackState === 'playing';
    transport(c, x + 55, 392, 88, (cc, px, py, s, col) => icon.skip(cc, px, py, s, col, true), !!controls.previous, false, 'music-previous', 'previous', onControl);
    transport(c, x + 191, 392, 88, playing ? icon.pause : icon.play, !!controls.playPause, true, 'music-playPause', 'playPause', onControl);
    transport(c, x + 327, 392, 88, (cc, px, py, s, col) => icon.skip(cc, px, py, s, col, false), !!controls.next, false, 'music-next', 'next', onControl);
    toggle(c, 1194, t('shuffle'), icon.shuffle, !!controls.shuffle, music.shuffle === 1, 'music-shuffle', 'shuffle', onControl);
    const repeatLabel = music.repeat === 1 ? t('repeat_one') : music.repeat === 2 ? t('repeat_all') : t('repeat');
    toggle(c, 1384, repeatLabel, (cc, px, py, s, col) => icon.repeat(cc, px, py, s, col, music.repeat === 1), !!controls.repeat, music.repeat > 0, 'music-repeat', 'repeat', onControl);
    if (!Object.keys(controls).some(k => controls[k])) text(c, t('start_on_iphone'), x, 470, 22, C.dim);
}

/* ---------- page ---------- */
function drawHome(c, state, notice, logo, artwork, onControl, onButton) {
    const original = c, sy = Math.min(1, (c.h || H) / H);
    if (sy < 1) {
        // A short display has a smaller body above the controls: compress
        // the layout rather than clipping its rows.
        const sized = (name, transform) => (...args) => original[name].apply(original, transform(args));
        const box = args => { args[1] *= sy; args[3] *= sy; return args; };
        c = {
            clear: color => original.clear(color),
            gradientRect: sized('gradientRect', box), fillRect: sized('fillRect', box),
            card: sized('card', args => { box(args); args[4] *= sy; return args; }),
            roundRect: sized('roundRect', args => { box(args); args[4] *= sy; return args; }),
            strokeRoundRect: sized('strokeRoundRect', args => { box(args); args[4] *= sy; return args; }),
            line: sized('line', args => { args[1] *= sy; args[3] *= sy; return args; }),
            circle: sized('circle', args => { args[1] *= sy; args[2] *= sy; return args; }),
            quad: (points, color) => original.quad(points.map(point => [point[0], point[1] * sy]), color),
            image: sized('image', args => { args[2] *= sy; args[4] *= sy; return args; }),
            text: sized('text', args => { args[2] *= sy; args[3] *= sy; return args; }),
        };
        if (original.arc) c.arc = sized('arc', args => { args[1] *= sy; args[2] *= sy; args[3] *= sy; return args; });
        if (original.target) c.target = sized('target', args => { box(args); if (args[6] !== undefined) args[6] *= sy; return args; });
        if (original.textWidth) c.textWidth = sized('textWidth', args => { args[1] *= sy; return args; });
        const imageBridge = bridge => bridge && { draw: (canvas, x, y, w, h) => bridge.draw(original, x, y * sy, w, h * sy) };
        logo = imageBridge(logo); artwork = imageBridge(artwork);
    }
    c.clear(C.bg);

    const audioOnly = state.mode === 'audio' || state.profile === 'audio';
    const loading = state.phase === 'loading';
    const busy = state.phase === 'starting' || state.phase === 'stopping' || state.phase === 'recovering';
    const connected = state.connected === true, android = state.sender === 'android';
    const status = state.phase === 'stopping' ? t('status_disconnecting') : connected ? (android ? t('status_android') : t('status_iphone'))
        : state.phase === 'error' ? t('status_check') : busy || loading ? t('status_wait') : state.pin ? t('status_ready') : t('status_off');
    const statusColor = connected ? C.mLight : state.phase === 'error' || state.error ? C.amber : state.pin ? '#ffffff' : C.dim;
    header(c, state, status, statusColor, logo, onButton);

    // The reason something failed, and what to do about it.
    const errText = code => { const key = 'err_' + code; return code && t(key) !== key ? t(key) : ''; };
    const code = state.viewportError || state.error;
    const failure = errText(code) ? {
        title: MEDIA_ERRORS.indexOf(code) >= 0 || code === 'media_unsupported' ? t('err_title') : t('err_title_connection'),
        cause: errText(code),
        tip: MEDIA_ERRORS.indexOf(code) >= 0 && code !== 'media_failed' ? t('err_try_mirror') : '',
    } : null;

    if (audioOnly) drawMusic(c, state, artwork, onControl);
    else if (connected) drawConnected(c, state, android, failure);
    else if (state.pin) drawPairing(c, state, failure);
    else drawReady(c, state, busy, onButton, failure);

    // One line at the foot: what a button press did, or what the receiver needs.
    const controlCodes = ['music_control_failed', 'music_control_busy', 'music_control_stale'];
    const controlError = audioOnly && state.music && controlCodes.indexOf(state.music.controlError) >= 0 && errText(state.music.controlError);
    const musicFailure = audioOnly && failure ? failure.cause : '';
    const foot = notice || musicFailure || controlError || (state.audioError ? t('audio_error') : '') || (!connected && state.p2pText) || '';
    if (foot) {
        const warn = !!(notice || musicFailure || controlError || state.audioError);
        c.circle(X0 + 6, 497, 5, warn ? C.amber : C.dim);
        text(c, fit(c, foot, 22, 1480), X0 + 22, 505, 22, warn ? C.amberText : C.dim);
    }
}
module.exports = { drawHome, COLORS: C };
