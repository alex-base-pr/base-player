/* Base Player — GStreamer glue. GPL-3.0-or-later. */
#include "bp_gst.h"

#include <errno.h>
#include <gio/gio.h>
#include <string.h>
#include <arpa/inet.h>
#include <netinet/in.h>
#include <sys/socket.h>
#include <unistd.h>

#define BP_PROBE_TIMEOUT_MS 5000

G_STATIC_ASSERT((int)BP_TLS_UNKNOWN_CA == (int)G_TLS_CERTIFICATE_UNKNOWN_CA);
G_STATIC_ASSERT((int)BP_TLS_BAD_IDENTITY == (int)G_TLS_CERTIFICATE_BAD_IDENTITY);
G_STATIC_ASSERT((int)BP_TLS_NOT_ACTIVATED == (int)G_TLS_CERTIFICATE_NOT_ACTIVATED);
G_STATIC_ASSERT((int)BP_TLS_EXPIRED == (int)G_TLS_CERTIFICATE_EXPIRED);
G_STATIC_ASSERT((int)BP_TLS_REVOKED == (int)G_TLS_CERTIFICATE_REVOKED);
G_STATIC_ASSERT((int)BP_TLS_INSECURE == (int)G_TLS_CERTIFICATE_INSECURE);
G_STATIC_ASSERT((int)BP_TLS_GENERIC_ERROR == (int)G_TLS_CERTIFICATE_GENERIC_ERROR);
G_STATIC_ASSERT((int)BP_TLS_VALIDATE_ALL == (int)G_TLS_CERTIFICATE_VALIDATE_ALL);

/* One verdict for every hook: remember why a certificate was refused, or
   that a date-only fault was let through. */
static gboolean tls_decide(BpTls *tls, GTlsCertificateFlags errors) {
    if (!errors) return TRUE;
    if (bp_tls_accept((unsigned)errors, g_atomic_int_get(&tls->tolerate_date))) {
        g_atomic_int_set(&tls->tolerated, 1);
        return TRUE;
    }
    g_atomic_int_or(&tls->seen_flags, (guint)errors);
    return FALSE;
}

/* --- hook 3: a GTlsDatabase that delegates to the real one ---------------- */

typedef struct { GTlsDatabase parent; GTlsDatabase *real; BpTls *tls; } BpTlsDatabase;
typedef struct { GTlsDatabaseClass parent_class; } BpTlsDatabaseClass;
GType bp_tls_database_get_type(void);
G_DEFINE_TYPE(BpTlsDatabase, bp_tls_database, G_TYPE_TLS_DATABASE)
#define BP_TLS_DATABASE(o) ((BpTlsDatabase *)(o))

static GTlsCertificateFlags db_verify_chain(GTlsDatabase *db, GTlsCertificate *chain, const gchar *purpose,
        GSocketConnectable *identity, GTlsInteraction *interaction, GTlsDatabaseVerifyFlags flags,
        GCancellable *cancellable, GError **error) {
    BpTlsDatabase *self = BP_TLS_DATABASE(db);
    GError *local = NULL;
    GTlsCertificateFlags errors = g_tls_database_verify_chain(self->real, chain, purpose, identity,
        interaction, flags, cancellable, &local);
    if (local) { g_propagate_error(error, local); return errors; }
    /* Full verification ran above; only the verdict on its result changes. */
    return tls_decide(self->tls, errors) ? 0 : errors;
}

static gchar *db_create_handle(GTlsDatabase *db, GTlsCertificate *certificate) {
    return g_tls_database_create_certificate_handle(BP_TLS_DATABASE(db)->real, certificate);
}

static GTlsCertificate *db_lookup_handle(GTlsDatabase *db, const gchar *handle, GTlsInteraction *interaction,
        GTlsDatabaseLookupFlags flags, GCancellable *cancellable, GError **error) {
    return g_tls_database_lookup_certificate_for_handle(BP_TLS_DATABASE(db)->real, handle, interaction, flags, cancellable, error);
}

static GTlsCertificate *db_lookup_issuer(GTlsDatabase *db, GTlsCertificate *certificate, GTlsInteraction *interaction,
        GTlsDatabaseLookupFlags flags, GCancellable *cancellable, GError **error) {
    return g_tls_database_lookup_certificate_issuer(BP_TLS_DATABASE(db)->real, certificate, interaction, flags, cancellable, error);
}

static GList *db_lookup_issued_by(GTlsDatabase *db, GByteArray *issuer, GTlsInteraction *interaction,
        GTlsDatabaseLookupFlags flags, GCancellable *cancellable, GError **error) {
    return g_tls_database_lookup_certificates_issued_by(BP_TLS_DATABASE(db)->real, issuer, interaction, flags, cancellable, error);
}

