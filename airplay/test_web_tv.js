'use strict';
// Experimental Web TV: the process wrapper (launch, stdout/stdin protocol,
// exit), the shared setting, the client commands and the frontend (hidden
// setting, entry, controller keys, key mark, stop when the view goes away).
const assert = require('assert'), EventEmitter = require('events'), fs = require('fs'), os = require('os'), path = require('path'), vm = require('vm');
const { WebTv, KEYS, WEBTV_HOME, WEBTV_BINARY, WEBTV_URL } = require('../apps/base_player/web_tv');
const appSettings = require('../apps/base_player/app_settings');
const turn = () => new Promise(resolve => setImmediate(resolve));

async function processWrapper() {
    assert.strictEqual(path.join(WEBTV_HOME, WEBTV_BINARY), '/var/opt/base-player-webtv/current/bin/base-player-webtv');
    assert.deepStrictEqual(KEYS, ['Up', 'Down', 'Left', 'Right', 'Enter', 'Back']);
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'webtv-unit-'));
    const missing = new WebTv({ runtime: '/rt', home: path.join(dataDir, 'none'), dataDir });
    assert.strictEqual(missing.available(), false, 'no package, not available');
    assert.strictEqual(missing.start(), false); assert.strictEqual(missing.state.error, 'webtv_missing');
    fs.mkdirSync(path.join(dataDir, 'pkg/bin'), { recursive: true }); fs.writeFileSync(path.join(dataDir, 'pkg/bin/base-player-webtv'), '');
    fs.mkdirSync(path.join(dataDir, 'rt/bin'), { recursive: true }); fs.writeFileSync(path.join(dataDir, 'rt/bin/airplay-launch'), '');
    assert.strictEqual(new WebTv({ runtime: path.join(dataDir, 'rt'), home: path.join(dataDir, 'pkg'), dataDir }).available(), true,
        'available once the package binary and the receiver launcher exist');

    const spawned = [];
    const spawn = (binary, args, options) => {
        const child = new EventEmitter(); child.pid = 4343; child.lines = [];
        child.stdin = { write: text => child.lines.push(text), on: () => {} }; child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
        child.kill = () => {}; spawned.push({ binary, args, options, child }); return child;
    };
    const tv = new WebTv({ runtime: '/rt', home: '/tv', dataDir, audioSink: 'alsasink device=x', spawn, skipRuntimeCheck: true });
    const phases = [], exits = [], diagnostics = [];
    tv.on('state', s => phases.push(s.phase)); tv.on('exit', () => exits.push(1)); tv.on('diagnostic', d => diagnostics.push(d));
    assert.strictEqual(tv.presentation(), null);
    assert(tv.start());
    assert(tv.start(), 'a running Web TV is reused'); assert.strictEqual(spawned.length, 1);
    const run = spawned[0], uid = process.getuid();
    assert.strictEqual(run.binary, '/rt/bin/airplay-launch', 'the same launcher as the other native processes');
    assert.deepStrictEqual(run.args, ['/tv/bin/base-player-webtv', '--url', WEBTV_URL, '--video', '/dev/shm/mgu-video-webtv-' + uid, '--width', '1280', '--height', '720']);
    assert.strictEqual(WEBTV_URL, 'https://www.youtube.com/tv');
    assert.strictEqual(run.options.detached, true); assert.strictEqual(run.options.env.MGU_HLS_AUDIO_SINK, 'alsasink device=x');
    assert.strictEqual(run.options.env.HOME, dataDir);
    assert.deepStrictEqual(tv.presentation(), { phase: 'loading', frame: null, file: '', error: null });
    run.child.stdout.emit('data', 'WEBTV phase ready\nWEBTV phase play');
    run.child.stdout.emit('data', 'ing\nWEBTV phase bogus\nWEBTV error Bad-Code!\nnoise\nWEBTV phase ended\n');
    assert.deepStrictEqual(phases, ['loading', 'ready', 'playing', 'ended']);
    assert.strictEqual(tv.state.error, null, 'malformed lines are ignored');
    run.child.stdout.emit('data', 'WEBTV error network\n');
    assert.strictEqual(tv.state.error, 'webtv_network'); assert.deepStrictEqual(diagnostics, ['webtv_network']);
    // Frames: the same MGVF header check as the URL player.
    const frameFile = path.join(dataDir, 'frames'), header = Buffer.alloc(64 + 16 * 16 * 3 / 2);
    header.writeUInt32LE(0x4656474d, 0); header.writeUInt32LE(1, 4); header.writeUInt32LE(16, 8); header.writeUInt32LE(16, 12);
    header.writeUInt32LE(3, 16); header.writeUInt32LE(0, 20); header.writeUInt32LE(1, 24);
    fs.writeFileSync(frameFile, header); tv.file = frameFile; tv.checkFrame();
    assert.strictEqual(tv.state.frame.sequence, 3); assert.strictEqual(tv.state.file, frameFile);
    const updates = phases.length; tv.checkFrame(); assert.strictEqual(phases.length, updates, 'an unchanged frame sends no state');
    // Keys: only the list reaches the process.
    assert(tv.key('Up') && tv.key('Back') && !tv.key('Escape') && !tv.key('Up\nexit'));
    assert.deepStrictEqual(run.child.lines, ['key Up\n', 'key Back\n']);
    // An unexpected exit is reported once and leaves the error.
    run.child.emit('close', 1, null);
    assert.strictEqual(tv.child, null); assert.strictEqual(tv.presentation(), null);
    assert.strictEqual(tv.state.error, 'webtv_network', 'the reported cause survives the exit');
    assert.deepStrictEqual(exits, [1]); assert(diagnostics.indexOf('webtv_exited') >= 0);
    assert(!tv.key('Up'), 'no process, no keys');
    tv.start(); assert.strictEqual(spawned.length, 2); assert.strictEqual(tv.state.error, null, 'a new start clears the error');
    spawned[1].child.emit('close', 1, null); assert.strictEqual(tv.state.error, 'webtv_failed');
    tv.start();
    const closing = tv.close();
    assert.strictEqual(spawned[2].child.lines[spawned[2].child.lines.length - 1], 'exit\n');
    spawned[2].child.emit('close', 0, null); await closing;
    assert.strictEqual(tv.state.error, null, 'a requested close is no failure'); assert.strictEqual(tv.state.phase, 'stopped');
    await tv.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
}

