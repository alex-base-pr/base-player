/* Private MGU AirPlay prototype: I420 frames to mgu-render's MGVF protocol. */
#define _GNU_SOURCE
#include <gst/video/gstvideosink.h>
#include <gst/video/video.h>
#include <errno.h>
#include <fcntl.h>
#include <stdint.h>
#include <string.h>
#include <sys/mman.h>
#include <sys/stat.h>
#include <unistd.h>

#define SLOT_COUNT 3u
#define MAX_EDGE 2048u
#define MAP_BYTES (64u + SLOT_COUNT * MAX_EDGE * MAX_EDGE * 3u / 2u)
#define MGVF_MAGIC 0x4656474du
#ifndef PACKAGE
#define PACKAGE "base-player-rt"
#endif

typedef struct {
    int fd;
    guint8 *map;
    char *path;
    dev_t device;
    ino_t inode;
    unsigned refs;
    guint32 seq;
    guint32 slot;
} FrameFile;

typedef struct {
    GstVideoSink parent;
    char *location;
    GstVideoInfo info;
    gboolean have_caps;
    FrameFile *file;
} MguVideoSink;
typedef struct { GstVideoSinkClass parent; } MguVideoSinkClass;

G_DEFINE_TYPE(MguVideoSink, mgu_video_sink, GST_TYPE_VIDEO_SINK)
static GMutex file_lock;
static FrameFile *shared_file;
enum { PROP_0, PROP_LOCATION };

static gboolean valid_path(const char *p) {
    const char *prefix = "/dev/shm/mgu-video-";
    if (!p || !g_str_has_prefix(p, prefix)) return FALSE;
    p += strlen(prefix);
    if (!*p || *p == '.' || strlen(p) > 64) return FALSE;
    for (; *p; ++p)
        if (!g_ascii_isalnum(*p) && *p != '-' && *p != '_' && *p != '.') return FALSE;
    return TRUE;
}

static gboolean sink_start(GstBaseSink *base) {
    MguVideoSink *self = (MguVideoSink *)base;
    gboolean ok = FALSE;
    g_mutex_lock(&file_lock);
    if (!valid_path(self->location)) goto done;
    if (shared_file) {
        if (strcmp(shared_file->path, self->location)) goto done;
        shared_file->refs++;
        self->file = shared_file;
        ok = TRUE;
        goto done;
    }
    int fd = open(self->location, O_RDWR | O_CREAT | O_EXCL | O_NOFOLLOW | O_CLOEXEC, 0600);
    if (fd < 0) goto done;
    struct stat st;
    if (fstat(fd, &st) || !S_ISREG(st.st_mode) || st.st_uid != geteuid() || st.st_nlink != 1 ||
        ftruncate(fd, MAP_BYTES)) {
        close(fd);
        unlink(self->location);
        goto done;
    }
    guint8 *map = mmap(NULL, MAP_BYTES, PROT_READ | PROT_WRITE, MAP_SHARED, fd, 0);
    if (map == MAP_FAILED) { close(fd); unlink(self->location); goto done; }
    FrameFile *file = g_new0(FrameFile, 1);
    file->fd = fd; file->map = map; file->path = g_strdup(self->location);
    file->device = st.st_dev; file->inode = st.st_ino; file->refs = 1;
    memset(map, 0, 64);
    shared_file = self->file = file;
    ok = TRUE;
done:
    g_mutex_unlock(&file_lock);
    if (!ok) GST_ELEMENT_ERROR(self, RESOURCE, OPEN_WRITE,
                              ("Cannot create private MGU frame file"), ("%s", g_strerror(errno)));
    return ok;
}

static gboolean sink_stop(GstBaseSink *base) {
    MguVideoSink *self = (MguVideoSink *)base;
    g_mutex_lock(&file_lock);
    FrameFile *file = self->file;
    self->file = NULL;
    if (file && --file->refs == 0) {
        struct stat st;
        munmap(file->map, MAP_BYTES);
        close(file->fd);
        if (!lstat(file->path, &st) && st.st_dev == file->device && st.st_ino == file->inode)
            unlink(file->path);
        g_free(file->path); g_free(file);
        shared_file = NULL;
    }
    g_mutex_unlock(&file_lock);
    return TRUE;
}

