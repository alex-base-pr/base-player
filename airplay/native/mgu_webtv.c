/* base-player-webtv: a web page (wpesrc) as I420 frames for mgu-render.
 *   base-player-webtv --url U --video /dev/shm/mgu-video-webtv-<uid> --width W --height H
 * stdout: "WEBTV phase loading|ready|playing|ended", "WEBTV error <[a-z0-9_]+>".
 * stdin:  "key Up|Down|Left|Right|Enter|Back", "exit".
 *
 * WebKit's hole-punch (WEBKIT_GST_HOLE_PUNCH_QUIRK=westeros) hands decoded
 * <video> frames to westerossink inside WPEWebProcess, which writes them to
 * the private file <video>-hole; the page itself is then transparent there.
 * This process is the only writer of <video>: each page frame (A420 from
 * BGRA) is alpha-blended over the latest hole frame, scaled into the
 * rectangle WebKit gave the sink. Audio: WebKit's autoaudiosink picks our
 * mguaudiosink, which plays MGU_HLS_AUDIO_SINK.
 * After "exit", SIGTERM or stdin EOF the process is gone within 1 s. */
#define _GNU_SOURCE
#include <gst/gst.h>
#include <gst/app/gstappsink.h>
#include <gst/app/gstappsrc.h>
#include <gst/video/navigation.h>
#include <gst/video/video.h>
#include <glib-unix.h>
#include <dlfcn.h>
#include <fcntl.h>
#include <limits.h>
#include <pthread.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/mman.h>
#include <sys/stat.h>
#include <unistd.h>

#define MGVF_MAGIC 0x4656474du
#define HOLE_MAX_EDGE 2048u
#define HOLE_BYTES (64u + 3u * HOLE_MAX_EDGE * HOLE_MAX_EDGE * 3u / 2u)
#define VIDEO_IDLE_US (3 * G_USEC_PER_SEC)

static GMainLoop *loop;
static GstElement *pipeline, *page_sink, *out_src;
static int exit_code;
static gboolean ready_sent, frame_seen;
static const char *video_path;
static char *hole_path;
static int width, height;
static GMutex say_lock;

typedef struct {
    int fd;
    const guint8 *map;
    dev_t device;
    ino_t inode;
    guint32 seq;
    gint64 changed;
    gboolean playing;
} Hole;
static Hole hole = {.fd = -1};

static void say(const char *kind, const char *value) {
    g_mutex_lock(&say_lock);
    printf("WEBTV %s %s\n", kind, value);
    fflush(stdout);
    g_mutex_unlock(&say_lock);
}
static gboolean quit_idle(gpointer data) { (void)data; g_main_loop_quit(loop); return G_SOURCE_REMOVE; }
static void fail(const char *code) {
    say("error", code);
    exit_code = 1;
    if (loop) g_idle_add(quit_idle, NULL);
}
static void ready(void) {
    if (ready_sent) return;
    ready_sent = TRUE;
    say("phase", "ready");
}

static const char *key_name(const char *key) {
    /* wpesrc maps names with xkb_keysym_from_name; YouTube TV treats Escape as back. */
    static const char *map[][2] = {{"Up", "Up"}, {"Down", "Down"}, {"Left", "Left"}, {"Right", "Right"},
                                   {"Enter", "Return"}, {"Back", "Escape"}};
    for (size_t i = 0; i < G_N_ELEMENTS(map); ++i)
        if (!strcmp(key, map[i][0])) return map[i][1];
    return NULL;
}
static void send_key(const char *name) {
    /* Upstream from the page appsink, through videoconvert, to wpesrc. */
    gst_element_send_event(page_sink, gst_navigation_event_new_key_press(name, GST_NAVIGATION_MODIFIER_NONE));
    gst_element_send_event(page_sink, gst_navigation_event_new_key_release(name, GST_NAVIGATION_MODIFIER_NONE));
}