function sharedSetting() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'webtv-settings-'));
    assert.strictEqual(appSettings.webTv(dir), false, 'no file means off');
    assert(appSettings.save(dir, { certDateTolerance: false, webTv: true }));
    assert.strictEqual(appSettings.webTv(dir), true); assert.strictEqual(appSettings.certDateTolerance(dir), false);
    assert(appSettings.save(dir, { webTv: 'yes' })); assert.strictEqual(appSettings.webTv(dir), false, 'only a real true turns it on');
    fs.rmSync(dir, { recursive: true, force: true });
    const spec = require('../apps/base_player/app.json').settings.find(s => s.key === 'webTv');
    assert.deepStrictEqual(spec, { key: 'webTv', label: 'Web TV (experimental)', type: 'bool', default: false, hidden: true });
}

function client() {
    const writes = [], socket = new EventEmitter();
    Object.assign(socket, { setEncoding() {}, write: line => writes.push(JSON.parse(line)), destroyed: false, connecting: false, end() {} });
    const context = { require: name => name === 'net' ? { createConnection: () => socket } : require(name), module: { exports: {} }, setTimeout, clearTimeout, setInterval, clearInterval };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../apps/base_player/backend_client.js'), 'utf8'), context);
    const c = new context.module.exports.BackendClient('/x'); c.connect();
    assert(c.webTvStart() && c.webTvKey('Left') && c.webTvStop());
    assert(!c.webTvKey('Escape'), 'the client sends only listed keys');
    assert.deepStrictEqual(writes, [{ command: 'webtv-start' }, { key: 'Left', command: 'webtv-key' }, { command: 'webtv-stop' }]);
    c.disconnect();
}