static gboolean sink_caps(GstBaseSink *base, GstCaps *caps) {
    MguVideoSink *self = (MguVideoSink *)base;
    GstVideoInfo info;
    if (!gst_video_info_from_caps(&info, caps) || GST_VIDEO_INFO_FORMAT(&info) != GST_VIDEO_FORMAT_I420)
        return FALSE;
    guint w = GST_VIDEO_INFO_WIDTH(&info), h = GST_VIDEO_INFO_HEIGHT(&info);
    if (w < 16 || h < 16 || w > MAX_EDGE || h > MAX_EDGE || (w & 1) || (h & 1)) return FALSE;
    self->info = info; self->have_caps = TRUE;
    return TRUE;
}

static GstFlowReturn sink_frame(GstVideoSink *sink, GstBuffer *buffer) {
    MguVideoSink *self = (MguVideoSink *)sink;
    GstVideoFrame frame;
    if (!self->have_caps || !gst_video_frame_map(&frame, &self->info, buffer, GST_MAP_READ))
        return GST_FLOW_NOT_NEGOTIATED;
    guint w = GST_VIDEO_INFO_WIDTH(&self->info), h = GST_VIDEO_INFO_HEIGHT(&self->info);
    gsize size = (gsize)w * h * 3 / 2;
    g_mutex_lock(&file_lock);
    FrameFile *file = self->file;
    if (!file) { g_mutex_unlock(&file_lock); gst_video_frame_unmap(&frame); return GST_FLOW_FLUSHING; }
    guint next = (file->slot + 1) % SLOT_COUNT;
    guint8 *dest = file->map + 64 + next * size;
    for (guint plane = 0; plane < 3; ++plane) {
        guint rows = plane ? h / 2 : h, columns = plane ? w / 2 : w;
        guint8 *src = GST_VIDEO_FRAME_PLANE_DATA(&frame, plane);
        gint stride = GST_VIDEO_FRAME_PLANE_STRIDE(&frame, plane);
        if ((guint)stride == columns) {
            /* Tightly packed plane (the 1280x720 output): one copy. */
            memcpy(dest, src, (gsize)rows * columns);
            dest += (gsize)rows * columns;
        } else for (guint row = 0; row < rows; ++row) {
            memcpy(dest, src + (gssize)row * stride, columns);
            dest += columns;
        }
    }
    guint32 *header = (guint32 *)file->map;
    header[0] = GUINT32_TO_LE(MGVF_MAGIC); header[1] = GUINT32_TO_LE(1);
    header[2] = GUINT32_TO_LE(w); header[3] = GUINT32_TO_LE(h);
    header[6] = GUINT32_TO_LE(SLOT_COUNT);
    header[7] = GUINT32_TO_LE(self->info.colorimetry.matrix == GST_VIDEO_COLOR_MATRIX_BT709 ? 1 : 0);
    header[8] = GUINT32_TO_LE(self->info.colorimetry.range == GST_VIDEO_COLOR_RANGE_0_255 ? 1 : 0);
    __atomic_store_n(&header[5], GUINT32_TO_LE(next), __ATOMIC_RELEASE);
    file->slot = next; file->seq++;
    __atomic_store_n(&header[4], GUINT32_TO_LE(file->seq), __ATOMIC_RELEASE);
    g_mutex_unlock(&file_lock);
    gst_video_frame_unmap(&frame);
    return GST_FLOW_OK;
}

static void set_property(GObject *object, guint id, const GValue *value, GParamSpec *spec) {
    MguVideoSink *self = (MguVideoSink *)object;
    if (id == PROP_LOCATION && !self->file) { g_free(self->location); self->location = g_value_dup_string(value); }
    else G_OBJECT_WARN_INVALID_PROPERTY_ID(object, id, spec);
}
static void get_property(GObject *object, guint id, GValue *value, GParamSpec *spec) {
    if (id == PROP_LOCATION) g_value_set_string(value, ((MguVideoSink *)object)->location);
    else G_OBJECT_WARN_INVALID_PROPERTY_ID(object, id, spec);
}
static void finalize(GObject *object) {
    MguVideoSink *self = (MguVideoSink *)object;
    if (self->file) sink_stop(GST_BASE_SINK(self));
    g_free(self->location);
    G_OBJECT_CLASS(mgu_video_sink_parent_class)->finalize(object);
}
static void mgu_video_sink_class_init(MguVideoSinkClass *klass) {
    GObjectClass *object = G_OBJECT_CLASS(klass);
    GstElementClass *element = GST_ELEMENT_CLASS(klass);
    object->set_property = set_property; object->get_property = get_property; object->finalize = finalize;
    g_object_class_install_property(object, PROP_LOCATION,
        g_param_spec_string("location", "Frame file", "Private mgu-render frame path", NULL,
                            G_PARAM_READWRITE | G_PARAM_STATIC_STRINGS));
    GstCaps *caps = gst_caps_from_string("video/x-raw,format=I420,width=[16,2048],height=[16,2048],framerate=[0/1,240/1]");
    GstPadTemplate *pad = gst_pad_template_new("sink", GST_PAD_SINK, GST_PAD_ALWAYS, caps);
    gst_element_class_add_pad_template(element, pad); gst_caps_unref(caps);
    gst_element_class_set_static_metadata(element, "MGU video sink", "Sink/Video",
        "I420 shared frame transport for mgu-render", "MGU AirPlay prototype");
    GstBaseSinkClass *base = GST_BASE_SINK_CLASS(klass);
    base->start = sink_start; base->stop = sink_stop; base->set_caps = sink_caps;
    GST_VIDEO_SINK_CLASS(klass)->show_frame = sink_frame;
}
static void mgu_video_sink_init(MguVideoSink *self) { gst_video_info_init(&self->info); }