static void bp_tls_database_finalize(GObject *object) {
    g_clear_object(&BP_TLS_DATABASE(object)->real);
    G_OBJECT_CLASS(bp_tls_database_parent_class)->finalize(object);
}

static void bp_tls_database_class_init(BpTlsDatabaseClass *klass) {
    GTlsDatabaseClass *db = G_TLS_DATABASE_CLASS(klass);
    G_OBJECT_CLASS(klass)->finalize = bp_tls_database_finalize;
    db->verify_chain = db_verify_chain;
    db->create_certificate_handle = db_create_handle;
    db->lookup_certificate_for_handle = db_lookup_handle;
    db->lookup_certificate_issuer = db_lookup_issuer;
    db->lookup_certificates_issued_by = db_lookup_issued_by;
    /* The async variants keep GTlsDatabase's defaults, which run the above in a thread. */
}

static void bp_tls_database_init(BpTlsDatabase *self) { (void)self; }

/* --- attaching to sources ------------------------------------------------- */

static gboolean on_accept_certificate(GstElement *source, GTlsCertificate *certificate,
        GTlsCertificateFlags errors, gpointer data) {
    (void)source; (void)certificate;
    return tls_decide((BpTls *)data, errors);
}

static gboolean has_property(GObject *object, const char *name, GType type) {
    GParamSpec *spec = g_object_class_find_property(G_OBJECT_GET_CLASS(object), name);
    return spec && (spec->flags & G_PARAM_WRITABLE) && g_type_is_a(spec->value_type, type);
}

static void tls_apply(BpTls *tls, GstElement *element) {
    GObject *object = G_OBJECT(element);
    gboolean tolerate = g_atomic_int_get(&tls->tolerate_date);

    if (has_property(object, "tls-validation-flags", G_TYPE_TLS_CERTIFICATE_FLAGS)) {
        /* Re-applied on every sighting so a changed setting takes effect. */
        g_object_set(object, "tls-validation-flags", (GTlsCertificateFlags)bp_tls_validation_mask(tolerate), NULL);
        return;
    }
    if (g_object_get_data(object, "bp-tls")) return; /* hooks 2 and 3 read the setting live */

    /* BP_TLS_HOOK=database skips hook 2 so tests can exercise hook 3 on libsoup 3. */
    gboolean use_signal = g_strcmp0(g_getenv("BP_TLS_HOOK"), "database") != 0;
    if (use_signal && g_signal_lookup("accept-certificate", G_OBJECT_TYPE(object))) {
        g_signal_connect(object, "accept-certificate", G_CALLBACK(on_accept_certificate), tls);
    } else if (has_property(object, "tls-database", G_TYPE_TLS_DATABASE)) {
        GTlsDatabase *real = NULL;
        g_object_get(object, "tls-database", &real, NULL);
        if (!real) real = g_tls_backend_get_default_database(g_tls_backend_get_default());
        if (!real) { g_atomic_int_set(&tls->unsupported, 1); return; }
        BpTlsDatabase *wrapper = g_object_new(bp_tls_database_get_type(), NULL);
        wrapper->real = real; /* takes the reference */
        wrapper->tls = tls;
        g_object_set(object, "tls-database", wrapper, NULL);
        g_object_unref(wrapper);
    } else {
        /* An HTTPS-capable source with no usable hook: say so instead of pretending. */
        if (g_object_class_find_property(G_OBJECT_GET_CLASS(object), "ssl-strict"))
            g_atomic_int_set(&tls->unsupported, 1);
        return;
    }
    g_object_set_data(object, "bp-tls", GINT_TO_POINTER(1));
}

static void on_source_setup(GstElement *pipeline, GstElement *source, gpointer data) {
    (void)pipeline;
    tls_apply((BpTls *)data, source);
}

static void on_deep_element_added(GstBin *bin, GstBin *sub_bin, GstElement *element, gpointer data) {
    (void)bin; (void)sub_bin;
    /* Adaptive demuxers (HLS/DASH) create their own HTTP sources for
       playlists and fragments; `source-setup` never sees those. */
    tls_apply((BpTls *)data, element);
}

void bp_tls_attach(BpTls *tls, GstElement *pipeline) {
    if (g_signal_lookup("source-setup", G_OBJECT_TYPE(pipeline)))
        g_signal_connect(pipeline, "source-setup", G_CALLBACK(on_source_setup), tls);
    if (GST_IS_BIN(pipeline))
        g_signal_connect(pipeline, "deep-element-added", G_CALLBACK(on_deep_element_added), tls);
}

