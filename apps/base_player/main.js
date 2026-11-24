'use strict';
const path = require('path');
const mgu = require('./kit/mgu');
const { BackendClient } = require('./backend_client');
const { VideoBridge, frameLuma } = require('./video_bridge');
const { drawHome, drawVideoControls } = require('./view');
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
    const shareSettings = () => appSettings.save(path.join(ctx.dataDir, 'airplay'), {
        certDateTolerance: ctx.settings.get('certDateTolerance') === true, webTv: ctx.settings.get('webTv') === true });
    shareSettings();
    if (ctx.settings.onChange) ctx.settings.onChange(shareSettings);
    let state = receiver.state, notice = '', closing = false, controlsUntil = 0, diagnosis = '', diagnosedAt = 0;
    let mirrorResumeUntil = 0, disconnecting = null, p2pText = '', p2pAt = 0;
    const isAudio = next => next.mode === 'audio' || next.profile === 'audio';
    // A control drawn on the page presses the bar button it stands for, as
    // the HMI does (for Settings: the kit's sheet over the page, else the
    // HMI's settings list).
    // LOG in the header: the event log's last lines on this screen.
    let logView = null, logAsked = 0;
    receiver.on('log', answer => { if (logView) logView = { lines: answer.lines, url: answer.url || '', loading: false }; });
    const press = id => {
        if (id === 'WEBTV') { startWebTv(); return; }
        if (id === 'END_VIDEO') { endVideo(); return; }
        if (id === 'MIRROR') { toMirror(); return; }
        if (id === 'LOG') {
            logView = logView ? null : { lines: [], url: '', loading: true };
            if (logView) { logAsked = Date.now(); receiver.requestLog(12); }
            log.info('Base Player log view: ' + (logView ? 'open' : 'closed'));
            return;
        }
        if (ctx.display && typeof ctx.display._click === 'function') ctx.display._click(id);
        else if (id === 'BTN_SETTINGS' && ui.open) ui.open('SETTINGS');
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
    // Experimental Web TV: its setting is listed only while the optional
    // package is installed; the entry is on the Ready screen.
    const webTvSetting = ctx.settings.item && ctx.settings.item('webTv');
    const webTvOn = () => ctx.settings.get('webTv') === true && state.webTvAvailable === true;
    // Direct video that stops sending frames must not leave a black screen
    // without buttons: after STALL_MS the page comes back with the controls.
    // (Mirroring an unchanged iPhone screen sends no frames; it is exempt.)
    const STALL_MS = 8000;
    let frameKey = '', frameAt = Date.now();
    // A black picture (a locked iPhone keeps mirroring black) for BLACK_MS
    // also returns to the page. Checked once a second on a few luma rows.
    const BLACK_MS = 6000, BLACK_LUMA = 24;
    let lumaAt = 0, darkSince = 0;
    const black = () => {
        if (!state.frame || !state.file || isAudio(state)) { darkSince = 0; return false; }
        if (Date.now() - lumaAt >= 1000) {
            lumaAt = Date.now();
            const luma = frameLuma(state.file);
            darkSince = luma !== null && luma < BLACK_LUMA ? darkSince || Date.now() : 0;
        }
        return !!darkSince && Date.now() - darkSince > BLACK_MS;
    };
    const stalled = () => !!state.frame && state.mode !== 'mirror' && state.mode !== 'webtv' && Date.now() - frameAt > STALL_MS;
    let webTvRequested = false, lastKey = '', keyCount = 0, keyAt = 0;
    const startWebTv = () => {
        if (disconnecting) return;
        controlsUntil = 0;
        webTvRequested = webTvOn() && receiver.webTvStart();
        notice = webTvRequested ? '' : t('webtv_unavailable');
    };
    const stopWebTv = () => { webTvRequested = false; return receiver.webTvStop(); };
    // Fullscreen Web TV gets the controller: turn up/down, push arrows,
    // press OK, a long push left is Back (the HMI keeps the BACK button).
    const TILT_KEYS = { N: 'Up', S: 'Down', E: 'Right', W: 'Left' }, LONG_LEFT = 11;
    ctx.display.onPresentationKey = input => {
        if (state.mode !== 'webtv') return false;
        const keys = [], turns = Math.min(8, Math.abs(input.d || 0));
        for (let i = 0; i < turns; i++) keys.push(input.d > 0 ? 'Down' : 'Up');
        if (input.press) keys.push('Enter');
        if (input.df === LONG_LEFT && input.last !== LONG_LEFT) keys.push('Back');
        else if (TILT_KEYS[input.tilt]) keys.push(TILT_KEYS[input.tilt]);
        keys.forEach(key => receiver.webTvKey(key));
        if (keys.length) { lastKey = keys[keys.length - 1]; keyCount++; keyAt = Date.now(); }
        return true;
    };
    // A small mark per key: the renderer takes input away from an app whose
    // picture stays the same after several inputs.
    const drawKey = (c, w) => {
        if (!lastKey || Date.now() - keyAt > 1500) return;
        c.fillRect(w - 196 + (keyCount & 1) * 4, 24, 160, 52, '#04060acc');
        c.fillRect(w - 196 + (keyCount & 1) * 4, 72, 160, 4, '#ef2b2d');
        c.text(t('key_' + lastKey), w - 116 + (keyCount & 1) * 4, 60, 26, '#f4f7fb', { font: 'airplay', align: 'center' });
    };
    receiver.on('state', next => {
        if (next.mode === 'waiting' && next.returnMode === 'mirror' &&
            (state.mode !== 'waiting' || state.returnMode !== 'mirror')) mirrorResumeUntil = Date.now() + 5000;
        if (isAudio(next) || next.returnMode !== 'mirror' || next.frame) mirrorResumeUntil = 0;
        const key = next.frame ? next.frame.generation + ':' + next.frame.sequence : '';
        if (key !== frameKey) { frameKey = key; frameAt = Date.now(); }
        state = next;
        if (webTvSetting) webTvSetting.hidden = next.webTvAvailable !== true;
        artwork.update(isAudio(state) && state.music && state.music.artwork, state.music && state.music.epoch);
        if (!state.frame || isAudio(state)) video.detach();
        if (state.error) log.warn('AirPlay: ' + state.error);
    });
    ui.onClick('BTN_START', () => {
        if (disconnecting) return;
        notice = receiver.start('auto', screenViewport()) ? '' : (diagnose(uid) || t('starting'));
    });
    // Stop video and To mirroring are drawn on the page while video is shown
    // (the HMI bar keeps four buttons); the ids still answer as before.
    const endVideo = () => {
        if (state.mode === 'webtv') { stopWebTv(); notice = ''; return; }
        if (state.mode === 'hls' || state.phase === 'loading' || state.playlistPending)
            notice = receiver.endVideo() ? '' : t('video_ctl_unavailable');
        else notice = t('no_video');
    };
    ui.onClick('BTN_END_VIDEO', endVideo);
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
    const toMirror = () => {
        if (isAudio(state)) { notice = t('start_mirror_hint'); return; }
        if (state.detached || state.mode === 'hls' || state.playlistPending) { notice = ''; receiver.resumeMirror(); controlsUntil = 0; }
        else notice = t('mirror_already');
    };
    ui.onClick('BTN_MIRROR', toMirror);
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
        // BACK on the controller leaves the app view: Web TV ends with it.
        else if (webTvRequested || state.mode === 'webtv') stopWebTv();
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
    // A drawing error leaves the page empty on the car: say why in the event
    // log (LOG page on the car Wi-Fi), at most once per 5 s.
    let uiErrorAt = 0;
    const reportUiError = e => {
        (log.error || log.warn || (() => {})).call(log, 'Base Player page: ' + String(e && e.stack || e));
        if (Date.now() - uiErrorAt < 5000) return;
        uiErrorAt = Date.now();
        receiver.command('ui-error', { text: String(e && e.stack || e).slice(0, 500) });
    };
    const drawPage = async () => {
        const transitioning = !isAudio(state) && state.mode !== 'webtv' && (state.phase === 'loading' ||
            (state.mode === 'waiting' && state.returnMode === 'mirror' && !!state.pin && !state.error &&
                !state.playlistPending && Date.now() < mirrorResumeUntil));
        const dark = black(), stuck = stalled() || dark;
        const fullscreen = !isAudio(state) && (!!state.frame || transitioning) && !stuck && Date.now() >= controlsUntil && video.ready();
        ctx.display.setPresentation(fullscreen);
        const body = ctx.display.contentSize && ctx.display.contentSize();
        const size = fullscreen ? ctx.display.gpu.screen : body || { w: 1600, h: 520 };
        receiver.setVideoViewport(size.w, size.h);
        // OP19 preserves aspect. Wait for the complete frame rescaled to the
        // current canvas instead of displaying the previous layout's bars.
        const resizing = !isAudio(state) && state.mode === 'hls' && state.frame &&
            state.frame.width * size.h !== state.frame.height * size.w;
        const c = ctx.canvas(size.w, size.h);
        // Video controls on the page: Stop video, and To mirroring for direct video.
        const videoControls = () => drawVideoControls(c, size.w, size.h, { mirror: state.mode === 'hls' || !!state.detached || !!state.playlistPending }, press);
        if (stuck) video.detach();
        if (!isAudio(state) && state.frame && !resizing && !stuck && video.attach(state.file, state.frame.generation)) {
            c.clear('#000000');
            // The native output follows this exact viewport in both axes.
            video.draw(c, 0, 0, size.w, size.h, state.frame, state.mode === 'hls' ? 'stretch' : 'contain');
            if (state.mode === 'webtv') drawKey(c, size.w);
            if (!fullscreen) videoControls();
        } else if (!stuck && (transitioning || resizing)) {
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
            if (logView && Date.now() - logAsked > 1000) { logAsked = Date.now(); receiver.requestLog(12); }
            drawHome(c, Object.assign({}, state, p2pText ? { p2pText } : {}, { webTv: webTvOn() }, logView ? { logView } : {},
                stuck ? { videoControls: { mirror: state.mode === 'hls' || !!state.detached } } : {}),
                notice || (dark ? t('video_black') : stuck ? t('video_stalled') : '') || diagnosis, logo, artwork, musicControl, press);
        }
        if (!closing) await ui.image('MAIN_GFX', c);
    };
    ctx.loop('MAIN', 10, async () => { try { await drawPage(); } catch (e) { reportUiError(e); } });
} });
