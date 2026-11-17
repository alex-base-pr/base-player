# Base Player native part. GPL-3.0-or-later.
#   make test     pure-C classifier tests (needs only cc)
#   make test-gst tls-validation-flags hook (needs GStreamer)
#   make          bp-player (needs GStreamer + GIO dev files via pkg-config)
# Cross-building for the MGU: set CC and PKG_CONFIG to the toolchain's.
CC ?= cc
PKG_CONFIG ?= pkg-config
CFLAGS ?= -O2
WARN = -std=c99 -Wall -Wextra -Werror
BUILD = build
GST_PKGS = gstreamer-1.0 gio-2.0

all: $(BUILD)/bp-player

$(BUILD):
	mkdir -p $(BUILD)

$(BUILD)/test_error: test_error.c bp_error.c bp_error.h | $(BUILD)
	$(CC) $(CFLAGS) $(WARN) -o $@ test_error.c bp_error.c

$(BUILD)/bp-player: bp_player.c bp_gst.c bp_error.c bp_gst.h bp_error.h | $(BUILD)
	$(CC) $(CFLAGS) $(WARN) -D_POSIX_C_SOURCE=200809L `$(PKG_CONFIG) --cflags $(GST_PKGS)` -o $@ \
		bp_player.c bp_gst.c bp_error.c `$(PKG_CONFIG) --libs $(GST_PKGS)`

$(BUILD)/test_tls_hook: test_tls_hook.c bp_gst.c bp_error.c bp_gst.h bp_error.h | $(BUILD)
	$(CC) $(CFLAGS) $(WARN) -D_POSIX_C_SOURCE=200809L `$(PKG_CONFIG) --cflags $(GST_PKGS)` -o $@ \
		test_tls_hook.c bp_gst.c bp_error.c `$(PKG_CONFIG) --libs $(GST_PKGS)`

test: $(BUILD)/test_error
	$(BUILD)/test_error

test-gst: $(BUILD)/test_tls_hook
	$(BUILD)/test_tls_hook

clean:
	rm -rf $(BUILD)

.PHONY: all test test-gst clean