static gboolean on_stdin(GIOChannel *channel, GIOCondition condition, gpointer data) {
    (void)condition; (void)data;
    gchar *line = NULL;
    GIOStatus status = g_io_channel_read_line(channel, &line, NULL, NULL, NULL);
    if (status == G_IO_STATUS_AGAIN) return TRUE;
    if (status != G_IO_STATUS_NORMAL) { g_main_loop_quit(loop); return FALSE; }
    g_strchomp(line);
    const char *mapped;
    if (!strcmp(line, "exit")) g_main_loop_quit(loop);
    else if (g_str_has_prefix(line, "key ") && (mapped = key_name(line + 4))) send_key(mapped);
    else if (*line) say("error", "bad_command");
    g_free(line);
    return TRUE;
}

static gboolean on_bus(GstBus *bus, GstMessage *message, gpointer data) {
    (void)bus; (void)data;
    switch (GST_MESSAGE_TYPE(message)) {
    case GST_MESSAGE_ERROR: {
        GError *error = NULL;
        gchar *debug = NULL;
        gst_message_parse_error(message, &error, &debug);
        g_printerr("webtv: %s: %s (%s)\n", GST_OBJECT_NAME(message->src), error->message, debug ? debug : "");
        fail(error->domain == GST_RESOURCE_ERROR ? "resource" : error->domain == GST_CORE_ERROR ? "core" : "stream");
        g_clear_error(&error); g_free(debug);
        break;
    }
    case GST_MESSAGE_EOS:
        g_main_loop_quit(loop);
        break;
    case GST_MESSAGE_ELEMENT: {
        /* wpesrc reports page load progress (percent) as "wpe-stats". */
        const GstStructure *s = gst_message_get_structure(message);
        gdouble progress;
        if (s && gst_structure_get_double(s, "estimated-load-progress", &progress) && progress >= 100.0) ready();
        break;
    }
    default:
        break;
    }
    return TRUE;
}

/* --- hole-punch frame file (written by westerossink in WPEWebProcess) --- */
static void hole_close(void) {
    if (hole.map) munmap((void *)hole.map, HOLE_BYTES);
    if (hole.fd >= 0) close(hole.fd);
    hole.map = NULL; hole.fd = -1;
}
static guint32 word(const guint8 *map, int i) {
    return GUINT32_FROM_LE(__atomic_load_n(&((const guint32 *)map)[i], __ATOMIC_ACQUIRE));
}
/* Latest video frame or NULL. Also drives "phase playing|ended". */
static const guint8 *hole_frame(guint *w, guint *h, gint rect[4]) {
    struct stat st;
    gint64 now = g_get_monotonic_time();
    if (stat(hole_path, &st) || st.st_dev != hole.device || st.st_ino != hole.inode) {
        hole_close();
        if (!stat(hole_path, &st) && S_ISREG(st.st_mode) && st.st_uid == geteuid() && st.st_size >= (off_t)HOLE_BYTES) {
            hole.fd = open(hole_path, O_RDONLY | O_NOFOLLOW | O_CLOEXEC);
            if (hole.fd >= 0) {
                void *map = mmap(NULL, HOLE_BYTES, PROT_READ, MAP_SHARED, hole.fd, 0);
                if (map == MAP_FAILED) hole_close();
                else { hole.map = map; hole.device = st.st_dev; hole.inode = st.st_ino; hole.seq = 0; }
            }
        }
    }
    const guint8 *frame = NULL;
    gboolean ended = !hole.map;
    if (hole.map && word(hole.map, 0) == MGVF_MAGIC) {
        guint32 seq = word(hole.map, 4), slot = word(hole.map, 5);
        *w = word(hole.map, 2); *h = word(hole.map, 3);
        for (int i = 0; i < 4; ++i) rect[i] = (gint)word(hole.map, 9 + i);
        if (seq != hole.seq) { hole.seq = seq; hole.changed = now; }
        ended = word(hole.map, 13) == 1 || now - hole.changed > VIDEO_IDLE_US;
        if (!ended && slot < 3 && *w >= 16 && *h >= 16 && *w <= HOLE_MAX_EDGE && *h <= HOLE_MAX_EDGE) {
            frame = hole.map + 64 + (gsize)slot * (*w) * (*h) * 3 / 2;
            if (rect[2] <= 0 || rect[3] <= 0) { rect[0] = rect[1] = 0; rect[2] = width; rect[3] = height; }
        }
    }
    if (frame && !hole.playing) { hole.playing = TRUE; say("phase", "playing"); }
    else if (ended && hole.playing) { hole.playing = FALSE; say("phase", "ended"); }
    return frame;
}

