'use strict';
/* Base Player — BMW iDrive-style view. All on-canvas text goes through t().
 * Pure drawing: given (c, state, t) it renders one frame. No side effects, so
 * the emulator and the car render identically. Reference screen 1920x720. */

const C = {
    bgTop: '#0b1017', bgBot: '#06090e',
    card: '#131b27', cardHi: '#17202e', edge: '#283647',
    ink: '#ffffff', muted: '#9fb1c6', faint: '#6b7c93',
    blue: '#2f9bff', blueDeep: '#1c69d4', blueDim: '#12325a',
    mint: '#49d1a8', mintDim: '#123a33',
    red: '#ff5964', redDim: '#3a1620', amber: '#ffb44d',
};

function text(c, str, x, y, size, color, opts) {
    return c.text(str, x, y, size, color, Object.assign({ font: 'airplay' }, opts || {}));
}

/* --- small vector icons (no image assets) --- */
function iconAirplay(c, x, y, s, color) {
    c.strokeRoundRect(x, y, s, s * 0.66, s * 0.09, Math.max(2, s * 0.03), color);
    c.quad([[x + s * 0.5, y + s * 0.46], [x + s * 0.74, y + s * 0.84],
        [x + s * 0.26, y + s * 0.84], [x + s * 0.5, y + s * 0.46]], color);
}
function iconPhone(c, x, y, s, color) {
    c.strokeRoundRect(x, y, s * 0.56, s, s * 0.13, Math.max(2, s * 0.04), color);
    c.line(x + s * 0.2, y + s * 0.86, x + s * 0.36, y + s * 0.86, Math.max(2, s * 0.04), color);
}
function iconNote(c, x, y, s, color) {
    c.line(x + s * 0.28, y + s * 0.1, x + s * 0.28, y + s * 0.84, Math.max(3, s * 0.07), color);
    c.line(x + s * 0.78, y + s * 0.02, x + s * 0.78, y + s * 0.74, Math.max(3, s * 0.07), color);
    c.line(x + s * 0.28, y + s * 0.1, x + s * 0.78, y + s * 0.02, Math.max(3, s * 0.07), color);
    c.circle(x + s * 0.18, y + s * 0.86, s * 0.12, color);
    c.circle(x + s * 0.68, y + s * 0.76, s * 0.12, color);
}
function iconPlay(c, x, y, s, color) {
    c.quad([[x + s * 0.28, y + s * 0.18], [x + s * 0.82, y + s * 0.5],
        [x + s * 0.28, y + s * 0.82], [x + s * 0.28, y + s * 0.18]], color);
}

/* --- shared chrome --- */
function header(c, t, pill, pillColor) {
    // title + thin iDrive accent, status pill on the right
    iconAirplay(c, 60, 44, 40, C.blue);
    text(c, t('app_title'), 120, 50, 34, C.ink);
    text(c, t('tagline'), 120, 92, 22, C.muted);
    c.fillRect(60, 126, 150, 3, C.blueDeep);
    if (pill) {
        const w = 26 + (pill.length * 13);
        c.roundRect(c.w - 70 - w, 52, w, 44, 22, pillColor === C.mint ? C.mintDim : pillColor === C.red ? C.redDim : C.blueDim);
        c.circle(c.w - 70 - w + 24, 74, 6, pillColor);
        text(c, pill, c.w - 70 - w + 40, 62, 22, C.ink);
    }
}

function notice(c, t, msg) {
    if (!msg) return;
    c.roundRect(60, c.h - 54, c.w - 120, 40, 12, C.redDim);
    text(c, msg, c.w / 2, c.h - 46, 22, '#ffd9dd', { align: 'center' });
}

/* --- phase: idle / waiting (the "ready" screen) --- */
function modeCard(c, t, x, w, icon, title, sub) {
    c.roundRect(x, c.h - 190, w, 120, 18, C.card);
    c.strokeRoundRect(x, c.h - 190, w, 120, 18, 1, C.edge);
    icon(c, x + 26, c.h - 158, 56);
    text(c, title, x + 104, c.h - 166, 25, C.ink);
    text(c, sub, x + 104, c.h - 132, 20, C.muted);
}

function drawIdle(c, state, t) {
    const code = state.pin || '— — — — — —';
    // big pairing card, centred
    const cw = 760, cx = (c.w - cw) / 2, cy = 168;
    c.roundRect(cx, cy, cw, 196, 24, C.cardHi);
    c.strokeRoundRect(cx, cy, cw, 196, 24, 1, C.edge);
    text(c, t('ready'), cx + 44, cy + 34, 28, C.ink);
    text(c, t('name_label') + ': ' + t('receiver_name'), cx + 44, cy + 76, 22, C.muted);
    text(c, t('pin_label'), cx + 44, cy + 120, 20, C.faint);
    text(c, code, cx + 44, cy + 146, 44, C.blue, { literal: true });
    iconAirplay(c, cx + cw - 128, cy + 56, 84, C.blueDeep);
    // hint line
    text(c, t('ready_hint'), c.w / 2, cy + 214, 21, C.muted, { align: 'center' });
    // three mode cards along the bottom of the body
    const gap = 24, w = (c.w - 120 - gap * 2) / 3;
    modeCard(c, t, 60, w, (cc, x, y, s) => iconPhone(cc, x, y, s, C.blue), t('card_mirror_t'), t('card_mirror_s'));
    modeCard(c, t, 60 + w + gap, w, (cc, x, y, s) => iconNote(cc, x, y, s, C.mint), t('card_audio_t'), t('card_audio_s'));
    modeCard(c, t, 60 + (w + gap) * 2, w, (cc, x, y, s) => iconPlay(cc, x, y, s, C.red), t('card_video_t'), t('card_video_s'));
}

