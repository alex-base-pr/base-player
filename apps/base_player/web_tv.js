'use strict';
// Experimental Web TV: runs the optional base-player-webtv tool (a separate
// Store package) through the receiver's launcher. Its video goes through the
// same shared-memory frame transport as the URL player.
//   stdout: "WEBTV phase loading|ready|playing|ended", "WEBTV error <code>"
//   stdin:  "key Up|Down|Left|Right|Enter|Back", "exit"
const EventEmitter = require('events');
const childProcess = require('child_process');
const fs = require('fs');
const path = require('path');
const { frameHeader } = require('./receiver');

// The one place that knows where the optional package is installed.
const WEBTV_HOME = '/var/opt/base-player-webtv/current';
const WEBTV_BINARY = 'bin/base-player-webtv';
const WEBTV_URL = 'https://www.youtube.com/tv';
const WEBTV_SIZE = { width: 1280, height: 720 };
const KEYS = ['Up', 'Down', 'Left', 'Right', 'Enter', 'Back'];

function idle() { return { phase: 'stopped', frame: null, file: '', error: null }; }
function removeOwnFile(file, uid) {
    try {
        const st = fs.lstatSync(file);
        if (st.isFile() && !st.isSymbolicLink() && st.nlink === 1 && st.uid === uid) fs.unlinkSync(file);
    } catch (e) {}
}

class WebTv extends EventEmitter {
    constructor(options) {
        super();
        this.options = options || {};
        this.spawn = this.options.spawn || childProcess.spawn;
        this.runtime = this.options.runtime;
        this.home = this.options.home || process.env.BASE_PLAYER_WEBTV || WEBTV_HOME;
        this.dataDir = this.options.dataDir;
        this.child = null; this.pending = ''; this.poll = null; this.lastFrame = ''; this.closing = false; this.file = '';
        this.state = idle();
    }
    binary() { return path.join(this.home, WEBTV_BINARY); }
    available() {
        if (this.options.skipRuntimeCheck) return true;
        return fs.existsSync(this.binary()) && fs.existsSync(path.join(this.runtime, 'bin/airplay-launch'));
    }
    update(fields) { Object.assign(this.state, fields); this.emit('state', Object.assign({}, this.state)); }
    // What the frontend shows while the process runs; null otherwise.
    presentation() { return this.child ? Object.assign({}, this.state) : null; }
    start() {
        if (this.child) return true;
        if (!this.available()) { this.update(Object.assign(idle(), { error: 'webtv_missing' })); return false; }
        const uid = process.getuid ? process.getuid() : 0;
        const file = '/dev/shm/mgu-video-webtv-' + uid;
        removeOwnFile(file, uid); // a crashed run's frames; the sink creates the file exclusively
        const env = Object.assign({}, process.env, {
            HOME: this.dataDir, XDG_CACHE_HOME: this.dataDir,
            MGU_HLS_AUDIO_SINK: this.options.audioSink || 'fakesink', ALSA_PLUGIN_DIR: '/usr/lib/alsa-lib',
        });
        const args = [this.binary(), '--url', WEBTV_URL, '--video', file,
            '--width', String(WEBTV_SIZE.width), '--height', String(WEBTV_SIZE.height)];
        let child;
        try { child = this.spawn(path.join(this.runtime, 'bin/airplay-launch'), args, { env, cwd: this.dataDir, detached: true, stdio: ['pipe', 'pipe', 'pipe'] }); }
        catch (e) { this.update(Object.assign(idle(), { error: 'webtv_failed' })); return false; }
        this.child = child; this.pending = ''; this.file = file; this.lastFrame = ''; this.closing = false;
        if (child.stdin && child.stdin.on) child.stdin.on('error', () => {});
        if (child.stdout) child.stdout.on('data', chunk => {
            if (this.child !== child) return;
            this.pending = (this.pending + String(chunk)).slice(-8192);
            let at;
            while ((at = this.pending.indexOf('\n')) >= 0) {
                const line = this.pending.slice(0, at).trim(); this.pending = this.pending.slice(at + 1);
                if (line) this.emit('log', line);
                this.line(line);
            }
        });
        let pendingError = '';
        if (child.stderr) child.stderr.on('data', chunk => {
            if (this.child !== child) return;
            pendingError = (pendingError + String(chunk)).slice(-8192);
            let at;
            while ((at = pendingError.indexOf('\n')) >= 0) {
                const line = pendingError.slice(0, at).trim(); pendingError = pendingError.slice(at + 1);
                if (line) this.emit('log', line);
            }
        });
        let ended = false;
        const finish = () => {
            if (ended) return; ended = true;
            if (this.child !== child) return;
            this.child = null; clearInterval(this.poll); this.poll = null;
            removeOwnFile(file, uid);
            const failed = !this.closing;
            this.closing = false;
            this.update(Object.assign(idle(), failed ? { error: this.state.error || 'webtv_failed' } : {}));
            if (failed) this.emit('diagnostic', 'webtv_exited');
            this.emit('exit');
        };
        child.once('error', () => { if (!child.pid) finish(); });
        child.once('close', finish);
        this.poll = setInterval(() => this.checkFrame(), 100);
        this.update({ phase: 'loading', frame: null, file: '', error: null });
        return true;
    }
    checkFrame() {
        if (!this.child) return;
        const frame = frameHeader(this.file);
        const key = frame && [frame.generation, frame.sequence, frame.width, frame.height].join(':');
        if (frame && frame.sequence && key !== this.lastFrame) { this.lastFrame = key; this.update({ frame, file: this.file }); }
    }
    line(line) {
        const phase = /^WEBTV phase (loading|ready|playing|ended)$/.exec(line);
        if (phase) { this.update({ phase: phase[1] }); return; }
        const error = /^WEBTV error ([a-z0-9_]{1,32})$/.exec(line);
        if (error) { this.update({ error: 'webtv_' + error[1] }); this.emit('diagnostic', 'webtv_' + error[1]); }
    }
    send(text) {
        if (!this.child || !this.child.stdin || this.child.stdin.destroyed) return false;
        try { this.child.stdin.write(text + '\n'); return true; } catch (e) { return false; }
    }
    key(name) { return KEYS.indexOf(name) >= 0 && this.send('key ' + name); }
    // Ends the process; resolves when its process group has exited.
    close() {
        const child = this.child;
        if (!child) return Promise.resolve();
        this.closing = true;
        this.send('exit');
        return new Promise(resolve => {
            let done = false;
            const finish = () => { if (done) return; done = true; clearTimeout(term); clearTimeout(kill); resolve(); };
            const signal = name => { try { process.kill(-child.pid, name); } catch (e) { try { child.kill(name); } catch (ignore) {} } };
            const term = setTimeout(() => signal('SIGTERM'), 1000);
            const kill = setTimeout(() => { signal('SIGKILL'); setTimeout(finish, 200); }, 3000);
            child.once('close', finish);
        });
    }
}
module.exports = { WebTv, KEYS, WEBTV_HOME, WEBTV_BINARY, WEBTV_URL };
