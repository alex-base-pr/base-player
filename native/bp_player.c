/* Base Player — URL player for direct (non-mirrored) video. GPL-3.0-or-later.
 *
 * playbin driven over stdin, one command per line; bounded status lines on
 * stdout for the JS backend (apps/base_player/player_proto.js). Stream URLs
 * are never printed on stdout.
 *
 *   uri <url>        load and play
 *   play | pause     transport
 *   certdate <0|1>   tolerate certificate dates only (applies from the next load)
 *   stop             unload
 *   quit             exit
 *
 *   BP ready
 *   BP state loading|buffering|playing|paused|stopped|ended
 *   BP error <code>            see bp_error.h; the UI shows i18n `err_<code>`
 *   BP tls date_tolerated      a certificate was accepted despite its dates
 *   BP tls date_unavailable    tolerance is on but this source offers no hook
 *
 * usage: bp-player [<video-sink description> | none]
 */
#include <gst/gst.h>
#include <stdarg.h>
#include <stdio.h>
#include <string.h>

#include "bp_gst.h"

typedef struct {
    GMainLoop *loop;
    GstElement *player;
    GString *line;
    BpTls tls;
    gboolean loaded, want_playing, buffering, tls_reported;
    const char *last_state;
} Player;

static void say(const char *format, ...) {
    va_list args;
    va_start(args, format);
    fputs("BP ", stdout);
    vfprintf(stdout, format, args);
    fputc('\n', stdout);
    fflush(stdout);
    va_end(args);
}

static void report_state(Player *p, const char *state) {
    if (p->last_state && !strcmp(p->last_state, state)) return;
    p->last_state = state;
    say("state %s", state);
}

static void unload(Player *p) {
    gst_element_set_state(p->player, GST_STATE_NULL);
    p->loaded = p->want_playing = p->buffering = FALSE;
}

static void load(Player *p, const char *uri) {
    unload(p);
    if (!gst_uri_is_valid(uri) || (!g_str_has_prefix(uri, "http://") && !g_str_has_prefix(uri, "https://"))) {
        say("error media_failed");
        report_state(p, "stopped");
        return;
    }
    bp_tls_reset(&p->tls);
    p->tls_reported = FALSE;
    g_object_set(p->player, "uri", uri, NULL);
    p->loaded = p->want_playing = TRUE;
    p->last_state = NULL;
    report_state(p, "loading");
    /* A failure here also reaches the bus as GST_MESSAGE_ERROR, with the reason. */
    gst_element_set_state(p->player, GST_STATE_PLAYING);
}

static void command(Player *p, char *text) {
    char *argument = strchr(text, ' ');
    if (argument) *argument++ = 0;
    if (!strcmp(text, "uri") && argument) load(p, g_strstrip(argument));
    else if (!strcmp(text, "play") && p->loaded) { p->want_playing = TRUE; if (!p->buffering) gst_element_set_state(p->player, GST_STATE_PLAYING); }
    else if (!strcmp(text, "pause") && p->loaded) { p->want_playing = FALSE; gst_element_set_state(p->player, GST_STATE_PAUSED); }
    else if (!strcmp(text, "certdate") && argument) bp_tls_set_tolerate_date(&p->tls, argument[0] == '1');
    else if (!strcmp(text, "stop")) { unload(p); report_state(p, "stopped"); }
    else if (!strcmp(text, "quit")) g_main_loop_quit(p->loop);
}

static gboolean on_stdin(GIOChannel *channel, GIOCondition condition, gpointer data) {
    Player *p = (Player *)data;
    gchar buffer[512];
    gsize got = 0;
    if (condition & (G_IO_HUP | G_IO_ERR | G_IO_NVAL) && !(condition & G_IO_IN)) { g_main_loop_quit(p->loop); return FALSE; }
    if (g_io_channel_read_chars(channel, buffer, sizeof buffer, &got, NULL) != G_IO_STATUS_NORMAL || !got) {
        g_main_loop_quit(p->loop);
        return FALSE;
    }
    for (gsize i = 0; i < got; i++) {
        if (buffer[i] == '\n') {
            command(p, p->line->str);
            g_string_truncate(p->line, 0);
        } else if (buffer[i] != '\r') {
            if (p->line->len < 4096) g_string_append_c(p->line, buffer[i]);
        }
    }
    return TRUE;
}