/* --- phase: audio / now playing --- */
function controlButton(c, x, w, label, active) {
    c.roundRect(x, c.h - 150, w, 84, 16, active ? C.mintDim : C.card);
    c.strokeRoundRect(x, c.h - 150, w, 84, 16, 1, active ? '#2f6f63' : C.edge);
    text(c, label, x + w / 2, c.h - 118, 24, active ? C.mint : C.ink, { align: 'center' });
}
function drawAudio(c, state, t) {
    const m = state.music || {};
    // artwork placeholder
    c.roundRect(60, 160, 240, 240, 20, C.card);
    iconNote(c, 128, 212, 110, C.blue);
    // titles
    text(c, m.title || t('now_playing') + '.', 332, 168, 44, C.ink, { literal: !!m.title });
    text(c, m.artist || (state.connected ? t('pick_on_phone') : t('waiting_audio')), 334, 220, 27, C.muted, { literal: !!m.artist });
    text(c, m.album || (state.connected ? t('audio_connected') : ''), 334, 262, 23, C.muted, { literal: !!m.album });
    // controls row
    const ctl = m.controls || {};
    const row = [
        [t('prev'), 'previous', false],
        [m.playbackState === 'playing' ? t('play_pause') : t('play_pause'), 'playPause', false],
        [t('next'), 'next', false],
        [m.shuffle ? t('shuffle_on') : t('shuffle_off'), 'shuffle', m.shuffle === 1],
        [m.repeat === 1 ? t('repeat_one') : m.repeat === 2 ? t('repeat_all') : t('repeat_off'), 'repeat', m.repeat > 0],
    ];
    const gap = 20, total = c.w - 680, w = (total - gap * (row.length - 1)) / row.length;
    row.forEach((b, i) => controlButton(c, 332 + i * (w + gap), w, b[0], b[2]));
}

/* --- phase: mirror / video / loading --- */
function drawStatusCentre(c, t, icon, color, title, sub) {
    const cy = 150;
    icon(c, c.w / 2 - 50, cy, 100, color);
    text(c, title, c.w / 2, cy + 130, 40, C.ink, { align: 'center' });
    text(c, sub, c.w / 2, cy + 184, 24, C.muted, { align: 'center' });
}

/* --- phase: error (the real reason) --- */
function drawError(c, state, t) {
    const key = 'err_' + (state.error || 'media_failed');
    const reason = t(key) !== key ? t(key) : t('err_media_failed');
    const cw = 1100, cx = (c.w - cw) / 2, cy = 150;
    c.roundRect(cx, cy, cw, 240, 22, C.redDim);
    c.strokeRoundRect(cx, cy, cw, 240, 22, 1, '#6a2730');
    c.circle(cx + 60, cy + 60, 26, C.red);
    text(c, '!', cx + 60, cy + 44, 34, '#ffffff', { align: 'center' });
    text(c, t('err_title'), cx + 104, cy + 40, 30, C.ink);
    // reason wraps to two lines by naive split at ~62 chars
    const words = reason.split(' '); let line = '', lines = [];
    for (const w of words) { if ((line + ' ' + w).length > 64) { lines.push(line); line = w; } else line = line ? line + ' ' + w : w; }
    if (line) lines.push(line);
    lines.slice(0, 3).forEach((ln, i) => text(c, ln, cx + 104, cy + 86 + i * 34, 23, '#ffd9dd'));
    text(c, t('err_try_mirror'), c.w / 2, cy + 272, 22, C.amber, { align: 'center' });
    text(c, t('err_tap_retry'), c.w / 2, cy + 308, 21, C.muted, { align: 'center' });
}

/* --- entry point --- */
function drawHome(c, state, t) {
    c.clear(C.bgTop);
    if (c.gradientRect) c.gradientRect(0, 0, c.w, c.h, C.bgTop, C.bgBot, true);
    let pill = null, pc = C.blue;
    switch (state.phase) {
        case 'audio': pill = t('now_playing'); pc = C.mint; break;
        case 'mirror': pill = t('mirroring'); pc = C.blue; break;
        case 'video': pill = t('video_playing'); pc = C.blue; break;
        case 'loading': pill = t('loading'); pc = C.blue; break;
        case 'error': pill = t('err_title'); pc = C.red; break;
        default: pill = t('ready'); pc = C.blue;
    }
    header(c, t, pill, pc);
    switch (state.phase) {
        case 'audio': drawAudio(c, state, t); break;
        case 'mirror': drawStatusCentre(c, t, (cc, x, y, s) => iconPhone(cc, x, y, s, C.blue), C.blue, t('mirroring'), t('mirroring_sub')); break;
        case 'video': drawStatusCentre(c, t, (cc, x, y, s) => iconPlay(cc, x, y, s, C.blue), C.blue, t('video_playing'), t('video_sub')); break;
        case 'loading': drawStatusCentre(c, t, (cc, x, y, s) => iconAirplay(cc, x, y, s, C.blue), C.blue, state.buffering ? t('buffering') : t('loading'), ''); break;
        case 'error': drawError(c, state, t); break;
        default: drawIdle(c, state, t);
    }
    notice(c, t, state.notice);
}

module.exports = { drawHome, COLORS: C };