/* One plane: out = page*a + video*(1-a); video scaled (nearest) into rect,
 * black outside it. `shift` is 1 for chroma (half resolution). */
static void blend_plane(guint8 *out, const guint8 *page, gint page_stride, const guint8 *alpha, gint alpha_stride,
                        int shift, guint pw, guint ph, const guint8 *video, guint vw, guint vh,
                        const gint rect[4], guint8 black) {
    gint rx = rect[0] >> shift, ry = rect[1] >> shift, rw = MAX(rect[2] >> shift, 1), rh = MAX(rect[3] >> shift, 1);
    for (guint y = 0; y < ph; ++y) {
        const guint8 *p = page + (gsize)y * page_stride, *a = alpha + (gsize)(y << shift) * alpha_stride;
        guint8 *o = out + (gsize)y * pw;
        gint vy = ((gint)y - ry) * (gint)vh / rh;
        const guint8 *vrow = video && vy >= 0 && vy < (gint)vh && (gint)y >= ry ? video + (gsize)vy * vw : NULL;
        for (guint x = 0; x < pw; ++x) {
            guint av = a[x << shift];
            if (av == 255) { o[x] = p[x]; continue; }
            guint8 v = black;
            gint vx = ((gint)x - rx) * (gint)vw / rw;
            if (vrow && (gint)x >= rx && vx >= 0 && vx < (gint)vw) v = vrow[vx];
            o[x] = (guint8)((p[x] * av + v * (255 - av) + 127) / 255);
        }
    }
}

static GstFlowReturn on_page(GstAppSink *appsink, gpointer data) {
    (void)data;
    GstSample *sample = gst_app_sink_pull_sample(appsink);
    if (!sample) return GST_FLOW_EOS;
    GstVideoInfo info;
    GstVideoFrame in;
    if (!gst_video_info_from_caps(&info, gst_sample_get_caps(sample)) ||
        !gst_video_frame_map(&in, &info, gst_sample_get_buffer(sample), GST_MAP_READ)) {
        gst_sample_unref(sample);
        return GST_FLOW_ERROR;
    }
    if (!frame_seen) { frame_seen = TRUE; g_printerr("webtv: first page frame\n"); }
    guint pw = GST_VIDEO_INFO_WIDTH(&info), ph = GST_VIDEO_INFO_HEIGHT(&info), vw = 0, vh = 0;
    gint rect[4] = {0, 0, 0, 0};
    const guint8 *video = hole_frame(&vw, &vh, rect);
    gsize luma = (gsize)pw * ph, chroma = luma / 4;
    GstBuffer *out = gst_buffer_new_allocate(NULL, luma + 2 * chroma, NULL);
    GstMapInfo map;
    gst_buffer_map(out, &map, GST_MAP_WRITE);
    const guint8 *alpha = GST_VIDEO_FRAME_PLANE_DATA(&in, 3);
    gint alpha_stride = GST_VIDEO_FRAME_PLANE_STRIDE(&in, 3);
    guint8 black[3] = {16, 128, 128};
    for (int plane = 0; plane < 3; ++plane) {
        int shift = plane ? 1 : 0;
        guint8 *dest = map.data + (plane ? luma + (plane - 1) * chroma : 0);
        const guint8 *vplane = video ? video + (plane ? (gsize)vw * vh + (plane - 1) * ((gsize)vw * vh / 4) : 0) : NULL;
        blend_plane(dest, GST_VIDEO_FRAME_PLANE_DATA(&in, plane), GST_VIDEO_FRAME_PLANE_STRIDE(&in, plane), alpha,
                    alpha_stride, shift, pw >> shift, ph >> shift, vplane, vw >> shift, vh >> shift, rect, black[plane]);
    }
    gst_buffer_unmap(out, &map);
    GST_BUFFER_PTS(out) = GST_BUFFER_PTS(gst_sample_get_buffer(sample));
    gst_video_frame_unmap(&in);
    gst_sample_unref(sample);
    return gst_app_src_push_buffer(GST_APP_SRC(out_src), out);
}