static void report_tls(Player *p) {
    if (p->tls_reported) return;
    if (g_atomic_int_get(&p->tls.tolerated)) { say("tls date_tolerated"); p->tls_reported = TRUE; }
    else if (g_atomic_int_get(&p->tls.tolerate_date) && g_atomic_int_get(&p->tls.unsupported)) { say("tls date_unavailable"); p->tls_reported = TRUE; }
}

static gboolean on_bus(GstBus *bus, GstMessage *message, gpointer data) {
    (void)bus;
    Player *p = (Player *)data;
    switch (GST_MESSAGE_TYPE(message)) {
    case GST_MESSAGE_EOS:
        if (p->loaded) { unload(p); report_state(p, "ended"); }
        break;
    case GST_MESSAGE_ERROR:
        /* The first error carries the cause; what follows it ("Internal data
           stream error") is fallout, so nothing is reported once unloaded. */
        if (!p->loaded) break;
        report_tls(p);
        {
            gchar *uri = NULL;
            g_object_get(p->player, "current-uri", &uri, NULL);
            if (!uri) g_object_get(p->player, "uri", &uri, NULL);
            say("error %s", bp_error_name(bp_gst_classify(message, &p->tls, uri)));
            g_free(uri);
        }
        unload(p);
        report_state(p, "stopped");
        break;
    case GST_MESSAGE_BUFFERING: {
        gint percent = 0;
        if (!p->loaded) break;
        gst_message_parse_buffering(message, &percent);
        if (percent < 100) {
            if (!p->buffering) { p->buffering = TRUE; gst_element_set_state(p->player, GST_STATE_PAUSED); }
            report_state(p, "buffering");
        } else if (p->buffering) {
            p->buffering = FALSE;
            if (p->want_playing) gst_element_set_state(p->player, GST_STATE_PLAYING);
        }
        break;
    }
    case GST_MESSAGE_STATE_CHANGED:
        if (p->loaded && !p->buffering && GST_MESSAGE_SRC(message) == GST_OBJECT(p->player)) {
            GstState now;
            gst_message_parse_state_changed(message, NULL, &now, NULL);
            report_tls(p);
            if (now == GST_STATE_PLAYING) report_state(p, "playing");
            else if (now == GST_STATE_PAUSED && !p->want_playing) report_state(p, "paused");
        }
        break;
    default:
        break;
    }
    return TRUE;
}

int main(int argc, char **argv) {
    Player p;
    gst_init(&argc, &argv);
    memset(&p, 0, sizeof p);
    p.line = g_string_new(NULL);
    p.loop = g_main_loop_new(NULL, FALSE);
    p.player = gst_element_factory_make("playbin", "bp-player");
    if (!p.player) { say("error media_failed"); return 69; }

    const char *video = argc > 1 ? argv[1] : "none";
    if (strcmp(video, "none")) {
        GError *error = NULL;
        GstElement *sink = gst_parse_bin_from_description(video, TRUE, &error);
        if (error || !sink) { g_clear_error(&error); say("error media_failed"); return 69; }
        g_object_set(p.player, "video-sink", sink, NULL);
    } else {
        g_object_set(p.player, "video-sink", gst_element_factory_make("fakesink", NULL), NULL);
    }
    if (g_getenv("BP_NO_AUDIO")) g_object_set(p.player, "audio-sink", gst_element_factory_make("fakesink", NULL), NULL);

    bp_tls_attach(&p.tls, p.player);

    GstBus *bus = gst_element_get_bus(p.player);
    gst_bus_add_watch(bus, on_bus, &p);
    gst_object_unref(bus);
    GIOChannel *input = g_io_channel_unix_new(0);
    g_io_channel_set_encoding(input, NULL, NULL);
    g_io_channel_set_buffered(input, FALSE);
    g_io_add_watch(input, (GIOCondition)(G_IO_IN | G_IO_HUP | G_IO_ERR | G_IO_NVAL), on_stdin, &p);

    say("ready");
    g_main_loop_run(p.loop);

    gst_element_set_state(p.player, GST_STATE_NULL);
    gst_object_unref(p.player);
    g_io_channel_unref(input);
    g_string_free(p.line, TRUE);
    g_main_loop_unref(p.loop);
    return 0;
}
