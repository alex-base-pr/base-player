'use strict';
/* Base Player — UI strings. English is the default and the fallback; Ukrainian
 * is the second language. t(key) returns the string for the current language;
 * t.set('en'|'uk') switches. */

const STRINGS = {
    uk: {
        app_title: 'Base Player',
        tagline: 'Екран і звук з твого телефона — на iDrive',

        // receiver / idle
        ready: 'Готово до підключення',
        ready_hint: 'На iPhone відкрий Керування → Повтор екрана й обери «Base Player». Для відео натисни AirPlay у плеєрі.',
        pin_label: 'Код підключення',
        name_label: "Ім'я приймача",
        receiver_name: 'Base Player',

        // audio / now playing
        now_playing: 'Зараз грає',
        pick_on_phone: 'Обери музику на телефоні',
        audio_connected: 'Звук під’єднано · йде через колонки авто',
        waiting_audio: 'Запусти відтворення на телефоні',
        prev: 'Назад', play_pause: 'Пуск / пауза', next: 'Далі',
        shuffle: 'Випадково', repeat: 'Повтор',
        shuffle_on: 'Випадково: увімк', shuffle_off: 'Випадково: вимк',
        repeat_off: 'Повтор: вимк', repeat_one: 'Повтор: трек', repeat_all: 'Повтор: усі',

        // mirror / video
        mirroring: 'Повтор екрана',
        mirroring_sub: 'Екран телефона на дисплеї авто',
        video_playing: 'Відео',
        video_sub: 'Звук через колонки авто',
        loading: 'Завантаження…',
        buffering: 'Буферизація…',

        // modes shown on idle cards
        card_mirror_t: 'Повтор екрана', card_mirror_s: 'Весь екран телефона',
        card_audio_t: 'Музика', card_audio_s: 'Тільки звук у колонки',
        card_video_t: 'Відео', card_video_s: 'YouTube, файли, плеєри',

        // hardware buttons (mirror app.json)
        btn_start: 'Підключити',
        btn_end_video: 'Зупинити відео',
        btn_mirror: 'До повтору екрана',
        btn_stop: 'Від’єднати',
        btn_close: 'Закрити',

        // notices
        starting: 'Приймач ще запускається. Спробуй ще раз.',
        no_video: 'Відео не відтворюється.',
        disconnecting: 'Від’єднуємо AirPlay…',
        disconnect_unconfirmed: 'Від’єднання не підтверджено. Спробуй ще раз.',
        mirror_already: 'Відео немає — повтор екрана вже активний.',
        start_mirror_hint: 'Увімкни повтор екрана на телефоні.',
        preview_only: 'Це збірка лише з інтерфейсом — приймача в ній ще немає.',

        // errors — the whole point of this rebuild: say the real reason
        err_title: 'Відео не вдалося відтворити',
        err_certificate: 'Годинник авто збитий — сертифікат сайту виглядає простроченим. Зачекай на GPS-час або ввімкни в налаштуваннях терпимість до дати сертифіката.',
        err_certificate_untrusted: 'Сертифікат сайту не пройшов перевірку, і справа не в даті. Можливо, мережа підміняє з’єднання — наприклад, сторінка входу Wi-Fi.',
        err_offline: 'У головного блоку немає інтернету. Увімкни точку доступу телефона й перевір у Store → Wi-Fi.',
        err_dns: 'Немає доступу до DNS. Перевір інтернет на точці доступу телефона.',
        err_forbidden: 'Сервер відхилив запит (доступ заборонено).',
        err_not_found: 'Джерело відео не знайдено.',
        err_unsupported: 'Формат відео не підтримується для прямого AirPlay.',
        err_decode: 'Помилка декодування відео.',
        err_media_failed: 'Не вдалося відтворити медіа.',
        err_tap_retry: 'Торкнись, щоб спробувати ще раз',
        err_try_mirror: 'Порада: пусти це відео через повтор екрана — тоді інтернет блоку не потрібен.',
    },
    en: {
        app_title: 'Base Player',
        tagline: 'Your phone’s screen and sound — on iDrive',

        ready: 'Ready to connect',
        ready_hint: 'On iPhone open Control Centre → Screen Mirroring and pick “Base Player”. For video, tap AirPlay in the player.',
        pin_label: 'Pairing code',
        name_label: 'Receiver name',
        receiver_name: 'Base Player',

        now_playing: 'Now playing',
        pick_on_phone: 'Pick music on your phone',
        audio_connected: 'Audio connected · through the car speakers',
        waiting_audio: 'Start playback on your phone',
        prev: 'Previous', play_pause: 'Play / Pause', next: 'Next',
        shuffle: 'Shuffle', repeat: 'Repeat',
        shuffle_on: 'Shuffle: on', shuffle_off: 'Shuffle: off',
        repeat_off: 'Repeat: off', repeat_one: 'Repeat: one', repeat_all: 'Repeat: all',

        mirroring: 'Screen mirroring',
        mirroring_sub: 'Your phone’s screen on the car display',
        video_playing: 'Video',
        video_sub: 'Sound through the car speakers',
        loading: 'Loading…',
        buffering: 'Buffering…',

        card_mirror_t: 'Screen mirroring', card_mirror_s: 'Your whole phone screen',
        card_audio_t: 'Music', card_audio_s: 'Audio only, to the speakers',
        card_video_t: 'Video', card_video_s: 'YouTube, files, players',

        btn_start: 'Connect',
        btn_end_video: 'Stop video',
        btn_mirror: 'To mirroring',
        btn_stop: 'Disconnect',
        btn_close: 'Close',

        starting: 'Receiver still starting. Try again.',
        no_video: 'No video is playing.',
        disconnecting: 'Disconnecting AirPlay…',
        disconnect_unconfirmed: 'Disconnect not confirmed. Try again.',
        mirror_already: 'No video — mirroring is already active.',
        start_mirror_hint: 'Start screen mirroring on your phone.',
        preview_only: 'Interface-only build — the receiver is not included yet.',

        err_title: 'Video could not play',
        err_certificate: 'The car’s clock is wrong, so the site’s certificate looks expired. Wait for GPS time, or turn on certificate date tolerance in settings.',
        err_certificate_untrusted: 'The site’s certificate failed verification, and not because of its date. The network may be intercepting the connection, e.g. a Wi-Fi login page.',
        err_offline: 'The head unit has no internet. Turn on your phone’s hotspot and check Store → Wi-Fi.',
        err_dns: 'DNS is unreachable. Check internet on the phone hotspot.',
        err_forbidden: 'The server refused the request (forbidden).',
        err_not_found: 'The video source was not found.',
        err_unsupported: 'This video format isn’t supported for direct AirPlay.',
        err_decode: 'Video decode error.',
        err_media_failed: 'Could not play the media.',
        err_tap_retry: 'Tap to try again',
        err_try_mirror: 'Tip: play this video via screen mirroring — then the head unit needs no internet.',
    },
};

let lang = 'en';
function t(key) {
    const table = STRINGS[lang] || STRINGS.en;
    return table[key] !== undefined ? table[key] : (STRINGS.en[key] !== undefined ? STRINGS.en[key] : key);
}
t.set = next => { if (STRINGS[next]) lang = next; };
t.get = () => lang;
t.languages = () => ['en'].concat(Object.keys(STRINGS).filter(l => l !== 'en'));

module.exports = { t, STRINGS };