void bp_tls_set_tolerate_date(BpTls *tls, gboolean on) { g_atomic_int_set(&tls->tolerate_date, on ? 1 : 0); }

void bp_tls_reset(BpTls *tls) {
    g_atomic_int_set(&tls->seen_flags, 0);
    g_atomic_int_set(&tls->tolerated, 0);
    g_atomic_int_set(&tls->unsupported, 0);
}

/* --- classification ------------------------------------------------------- */

static gboolean route_exists(int family, const struct sockaddr *address, socklen_t length, int *failure) {
    int fd = socket(family, SOCK_DGRAM, 0);
    if (fd < 0) { *failure = errno; return FALSE; }
    /* connect() on a datagram socket only asks the kernel for a route. */
    gboolean ok = connect(fd, address, length) == 0;
    if (!ok) *failure = errno;
    close(fd);
    return ok;
}

BpRoute bp_route_probe(void) {
    struct sockaddr_in v4;
    struct sockaddr_in6 v6;
    int e4 = 0, e6 = 0;
    memset(&v4, 0, sizeof v4);
    v4.sin_family = AF_INET; v4.sin_port = htons(53);
    inet_pton(AF_INET, "1.1.1.1", &v4.sin_addr);
    memset(&v6, 0, sizeof v6);
    v6.sin6_family = AF_INET6; v6.sin6_port = htons(53);
    inet_pton(AF_INET6, "2606:4700:4700::1111", &v6.sin6_addr);
    if (route_exists(AF_INET, (struct sockaddr *)&v4, sizeof v4, &e4)) return BP_ROUTE_UP;
    if (route_exists(AF_INET6, (struct sockaddr *)&v6, sizeof v6, &e6)) return BP_ROUTE_UP;
    if (e4 == ENETUNREACH || e4 == EHOSTUNREACH || e4 == EADDRNOTAVAIL || e4 == ENETDOWN) return BP_ROUTE_DOWN;
    return BP_ROUTE_UNKNOWN;
}

typedef struct { GMainLoop *loop; GError *error; guint tls_flags; } Probe;

static gboolean probe_accept(GTlsConnection *connection, GTlsCertificate *certificate, GTlsCertificateFlags errors, gpointer data) {
    (void)connection; (void)certificate;
    ((Probe *)data)->tls_flags |= (guint)errors;
    return FALSE; /* the probe only looks; it never accepts anything */
}

static void probe_event(GSocketClient *client, GSocketClientEvent event, GSocketConnectable *connectable,
        GIOStream *connection, gpointer data) {
    (void)client; (void)connectable;
    if (event == G_SOCKET_CLIENT_TLS_HANDSHAKING && connection)
        g_signal_connect(connection, "accept-certificate", G_CALLBACK(probe_accept), data);
}

static void probe_done(GObject *source, GAsyncResult *result, gpointer data) {
    Probe *probe = (Probe *)data;
    GSocketConnection *connection = g_socket_client_connect_to_uri_finish(G_SOCKET_CLIENT(source), result, &probe->error);
    if (connection) {
        g_io_stream_close(G_IO_STREAM(connection), NULL, NULL);
        g_object_unref(connection);
    }
    g_main_loop_quit(probe->loop);
}

static gboolean probe_timeout(gpointer cancellable) {
    g_cancellable_cancel(G_CANCELLABLE(cancellable));
    return G_SOURCE_REMOVE;
}

BpProbe bp_net_probe(const char *uri, guint timeout_ms, guint *tls_flags) {
    gboolean https = uri && g_str_has_prefix(uri, "https://");
    if (!uri || (!https && !g_str_has_prefix(uri, "http://"))) return BP_PROBE_NONE;

    /* Own context: nothing else of the application runs while we wait. */
    GMainContext *context = g_main_context_new();
    g_main_context_push_thread_default(context);
    Probe probe = { g_main_loop_new(context, FALSE), NULL, 0 };
    GCancellable *cancellable = g_cancellable_new();
    GSocketClient *client = g_socket_client_new();
    g_socket_client_set_tls(client, https);
    g_signal_connect(client, "event", G_CALLBACK(probe_event), &probe);
    GSource *timer = g_timeout_source_new(timeout_ms);
    g_source_set_callback(timer, probe_timeout, cancellable, NULL);
    g_source_attach(timer, context);

    g_socket_client_connect_to_uri_async(client, uri, https ? 443 : 80, cancellable, probe_done, &probe);
    g_main_loop_run(probe.loop);

    BpProbe result = BP_PROBE_OK;
    if (probe.error) {
        if (probe.error->domain == G_RESOLVER_ERROR) result = BP_PROBE_DNS_FAILED;
        else if (probe.error->domain == G_TLS_ERROR || probe.tls_flags) result = BP_PROBE_TLS_FAILED;
        else result = BP_PROBE_CONNECT_FAILED; /* refused, unreachable, or our timeout */
        if (g_getenv("BP_DEBUG")) g_printerr("bp: probe: %s\n", probe.error->message);
        g_error_free(probe.error);
    }
    if (tls_flags) *tls_flags |= probe.tls_flags;

    g_source_destroy(timer);
    g_source_unref(timer);
    g_object_unref(client);
    g_object_unref(cancellable);
    g_main_loop_unref(probe.loop);
    g_main_context_pop_thread_default(context);
    g_main_context_unref(context);
    return result;
}