async function frontend() {
    let receiver, renderLoop, presented, visible, clock = 1000;
    const values = { certDateTolerance: false, webTv: false }, items = { webTv: { key: 'webTv', hidden: true } }, saved = [];
    const ops = [], homes = [];
    class BackendClient extends EventEmitter {
        constructor() { super(); receiver = this; this.state = {}; this.sent = []; this.socket = {}; }
        connect() {} disconnect() { return Promise.resolve(); } setVideoViewport() { return true; }
        webTvStart() { this.sent.push('start'); return true; } webTvStop() { this.sent.push('stop'); return true; }
        webTvKey(key) { this.sent.push(key); return true; } endVideo() { this.sent.push('end-video'); return true; }
    }
    const canvas = () => ({ clear() {}, text: (s) => ops.push(['text', s]), fillRect: (x) => ops.push(['rect', x]) });
    const ctx = { ui: { onClick: (id, fn) => { ctx.clicks[id] = fn; }, onVisible: fn => { visible = fn; }, image: () => Promise.resolve() },
        clicks: {}, log: { info() {}, warn() {} }, dataDir: '/app/data', loop: (n, hz, fn) => { renderLoop = fn; }, canvas,
        display: { gpu: { screen: { w: 1920, h: 720 } }, setPresentation: on => { presented = on; }, contentSize: () => ({ w: 1600, h: 560 }), _click() {} },
        settings: { get: key => values[key], item: key => items[key], onChange() {} } };
    const modules = { path, './kit/mgu': { run: app => app.start(ctx) }, './backend_client': { BackendClient },
        './video_bridge': { frameLuma: () => 200, VideoBridge: class { ready() { return true; } detach() {} attach() { return true; } draw() { ops.push(['video']); } } },
        './view': { drawHome: (c, state, notice, logo, art, control, onButton) => homes.push({ state, notice, onButton }) },
        './logo_bridge': { LogoBridge: class { draw() {} } }, './music_artwork_bridge': { MusicArtworkBridge: class { update() {} drop() {} } },
        './brand_logo': { register() {} }, './i18n': require('../apps/base_player/i18n'), './kit/record': { setImage() {} },
        './app_settings': { save: (dir, v) => { saved.push(v); return true; } }, './diagnose': { diagnose: () => '', wifiDirect: () => '' } };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../apps/base_player/main.js'), 'utf8'), {
        require: name => { assert(modules[name], name); return modules[name]; },
        process: { on() {}, getuid: () => 12233, exit() {} }, Date: { now: () => clock }, Promise, console });
    await turn();
    assert.strictEqual(JSON.stringify(saved[0]), JSON.stringify({ certDateTolerance: false, webTv: false }), 'the setting reaches the backend');
    receiver.emit('state', { phase: 'stopped', webTvAvailable: false });
    assert.strictEqual(items.webTv.hidden, true, 'no package: the setting stays hidden');
    receiver.emit('state', { phase: 'stopped', webTvAvailable: true });
    assert.strictEqual(items.webTv.hidden, false, 'the installed package unlocks the setting');
    await renderLoop();
    assert.strictEqual(homes[homes.length - 1].state.webTv, false, 'setting off: no entry on the Ready screen');
    homes[homes.length - 1].onButton('WEBTV');
    assert.deepStrictEqual(receiver.sent, [], 'the entry does nothing while the setting is off');
    values.webTv = true; await renderLoop();
    assert.strictEqual(homes[homes.length - 1].state.webTv, true, 'setting on and installed: the entry is shown');
    homes[homes.length - 1].onButton('WEBTV');
    assert.deepStrictEqual(receiver.sent, ['start']);
    // Loading: the normal page with the Web TV screen, not a black fullscreen.
    receiver.emit('state', { phase: 'loading', mode: 'webtv', webTvPhase: 'loading', webTvAvailable: true, frame: null });
    await renderLoop(); assert.strictEqual(presented, false); assert.strictEqual(homes[homes.length - 1].state.mode, 'webtv');
    assert.strictEqual(ctx.display.onPresentationKey({ d: 1 }) && receiver.sent.length, 2, 'keys are sent only from Web TV mode');
    receiver.sent.length = 1;
    receiver.emit('state', { phase: 'mirroring', mode: 'webtv', webTvPhase: 'playing', webTvAvailable: true, file: '/dev/shm/mgu-video-webtv-12233', frame: { generation: 'g', sequence: 1, width: 1280, height: 720 } });
    await renderLoop(); assert.strictEqual(presented, true, 'the first picture is fullscreen');
    assert(ops.some(op => op[0] === 'video'));
    // Controller: turn up/down, push arrows, press OK, hold left Back.
    const key = input => ctx.display.onPresentationKey(Object.assign({ d: 0, press: false, tilt: null, df: 0, last: 0 }, input));
    assert.strictEqual(key({ d: 2 }), true); key({ d: -1 }); key({ press: true });
    key({ tilt: 'N', df: 1 }); key({ tilt: 'E', df: 4 }); key({ tilt: 'S', df: 7 }); key({ tilt: 'W', df: 10 });
    key({ df: 11, last: 10 }); key({ df: 11, last: 11 }); key({ tilt: 'W', df: 11, last: 0 });
    key({ d: 40 });
    assert.deepStrictEqual(receiver.sent.slice(1), ['Down', 'Down', 'Up', 'Enter', 'Up', 'Right', 'Down', 'Left', 'Back', 'Back',
        'Down', 'Down', 'Down', 'Down', 'Down', 'Down', 'Down', 'Down']);
    // Each key leaves a small mark that differs from the previous one.
    ops.length = 0; await renderLoop();
    const mark = ops.filter(op => op[0] === 'rect').map(op => op[1]);
    assert(ops.some(op => op[0] === 'text' && op[1] === 'Down'), 'the last key is shown');
    key({ press: true }); ops.length = 0; await renderLoop();
    assert(ops.some(op => op[0] === 'text' && op[1] === 'OK'));
    assert.notDeepStrictEqual(ops.filter(op => op[0] === 'rect').map(op => op[1]), mark, 'the mark moves with every key');
    clock += 2000; ops.length = 0; await renderLoop();
    assert(!ops.some(op => op[0] === 'text'), 'the mark disappears after a moment');
    // Stop video and leaving the view end Web TV.
    ctx.clicks.BTN_END_VIDEO(); assert.strictEqual(receiver.sent[receiver.sent.length - 1], 'stop');
    assert(receiver.sent.indexOf('end-video') < 0);
    const before = receiver.sent.length;
    visible('MAIN', false); assert.strictEqual(receiver.sent.length, before + 1); assert.strictEqual(receiver.sent[before], 'stop');
    receiver.emit('state', { phase: 'waiting', mode: 'hls', webTvAvailable: true });
    assert.strictEqual(ctx.display.onPresentationKey({ d: 1 }), false, 'other video keeps the old fullscreen behaviour');
    visible('MAIN', false); assert.strictEqual(receiver.sent.length, before + 1, 'no Web TV, nothing to stop');
}

(async () => {
    await processWrapper();
    sharedSetting();
    client();
    await frontend();
    console.log('Web TV process protocol, setting, client commands and controller keys passed');
})().catch(e => { console.error(e); process.exitCode = 1; });