#ifdef MGU_WESTEROS_SINK
#include <stdio.h>
#include <stdlib.h>
/* Web TV build only (base-player-webtv).
 * westerossink: WebKit's hole-punch quirk (WEBKIT_GST_HOLE_PUNCH_QUIRK=westeros)
 * creates it by name inside WPEWebProcess and sets "rectangle" and "zorder".
 * Frames go to MGU_WEBTV_HOLE_LOCATION, a file private to base-player-webtv
 * (never handed to mgu-render), which composites the page over it. Words
 * 9..12 of its header hold the rectangle, word 13 is 1 after EOS.
 * mguaudiosink: Sink/Audio bin of MGU_HLS_AUDIO_SINK with a high rank, so
 * WebKit's autoaudiosink plays to the device the app chose. */
typedef struct { MguVideoSink parent; char *rectangle; gint rect[4]; gfloat zorder; guint res_usage; } GstWesterosSink;
typedef struct { MguVideoSinkClass parent; } GstWesterosSinkClass;
/* Type name GstWesterosSink: WebKit's westeros quirk compares G_OBJECT_TYPE_NAME. */
G_DEFINE_TYPE(GstWesterosSink, gst_westeros_sink, mgu_video_sink_get_type())
enum { WPROP_0, WPROP_RECTANGLE, WPROP_ZORDER, WPROP_RES_USAGE };

