'use strict';
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
const { EventLog, scrub, FILE } = require('../apps/base_player/event_log');

// What may never leave the car in a photo or a copied page.
assert.strictEqual(scrub('VIN WBA12345678901234 read'), 'VIN <vin> read', 'a VIN is cut');
assert.strictEqual(scrub('F18C: 0123456789AB'), 'F18C: <serial>', 'an ECU serial (F18C) is cut');
assert.strictEqual(scrub('serialNumber=AB12CD34EF'), 'serialNumber=<serial>', 'serial fields are cut');
assert.strictEqual(scrub('GET https://rr3.googlevideo.com/videoplayback?sig=abc&id=1 failed'), 'GET https://rr3.googlevideo.com/… failed', 'URL paths and tokens are cut, the host stays');
assert.strictEqual(scrub('pin 4821 shown', ['4821']), 'pin <code> shown', 'the pairing code is cut');
assert.strictEqual(scrub('MGU_MODE hls'), 'MGU_MODE hls', 'protocol lines stay as they are');
assert.strictEqual(scrub('a\u0007b'), 'a b', 'control characters do not reach the page');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-log-'));
let clock = new Date(2026, 10, 24, 9, 5, 7);
const log = new EventLog({ dataDir: dir, limit: 5, now: () => clock, port: 0, host: '127.0.0.1',
    interfaces: () => ({ lo: [{ family: 'IPv4', address: '127.0.0.1', internal: true }], wlan_bridge: [{ family: 'IPv4', address: '192.168.1.1', internal: false }] }) });
assert.strictEqual(log.add('airplay', 'MGU_MODE hls'), '09:05:07 airplay MGU_MODE hls', 'time, source and text');
for (let i = 0; i < 7; i++) log.add('state', 'n=' + i);
assert.strictEqual(log.entries.length, 5, 'the ring keeps the newest lines');
assert.deepStrictEqual(log.tail(2), ['09:05:07 state n=5', '09:05:07 state n=6']);
assert.strictEqual(log.url(), 'http://192.168.1.1:7105', 'the address on the car Wi-Fi');
log.flush();
assert.strictEqual(fs.readFileSync(path.join(dir, FILE), 'utf8').split('\n').filter(Boolean).length, 5, 'lines are kept on disk');
assert.strictEqual((fs.statSync(path.join(dir, FILE)).mode & 0o777), 0o600, 'the file is private');
const again = new EventLog({ dataDir: dir, limit: 5 });
assert.deepStrictEqual(again.entries, log.entries, 'the previous run is read back after a restart');
assert.strictEqual(new EventLog({ interfaces: () => ({}) }).url(), '', 'no car Wi-Fi, no address');

const server = log.listen(() => 'Base Player 9.9.9 · internet no');
const get = p => new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: server.address().port, path: p }, res => {
        let body = ''; res.setEncoding('utf8'); res.on('data', d => { body += d; }); res.on('end', () => resolve({ status: res.statusCode, type: res.headers['content-type'], body }));
    }).on('error', reject);
});
server.on('listening', async () => {
    try {
        log.add('webtv', '<script>x</script>');
        const page = await get('/');
        assert.strictEqual(page.status, 200); assert(/text\/html/.test(page.type));
        assert(page.body.indexOf('internet no') >= 0 && page.body.indexOf('state n=6') >= 0, 'header and lines on the page');
        assert(page.body.indexOf('<script>x</script>') < 0 && page.body.indexOf('&lt;script&gt;') >= 0, 'lines are escaped');
        const text = await get('/log.txt');
        assert(/text\/plain/.test(text.type) && /^Base Player 9\.9\.9/.test(text.body), 'plain text to copy or save');
        assert.strictEqual((await get('/other')).status, 404);
        console.log('Event log: scrubbing, ring, disk copy and the Wi-Fi page passed');
    } catch (e) { console.error(e); process.exitCode = 1; }
    finally { log.close(); }
});
