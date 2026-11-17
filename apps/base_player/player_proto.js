'use strict';
/* Base Player — status lines of native/bp-player -> view state.
 * Pure: applyLine(state, line) returns the patch to merge into the state that
 * view.js renders (docs/CANVAS_API.md). Unknown lines return null. */

const { STRINGS } = require('./i18n.js');

// Every code the UI has a text for; anything else shows as media_failed.
const ERRORS = Object.keys(STRINGS.en).filter(k => /^err_/.test(k) && !/^err_(title|tap_retry|try_mirror)$/.test(k)).map(k => k.slice(4));

function applyLine(state, line) {
    const m = /^BP (\S+)(?: (\S+))?$/.exec(String(line).trim());
    if (!m) return null;
    const [, what, value] = m;
    if (what === 'error') return { phase: 'error', error: ERRORS.includes(value) ? value : 'media_failed' };
    if (what === 'tls') {
        if (value === 'date_tolerated') return { certDateTolerated: true };
        if (value === 'date_unavailable') return { certDateUnavailable: true };
        return null;
    }
    if (what !== 'phase') return null;
    switch (value) {
        case 'loading': return { phase: 'loading', buffering: false, error: null, certDateTolerated: false, certDateUnavailable: false };
        case 'buffering': return { phase: 'loading', buffering: true };
        case 'video': case 'paused': return { phase: 'video', mode: 'hls' };
        // The player goes idle right after an error; the reason must stay on screen.
        case 'idle': case 'ended': return (state && state.phase === 'error') ? {} : { phase: 'idle', mode: null };
        default: return null;
    }
}

/* Commands to send before each `open`, from the app's settings. */
function settingsCommands(settings) {
    return ['certdate ' + (settings && settings.cert_date_tolerance ? 'on' : 'off')];
}

module.exports = { applyLine, settingsCommands, ERRORS };
