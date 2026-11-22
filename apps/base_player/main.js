'use strict';
const path = require('path');
const mgu = require('./kit/mgu');
const { BackendClient } = require('./backend_client');
const { VideoBridge } = require('./video_bridge');
const { drawHome } = require('./view');
const { LogoBridge } = require('./logo_bridge');
const { MusicArtworkBridge } = require('./music_artwork_bridge');
const { diagnose, wifiDirect } = require('./diagnose');
const { t } = require('./i18n');
const appSettings = require('./app_settings');
require('./brand_logo').register(require('./kit/record').setImage);

mgu.run({ async start(ctx) {
    const { ui, log } = ctx;
    const receiver = new BackendClient(path.join(ctx.dataDir, 'airplay/control.sock'));
    receiver.connect();
    const video = new VideoBridge(ctx.display);
    const logo = new LogoBridge(ctx.display);
    const artwork = new MusicArtworkBridge(ctx.display, path.join(ctx.dataDir, 'airplay'));
    // The backend reads this when it starts a receiver or a player, so a
    // change applies from the next "Connect".
    const shareSettings = () => appSettings.save(path.join(ctx.dataDir, 'airplay'), { certDateTolerance: ctx.settings.get('certDateTolerance') === true });
    shareSettings();
    if (ctx.settings.onChange) ctx.settings.onChange(shareSettings);
    let state = receiver.state, notice = '', closing = false, controlsUntil = 0, diagnosis = '', diagnosedAt = 0;
    let mirrorResumeUntil = 0, disconnecting = null, p2pText = '', p2pAt = 0;
    const isAudio = next => next.mode === 'audio' || next.profile === 'audio';
    // The kit's own Settings action (a sheet drawn over the page, else the
    // HMI's settings list), as if BTN_SETTINGS had been pressed.
    const openSettings = () => {
        if (ctx.display && typeof ctx.display._click === 'function') ctx.display._click('BTN_SETTINGS');
        else if (ui.open) ui.open('SETTINGS');
    };
    const screenViewport = () => {
        const screen = ctx.display.gpu && ctx.display.gpu.screen;
        return screen && screen.w >= 16 && screen.h >= 16 ?
            { width: screen.w, height: screen.h } : { width: 1920, height: 720 };
    };
    const uid = process.getuid ? process.getuid() : 0;
    const unreachable = () => !receiver.socket || receiver.socket.connecting || receiver.socket.destroyed;
    ctx.display.onPresentationInput = () => {
        controlsUntil = Date.now() + 8000;
        ctx.display.setPresentation(false);
    };
    receiver.on('state', next => {
        if (next.mode === 'waiting' && next.returnMode === 'mirror' &&
            (state.mode !== 'waiting' || state.returnMode !== 'mirror')) mirrorResumeUntil = Date.now() + 5000;
        if (isAudio(next) || next.returnMode !== 'mirror' || next.frame) mirrorResumeUntil = 0;
        state = next;
        artwork.update(isAudio(state) && state.music && state.music.artwork, state.music && state.music.epoch);
        if (!state.frame || isAudio(state)) video.detach();
        if (state.error) log.warn('AirPlay: ' + state.error);
    });
    ui.onClick('BTN_START', () => {
        if (disconnecting) return;
        notice = receiver.start('auto', screenViewport()) ? '' : (diagnose(uid) || t('starting'));
    });
    ui.onClick('BTN_END_VIDEO', () => {
        if (state.mode === 'hls' || state.phase === 'loading' || state.playlistPending)
            notice = receiver.endVideo() ? '' : t('video_ctl_unavailable');
        else notice = t('no_video');
    });
    const endSession = async close => {
        controlsUntil = Date.now() + 8000;
        notice = t('disconnecting');
        if (!disconnecting) disconnecting = receiver.stop();
        try {
            await disconnecting;
            notice = '';
            if (close) { closing = true; await ui.close('MAIN'); }
        } catch (e) {
            closing = false;
            controlsUntil = Date.now() + 8000;
            notice = t('disconnect_unconfirmed');
        } finally { disconnecting = null; }
    };
    ui.onClick('BTN_STOP', () => endSession(false));
    ui.onClick('BTN_MIRROR', () => {
        if (isAudio(state)) { notice = t('start_mirror_hint'); return; }
        if (state.detached || state.mode === 'hls' || state.playlistPending) { notice = ''; receiver.resumeMirror(); controlsUntil = 0; }
        else notice = t('mirror_already');
    });
    ui.onClick('BTN_CLOSE', () => endSession(true));
    const musicControl = action => {
        const music = state.music || {}, controls = music.controls || {};
        if (disconnecting || !isAudio(state) || !controls[action]) return;
        let value;
        if (action === 'shuffle') {
            if (music.shuffle !== 0 && music.shuffle !== 1) return;
            value = music.shuffle ? 0 : 1;
        } else if (action === 'repeat') {
            if ([0, 1, 2].indexOf(music.repeat) < 0) return;
            // Off -> repeat all -> repeat one -> off.
            value = music.repeat === 0 ? 2 : music.repeat === 2 ? 1 : 0;
        }
        notice = receiver.musicControl(action, value) ? '' : t('music_ctl_unavailable');
    };
    // The BMW renderer owns display focus. CarPlay, a call, or Home may hide
    // this view without ending the phone's AirPlay session.
    ui.onVisible((name, on) => {
        if (name !== 'MAIN') return;
        if (on) closing = false;
        log.info('AirPlay view: ' + (on ? 'visible' : 'hidden'));
    });
    if (ui.onFocus) ui.onFocus((name, on) => {
        if (name === 'MAIN') log.info('AirPlay focus: ' + (on ? 'foreground' : 'background'));
    });
    // Losing the UI is different from pressing Trennen/Schließen. The backend
    // keeps audio reception alive and gives video UIs their reconnect grace.
    process.on('SIGTERM', () => { receiver.disconnect().then(() => process.exit(0)); });
    process.on('SIGINT', () => { receiver.disconnect().then(() => process.exit(0)); });
    process.on('exit', () => { artwork.drop(); receiver.disconnect(); });
    // 10 Hz: the switch between mirroring, a YouTube video and back is
    // picked up within ~100 ms. The video itself is drawn by the native
    // renderer, so this only re-records a small canvas.
    ctx.loop('MAIN', 10, async () => {
        const transitioning = !isAudio(state) && (state.phase === 'loading' ||
            (state.mode === 'waiting' && state.returnMode === 'mirror' && !!state.pin && !state.error &&
                !state.playlistPending && Date.now() < mirrorResumeUntil));
        const fullscreen = !isAudio(state) && (!!state.frame || transitioning) && Date.now() >= controlsUntil && video.ready();
        ctx.display.setPresentation(fullscreen);
        const body = ctx.display.contentSize && ctx.display.contentSize();
        const size = fullscreen ? ctx.display.gpu.screen : body || { w: 1600, h: 520 };
        receiver.setVideoViewport(size.w, size.h);
        // OP19 preserves aspect. Wait for the complete frame rescaled to the
        // current canvas instead of displaying the previous layout's bars.
        const resizing = !isAudio(state) && state.mode === 'hls' && state.frame &&
            state.frame.width * size.h !== state.frame.height * size.w;
        const c = ctx.canvas(size.w, size.h);
        if (!isAudio(state) && state.frame && !resizing && video.attach(state.file, state.frame.generation)) {
            c.clear('#000000');
            // The native output follows this exact viewport in both axes.
            video.draw(c, 0, 0, size.w, size.h, state.frame, state.mode === 'hls' ? 'stretch' : 'contain');
        } else if (transitioning || resizing) {
            c.clear('#000000');
            logo.draw(c, size.w / 2 - 32, size.h / 2 - 70, 64, 64);
            c.text(state.sender === 'android' && state.mode === 'mirror' ? t('android_wait_frame') :
                state.phase === 'loading' || resizing ? t('video_loading') : t('mirror_resuming'),
                size.w / 2, size.h / 2 + 32, 28, '#c0cedd', { font: 'airplay', align: 'center' });
        } else {
            // While the receiver service is unreachable, say why (every 2 s).
            if (!unreachable()) diagnosis = '';
            else if (Date.now() - diagnosedAt > 2000) { diagnosedAt = Date.now(); diagnosis = diagnose(uid); }
            if (Date.now() - p2pAt > 10000) { p2pAt = Date.now(); p2pText = wifiDirect(); }
            drawHome(c, p2pText ? Object.assign({}, state, { p2pText }) : state, notice || diagnosis, logo, artwork, musicControl, openSettings);
        }
        if (!closing) await ui.image('MAIN_GFX', c);
    });
} });
