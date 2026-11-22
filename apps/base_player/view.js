'use strict';
/* Base Player — the app's page, drawn in the grammar of BMW iDrive 7.
 * GPL-3.0-or-later; derived from apps/pllana_airplay/view.js of
 * pllanaio/bmw-airplay (Copyright (C) 2026 Leon Pllana IT-Solutions), redrawn
 * for Base Player (see NOTICE.md and docs/UX_REVIEW.md).
 *
 * <!-- THESIS: one state per screen, as iDrive shows one task: Ready, Pair,
 *      Connected, Music. The state is the content; no hero, no mode cards.
 *      OWN-WORLD: iDrive 7 — near-black blue-grey depth, white primary text,
 *      cool grey secondary, one BMW blue for selection and the primary action,
 *      line icons at one stroke, tiles with a small radius, list rows with
 *      hairlines. Amber only for problems.
 *      STORY: the driver sees what is happening and the one thing to do next;
 *      when video fails, the reason and the fix are the largest text.
 *      FIRST VIEWPORT: title and steps on the left, the primary tile (Connect,
 *      or the code) on the right; music: cover left, title, icon transport.
 *      FORM: pinned by the brief (iDrive 7 native), no concept roll. -->
 *
 * drawHome(c, state, notice, logo, artwork, onControl, onButton)
 *   c         kit canvas (docs: apps/base_player/kit/canvas.js), page 1600 x H
 *   onControl music action ('previous', 'playPause', 'next', 'shuffle', 'repeat')
 *   onButton  presses a bar button by id ('BTN_START', 'BTN_SETTINGS'); optional
 */
const { ID: LOGO } = require('./brand_logo');
const { t, MEDIA_ERRORS } = require('./i18n');

const W = 1600, H = 520, X0 = 40, X1 = 1560;
const C = {
    top: '#0d1319', bottom: '#040609',
    hair: '#1d242c',
    tile: [[0, '#1a2129'], [1, '#11161c']], tileEdge: '#28313b',
    ink: '#ffffff', sub: '#a3aeb9', dim: '#6c7884', off: '#47515b',
    blue: '#1c69d4', blueHi: '#5b9cf0', blueFill: [[0, '#2b7fe0'], [1, '#1553a9']], blueTint: '#14325a', blueOn: '#d9e8fb',
    amber: '#f2a33a', amberText: '#f6c98b',
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
        c.fillRect(x - s * 0.06, y - s * 0.30, s * 0.16, s * 0.09, C.bottom);
        c.quad([[x + s * 0.12, y - s * 0.26], [x - s * 0.04, y - s * 0.38], [x - s * 0.04, y - s * 0.14]], col);
        if (one) text(c, '1', x, y + s * 0.13, s * 0.36, col, { align: 'center' });
    },
    gear(c, x, y, s, col) {
        const r = s / 2;
        if (c.arc) c.arc(x, y, r * 0.34, r * 0.62, 0, 360, col);
        else { c.circle(x, y, r * 0.62, col); c.circle(x, y, r * 0.34, C.top); }
        for (let i = 0; i < 8; i++) {
            const a = i * Math.PI / 4, ca = Math.cos(a), sa = Math.sin(a), w = r * 0.16;
            const p = (d, o) => [x + ca * d - sa * o, y + sa * d + ca * o];
            c.quad([p(r * 0.55, -w), p(r * 0.98, -w * 0.8), p(r * 0.98, w * 0.8), p(r * 0.55, w)], col);
        }
    },
    alert(c, x, y, s, col) {
        c.quad([[x, y - s * 0.46], [x + s * 0.5, y + s * 0.40], [x - s * 0.5, y + s * 0.40]], col);
        c.roundRect(x - s * 0.05, y - s * 0.18, s * 0.10, s * 0.32, s * 0.04, C.bottom);
        c.circle(x, y + s * 0.26, s * 0.06, C.bottom);
    },
};

