/* Base Player — direct-video URL player. GPL-3.0-or-later.
 *
 * Wraps a playbin. The JS backend writes one command per line to stdin and
 * reads event lines from stdout (apps/base_player/player_proto.js). The stream
 * URL never appears on stdout.
 *
 * Commands                         Events
 *   open <http(s) url>               BP ready
 *   hold                             BP phase loading|buffering|video|paused|idle|ended
 *   resume                           BP error <code>          (bp_error.h; UI text err_<code>)
 *   close                            BP tls date_tolerated    (accepted despite its dates)
 *   certdate on|off                  BP tls date_unavailable  (tolerance on, source has no hook)
 *   exit
 *
 * Options: --video-sink=<gst-launch description>   default: discard video
 *          --no-audio                              discard audio
 */
#include <gio/gio.h>
#include <gio/gunixinputstream.h>
#include <gst/gst.h>
#include <stdio.h>
#include <string.h>

#include "bp_gst.h"

typedef enum { PHASE_IDLE, PHASE_LOADING, PHASE_BUFFERING, PHASE_VIDEO, PHASE_PAUSED, PHASE_ENDED, PHASE_UNSET } Phase;
static const char *const PHASE_NAMES[] = { "idle", "loading", "buffering", "video", "paused", "ended" };

typedef struct {
    GMainLoop *loop;
    GstElement *playbin;
    GDataInputStream *commands;
    BpTls tls;
    Phase phase;        /* last phase told to the backend */
    gboolean active;    /* a URL is loaded */
    gboolean held;      /* the user asked for pause */
    gboolean starved;   /* paused by us while the buffer refills */
    gboolean tls_told;
} Session;

static void emit(const char *kind, const char *value) {
    if (value) printf("BP %s %s\n", kind, value);
    else printf("BP %s\n", kind);
    fflush(stdout);
}

static void enter(Session *s, Phase phase) {
    if (s->phase == phase) return;
    s->phase = phase;
    emit("phase", PHASE_NAMES[phase]);
}

static void drop_media(Session *s) {
    gst_element_set_state(s->playbin, GST_STATE_NULL);
    s->active = s->held = s->starved = FALSE;
}

static void tell_tls(Session *s) {
    if (s->tls_told) return;
    if (g_atomic_int_get(&s->tls.tolerated)) emit("tls", "date_tolerated");
    else if (g_atomic_int_get(&s->tls.tolerate_date) && g_atomic_int_get(&s->tls.unsupported)) emit("tls", "date_unavailable");
    else return;
    s->tls_told = TRUE;
}

/* --- commands -------------------------------------------------------------- */

static void cmd_open(Session *s, const char *url) {
    drop_media(s);
    if (!url || !(g_str_has_prefix(url, "https://") || g_str_has_prefix(url, "http://")) || !gst_uri_is_valid(url)) {
        emit("error", bp_error_name(BP_ERR_MEDIA_FAILED));
        enter(s, PHASE_IDLE);
        return;
    }
    bp_tls_reset(&s->tls);
    s->tls_told = FALSE;
    s->active = TRUE;
    s->phase = PHASE_UNSET;
    enter(s, PHASE_LOADING);
    g_object_set(s->playbin, "uri", url, NULL);
    gst_element_set_state(s->playbin, GST_STATE_PLAYING); /* failures arrive on the bus, with their cause */
}

static void cmd_hold(Session *s, const char *arg) {
    (void)arg;
    if (!s->active) return;
    s->held = TRUE;
    gst_element_set_state(s->playbin, GST_STATE_PAUSED);
}

static void cmd_resume(Session *s, const char *arg) {
    (void)arg;
    if (!s->active) return;
    s->held = FALSE;
    if (!s->starved) gst_element_set_state(s->playbin, GST_STATE_PLAYING);
}

static void cmd_close(Session *s, const char *arg) {
    (void)arg;
    drop_media(s);
    enter(s, PHASE_IDLE);
}

static void cmd_certdate(Session *s, const char *arg) {
    bp_tls_set_tolerate_date(&s->tls, arg && !strcmp(arg, "on"));
}

static void cmd_exit(Session *s, const char *arg) {
    (void)arg;
    g_main_loop_quit(s->loop);
}

static const struct { const char *name; void (*run)(Session *, const char *); } COMMANDS[] = {
    { "open", cmd_open }, { "hold", cmd_hold }, { "resume", cmd_resume },
    { "close", cmd_close }, { "certdate", cmd_certdate }, { "exit", cmd_exit },
};

static void next_command(Session *s);

static void on_command(GObject *stream, GAsyncResult *result, gpointer data) {
    Session *s = (Session *)data;
    gchar *line = g_data_input_stream_read_line_finish_utf8(G_DATA_INPUT_STREAM(stream), result, NULL, NULL);
    if (!line) { g_main_loop_quit(s->loop); return; } /* the backend went away */
    gchar **parts = g_strsplit(g_strstrip(line), " ", 2);
    for (gsize i = 0; parts[0] && i < G_N_ELEMENTS(COMMANDS); i++)
        if (!strcmp(parts[0], COMMANDS[i].name)) { COMMANDS[i].run(s, parts[1]); break; }
    g_strfreev(parts);
    g_free(line);
    next_command(s);
}

