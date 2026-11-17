/* Base Player — playback error classification. GPL-3.0-or-later.
 *
 * Pure C, no GLib/GStreamer: the GStreamer glue (bp_gst.c) reduces a
 * GST_MESSAGE_ERROR to a BpErrorInput and this decides the code that goes to
 * the UI as `error <code>` (i18n key `err_<code>`). Host-testable with cc.
 */
#ifndef BP_ERROR_H
#define BP_ERROR_H

typedef enum {
    BP_ERR_MEDIA_FAILED = 0,      /* fallback: nothing more specific is known */
    BP_ERR_CERTIFICATE,           /* certificate rejected for its dates (clock) */
    BP_ERR_CERTIFICATE_UNTRUSTED, /* certificate rejected for chain/host/signature */
    BP_ERR_OFFLINE,
    BP_ERR_DNS,
    BP_ERR_FORBIDDEN,
    BP_ERR_NOT_FOUND,
    BP_ERR_UNSUPPORTED,
    BP_ERR_DECODE,
    BP_ERR_COUNT
} BpError;

/* What the GStreamer error domain/code said, reduced to what matters here. */
typedef enum {
    BP_KIND_OTHER = 0,
    BP_KIND_NOT_FOUND,      /* GST_RESOURCE_ERROR_NOT_FOUND */
    BP_KIND_NOT_AUTHORIZED, /* GST_RESOURCE_ERROR_NOT_AUTHORIZED */
    BP_KIND_OPEN,           /* GST_RESOURCE_ERROR_OPEN_* — the source never opened */
    BP_KIND_IO,             /* other GST_RESOURCE_ERROR_* (read, seek, ...) */
    BP_KIND_TYPE,           /* stream type/codec/format not handled, missing plugin */
    BP_KIND_DECODE          /* decode/demux/decrypt failed */
} BpKind;

typedef enum { BP_ROUTE_UNKNOWN = 0, BP_ROUTE_UP, BP_ROUTE_DOWN } BpRoute;

/* Result of connecting to the stream's host ourselves (bp_net_probe). */
typedef enum { BP_PROBE_NONE = 0, BP_PROBE_OK, BP_PROBE_DNS_FAILED, BP_PROBE_CONNECT_FAILED, BP_PROBE_TLS_FAILED } BpProbe;

/* Same bit values as GTlsCertificateFlags (asserted in bp_gst.c). */
enum {
    BP_TLS_UNKNOWN_CA    = 1 << 0,
    BP_TLS_BAD_IDENTITY  = 1 << 1,
    BP_TLS_NOT_ACTIVATED = 1 << 2,
    BP_TLS_EXPIRED       = 1 << 3,
    BP_TLS_REVOKED       = 1 << 4,
    BP_TLS_INSECURE      = 1 << 5,
    BP_TLS_GENERIC_ERROR = 1 << 6,
    BP_TLS_VALIDATE_ALL  = 0x7f,
    BP_TLS_DATE_FLAGS    = BP_TLS_NOT_ACTIVATED | BP_TLS_EXPIRED
};

typedef struct {
    BpKind kind;
    /* souphttpsrc "http-status-code" detail, 0 if absent. With libsoup 2 the
       values below 100 are transport pseudo-statuses (2 = can't resolve, ...). */
    unsigned http_status;
    /* Exact certificate problems seen during this load, 0 if none or unknown. */
    unsigned tls_flags;
    BpRoute route;
    /* Set when the message itself named no cause and the host was probed. */
    BpProbe probe;
    /* Error message and debug string joined; may be NULL. Never shown to the user. */
    const char *text;
} BpErrorInput;

BpError bp_error_classify(const BpErrorInput *in);

/* Stable wire name: "certificate", "offline", ... (i18n key is "err_" + name). */
const char *bp_error_name(BpError e);

/* Certificate policy. With tolerate_date, a certificate whose ONLY problems are
   its validity dates is accepted; any chain/identity/signature problem still
   rejects. Without it, any problem rejects. */
int bp_tls_accept(unsigned tls_flags, int tolerate_date);

/* Value for a `tls-validation-flags` property under the same policy. */
unsigned bp_tls_validation_mask(int tolerate_date);

#endif