static gboolean parse_rectangle(const char *text, gint out[4]) {
    int x, y, w, h, end = 0;
    if (!text || strlen(text) > 48 || sscanf(text, "%d,%d,%d,%d%n", &x, &y, &w, &h, &end) != 4 || text[end] ||
        w < 0 || h < 0)
        return FALSE;
    out[0] = x; out[1] = y; out[2] = w; out[3] = h;
    return TRUE;
}
static void westeros_header(GstWesterosSink *self, guint32 eos) {
    MguVideoSink *sink = (MguVideoSink *)self;
    g_mutex_lock(&file_lock);
    if (sink->file) {
        guint32 *header = (guint32 *)sink->file->map;
        for (int i = 0; i < 4; ++i) header[9 + i] = GUINT32_TO_LE((guint32)self->rect[i]);
        __atomic_store_n(&header[13], GUINT32_TO_LE(eos), __ATOMIC_RELEASE);
    }
    g_mutex_unlock(&file_lock);
}
static void westeros_set_property(GObject *object, guint id, const GValue *value, GParamSpec *spec) {
    GstWesterosSink *self = (GstWesterosSink *)object;
    gint rect[4];
    if (id == WPROP_RECTANGLE) {
        if (!parse_rectangle(g_value_get_string(value), rect)) return;
        GST_OBJECT_LOCK(self);
        g_free(self->rectangle); self->rectangle = g_value_dup_string(value);
        memcpy(self->rect, rect, sizeof rect);
        GST_OBJECT_UNLOCK(self);
    } else if (id == WPROP_ZORDER) self->zorder = g_value_get_float(value);
    else if (id == WPROP_RES_USAGE) self->res_usage = g_value_get_uint(value);
    else G_OBJECT_WARN_INVALID_PROPERTY_ID(object, id, spec);
}
static void westeros_get_property(GObject *object, guint id, GValue *value, GParamSpec *spec) {
    GstWesterosSink *self = (GstWesterosSink *)object;
    if (id == WPROP_RECTANGLE) g_value_set_string(value, self->rectangle);
    else if (id == WPROP_ZORDER) g_value_set_float(value, self->zorder);
    else if (id == WPROP_RES_USAGE) g_value_set_uint(value, self->res_usage);
    else G_OBJECT_WARN_INVALID_PROPERTY_ID(object, id, spec);
}
static void westeros_finalize(GObject *object) {
    g_free(((GstWesterosSink *)object)->rectangle);
    G_OBJECT_CLASS(gst_westeros_sink_parent_class)->finalize(object);
}
static gboolean westeros_start(GstBaseSink *base) {
    MguVideoSink *sink = (MguVideoSink *)base;
    if (!sink->location) sink->location = g_strdup(g_getenv("MGU_WEBTV_HOLE_LOCATION"));
    return GST_BASE_SINK_CLASS(gst_westeros_sink_parent_class)->start(base);
}
static gboolean westeros_event(GstBaseSink *base, GstEvent *event) {
    if (GST_EVENT_TYPE(event) == GST_EVENT_EOS) westeros_header((GstWesterosSink *)base, 1);
    return GST_BASE_SINK_CLASS(gst_westeros_sink_parent_class)->event(base, event);
}
static GstFlowReturn westeros_frame(GstVideoSink *sink, GstBuffer *buffer) {
    GstFlowReturn result = GST_VIDEO_SINK_CLASS(gst_westeros_sink_parent_class)->show_frame(sink, buffer);
    if (result == GST_FLOW_OK) westeros_header((GstWesterosSink *)sink, 0);
    return result;
}
static void gst_westeros_sink_class_init(GstWesterosSinkClass *klass) {
    GObjectClass *object = G_OBJECT_CLASS(klass);
    object->set_property = westeros_set_property; object->get_property = westeros_get_property;
    object->finalize = westeros_finalize;
    g_object_class_install_property(object, WPROP_RECTANGLE,
        g_param_spec_string("rectangle", "Rectangle", "Video area in page pixels: x,y,w,h", NULL,
                            G_PARAM_READWRITE | G_PARAM_STATIC_STRINGS));
    g_object_class_install_property(object, WPROP_ZORDER,
        g_param_spec_float("zorder", "Z order", "Accepted for WebKit's westeros quirk", 0.0f, 1.0f, 0.0f,
                           G_PARAM_READWRITE | G_PARAM_STATIC_STRINGS));
    g_object_class_install_property(object, WPROP_RES_USAGE,
        g_param_spec_uint("res-usage", "Resource usage", "Accepted for WebKit's westeros quirk", 0, G_MAXUINT, 1,
                          G_PARAM_READWRITE | G_PARAM_STATIC_STRINGS));
    gst_element_class_set_static_metadata(GST_ELEMENT_CLASS(klass), "MGU hole-punch video sink", "Sink/Video",
        "WebKit hole-punch video to a private Web TV frame file", "MGU AirPlay prototype");
    GstBaseSinkClass *base = GST_BASE_SINK_CLASS(klass);
    base->start = westeros_start; base->event = westeros_event;
    GST_VIDEO_SINK_CLASS(klass)->show_frame = westeros_frame;
}
static void gst_westeros_sink_init(GstWesterosSink *self) { self->res_usage = 1; }

typedef struct { GstBin parent; GstPad *ghost; GstElement *inner; GstElement *device; gint64 ts_offset; } MguAudioSink;
typedef struct { GstBinClass parent; } MguAudioSinkClass;
G_DEFINE_TYPE(MguAudioSink, mgu_audio_sink, GST_TYPE_BIN)
static GstStaticPadTemplate audio_template = GST_STATIC_PAD_TEMPLATE("sink", GST_PAD_SINK, GST_PAD_ALWAYS,
                                                                     GST_STATIC_CAPS("audio/x-raw"));