/* User agent. wpesrc has no property for it, but it fetches the view's
 * settings through webkit_web_view_get_settings() before loading the page;
 * this executable (linked -rdynamic) interposes that call. YouTube sends the
 * default x86_64 WPE agent to the desktop site and an aarch64 one to the TV
 * UI, so the default only swaps the architecture. MGU_WEBTV_USER_AGENT wins. */
typedef struct _WebKitWebView WebKitWebView;
typedef struct _WebKitSettings WebKitSettings;
WebKitSettings *webkit_web_view_get_settings(WebKitWebView *view);
WebKitSettings *webkit_web_view_get_settings(WebKitWebView *view) {
    /* GStreamer loads plugins (and so WebKit) RTLD_LOCAL: look up in WebKit itself. */
    void *webkit = dlopen("libWPEWebKit-2.0.so.1", RTLD_LAZY | RTLD_NOLOAD);
    WebKitSettings *(*real)(WebKitWebView *) =
        webkit ? (WebKitSettings * (*)(WebKitWebView *)) dlsym(webkit, "webkit_web_view_get_settings") : NULL;
    WebKitSettings *settings = real ? real(view) : NULL;
    const char *(*get)(WebKitSettings *) =
        webkit ? (const char *(*)(WebKitSettings *))dlsym(webkit, "webkit_settings_get_user_agent") : NULL;
    void (*set)(WebKitSettings *, const char *) =
        webkit ? (void (*)(WebKitSettings *, const char *))dlsym(webkit, "webkit_settings_set_user_agent") : NULL;
    if (webkit) dlclose(webkit);
    if (settings && get && set) {
        const char *wanted = getenv("MGU_WEBTV_USER_AGENT");
        gchar *agent = NULL;
        if (wanted && *wanted) agent = g_strdup(wanted);
        else {
            gchar **parts = g_strsplit(get(settings), "x86_64", -1);
            agent = g_strjoinv("aarch64", parts);
            g_strfreev(parts);
        }
        if (g_strcmp0(agent, get(settings))) set(settings, agent);
        g_free(agent);
    }
    return settings;
}

static gboolean ready_fallback(gpointer data) {
    (void)data;
    if (frame_seen) ready(); /* no load-progress messages: frames are flowing */
    return G_SOURCE_CONTINUE;
}
static gboolean on_signal(gpointer data) { (void)data; g_main_loop_quit(loop); return G_SOURCE_REMOVE; }

static void *exit_watchdog(void *data) {
    (void)data;
    g_usleep(800 * 1000); /* WebKit teardown can hang; the app kills us at 1 s */
    fflush(stdout);
    _exit(exit_code);
    return NULL;
}

