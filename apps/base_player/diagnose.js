'use strict';
// Explains in the app why the receiver service cannot be reached, from what
// the receiver runtime writes (/run/base-player/status.json) and which
// runtime is installed. Read-only; returns '' when there is nothing to say.
const fs = require('fs');
const { t } = require('./i18n');
const STATUS = '/run/base-player/status.json';
const RECEIVER = '/var/opt/base-player-receiver/current/component.json';
function readJson(io, file) {
    try { const text = io.readFileSync(file, 'utf8'); return text.length < 65536 ? JSON.parse(text) : null; } catch (e) { return null; }
}
function diagnose(uid, io) {
    io = io || fs;
    const receiver = readJson(io, RECEIVER), status = readJson(io, STATUS);
    if (!receiver) return t('diag_missing');
    if (status && typeof status.state === 'string') {
        const other = Number.isInteger(status.uid) && status.uid !== uid;
        switch (status.state) {
            case 'waiting_for_app': return t('diag_waiting_for_app');
            case 'app_identity_invalid': return t('diag_identity') + ' (' + String(status.error || '').slice(0, 40) + ').';
            case 'starting': return t('diag_starting');
            case 'backend_launch_failed': return t('diag_launch_failed') + String(status.error || '').slice(0, 60);
            case 'backend_exited': return t('diag_exited_1') + (status.signal || status.code) + t('diag_exited_2');
            case 'running': if (other) return t('diag_other_uid_1') + status.uid + t('diag_other_uid_2') + uid + t('diag_other_uid_3'); break;
            case 'stopped': return t('diag_stopped');
        }
        return '';
    }
    return t('diag_no_status');
}
// Miracast pre-check written by the receiver runtime (p2p_probe.js).
const P2P = '/run/base-player/p2p.json';
function wifiDirect(io) {
    const record = readJson(io || fs, P2P);
    const texts = { concurrent: t('p2p_concurrent'), exclusive: t('p2p_exclusive'), unsupported: t('p2p_unsupported') };
    return record && texts[record.summary] || '';
}
module.exports = { diagnose, wifiDirect, STATUS, RECEIVER, P2P };