static void next_command(Session *s) {
    g_data_input_stream_read_line_async(s->commands, G_PRIORITY_DEFAULT, NULL, on_command, s);
}

/* --- bus ------------------------------------------------------------------- */

static void on_error(GstBus *bus, GstMessage *message, gpointer data) {
    Session *s = (Session *)data;
    gchar *url = NULL;
    (void)bus;
    /* Only the first error names the cause; the rest is fallout of the teardown. */
    if (!s->active) return;
    g_object_get(s->playbin, "current-uri", &url, NULL);
    if (!url) g_object_get(s->playbin, "uri", &url, NULL);
    tell_tls(s);
    emit("error", bp_error_name(bp_gst_classify(message, &s->tls, url)));
    g_free(url);
    drop_media(s);
    enter(s, PHASE_IDLE);
}

static void on_eos(GstBus *bus, GstMessage *message, gpointer data) {
    Session *s = (Session *)data;
    (void)bus; (void)message;
    if (!s->active) return;
    drop_media(s);
    enter(s, PHASE_ENDED);
}

static void on_buffering(GstBus *bus, GstMessage *message, gpointer data) {
    Session *s = (Session *)data;
    gint percent = 100;
    (void)bus;
    if (!s->active) return;
    gst_message_parse_buffering(message, &percent);
    if (percent < 100 && !s->starved) {
        s->starved = TRUE;
        gst_element_set_state(s->playbin, GST_STATE_PAUSED);
        enter(s, PHASE_BUFFERING);
    } else if (percent >= 100 && s->starved) {
        s->starved = FALSE;
        if (!s->held) gst_element_set_state(s->playbin, GST_STATE_PLAYING);
    }
}

static void on_state_changed(GstBus *bus, GstMessage *message, gpointer data) {
    Session *s = (Session *)data;
    GstState state = GST_STATE_NULL;
    (void)bus;
    if (!s->active || s->starved || GST_MESSAGE_SRC(message) != GST_OBJECT(s->playbin)) return;
    gst_message_parse_state_changed(message, NULL, &state, NULL);
    tell_tls(s);
    if (state == GST_STATE_PLAYING) enter(s, PHASE_VIDEO);
    else if (state == GST_STATE_PAUSED && s->held) enter(s, PHASE_PAUSED);
}

/* --- setup ----------------------------------------------------------------- */

static GstElement *make_sink(const char *description) {
    GstElement *sink = description ? gst_parse_bin_from_description(description, TRUE, NULL) : gst_element_factory_make("fakesink", NULL);
    return sink;
}

int main(int argc, char **argv) {
    gchar *video_sink = NULL;
    gboolean no_audio = FALSE;
    GOptionEntry options[] = {
        { "video-sink", 0, 0, G_OPTION_ARG_STRING, &video_sink, "Video sink (gst-launch syntax); default discards video", "DESC" },
        { "no-audio", 0, 0, G_OPTION_ARG_NONE, &no_audio, "Discard audio", NULL },
        { NULL, 0, 0, G_OPTION_ARG_NONE, NULL, NULL, NULL },
    };
    GOptionContext *parser = g_option_context_new("- Base Player direct-video player");
    g_option_context_add_main_entries(parser, options, NULL);
    g_option_context_add_group(parser, gst_init_get_option_group());
    if (!g_option_context_parse(parser, &argc, &argv, NULL)) return 64;
    g_option_context_free(parser);

    Session s;
    memset(&s, 0, sizeof s); /* a zeroed BpTls, GMutex included, is valid */
    s.phase = PHASE_UNSET;
    s.playbin = gst_element_factory_make("playbin", NULL);
    GstElement *video = make_sink(video_sink);
    if (!s.playbin || !video) { emit("error", bp_error_name(BP_ERR_MEDIA_FAILED)); return 69; }
    g_object_set(s.playbin, "video-sink", video, NULL);
    if (no_audio) g_object_set(s.playbin, "audio-sink", gst_element_factory_make("fakesink", NULL), NULL);
    bp_tls_attach(&s.tls, s.playbin);

    GstBus *bus = gst_element_get_bus(s.playbin);
    gst_bus_add_signal_watch(bus);
    g_signal_connect(bus, "message::error", G_CALLBACK(on_error), &s);
    g_signal_connect(bus, "message::eos", G_CALLBACK(on_eos), &s);
    g_signal_connect(bus, "message::buffering", G_CALLBACK(on_buffering), &s);
    g_signal_connect(bus, "message::state-changed", G_CALLBACK(on_state_changed), &s);

    GInputStream *input = g_unix_input_stream_new(0, FALSE);
    s.commands = g_data_input_stream_new(input);
    g_object_unref(input);
    s.loop = g_main_loop_new(NULL, FALSE);
    next_command(&s);

    emit("ready", NULL);
    g_main_loop_run(s.loop);

    gst_element_set_state(s.playbin, GST_STATE_NULL);
    gst_bus_remove_signal_watch(bus);
    gst_object_unref(bus);
    gst_object_unref(s.playbin);
    g_object_unref(s.commands);
    g_main_loop_unref(s.loop);
    g_free(video_sink);
    return 0;
}
