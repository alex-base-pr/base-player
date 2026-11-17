/* Base Player — GStreamer glue: certificate-date tolerance and turning a
 * GST_MESSAGE_ERROR into a BpError. GPL-3.0-or-later. */
#ifndef BP_GST_H
#define BP_GST_H

#include <gst/gst.h>
#include "bp_error.h"

typedef struct {
    gint tolerate_date; /* atomic: accept certificates whose only fault is their dates */
    gint seen_flags;    /* atomic: certificate problems that caused a rejection this load */
    gint tolerated;     /* atomic: a date-only problem was let through this load */
    gint unsupported;   /* atomic: a source offered none of the hooks below */
    GMutex lock;
    gchar *last_remote; /* under lock: last non-loopback http(s) URL a source was given */
} BpTls;

/* Watch `pipeline` (a playbin, or any bin) and put every network source it
   creates under the certificate policy of bp_tls_accept(). Per source, the
   first hook that exists is used:
     1. `tls-validation-flags` property  (set to bp_tls_validation_mask())
     2. `accept-certificate` signal      (souphttpsrc with libsoup 3)
     3. `tls-database` property          (wrapped database; libsoup 2 and 3)
   `ssl-strict` is never turned off. `tls` must outlive the pipeline. */
void bp_tls_attach(BpTls *tls, GstElement *pipeline);

void bp_tls_set_tolerate_date(BpTls *tls, gboolean on);

/* Call before each load: forgets what the previous load saw. */
void bp_tls_reset(BpTls *tls);

/* Classify an error message from the bus. `tls` and `uri` may be NULL.
   When the message names no cause (libsoup 3 reports DNS, routing and TLS
   failures alike as "Internal data stream error"), a host is probed: resolve,
   connect, TLS handshake — bounded by a few seconds. The host is that of the
   last remote URL a source was given (AirPlay video hands playbin a playlist
   on localhost whose segments are remote), else that of `uri`. */
BpError bp_gst_classify(GstMessage *message, const BpTls *tls, const char *uri);

/* Resolve + connect (+ TLS handshake for https) to the host of `uri`.
   Certificate problems are OR-ed into *tls_flags. Blocks up to timeout_ms. */
BpProbe bp_net_probe(const char *uri, guint timeout_ms, guint *tls_flags);

/* Is there a default route? Opens no connection and sends no packet. */
BpRoute bp_route_probe(void);

#endif
