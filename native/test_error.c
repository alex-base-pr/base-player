/* Base Player — tests for bp_error.c. GPL-3.0-or-later. Plain C: `make test`.
 * With `--names` prints the wire names, one per line (used by tests/test_codes.js). */
#include <stdio.h>
#include <string.h>

#include "bp_error.h"

static int failures, checks;

static void expect(const char *what, BpError want, BpKind kind, unsigned http, unsigned tls, BpRoute route, const char *text) {
    BpErrorInput in = { kind, http, tls, route, BP_PROBE_NONE, text };
    BpError got = bp_error_classify(&in);
    checks++;
    if (got != want) {
        failures++;
        printf("FAIL %s: want %s, got %s\n", what, bp_error_name(want), bp_error_name(got));
    }
}

static void expect_int(const char *what, long want, long got) {
    checks++;
    if (got != want) { failures++; printf("FAIL %s: want %ld, got %ld\n", what, want, got); }
}

int main(int argc, char **argv) {
    if (argc > 1 && !strcmp(argv[1], "--names")) {
        for (int e = 0; e < BP_ERR_COUNT; e++) puts(bp_error_name((BpError)e));
        return 0;
    }
    const BpRoute UP = BP_ROUTE_UP, DOWN = BP_ROUTE_DOWN, UNK = BP_ROUTE_UNKNOWN;

    /* Exact certificate flags win over everything. */
    expect("flags: expired", BP_ERR_CERTIFICATE, BP_KIND_OPEN, 0, BP_TLS_EXPIRED, UP, "Unacceptable TLS certificate");
    expect("flags: not activated", BP_ERR_CERTIFICATE, BP_KIND_OPEN, 0, BP_TLS_NOT_ACTIVATED, UP, "");
    expect("flags: both dates", BP_ERR_CERTIFICATE, BP_KIND_OPEN, 0, BP_TLS_DATE_FLAGS, UP, NULL);
    expect("flags: wrong host", BP_ERR_CERTIFICATE_UNTRUSTED, BP_KIND_OPEN, 0, BP_TLS_BAD_IDENTITY, UP, "");
    expect("flags: unknown CA", BP_ERR_CERTIFICATE_UNTRUSTED, BP_KIND_OPEN, 0, BP_TLS_UNKNOWN_CA, UP, "");
    expect("flags: expired AND unknown CA", BP_ERR_CERTIFICATE_UNTRUSTED, BP_KIND_OPEN, 0, BP_TLS_EXPIRED | BP_TLS_UNKNOWN_CA, UP, "");
    expect("flags beat a decode error", BP_ERR_CERTIFICATE, BP_KIND_DECODE, 0, BP_TLS_EXPIRED, UP, "");

    /* Text only — what libsoup 2 and the TLS backends say. */
    expect("soup2 SSL_FAILED status", BP_ERR_CERTIFICATE, BP_KIND_OPEN, 6, 0, UP, "Secure connection setup failed.");
    expect("soup2 text, no status", BP_ERR_CERTIFICATE, BP_KIND_OPEN, 0, 0, UP, "Secure connection setup failed.");
    expect("glib generic", BP_ERR_CERTIFICATE, BP_KIND_OPEN, 0, 0, UP, "Unacceptable TLS certificate");
    expect("gnutls expired", BP_ERR_CERTIFICATE, BP_KIND_OPEN, 0, 0, UP, "The certificate is NOT trusted. The certificate chain uses expired certificate.");
    expect("openssl expired", BP_ERR_CERTIFICATE, BP_KIND_IO, 0, 0, UP, "SSL routines: certificate verify failed (certificate has expired)");
    expect("not yet valid", BP_ERR_CERTIFICATE, BP_KIND_OPEN, 0, 0, UP, "TLS: certificate is not yet valid");
    expect("self-signed", BP_ERR_CERTIFICATE_UNTRUSTED, BP_KIND_OPEN, 0, 0, UP, "certificate verify failed: self-signed certificate");
    expect("hostname", BP_ERR_CERTIFICATE_UNTRUSTED, BP_KIND_OPEN, 0, 0, UP, "TLS certificate hostname does not match");

    /* DNS vs offline. */
    expect("soup2 can't resolve", BP_ERR_DNS, BP_KIND_NOT_FOUND, 2, 0, UP, "Could not resolve server name.");
    expect("soup2 can't resolve, no route", BP_ERR_OFFLINE, BP_KIND_NOT_FOUND, 2, 0, DOWN, "Could not resolve server name.");
    expect("resolver text", BP_ERR_DNS, BP_KIND_OPEN, 0, 0, UP, "Error resolving \"example.invalid\": Name or service not known");
    expect("resolver text, route unknown", BP_ERR_DNS, BP_KIND_OPEN, 0, 0, UNK, "Temporary failure in name resolution");
    expect("resolver text, no route", BP_ERR_OFFLINE, BP_KIND_OPEN, 0, 0, DOWN, "Temporary failure in name resolution");
    expect("soup2 can't connect", BP_ERR_OFFLINE, BP_KIND_OPEN, 4, 0, UP, "Could not establish connection to server.");
    expect("unreachable", BP_ERR_OFFLINE, BP_KIND_OPEN, 0, 0, UNK, "Network is unreachable");
    expect("refused", BP_ERR_OFFLINE, BP_KIND_IO, 0, 0, UP, "Could not connect to 10.0.0.1: Connection refused");
    expect("timeout", BP_ERR_OFFLINE, BP_KIND_IO, 0, 0, UP, "Socket I/O timed out");
    expect("open failed, no text", BP_ERR_OFFLINE, BP_KIND_OPEN, 0, 0, UNK, "");
    expect("read failed, no route", BP_ERR_OFFLINE, BP_KIND_IO, 0, 0, DOWN, "");
    expect("read failed, route up", BP_ERR_MEDIA_FAILED, BP_KIND_IO, 0, 0, UP, "Server sent bad data.");

    /* HTTP statuses: the network worked. */
    expect("403", BP_ERR_FORBIDDEN, BP_KIND_NOT_AUTHORIZED, 403, 0, UP, "Forbidden");
    expect("401", BP_ERR_FORBIDDEN, BP_KIND_NOT_AUTHORIZED, 401, 0, UP, "Unauthorized");
    expect("404", BP_ERR_NOT_FOUND, BP_KIND_NOT_FOUND, 404, 0, UP, "Not Found");
    expect("410", BP_ERR_NOT_FOUND, BP_KIND_OPEN, 410, 0, UP, "Gone");
    expect("500", BP_ERR_MEDIA_FAILED, BP_KIND_OPEN, 500, 0, UP, "Internal Server Error");
    expect("403 whose text mentions a token expiring", BP_ERR_FORBIDDEN, BP_KIND_NOT_AUTHORIZED, 403, 0, UP, "Token expired");
    expect("code only: not authorized", BP_ERR_FORBIDDEN, BP_KIND_NOT_AUTHORIZED, 0, 0, UP, "");
    expect("code only: not found", BP_ERR_NOT_FOUND, BP_KIND_NOT_FOUND, 0, 0, UP, "");

    /* Media. */
    expect("codec", BP_ERR_UNSUPPORTED, BP_KIND_TYPE, 0, 0, UP, "Your GStreamer installation is missing a plug-in.");
    expect("decode", BP_ERR_DECODE, BP_KIND_DECODE, 0, 0, UP, "Could not decode stream.");
    expect("decode with no route is still decode", BP_ERR_DECODE, BP_KIND_DECODE, 0, 0, DOWN, "timed out");
    expect("fallout", BP_ERR_MEDIA_FAILED, BP_KIND_OTHER, 0, 0, UP, "Internal data stream error.");

    /* libsoup 3 reports every connection failure as a bare stream error; the probe names it. */
    {
        struct { const char *what; BpProbe probe; BpRoute route; BpError want; } probes[] = {
            { "probe: dns", BP_PROBE_DNS_FAILED, UP, BP_ERR_DNS },
            { "probe: dns, no route", BP_PROBE_DNS_FAILED, DOWN, BP_ERR_OFFLINE },
            { "probe: connect", BP_PROBE_CONNECT_FAILED, UP, BP_ERR_OFFLINE },
            { "probe: tls without flags", BP_PROBE_TLS_FAILED, UP, BP_ERR_CERTIFICATE },
            { "probe: host is fine", BP_PROBE_OK, UP, BP_ERR_MEDIA_FAILED },
        };
        for (unsigned i = 0; i < sizeof probes / sizeof probes[0]; i++) {
            BpErrorInput in = { BP_KIND_OTHER, 0, 0, probes[i].route, probes[i].probe, "Internal data stream error." };
            BpError got = bp_error_classify(&in);
            checks++;
            if (got != probes[i].want) { failures++; printf("FAIL %s: want %s, got %s\n", probes[i].what, bp_error_name(probes[i].want), bp_error_name(got)); }
        }
    }

    /* The stream URL in the debug string must not steer the result. */
    expect("url with ssl host", BP_ERR_NOT_FOUND, BP_KIND_NOT_FOUND, 404, 0, UP, "Not Found (404), URL: https://ssl.example.com/certificate/expired.m3u8, Redirect to: (NULL)");
    expect("url with tls host, no status", BP_ERR_MEDIA_FAILED, BP_KIND_IO, 0, 0, UP, "Server sent bad data., URL: https://tls.example.com/dns/resolve.mp4");
    expect("word boundary", BP_ERR_MEDIA_FAILED, BP_KIND_IO, 0, 0, UP, "lossless subtitles stream failed");

    /* Certificate policy. */
    expect_int("accept: clean", 1, bp_tls_accept(0, 0));
    expect_int("accept: expired, strict", 0, bp_tls_accept(BP_TLS_EXPIRED, 0));
    expect_int("accept: expired, tolerant", 1, bp_tls_accept(BP_TLS_EXPIRED, 1));
    expect_int("accept: not activated, tolerant", 1, bp_tls_accept(BP_TLS_NOT_ACTIVATED, 1));
    expect_int("accept: both dates, tolerant", 1, bp_tls_accept(BP_TLS_DATE_FLAGS, 1));
    for (unsigned other = 1; other <= BP_TLS_VALIDATE_ALL; other++) {
        if (!(other & ~(unsigned)BP_TLS_DATE_FLAGS)) continue;
        if (bp_tls_accept(other, 1)) { failures++; printf("FAIL tolerant accepted flags 0x%x\n", other); }
        checks++;
    }
    expect_int("mask: strict", 0x7f, bp_tls_validation_mask(0));
    expect_int("mask: tolerant", 0x73, bp_tls_validation_mask(1));

    printf("test_error: %d/%d passed\n", checks - failures, checks);
    return failures ? 1 : 0;
}
