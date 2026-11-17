'use strict';
const assert = require('assert');
const { diagnose, STATUS, RECEIVER } = require('../apps/base_player/diagnose');
const io = files => ({ readFileSync: f => { if (!(f in files)) throw Object.assign(Error('ENOENT'), { code: 'ENOENT' }); return JSON.stringify(files[f]); } });
const receiver = { id: 'base-player-receiver', version: '0.4.0' };
assert(/fehlt/.test(diagnose(13001, io({}))), 'no runtime at all');
assert(/Code 139/.test(diagnose(13001, io({ [RECEIVER]: receiver, [STATUS]: { state: 'backend_exited', uid: 13001, code: 139 } }))));
assert(/wartet/.test(diagnose(13001, io({ [RECEIVER]: receiver, [STATUS]: { state: 'waiting_for_app' } }))));
assert.strictEqual(diagnose(13001, io({ [RECEIVER]: receiver, [STATUS]: { state: 'running', uid: 13001 } })), '');
assert(/12999/.test(diagnose(13001, io({ [RECEIVER]: receiver, [STATUS]: { state: 'running', uid: 12999 } }))));
const { parseUids } = require('./runtime/launch.js');
assert.strictEqual(parseUids('12201=store\n13007=base_player\n'), 13007);
assert.throws(() => parseUids('13007=base_player\n13008=base_player\n'));
console.log('Receiver diagnostics and app UID lookup passed');
// Miracast pre-check text from the receiver runtime.
{
    const { wifiDirect, P2P } = require('../apps/base_player/diagnose');
    const io = summary => ({ readFileSync: file => { if (file !== P2P) throw Error('ENOENT'); return JSON.stringify({ summary }); } });
    assert.strictEqual(wifiDirect(io('concurrent')), 'Miracast-Vorprüfung: Wi-Fi Direct neben dem Hotspot möglich');
    assert.strictEqual(wifiDirect(io('unsupported')), 'Miracast-Vorprüfung: WLAN-Chip ohne Wi-Fi Direct');
    assert.strictEqual(wifiDirect(io('unknown')), '');
    assert.strictEqual(wifiDirect({ readFileSync: () => { throw Error('ENOENT'); } }), '');
    console.log('Miracast pre-check text passed');
}
