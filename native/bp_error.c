/* Base Player — playback error classification. GPL-3.0-or-later. */
#include "bp_error.h"

#include <ctype.h>
#include <stddef.h>
#include <string.h>

static const char *const NAMES[BP_ERR_COUNT] = {
    "media_failed", "certificate", "certificate_untrusted", "offline", "dns",
    "forbidden", "not_found", "unsupported", "decode",
};

const char *bp_error_name(BpError e) {
    return (unsigned)e < BP_ERR_COUNT ? NAMES[e] : NAMES[BP_ERR_MEDIA_FAILED];
}

int bp_tls_accept(unsigned tls_flags, int tolerate_date) {
    if (!tls_flags) return 1;
    return tolerate_date && !(tls_flags & ~(unsigned)BP_TLS_DATE_FLAGS);
}

unsigned bp_tls_validation_mask(int tolerate_date) {
    return tolerate_date ? BP_TLS_VALIDATE_ALL & ~(unsigned)BP_TLS_DATE_FLAGS : BP_TLS_VALIDATE_ALL;
}

/* Case-insensitive (ASCII) substring search. */
static const char *find_ci(const char *text, const char *needle) {
    size_t n = strlen(needle);
    for (; *text; text++) {
        size_t i = 0;
        while (i < n && text[i] && tolower((unsigned char)text[i]) == needle[i]) i++;
        if (i == n) return text;
    }
    return NULL;
}

/* As find_ci, but the match must not touch a letter or digit on either side,
   so "ssl" does not hit "lossless". */
static int has_word(const char *text, const char *word) {
    size_t n = strlen(word);
    const char *at = text;
    while ((at = find_ci(at, word))) {
        int left = at == text || !isalnum((unsigned char)at[-1]);
        int right = !isalnum((unsigned char)at[n]);
        if (left && right) return 1;
        at++;
    }
    return 0;
}

static int has_any(const char *text, const char *const *list) {
    for (; *list; list++) if (find_ci(text, *list)) return 1;
    return 0;
}

static int mentions_tls(const char *t) {
    static const char *const sub[] = { "certificate", "handshake", "secure connection", "gnutls", "openssl", "x509", NULL };
    return has_any(t, sub) || has_word(t, "tls") || has_word(t, "ssl");
}

static int mentions_cert_date(const char *t) {
    static const char *const sub[] = { "expired", "not yet valid", "not valid yet", "not activated", "not yet activated", NULL };
    return has_any(t, sub);
}

static int mentions_cert_trust(const char *t) {
    static const char *const sub[] = {
        "self-signed", "self signed", "unknown ca", "unknown authority", "unable to get local issuer",
        "issuer", "not trusted", "untrusted", "revoked", "hostname", "does not match", "bad identity",
        "insecure algorithm", NULL };
    return has_any(t, sub);
}

static int mentions_dns(const char *t) {
    static const char *const sub[] = {
        "resolv", /* resolve, resolving, resolver */
        "name resolution", "name or service not known", "nodename nor servname",
        "no address associated", "unknown host", "host not found", NULL };
    return has_any(t, sub) || has_word(t, "dns");
}

static int mentions_offline(const char *t) {
    static const char *const sub[] = {
        "network is unreachable", "network unreachable", "network is down", "no route to host",
        "host is unreachable", "host is down", "connection refused", "connection reset",
        "timed out", "timeout", "could not connect", "couldn't connect", "cannot connect",
        "could not establish connection", NULL };
    return has_any(t, sub);
}

/* Copy `text` with every http(s) URL blanked out. Debug strings carry the
   stream URL, and a host such as "ssl.example.com" must not read as a TLS error. */
static void copy_without_urls(char *out, size_t size, const char *text) {
    size_t n = 0;
    while (*text && n + 1 < size) {
        if (!strncmp(text, "http://", 7) || !strncmp(text, "https://", 8)) {
            while (*text && !isspace((unsigned char)*text) && *text != ',') text++;
            out[n++] = ' ';
        } else {
            out[n++] = *text++;
        }
    }
    out[n] = 0;
}

BpError bp_error_classify(const BpErrorInput *in) {
    char t[2048];
    copy_without_urls(t, sizeof t, in->text ? in->text : "");

    /* 1. The TLS layer told us exactly what was wrong with the certificate. */
    if (in->tls_flags)
        return in->tls_flags & ~(unsigned)BP_TLS_DATE_FLAGS ? BP_ERR_CERTIFICATE_UNTRUSTED : BP_ERR_CERTIFICATE;

    /* 2. Stream-level failures are about the media, whatever the text says. */
    if (in->kind == BP_KIND_TYPE) return BP_ERR_UNSUPPORTED;
    if (in->kind == BP_KIND_DECODE) return BP_ERR_DECODE;

    /* 3. A real HTTP status means DNS, routing and TLS all worked. */
    if (in->http_status >= 100) {
        switch (in->http_status) {
        case 401: case 402: case 403: case 407: case 451: return BP_ERR_FORBIDDEN;
        case 404: case 410: return BP_ERR_NOT_FOUND;
        case 406: case 415: return BP_ERR_UNSUPPORTED;
        default: if (in->http_status >= 400) return BP_ERR_MEDIA_FAILED;
        }
    }
    /* libsoup 2 transport pseudo-statuses carried in the same field. */
    switch (in->http_status) {
    case 2: case 3: return in->route == BP_ROUTE_DOWN ? BP_ERR_OFFLINE : BP_ERR_DNS;
    case 4: case 5: return BP_ERR_OFFLINE;
    case 6: return mentions_cert_trust(t) && !mentions_cert_date(t) ? BP_ERR_CERTIFICATE_UNTRUSTED : BP_ERR_CERTIFICATE;
    default: break;
    }

    /* 4. We connected to the host ourselves because the message named no cause. */
    switch (in->probe) {
    case BP_PROBE_DNS_FAILED: return in->route == BP_ROUTE_DOWN ? BP_ERR_OFFLINE : BP_ERR_DNS;
    case BP_PROBE_CONNECT_FAILED: return BP_ERR_OFFLINE;
    case BP_PROBE_TLS_FAILED: return BP_ERR_CERTIFICATE; /* refused without flags: see below */
    default: break;
    }

    /* 5. Text of the error and its debug string. */
    if (mentions_tls(t)) {
        if (mentions_cert_date(t)) return BP_ERR_CERTIFICATE;
        if (mentions_cert_trust(t)) return BP_ERR_CERTIFICATE_UNTRUSTED;
        /* No reason given (libsoup 2 says only "Secure connection setup
           failed"). On this head unit the usual cause is the clock. */
        return BP_ERR_CERTIFICATE;
    }
    /* Checked before NOT_FOUND: libsoup 2 reports an unresolvable host as
       RESOURCE/NOT_FOUND. Without any route the resolver fails too, and then
       the honest answer is "no internet", not "DNS". */
    if (mentions_dns(t)) return in->route == BP_ROUTE_DOWN ? BP_ERR_OFFLINE : BP_ERR_DNS;
    if (in->kind == BP_KIND_NOT_AUTHORIZED) return BP_ERR_FORBIDDEN;
    if (in->kind == BP_KIND_NOT_FOUND) return BP_ERR_NOT_FOUND;
    if (mentions_offline(t)) return BP_ERR_OFFLINE;
    if (in->route == BP_ROUTE_DOWN && (in->kind == BP_KIND_OPEN || in->kind == BP_KIND_IO)) return BP_ERR_OFFLINE;
    if (in->kind == BP_KIND_OPEN) return BP_ERR_OFFLINE;
    return BP_ERR_MEDIA_FAILED;
}