enum { APROP_0, APROP_TS_OFFSET };
static GstElement *audio_device(GstElement *bin) {
    /* The last sink inside the parsed description (alsasink, fakesink...). */
    GstElement *found = NULL;
    GstIterator *it = gst_bin_iterate_sinks(GST_BIN(bin));
    GValue item = G_VALUE_INIT;
    if (gst_iterator_next(it, &item) == GST_ITERATOR_OK) found = g_value_dup_object(&item);
    g_value_unset(&item);
    gst_iterator_free(it);
    return found;
}
/* WebKit sets ts-offset (A/V sync) on the platform audio sink. */
static void audio_set_property(GObject *object, guint id, const GValue *value, GParamSpec *spec) {
    MguAudioSink *self = (MguAudioSink *)object;
    if (id != APROP_TS_OFFSET) { G_OBJECT_WARN_INVALID_PROPERTY_ID(object, id, spec); return; }
    self->ts_offset = g_value_get_int64(value);
    if (self->device && g_object_class_find_property(G_OBJECT_GET_CLASS(self->device), "ts-offset"))
        g_object_set(self->device, "ts-offset", self->ts_offset, NULL);
}
static void audio_get_property(GObject *object, guint id, GValue *value, GParamSpec *spec) {
    if (id == APROP_TS_OFFSET) g_value_set_int64(value, ((MguAudioSink *)object)->ts_offset);
    else G_OBJECT_WARN_INVALID_PROPERTY_ID(object, id, spec);
}
static void audio_dispose(GObject *object) {
    g_clear_object(&((MguAudioSink *)object)->device);
    G_OBJECT_CLASS(mgu_audio_sink_parent_class)->dispose(object);
}
static GstStateChangeReturn audio_change_state(GstElement *element, GstStateChange transition) {
    MguAudioSink *self = (MguAudioSink *)element;
    if (transition == GST_STATE_CHANGE_NULL_TO_READY && !self->inner) {
        /* Never autoaudiosink here: it would pick this element again. */
        const char *target = g_getenv("MGU_HLS_AUDIO_SINK");
        gchar *description = g_strdup_printf("audioconvert ! audioresample ! %s",
                                             target && *target && !strstr(target, "autoaudiosink") ? target : "alsasink");
        GError *error = NULL;
        self->inner = gst_parse_bin_from_description(description, TRUE, &error);
        g_free(description);
        if (!self->inner) {
            GST_ELEMENT_ERROR(self, CORE, FAILED, ("MGU_HLS_AUDIO_SINK"), ("%s", error ? error->message : "?"));
            g_clear_error(&error);
            return GST_STATE_CHANGE_FAILURE;
        }
        gst_bin_add(GST_BIN(self), self->inner);
        self->device = audio_device(self->inner);
        if (self->device && g_object_class_find_property(G_OBJECT_GET_CLASS(self->device), "ts-offset"))
            g_object_set(self->device, "ts-offset", self->ts_offset, NULL);
        GstPad *target_pad = gst_element_get_static_pad(self->inner, "sink");
        gst_ghost_pad_set_target(GST_GHOST_PAD(self->ghost), target_pad);
        gst_object_unref(target_pad);
    }
    return GST_ELEMENT_CLASS(mgu_audio_sink_parent_class)->change_state(element, transition);
}
static void mgu_audio_sink_class_init(MguAudioSinkClass *klass) {
    GstElementClass *element = GST_ELEMENT_CLASS(klass);
    GObjectClass *object = G_OBJECT_CLASS(klass);
    object->set_property = audio_set_property; object->get_property = audio_get_property;
    object->dispose = audio_dispose;
    g_object_class_install_property(object, APROP_TS_OFFSET,
        g_param_spec_int64("ts-offset", "TS offset", "Passed to the device sink", G_MININT64, G_MAXINT64, 0,
                           G_PARAM_READWRITE | G_PARAM_STATIC_STRINGS));
    gst_element_class_add_static_pad_template(element, &audio_template);
    gst_element_class_set_static_metadata(element, "MGU audio sink", "Sink/Audio",
        "Plays to the GStreamer sink description in MGU_HLS_AUDIO_SINK", "MGU AirPlay prototype");
    element->change_state = audio_change_state;
}
static void mgu_audio_sink_init(MguAudioSink *self) {
    self->ghost = gst_ghost_pad_new_no_target_from_template("sink", gst_static_pad_template_get(&audio_template));
    gst_element_add_pad(GST_ELEMENT(self), self->ghost);
    GST_OBJECT_FLAG_SET(self, GST_ELEMENT_FLAG_SINK);
}
#endif

static gboolean plugin_init(GstPlugin *plugin) {
#ifdef MGU_WESTEROS_SINK
    if (!gst_element_register(plugin, "westerossink", GST_RANK_NONE, gst_westeros_sink_get_type()) ||
        !gst_element_register(plugin, "mguaudiosink", GST_RANK_PRIMARY + 100, mgu_audio_sink_get_type()))
        return FALSE;
#endif
    return gst_element_register(plugin, "mguvideosink", GST_RANK_NONE, mgu_video_sink_get_type());
}
GST_PLUGIN_DEFINE(GST_VERSION_MAJOR, GST_VERSION_MINOR, mguvideo, "MGU I420 frame sink",
                  plugin_init, "0.1.0", "Proprietary", PACKAGE, "https://github.com/FDH2/UxPlay")
