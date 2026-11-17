'use strict';
/* Live check of native/build/bp-player against public test endpoints (needs
 * internet and a host GStreamer build). Not part of `npm test`-style offline
 * checks: run by hand with `node tests/e2e_player.js`.
 *
 * Each case sends `certdate`, `uri`, and expects one outcome line. */

const { spawn } = require('child_process');
const path = require('path');

const PLAYER = path.join(__dirname, '..', 'native', 'build', 'bp-player');
const MEDIA = 'https://gstreamer.freedesktop.org/data/media/small/sintel.mkv'; // small real file, valid certificate

const CASES = [
    // [name, url, tolerate dates, expected line, hook (optional)]
    ['valid https plays', MEDIA, 0, 'state playing'],
    ['expired cert, strict', 'https://expired.badssl.com/', 0, 'error certificate'],
    ['wrong host, strict', 'https://wrong.host.badssl.com/', 0, 'error certificate_untrusted'],
    ['self-signed, strict', 'https://self-signed.badssl.com/', 0, 'error certificate_untrusted'],
    ['untrusted root, strict', 'https://untrusted-root.badssl.com/', 0, 'error certificate_untrusted'],
    // Tolerance lets the expired certificate through; the page is not media,
    // so the load must then fail for a NON-certificate reason.
    ['expired cert, tolerant', 'https://expired.badssl.com/', 1, 'tls date_tolerated'],
    ['wrong host, tolerant', 'https://wrong.host.badssl.com/', 1, 'error certificate_untrusted'],
    ['self-signed, tolerant', 'https://self-signed.badssl.com/', 1, 'error certificate_untrusted'],
    ['untrusted root, tolerant', 'https://untrusted-root.badssl.com/', 1, 'error certificate_untrusted'],
    ['valid https plays, tolerant', MEDIA, 1, 'state playing'],
    // Same policy through the wrapped tls-database (the libsoup 2 path).
    ['db hook: expired, strict', 'https://expired.badssl.com/', 0, 'error certificate', 'database'],
    ['db hook: expired, tolerant', 'https://expired.badssl.com/', 1, 'tls date_tolerated', 'database'],
    ['db hook: wrong host, tolerant', 'https://wrong.host.badssl.com/', 1, 'error certificate_untrusted', 'database'],
    ['db hook: untrusted root, tolerant', 'https://untrusted-root.badssl.com/', 1, 'error certificate_untrusted', 'database'],
    ['db hook: valid plays', MEDIA, 0, 'state playing', 'database'],
    ['dns', 'https://no-such-host.base-player.invalid/a.mp4', 0, 'error dns'],
    ['connection refused', 'http://127.0.0.1:9/a.mp4', 0, 'error offline'],
    ['404', 'https://gstreamer.freedesktop.org/data/media/small/does-not-exist.mkv', 0, 'error not_found'],
    ['not media', 'https://badssl.com/', 0, 'error unsupported'],
];

function run(c) {
    const [name, url, tolerate, want, hook] = c;
    return new Promise(resolve => {
        const env = Object.assign({}, process.env, { BP_NO_AUDIO: '1' });
        if (hook) env.BP_TLS_HOOK = hook;
        const child = spawn(PLAYER, ['none'], { env, stdio: ['pipe', 'pipe', process.env.BP_DEBUG ? 'inherit' : 'ignore'] });
        const lines = [];
        let done = false, buffer = '';
        const finish = verdict => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            child.stdin.end('quit\n');
            child.kill();
            resolve({ name, want, lines, ok: verdict });
        };
        const timer = setTimeout(() => finish(false), 40000);
        child.stdout.on('data', chunk => {
            buffer += chunk;
            let at;
            while ((at = buffer.indexOf('\n')) >= 0) {
                const line = buffer.slice(0, at).replace(/^BP /, '');
                buffer = buffer.slice(at + 1);
                lines.push(line);
                if (line === 'ready') child.stdin.write(`certdate ${tolerate}\nuri ${url}\n`);
                else if (line === want) {
                    // "tolerated" must not be followed by a certificate error.
                    if (want === 'tls date_tolerated') continue;
                    finish(true);
                } else if (line.startsWith('error ') || line === 'state playing' || line === 'state ended') {
                    finish(want === 'tls date_tolerated' && lines.includes(want) && !line.startsWith('error certificate'));
                }
            }
        });
        child.on('exit', () => finish(false));
    });
}

(async () => {
    let failed = 0;
    for (const c of CASES) {
        const r = await run(c);
        if (!r.ok) failed++;
        console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.name}: want "${r.want}", got [${r.lines.join(' | ')}]`);
    }
    console.log(`e2e_player: ${CASES.length - failed}/${CASES.length} passed`);
    process.exit(failed ? 1 : 0);
})();