/* ---------- building blocks ---------- */
function tile(c, x, y, w, h, fill) {
    c.card(x, y, w, h, 12, fill || C.tile);
    if (!fill) c.strokeRoundRect(x, y, w, h, 12, 1, C.tileEdge);
}
function stepRows(c, rows, top) {
    // numbered rows: the order is the instruction, so the numbers carry information
    rows.forEach((row, i) => {
        const y = top + i * 76;
        c.circle(X0 + 22, y + 38, 22, C.blueTint);
        text(c, String(i + 1), X0 + 22, y + 47, 24, C.blueHi, { align: 'center' });
        text(c, fit(c, row, 28, 830), X0 + 64, y + 48, 28, C.ink);
        c.fillRect(X0, y + 76, 920, 1, C.hair);
    });
}
function listRows(c, rows, top) {
    rows.forEach((row, i) => {
        const y = top + i * 76;
        row[0](c, X0 + 26, y + 38, 36, C.sub);
        text(c, fit(c, row[1], 28, 1400), X0 + 76, y + 48, 28, C.ink);
        c.fillRect(X0, y + 76, X1 - X0, 1, C.hair);
    });
}
function problem(c, title, cause, tip) {
    // the reason a thing failed is the most important text on the page
    tile(c, X0, 214, 920, 246);
    icon.alert(c, X0 + 46, 262, 40, C.amber);
    text(c, fit(c, title, 32, 780), X0 + 90, 274, 32, C.ink);
    wrap(c, cause, 26, 840, tip ? 3 : 4).forEach((line, i) => text(c, line, X0 + 40, 330 + i * 36, 26, C.sub));
    if (tip) text(c, fit(c, tip, 22, 850), X0 + 40, 438, 22, C.amberText);
}

/* ---------- header ---------- */
function header(c, state, status, statusColor, logo, onButton) {
    if (logo) logo.draw(c, X0, 20, 36, 36);
    else c.image(LOGO, X0, 20, 36, 36);
    text(c, t('app_title'), X0 + 52, 48, 26, C.ink);
    let right = X1;
    if (onButton) {
        icon.gear(c, X1 - 22, 38, 34, C.sub);
        if (c.target) c.target(X1 - 52, 12, 60, 52, () => onButton('BTN_SETTINGS'), 'settings', 12);
        right = X1 - 76;
    }
    text(c, status, right, 47, 22, statusColor === C.ink ? C.sub : statusColor, { align: 'right' });
    c.circle(right - width(c, status, 22) - 16, 40, 6, statusColor);
    c.fillRect(X0, 76, X1 - X0, 1, C.hair);
}

/* ---------- screens ---------- */
function drawReady(c, state, busy, onButton, failure) {
    text(c, t('ready_title'), X0, 150, 44, C.ink);
    text(c, t('hero_sub'), X0, 190, 24, C.sub);
    if (failure) problem(c, failure.title, failure.cause, failure.tip);
    else stepRows(c, [t('step_carplay'), t('step_wifi'), t('step_connect')], 214);
    if (busy) {
        tile(c, 1000, 104, 560, 356);
        icon.airplay(c, 1280, 236, 96, C.off);
        text(c, t('preparing'), 1280, 352, 30, C.sub, { align: 'center' });
        return;
    }
    c.card(1000, 104, 560, 356, 12, C.blueFill);
    icon.airplay(c, 1280, 230, 104, C.ink);
    text(c, t('btn_start'), 1280, 346, 44, C.ink, { align: 'center' });
    text(c, t('connect_sub'), 1280, 388, 24, C.blueOn, { align: 'center' });
    if (onButton && c.target) c.target(1000, 104, 560, 356, () => onButton('BTN_START'), 'connect', 12);
}
function drawPairing(c, state, failure) {
    text(c, t('pair_title'), X0, 150, 44, C.ink);
    text(c, state.directVideo === false ? t('no_uplink') : t('same_wifi'), X0, 190, 24, C.sub);
    if (failure) problem(c, failure.title, failure.cause, failure.tip);
    else stepRows(c, [t('step_mirror'), t('step_choose'), t('step_code')], 214);
    tile(c, 1000, 104, 560, 356);
    text(c, t('code'), 1040, 150, 24, C.sub);
    const code = String(state.pin), n = code.length, gap = 14;
    const cell = Math.min(110, (480 - (n - 1) * gap) / n), left = 1280 - (n * cell + (n - 1) * gap) / 2;
    for (let i = 0; i < n; i++) {
        const x = left + i * (cell + gap);
        c.roundRect(x, 184, cell, 150, 10, C.bottom);
        text(c, code[i], x + cell / 2, 296, Math.min(96, cell * 0.95), C.ink, { align: 'center', font: 'light' });
    }
    text(c, fit(c, t('android_hint'), 22, 480), 1040, 410, 22, C.dim);
}
function drawConnected(c, state, android, failure) {
    const loading = state.phase === 'loading';
    text(c, android ? t('conn_android') : t('conn_iphone'), X0, 150, 44, C.ink);
    const media = state.mode === 'hls' ? (loading ? t('media_loading') : t('media_playing')) : state.mode === 'mirror' && state.frame ? t('media_mirror') : t('media_waiting');
    text(c, media, X0, 190, 24, C.blueHi);
    if (failure) { problem(c, failure.title, failure.cause, failure.tip); return; }
    listRows(c, android
        ? [[icon.phone, t('from_android')], [icon.note, t('control_on_phone')]]
        : [[icon.note, t('row_music')], [icon.airplay, t('row_video')], [icon.phone, t('row_mirror')]], 214);
}

