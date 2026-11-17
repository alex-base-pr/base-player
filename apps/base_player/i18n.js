'use strict';
/* Base Player — UI strings. GPL-3.0-or-later.
 * English is the default and the fallback. t(key) returns the string for the
 * current language; t.set('en'|'uk') switches.
 *
 * On the head unit only English is used: the baked font atlas has Latin
 * glyphs. Ukrainian is here for the emulator and for the day the atlas is
 * baked with Cyrillic; keys it lacks fall back to English.
 * Strings stay within the atlas: ASCII plus … – · and the German letters. */

const STRINGS = {
    en: {
        app_title: 'Base Player',

        // status pill
        status_disconnecting: 'Disconnecting …',
        status_android: 'Connected to Android',
        status_iphone: 'Connected to iPhone',
        status_check: 'Check connection',
        status_wait: 'One moment …',
        status_ready: 'Ready to receive',
        status_off: 'Not connected',

        // home
        hero_1: 'Your phone.',
        hero_2: 'Your BMW.',
        hero_sub: 'iPhone over AirPlay. Android over DLNA.',
        card_screen_t: 'Screen & videos',
        card_screen_s: 'Screen mirroring / AirPlay',
        card_music_t: 'Listen to music',
        card_music_s: 'Spotify or YouTube Music',
        conn_android: 'Your Android is connected.',
        conn_iphone: 'Your iPhone is connected.',
        ready_when: 'Ready when you are.',
        media_loading: 'Loading video …',
        media_playing: 'Video playing',
        media_mirror: 'Screen mirroring active',
        media_waiting: 'Waiting for music or video',
        from_android: 'Playing from the Android phone.',
        stays_connected: 'AirPlay stays connected.',
        control_on_phone: 'Control or stop it on the phone.',
        start_media_iphone: 'Start music or video on your iPhone.',
        pick_audio_output: 'Choose it as audio output on your iPhone',
        pick_and_code: 'Choose it on your iPhone and enter the code',
        same_wifi: 'BMW Wi-Fi or a shared Wi-Fi.',
        no_uplink: 'No uplink: video stays mirrored.',
        android_hint: 'Android: "Base Player" + code',
        preparing: 'Preparing the connection.',
        press_connect: 'Press "Connect" below.',
        pick_same: 'Choose the same receiver on your iPhone.',

        // music
        music_default_title: 'Your music.',
        music_pick_on_phone: 'Pick music on your iPhone',
        music_choose_audio: 'Choose AirPlay audio on your iPhone',
        audio_connected: 'AirPlay audio connected',
        code: 'Code',
        prev: 'Back', next: 'Next', pause: 'Pause', play: 'Play', play_pause: 'Play / Pause',
        shuffle: 'Shuffle', repeat: 'Repeat',
        opt_off: ': off', opt_on: ': on', opt_one: ': one track', opt_all: ': all',
        playback_android: 'Playing from your Android phone. Sound through your BMW.',
        playback_iphone: 'Playing from your iPhone. Sound through your BMW.',
        more_on_iphone: 'More controls are on your iPhone.',
        start_on_iphone: 'Start playback on your iPhone. The sender enables the controls.',

        // buttons (app.json carries the same English labels)
        btn_start: 'Connect', btn_end_video: 'Stop video', btn_mirror: 'To mirroring',
        btn_stop: 'Disconnect', btn_close: 'Close', btn_settings: 'Settings',

        // notices from button presses
        starting: 'Receiver service is still starting. Please try again.',
        video_ctl_unavailable: 'Video control is not available yet.',
        no_video: 'No video is playing.',
        disconnecting: 'Disconnecting AirPlay …',
        disconnect_unconfirmed: 'Disconnect was not confirmed. Please try again.',
        start_mirror_hint: 'Start screen mirroring on your iPhone.',
        mirror_already: 'No video is playing – mirroring is already running.',
        music_ctl_unavailable: 'Music control is not available yet.',
        android_wait_frame: 'Android connected – waiting for the first frame …',
        video_loading: 'Loading video …',
        mirror_resuming: 'Resuming screen mirroring …',
        audio_error: 'For BMW sound choose "Connect" again.',

        // errors: why the video failed (native/bp_error.h names) ...
        err_certificate: 'Car clock is wrong: the site certificate looks expired. Wait for GPS time or allow it in Settings.',
        err_certificate_untrusted: 'Site certificate failed verification, not for its date. The network may be intercepting it.',
        err_offline: 'The head unit has no internet. Turn on the phone hotspot and check Wi-Fi in the Store.',
        err_dns: 'DNS is unreachable. Check the internet on the phone hotspot.',
        err_forbidden: 'The server refused the request.',
        err_not_found: 'The video source was not found.',
        err_unsupported: 'This video format is not supported for direct AirPlay.',
        err_decode: 'Video decode error.',
        err_media_failed: 'The video could not be loaded. Receiving stays ready.',
        // ... and the receiver's own conditions
        err_media_unsupported: 'The receiver cannot play this video.',
        err_runtime_missing: 'Receiver software is missing.',
        err_discovery_failed: 'Device discovery is not reachable.',
        err_receiver_failed: 'Connection ended. Please connect again.',
        err_backend_unavailable: 'Connecting to the receiver service …',
        err_disconnect_failed: 'AirPlay was not fully disconnected. Choose "Disconnect" again.',
        err_video_viewport_failed: 'Video output could not be adjusted. Choose "Connect" again.',
        err_receiver_recovering: 'Receiving is being restored automatically …',
        err_music_control_failed: 'Music control is not reachable. Keep controlling on the iPhone.',
        err_music_control_busy: 'Music control is busy. Wait a moment.',
        err_music_control_stale: 'The music connection is being refreshed.',

        // receiver diagnosis (diagnose.js)
        diag_missing: 'Receiver is missing: install "Base Player receiver" in the Store from the "Releases" source.',
        diag_waiting_for_app: 'Receiver is waiting for the app to register. Restart the head unit once.',
        diag_identity: 'Receiver finds no unique app identity',
        diag_starting: 'Receiver service is starting …',
        diag_launch_failed: 'Receiver service could not start: ',
        diag_exited_1: 'Receiver service ended (code ',
        diag_exited_2: ') – restarting …',
        diag_other_uid_1: 'Receiver runs for app UID ',
        diag_other_uid_2: ', this app has ',
        diag_other_uid_3: '. Restart the head unit.',
        diag_stopped: 'Receiver service is stopped. Restart the head unit once.',
        diag_no_status: 'Receiver service is starting … (no status yet)',
        p2p_concurrent: 'Miracast pre-check: Wi-Fi Direct works beside the hotspot',
        p2p_exclusive: 'Miracast pre-check: Wi-Fi Direct only without the hotspot',
        p2p_unsupported: 'Miracast pre-check: Wi-Fi chip without Wi-Fi Direct',
    },
    uk: {
        status_disconnecting: 'Від’єднуємо …',
        status_android: 'Android під’єднано',
        status_iphone: 'iPhone під’єднано',
        status_check: 'Перевір з’єднання',
        status_wait: 'Хвилинку …',
        status_ready: 'Готово до прийому',
        status_off: 'Не під’єднано',
        hero_1: 'Твій телефон.',
        hero_2: 'Твій BMW.',
        hero_sub: 'iPhone через AirPlay. Android через DLNA.',
        card_screen_t: 'Екран і відео',
        card_screen_s: 'Повтор екрана / AirPlay',
        card_music_t: 'Музика',
        card_music_s: 'Spotify або YouTube Music',
        conn_android: 'Твій Android під’єднано.',
        conn_iphone: 'Твій iPhone під’єднано.',
        ready_when: 'Готово, коли ти готовий.',
        media_loading: 'Відео завантажується …',
        media_playing: 'Відео грає',
        media_mirror: 'Повтор екрана активний',
        media_waiting: 'Чекаємо на музику чи відео',
        press_connect: 'Натисни «Підключити» внизу.',
        pick_same: 'Обери цей приймач на iPhone.',
        music_default_title: 'Твоя музика.',
        prev: 'Назад', next: 'Далі', pause: 'Пауза', play: 'Пуск', play_pause: 'Пуск / пауза',
        shuffle: 'Випадково', repeat: 'Повтор',
        opt_off: ': вимк', opt_on: ': увімк', opt_one: ': трек', opt_all: ': усі',
        btn_start: 'Підключити', btn_end_video: 'Зупинити відео', btn_mirror: 'До повтору екрана',
        btn_stop: 'Від’єднати', btn_close: 'Закрити', btn_settings: 'Налаштування',
        err_certificate: 'Годинник авто збитий: сертифікат сайту виглядає простроченим. Зачекай на GPS-час або дозволь у налаштуваннях.',
        err_certificate_untrusted: 'Сертифікат сайту не пройшов перевірку, і справа не в даті. Можливо, мережа підміняє з’єднання.',
        err_offline: 'У головного блоку немає інтернету. Увімкни точку доступу телефона й перевір Wi-Fi у Store.',
        err_dns: 'Немає доступу до DNS. Перевір інтернет на точці доступу телефона.',
        err_forbidden: 'Сервер відхилив запит.',
        err_not_found: 'Джерело відео не знайдено.',
        err_unsupported: 'Цей формат відео не підтримується для прямого AirPlay.',
        err_decode: 'Помилка декодування відео.',
        err_media_failed: 'Відео не вдалося завантажити. Прийом лишається готовим.',
    },
};

let lang = 'en';
function t(key) {
    const table = STRINGS[lang] || STRINGS.en;
    return table[key] !== undefined ? table[key] : (STRINGS.en[key] !== undefined ? STRINGS.en[key] : key);
}
t.set = next => { if (STRINGS[next]) lang = next; };
t.get = () => lang;
t.languages = () => Object.keys(STRINGS);

/* Error codes the native side reports for a failed video (native/bp_error.h). */
const MEDIA_ERRORS = ['certificate', 'certificate_untrusted', 'offline', 'dns', 'forbidden', 'not_found', 'unsupported', 'decode', 'media_failed'];
/* 'dns', 'player_dns' -> 'dns'; anything unknown -> 'media_failed'. */
function mediaError(code) {
    const name = String(code || '').replace(/^player_/, '');
    return MEDIA_ERRORS.indexOf(name) >= 0 ? name : 'media_failed';
}

module.exports = { t, STRINGS, MEDIA_ERRORS, mediaError };