static void default_env(const char *name, const char *value) {
    if (!getenv(name)) setenv(name, value, 1);
}
static void bundle_env(void) {
    /* Started as <runtime>/lib/ld-linux-x86-64.so.2 <runtime>/libexec/base-player-webtv. */
    char exe[PATH_MAX];
    ssize_t n = readlink("/proc/self/exe", exe, sizeof exe - 1);
    if (n <= 0) return;
    exe[n] = 0;
    gchar *lib = g_path_get_dirname(exe), *runtime = g_path_get_dirname(lib);
    /* The bundled GnuTLS reads its trust store from etc/ca-certificates.crt
     * relative to the working directory (build_webtv.py); WebKit's helper
     * processes inherit it. */
    if (chdir(runtime)) g_printerr("webtv: chdir %s failed\n", runtime);
    const char *cache_root = getenv("XDG_CACHE_HOME");
    gchar *cache = cache_root ? g_strdup(cache_root) : g_build_filename(g_get_home_dir(), ".cache", NULL);
    gchar *own = g_build_filename(cache, "base-player-webtv", NULL);
    g_mkdir_with_parents(own, 0700);
    struct { const char *name; gchar *value; } paths[] = {
        {"GST_PLUGIN_PATH_1_0", g_build_filename(runtime, "plugins", NULL)},
        {"GST_REGISTRY_1_0", g_build_filename(own, "gst-registry.bin", NULL)},
        {"GIO_MODULE_DIR", g_build_filename(runtime, "gio", NULL)},
        {"FONTCONFIG_FILE", g_build_filename(runtime, "etc/fonts/fonts.conf", NULL)},
        {"LIBGL_DRIVERS_PATH", g_build_filename(runtime, "lib/dri", NULL)},
        {"GBM_BACKENDS_PATH", g_build_filename(runtime, "lib/gbm", NULL)},
        {"__EGL_VENDOR_LIBRARY_FILENAMES", g_build_filename(runtime, "etc/egl/50_mesa.json", NULL)},
        {"MESA_SHADER_CACHE_DIR", g_build_filename(own, "mesa", NULL)},
        {"XDG_CACHE_HOME", g_strdup(cache)},
        {"XDG_DATA_HOME", g_build_filename(own, "data", NULL)},
    };
    for (size_t i = 0; i < G_N_ELEMENTS(paths); ++i) { default_env(paths[i].name, paths[i].value); g_free(paths[i].value); }
    default_env("GST_PLUGIN_SYSTEM_PATH_1_0", "");
    default_env("GST_REGISTRY_FORK", "no");
    /* "1", not "true": wpesrc ignores downstream size caps when it is "true". */
    default_env("LIBGL_ALWAYS_SOFTWARE", "1");
    default_env("WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS", "1");
    default_env("WEBKIT_GST_HOLE_PUNCH_QUIRK", "westeros");
    /* H.264 is the cheapest software decode on the head unit's CPU. */
    default_env("GST_PLUGIN_FEATURE_RANK", "vp9dec:NONE,avdec_vp9:NONE,av1dec:NONE,avdec_av1:NONE");
    setenv("MGU_WEBTV_HOLE_LOCATION", hole_path, 1);
    g_free(own); g_free(cache); g_free(lib); g_free(runtime);
}

static gboolean even_size(const char *text, int *out) {
    char *end = NULL;
    long v = text ? strtol(text, &end, 10) : 0;
    if (!text || *end || v < 16 || v > 2048 || (v & 1)) return FALSE;
    *out = (int)v;
    return TRUE;
}
static gboolean valid_video(const char *p) {
    const char *prefix = "/dev/shm/mgu-video-webtv-";
    if (!p || !g_str_has_prefix(p, prefix) || strlen(p + strlen("/dev/shm/mgu-video-")) > 59) return FALSE;
    for (p += strlen(prefix); *p; ++p)
        if (!g_ascii_isalnum(*p) && *p != '-' && *p != '_') return FALSE;
    return TRUE;
}

