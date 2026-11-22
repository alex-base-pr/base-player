'use strict';
/* Base Player — the app's settings as the backend sees them. GPL-3.0-or-later.
 * The frontend (main.js) owns the settings screen and mirrors what the native
 * processes need into one small file in the shared data folder; the backend
 * reads it when it starts a receiver or a player. */
const fs = require('fs'), path = require('path');
const NAME = 'base-player-settings.json';

/* dataDir: the folder that holds control.sock (…/data/airplay). */
function save(dataDir, settings) {
    try {
        try { fs.mkdirSync(dataDir, 0o700); } catch (e) { if (e.code !== 'EEXIST') throw e; }
        const file = path.join(dataDir, NAME), tmp = file + '.' + process.pid;
        fs.writeFileSync(tmp, JSON.stringify({ certDateTolerance: settings.certDateTolerance === true, webTv: settings.webTv === true }) + '\n', { mode: 0o600 });
        fs.renameSync(tmp, file);
        return true;
    } catch (e) { return false; }
}

/* Off unless the file clearly says otherwise. */
function flag(dataDir, key, io) {
    try {
        const text = (io || fs).readFileSync(path.join(dataDir, NAME), 'utf8');
        return text.length < 4096 && JSON.parse(text)[key] === true;
    } catch (e) { return false; }
}
const certDateTolerance = (dataDir, io) => flag(dataDir, 'certDateTolerance', io);
const webTv = (dataDir, io) => flag(dataDir, 'webTv', io);

module.exports = { save, certDateTolerance, webTv, NAME };
