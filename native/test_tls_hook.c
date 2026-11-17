/* Base Player — hook 1 of bp_tls_attach(): a source with a `tls-validation-flags`
 * property gets the date-tolerant mask and nothing weaker. GPL-3.0-or-later.
 * Uses rtspsrc, the stock element that has this property. `make test-gst`. */
#include <gio/gio.h>
#include <gst/gst.h>
#include <stdio.h>

#include "bp_gst.h"

static int failures;

static void check(const char *what, gboolean tolerate, guint want) {
    BpTls tls = { 0, 0, 0, 0 };
    GstElement *bin = gst_pipeline_new(NULL);
    GstElement *inner = gst_bin_new(NULL);
    GstElement *source = gst_element_factory_make("rtspsrc", NULL);
    GTlsCertificateFlags got = 0;
    if (!source) { printf("SKIP %s: no rtspsrc\n", what); gst_object_unref(bin); gst_object_unref(inner); return; }
    bp_tls_set_tolerate_date(&tls, tolerate);
    bp_tls_attach(&tls, bin);
    gst_bin_add(GST_BIN(bin), inner);
    gst_bin_add(GST_BIN(inner), source); /* nested: must arrive via deep-element-added */
    g_object_get(source, "tls-validation-flags", &got, NULL);
    if ((guint)got != want) { failures++; printf("FAIL %s: want 0x%x, got 0x%x\n", what, want, (guint)got); }
    else printf("ok   %s: 0x%x\n", what, (guint)got);
    gst_object_unref(bin);
}

int main(int argc, char **argv) {
    gst_init(&argc, &argv);
    check("strict validates everything", FALSE, G_TLS_CERTIFICATE_VALIDATE_ALL);
    check("tolerant drops only the two date flags", TRUE,
        G_TLS_CERTIFICATE_VALIDATE_ALL & ~(G_TLS_CERTIFICATE_EXPIRED | G_TLS_CERTIFICATE_NOT_ACTIVATED));
    return failures ? 1 : 0;
}
