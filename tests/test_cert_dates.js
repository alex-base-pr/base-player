'use strict';
/* Certificate dates, and nothing but the dates. GPL-3.0-or-later.
 *
 * The matrix follows mgu-updater's test_certs.js (robertnisipeanu/mgu-store):
 * a private PKI made with openssl, a TLS server per certificate, and the host
 * player (native/build/bp-player) pointed at it. A certificate whose only
 * fault is its dates must pass when the tolerance is on, and every other
 * fault must be refused whether or not its dates also fail.
 *
 * Needs: native/build/bp-player, OpenSSL 3.4+ (-not_before/-not_after).
 *   node tests/test_cert_dates.js            both hooks
 */
const { spawn, execFileSync } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path'), net = require('net');

const PLAYER = path.join(__dirname, '..', 'native', 'build', 'bp-player');
const OPENSSL = process.env.OPENSSL || (fs.existsSync('/opt/homebrew/opt/openssl@3/bin/openssl') ? '/opt/homebrew/opt/openssl@3/bin/openssl' : 'openssl');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-certs-'));
const ssl = args => execFileSync(OPENSSL, args, { cwd: dir, stdio: ['ignore', 'ignore', 'ignore'] });

const PAST = ['20200101000000Z', '20210101000000Z'];     // expired: the clock ran ahead
const FUTURE = ['20400101000000Z', '20410101000000Z'];   // not yet valid: the clock fell behind
const NOW = ['20250101000000Z', '20350101000000Z'];

function ca(name, signer) {
    ssl(['req', '-newkey', 'rsa:2048', '-nodes', '-keyout', name + '.key', '-out', name + '.csr', '-subj', '/CN=' + name]);
    fs.writeFileSync(path.join(dir, name + '.ext'), 'basicConstraints=critical,CA:TRUE\nkeyUsage=critical,keyCertSign,cRLSign\n');
    const sign = signer ? ['-CA', signer + '.pem', '-CAkey', signer + '.key', '-CAcreateserial'] : ['-signkey', name + '.key'];
    ssl(['x509', '-req', '-in', name + '.csr', '-out', name + '.pem', '-not_before', '20190101000000Z', '-not_after', '20450101000000Z', '-extfile', name + '.ext'].concat(sign));
}
function leaf(name, signer, dates, san) {
    ssl(['req', '-newkey', 'rsa:2048', '-nodes', '-keyout', name + '.key', '-out', name + '.csr', '-subj', '/CN=' + name]);
    fs.writeFileSync(path.join(dir, name + '.ext'), 'basicConstraints=CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=DNS:' + san + '\n');
    const sign = signer ? ['-CA', signer + '.pem', '-CAkey', signer + '.key', '-CAcreateserial'] : ['-signkey', name + '.key'];
    ssl(['x509', '-req', '-in', name + '.csr', '-out', name + '.pem', '-not_before', dates[0], '-not_after', dates[1], '-extfile', name + '.ext'].concat(sign));
}

ca('root'); ca('other');   // only `root` is trusted
leaf('good', 'root', NOW, 'localhost');
leaf('expired', 'root', PAST, 'localhost');
leaf('future', 'root', FUTURE, 'localhost');
leaf('wronghost', 'root', NOW, 'elsewhere.test');
leaf('wronghost-expired', 'root', PAST, 'elsewhere.test');
leaf('untrusted', 'other', NOW, 'localhost');
leaf('untrusted-expired', 'other', PAST, 'localhost');
leaf('untrusted-future', 'other', FUTURE, 'localhost');
leaf('self-expired', null, PAST, 'localhost');

// What must happen: [certificate, strict, tolerant]. "pass" = TLS accepted (the
// test page is not media, so the load then fails for a non-certificate reason).
const CASES = [
    ['good', 'pass', 'pass'],
    ['expired', 'certificate', 'tolerated'],
    ['future', 'certificate', 'tolerated'],
    ['wronghost', 'certificate_untrusted', 'certificate_untrusted'],
    ['wronghost-expired', 'certificate_untrusted', 'certificate_untrusted'],
    ['untrusted', 'certificate_untrusted', 'certificate_untrusted'],
    ['untrusted-expired', 'certificate_untrusted', 'certificate_untrusted'],
    ['untrusted-future', 'certificate_untrusted', 'certificate_untrusted'],
    ['self-expired', 'certificate_untrusted', 'certificate_untrusted'],
];

const freePort = () => new Promise(resolve => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function play(port, tolerate, hook) {
    return new Promise(resolve => {
        const env = Object.assign({}, process.env, { BP_CA_FILE: path.join(dir, 'root.pem') });
        if (hook) env.BP_TLS_HOOK = hook;
        const child = spawn(PLAYER, ['--no-audio'], { env, stdio: ['pipe', 'pipe', 'ignore'] });
        const lines = []; let buffer = '', done = false;
        const finish = () => { if (done) return; done = true; clearTimeout(timer); child.kill(); resolve(lines); };
        const timer = setTimeout(finish, 20000);
        child.stdout.on('data', chunk => {
            buffer += chunk; let at;
            while ((at = buffer.indexOf('\n')) >= 0) {
                const line = buffer.slice(0, at).replace(/^BP /, ''); buffer = buffer.slice(at + 1);
                lines.push(line);
                if (line === 'ready') child.stdin.write('certdate ' + (tolerate ? 'on' : 'off') + '\nopen https://localhost:' + port + '/\n');
                else if (line.startsWith('error ') || line === 'phase video' || line === 'phase ended') finish();
            }
        });
        child.on('exit', finish);
    });
}
function verdict(lines) {
    const error = (lines.find(l => l.startsWith('error ')) || '').slice(6);
    if (error === 'certificate' || error === 'certificate_untrusted') return error;
    if (!error && !lines.includes('phase video')) return 'no_outcome';
    return lines.includes('tls date_tolerated') ? 'tolerated' : 'pass';
}

(async () => {
    let failed = 0, total = 0;
    try {
        for (const hook of [null, 'database']) {
            for (const [name, strict, tolerant] of CASES) {
                const port = await freePort();
                const server = spawn(OPENSSL, ['s_server', '-accept', '127.0.0.1:' + port, '-cert', name + '.pem', '-key', name + '.key', '-www', '-quiet'], { cwd: dir, stdio: 'ignore' });
                await wait(400);
                for (const [tolerate, want] of [[false, strict], [true, tolerant]]) {
                    const lines = await play(port, tolerate, hook);
                    const got = verdict(lines);
                    total++;
                    if (got !== want) { failed++; console.log(`FAIL ${hook || 'signal'} hook, ${name}, ${tolerate ? 'tolerant' : 'strict'}: want ${want}, got ${got} [${lines.join(' | ')}]`); }
                }
                server.kill();
            }
        }
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    console.log(`test_cert_dates: ${total - failed}/${total} passed (9 certificates x strict/tolerant x 2 hooks)`);
    process.exit(failed ? 1 : 0);
})();
