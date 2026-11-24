'use strict';
// What happened, in order: receiver and Web TV output, state changes and
// diagnostics. Shown on the head unit (last lines) and as a page on the
// car's Wi-Fi (all lines). VIN, ECU serials, pairing codes and URL paths
// are cut before a line is stored, so a photo or a copy can be shared.
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os');
const LIMIT = 2000, PORT = 7105, FILE = 'base-player-log.txt';
const INTERFACES = ['wlan_bridge', 'wlan0', 'wlan1'];
function scrub(value, secrets) {
    let s = String(value).replace(/[\x00-\x08\x0b-\x1f\x7f]/g, ' ').slice(0, 600);
    for (const secret of secrets || []) if (secret && String(secret).length >= 4) s = s.split(String(secret)).join('<code>');
    return s
        // URL paths and queries carry stream tokens; the host is enough.
        .replace(/\b((?:https?|rtsp):\/\/[^\/\s?#]+)[^\s"'<>]*/gi, '$1/…')
        // F18C (ECU serial) and serial-number fields.
        .replace(/\b(F18C\W{0,3})[0-9A-Za-z-]{4,}/gi, '$1<serial>')
        .replace(/\b(serial(?:[ _-]?(?:number|no))?["']?\s*[:=]?\s*["']?)[0-9A-Za-z-]{6,}/gi, '$1<serial>')
        // A VIN: 17 characters of [A-HJ-NPR-Z0-9] with a letter and a digit.
        .replace(/\b(?=[A-HJ-NPR-Z0-9]*[A-HJ-NPR-Z])(?=[A-HJ-NPR-Z0-9]*[0-9])[A-HJ-NPR-Z0-9]{17}\b/g, '<vin>');
}
function stamp(date) {
    const d = date || new Date(), p = n => ('0' + n).slice(-2);
    return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
}
class EventLog {
    constructor(options) {
        this.options = options || {};
        this.limit = this.options.limit || LIMIT;
        this.file = this.options.dataDir ? path.join(this.options.dataDir, FILE) : null;
        this.secrets = this.options.secrets || (() => []);
        this.entries = []; this.dirty = false; this.server = null;
        // The previous run's lines survive a backend restart or a crash.
        if (this.file) try {
            const st = fs.lstatSync(this.file);
            if (st.isFile() && st.size <= 1024 * 1024) this.entries = fs.readFileSync(this.file, 'utf8').split('\n').filter(Boolean).slice(-this.limit);
        } catch (e) {}
    }
    add(source, text) {
        const line = stamp(this.options.now ? this.options.now() : new Date()) + ' ' + source + ' ' + scrub(text, this.secrets());
        this.entries.push(line);
        if (this.entries.length > this.limit) this.entries.splice(0, this.entries.length - this.limit);
        this.dirty = true;
        return line;
    }
    tail(count) { return this.entries.slice(-count); }
    text() { return this.entries.join('\n') + (this.entries.length ? '\n' : ''); }
    flush() {
        if (!this.file || !this.dirty) return;
        this.dirty = false;
        try {
            const temp = this.file + '.tmp';
            fs.writeFileSync(temp, this.text(), { mode: 0o600 });
            fs.renameSync(temp, this.file);
        } catch (e) {}
    }
    // The car's Wi-Fi addresses where the page answers.
    addresses() {
        const all = (this.options.interfaces || os.networkInterfaces)(), out = [];
        for (const name of INTERFACES) for (const a of all[name] || [])
            if ((a.family === 'IPv4' || a.family === 4) && !a.internal) out.push({ name, address: a.address });
        return out;
    }
    url() {
        const a = this.addresses();
        return a.length ? 'http://' + a[0].address + ':' + PORT : '';
    }
    page(header) {
        const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        return '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
            '<title>Base Player log</title><style>body{background:#04060a;color:#f4f7fb;font:13px/1.45 ui-monospace,Menlo,monospace;margin:12px}' +
            'h1{font:600 17px -apple-system,sans-serif;margin:0 0 8px}a{color:#81c4ff}pre{white-space:pre-wrap;word-break:break-word}' +
            '.h{color:#b9c2ce}</style></head><body><h1>Base Player log</h1><p class="h">' + esc(header) +
            ' · <a href="/log.txt">log.txt</a> · <a href="/">refresh</a></p><pre>' + esc(this.text()) +
            '</pre><script>scrollTo(0,document.body.scrollHeight)</script></body></html>';
    }
    // A read-only page on the car's Wi-Fi (the firewall admits WLAN peers only).
    listen(header) {
        if (this.server) return this.server;
        const server = http.createServer((req, res) => {
            const url = String(req.url || '/').split('?')[0];
            if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }
            const head = typeof header === 'function' ? header() : '';
            if (url === '/' || url === '/log') {
                res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
                res.end(this.page(head));
            } else if (url === '/log.txt') {
                res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store',
                    'Content-Disposition': 'inline; filename="base-player-log.txt"' });
                res.end(head + '\n\n' + this.text());
            } else { res.writeHead(404); res.end(); }
        });
        server.on('error', () => { this.add('log', 'page_unavailable'); this.server = null; });
        server.listen(this.options.port !== undefined ? this.options.port : PORT, this.options.host || '0.0.0.0');
        if (server.unref) server.unref();
        this.server = server;
        return server;
    }
    close() { this.flush(); if (this.server) { this.server.close(); this.server = null; } }
}
module.exports = { EventLog, scrub, stamp, PORT, FILE };