static BpKind kind_of(const GError *error) {
    if (error->domain == GST_RESOURCE_ERROR) {
        switch (error->code) {
        case GST_RESOURCE_ERROR_NOT_FOUND: return BP_KIND_NOT_FOUND;
        case GST_RESOURCE_ERROR_NOT_AUTHORIZED: return BP_KIND_NOT_AUTHORIZED;
        case GST_RESOURCE_ERROR_OPEN_READ:
        case GST_RESOURCE_ERROR_OPEN_WRITE:
        case GST_RESOURCE_ERROR_OPEN_READ_WRITE: return BP_KIND_OPEN;
        default: return BP_KIND_IO;
        }
    }
    if (error->domain == GST_STREAM_ERROR) {
        switch (error->code) {
        case GST_STREAM_ERROR_TYPE_NOT_FOUND:
        case GST_STREAM_ERROR_WRONG_TYPE:
        case GST_STREAM_ERROR_CODEC_NOT_FOUND:
        case GST_STREAM_ERROR_FORMAT: return BP_KIND_TYPE;
        case GST_STREAM_ERROR_DECODE:
        case GST_STREAM_ERROR_DEMUX:
        case GST_STREAM_ERROR_DECRYPT:
        case GST_STREAM_ERROR_DECRYPT_NOKEY: return BP_KIND_DECODE;
        default: return BP_KIND_OTHER;
        }
    }
    if (error->domain == GST_CORE_ERROR && error->code == GST_CORE_ERROR_MISSING_PLUGIN) return BP_KIND_TYPE;
    return BP_KIND_OTHER;
}

BpError bp_gst_classify(GstMessage *message, const BpTls *tls, const char *uri) {
    GError *error = NULL;
    gchar *debug = NULL;
    const GstStructure *details = NULL;
    BpErrorInput in;
    memset(&in, 0, sizeof in);

    gst_message_parse_error(message, &error, &debug);
    if (!error) { g_free(debug); return BP_ERR_MEDIA_FAILED; }
    gst_message_parse_error_details(message, &details);
    if (details) gst_structure_get_uint(details, "http-status-code", &in.http_status);

    gchar *text = g_strconcat(error->message ? error->message : "", "\n", debug ? debug : "", NULL);
    in.kind = kind_of(error);
    in.text = text;
    if (tls) in.tls_flags = (unsigned)g_atomic_int_get(&((BpTls *)tls)->seen_flags);
    /* Only a network-side failure needs the route question answered. */
    if (in.kind != BP_KIND_TYPE && in.kind != BP_KIND_DECODE && !in.tls_flags) in.route = bp_route_probe();

    BpError result = bp_error_classify(&in);
    if (result == BP_ERR_MEDIA_FAILED && !in.http_status && in.kind != BP_KIND_TYPE && in.kind != BP_KIND_DECODE) {
        guint flags = 0;
        gboolean tolerate = tls && g_atomic_int_get(&((BpTls *)tls)->tolerate_date);
        in.probe = bp_net_probe(uri, BP_PROBE_TIMEOUT_MS, &flags);
        /* A date fault the policy tolerates did not cause this failure. */
        if (!bp_tls_accept(flags, tolerate)) in.tls_flags = flags;
        else if (in.probe == BP_PROBE_TLS_FAILED) in.probe = BP_PROBE_OK;
        result = bp_error_classify(&in);
    }
    if (g_getenv("BP_DEBUG")) /* carries the stream URL: never on by default, never to stdout */
        g_printerr("bp: %s <- domain=%s code=%d http=%u tls=0x%x route=%d probe=%d\n    %s\n    %s\n", bp_error_name(result),
            g_quark_to_string(error->domain), error->code, in.http_status, in.tls_flags, in.route, in.probe,
            error->message ? error->message : "", debug ? debug : "");
    g_free(text);
    g_free(debug);
    g_error_free(error);
    return result;
}