int main(int argc, char **argv) {
    const char *url = NULL;
    gboolean ok = TRUE;
    setvbuf(stdout, NULL, _IOLBF, 0);
    for (int i = 1; i < argc; ++i) {
        const char *value = i + 1 < argc ? argv[i + 1] : NULL;
        if (!strcmp(argv[i], "--url")) url = value;
        else if (!strcmp(argv[i], "--video")) video_path = value;
        else if (!strcmp(argv[i], "--width")) ok = ok && even_size(value, &width);
        else if (!strcmp(argv[i], "--height")) ok = ok && even_size(value, &height);
        else { ok = FALSE; break; }
        ++i;
    }
    if (!ok || !url || !width || !height || !valid_video(video_path) ||
        !(g_str_has_prefix(url, "https://") || g_str_has_prefix(url, "http://"))) {
        say("error", "args");
        g_printerr("usage: base-player-webtv --url https://... --video /dev/shm/mgu-video-webtv-<id> --width W --height H\n");
        return 2;
    }
    hole_path = g_strconcat(video_path, "-hole", NULL);
    bundle_env();
    gst_init(NULL, NULL);
    GError *error = NULL;
    /* framerate pinned right after wpesrc: it renders at the negotiated rate.
     * async=false: the out branch only gets buffers from on_page(), so the
     * sinks must not wait for each other's preroll. */
    gchar *description = g_strdup_printf(
        "wpesrc name=page draw-background=true ! video/x-raw,format=BGRA,width=%d,height=%d,framerate=30/1 ! "
        "videoconvert ! video/x-raw,format=A420 ! appsink name=pagesink sync=false async=false max-buffers=1 drop=true "
        "appsrc name=out is-live=true format=time do-timestamp=false "
        "caps=video/x-raw,format=I420,width=%d,height=%d,framerate=30/1 ! mguvideosink name=sink sync=false async=false",
        width, height, width, height);
    pipeline = gst_parse_launch(description, &error);
    g_free(description);
    if (!pipeline || error) {
        g_printerr("webtv: %s\n", error ? error->message : "pipeline");
        say("error", "pipeline");
        return 1;
    }
    GstElement *page = gst_bin_get_by_name(GST_BIN(pipeline), "page");
    GstElement *sink = gst_bin_get_by_name(GST_BIN(pipeline), "sink");
    page_sink = gst_bin_get_by_name(GST_BIN(pipeline), "pagesink");
    out_src = gst_bin_get_by_name(GST_BIN(pipeline), "out");
    g_object_set(page, "location", url, NULL);
    g_object_set(sink, "location", video_path, NULL);
    GstAppSinkCallbacks callbacks = {.new_sample = on_page};
    gst_app_sink_set_callbacks(GST_APP_SINK(page_sink), &callbacks, NULL, NULL);
    loop = g_main_loop_new(NULL, FALSE);
    GstBus *bus = gst_element_get_bus(pipeline);
    gst_bus_add_watch(bus, on_bus, NULL);
    gst_object_unref(bus);
    GIOChannel *in = g_io_channel_unix_new(STDIN_FILENO);
    g_io_add_watch(in, G_IO_IN | G_IO_HUP | G_IO_ERR, on_stdin, NULL);
    g_timeout_add_seconds(5, ready_fallback, NULL);
    g_unix_signal_add(SIGTERM, on_signal, NULL);
    g_unix_signal_add(SIGINT, on_signal, NULL);
    say("phase", "loading");
    if (gst_element_set_state(pipeline, GST_STATE_PLAYING) == GST_STATE_CHANGE_FAILURE) say("error", "pipeline"), exit_code = 1;
    else g_main_loop_run(loop);
    /* Teardown may crash or hang in WebKit: drop our frame file first. */
    unlink(video_path);
    pthread_t watchdog;
    pthread_create(&watchdog, NULL, exit_watchdog, NULL);
    gst_element_set_state(pipeline, GST_STATE_NULL);
    hole_close();
    gst_object_unref(page); gst_object_unref(sink); gst_object_unref(page_sink); gst_object_unref(out_src);
    gst_object_unref(pipeline);
    g_io_channel_unref(in);
    g_main_loop_unref(loop);
    return exit_code;
}