function roundButton(c, x, y, size, draw, enabled, primary, key, action, onControl) {
    const r = size / 2;
    if (primary && enabled) c.card(x - r, y - r, size, size, r, C.blueFill);
    else {
        c.roundRect(x - r, y - r, size, size, r, '#161c23');
        c.strokeRoundRect(x - r, y - r, size, size, r, 1, C.tileEdge);
    }
    draw(c, x, y, size * 0.42, enabled ? C.ink : C.off);
    if (enabled && onControl && c.target) c.target(x - r, y - r, size, size, () => onControl(action), key, r);
}
function toggle(c, x, label, draw, enabled, active, key, action, onControl) {
    const y = 356, w = 176, h = 72;
    c.roundRect(x, y, w, h, 12, active && enabled ? C.blueTint : '#161c23');
    c.strokeRoundRect(x, y, w, h, 12, 1, active && enabled ? C.blue : C.tileEdge);
    const col = !enabled ? C.off : active ? C.blueHi : C.sub;
    draw(c, x + 36, y + h / 2, 30, col);
    text(c, fit(c, label, 22, w - 60), x + 60, y + 44, 22, enabled ? (active ? C.ink : C.sub) : C.off);
    if (enabled && onControl && c.target) c.target(x, y, w, h, () => onControl(action), key, 12);
}
function drawMusic(c, state, artwork, onControl) {
    const music = state.music || {}, controls = music.controls || {}, android = state.sender === 'android';
    tile(c, X0, 104, 340, 340);
    if (!artwork || !artwork.draw(c, X0, 104, 340, 340)) icon.note(c, X0 + 170, 274, 150, C.off);
    const x = 420, max = X1 - x;
    text(c, fit(c, music.title || t('music_default_title'), 44, max), x, 160, 44, C.ink);
    text(c, fit(c, music.artist || (state.connected ? t('music_pick_on_phone') : state.pin ? t('music_choose_audio') : t('press_connect')), 28, max), x, 204, 28, C.sub);
    const album = music.album || (state.connected ? t('audio_connected') : state.pin && !music.title ? t('app_title') + ' · ' + t('code') + ' ' + state.pin : '');
    if (album) text(c, fit(c, album, 24, max), x, 242, 24, C.dim);
    icon.airplay(c, x + 12, 284, 24, C.blueHi);
    text(c, android ? t('source_android') : t('source_iphone'), x + 36, 292, 20, C.blueHi);

    const playing = music.playbackState === 'playing';
    roundButton(c, x + 44, 392, 88, (cc, px, py, s, col) => icon.skip(cc, px, py, s, col, true), !!controls.previous, false, 'music-previous', 'previous', onControl);
    roundButton(c, x + 172, 392, 112, playing ? icon.pause : icon.play, !!controls.playPause, true, 'music-playPause', 'playPause', onControl);
    roundButton(c, x + 300, 392, 88, (cc, px, py, s, col) => icon.skip(cc, px, py, s, col, false), !!controls.next, false, 'music-next', 'next', onControl);
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
    c.clear(C.bottom);
    c.gradientRect(0, 0, W, H, [[0, C.top], [1, C.bottom]]);

    const audioOnly = state.mode === 'audio' || state.profile === 'audio';
    const loading = state.phase === 'loading';
    const busy = state.phase === 'starting' || state.phase === 'stopping' || state.phase === 'recovering';
    const connected = state.connected === true, android = state.sender === 'android';
    const status = state.phase === 'stopping' ? t('status_disconnecting') : connected ? (android ? t('status_android') : t('status_iphone'))
        : state.phase === 'error' ? t('status_check') : busy || loading ? t('status_wait') : state.pin ? t('status_ready') : t('status_off');
    const statusColor = connected ? C.blueHi : state.phase === 'error' || state.error ? C.amber : state.pin ? C.ink : C.off;
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
