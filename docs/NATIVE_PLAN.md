# Нативна частина — план (приймач + причина помилки)

Мета двох найперших виправлень, яких бракує існуючим рішенням:

## 1. Говорити справжню причину
У типовій реалізації playbin/GStreamer будь-який мережевий збій зводиться до одного коду
(«network failed»). Base Player розрізняє на рівні `GST_MESSAGE_ERROR`:
- `GST_RESOURCE_ERROR_NOT_AUTHORIZED` -> `forbidden`
- `GST_RESOURCE_ERROR_NOT_FOUND`      -> `not_found`
- повідомлення містить "certificate"/"expired"/"not valid"/"TLS" -> `certificate`
- повідомлення містить "resolve"/"name"/"DNS"                    -> `dns`
- інакше, і сокет не відкрився                                   -> `offline`
- `GST_STREAM_ERROR_*TYPE*/WRONG_TYPE/CODEC_NOT_FOUND`           -> `unsupported`/`decode`
Код передається у JS (`error <code>`), а `i18n.js` показує людський текст (ключі `err_*`).

## 2. Терпимість до дати сертифіката (опційно, як у mgu-updater)
Коли годинник блока збитий (РЕБ), сертифікат виглядає простроченим. За увімкненим налаштуванням
знімати в перевірці TLS лише прапорці дати (`G_TLS_CERTIFICATE_EXPIRED`,
`G_TLS_CERTIFICATE_NOT_ACTIVATED`) — на джерелах через `source-setup` (`tls-validation-flags`).
Ланцюжок до кореня, підпис і відповідність хоста перевіряються як завжди. За замовчуванням вимкнено.

## Стан реалізації (native/)

Зроблено й перевірено на хості (macOS, GStreamer 1.28, libsoup 3, gnutls):

- `bp_error.c` — чистий C без GLib: `BpErrorInput` -> код. Порядок: точні прапорці сертифіката ->
  тип потоку -> HTTP-статус -> власна проба хоста -> текст помилки. `make test`.
- `bp_gst.c` — обв'язка GStreamer: політика сертифіката, розбір `GST_MESSAGE_ERROR`, проба хоста.
- `bp_player.c` — плеєр прямого відео: команди на stdin, рядки `BP …` на stdout
  (`apps/base_player/player_proto.js` перетворює їх на стан для `view.js`).
- Коди: `certificate` (дата), `certificate_untrusted` (ланцюг/хост/підпис — новий), `offline`, `dns`,
  `forbidden`, `not_found`, `unsupported`, `decode`, `media_failed`.

Що з'ясувалося по дорозі й чому зроблено саме так:

- **libsoup 3 взагалі не віддає причину на шину.** DNS, відмова з'єднання й TLS приходять однаково:
  STREAM/FAILED «Internal data stream error» (GError лише логується). Тому, коли повідомлення не
  називає причини, `bp_net_probe()` сам робить resolve -> connect -> TLS-handshake до хоста URL
  (до 5 с, нічого не приймає) і каже, на якому кроці впало. Від версії libsoup не залежить.
- **libsoup 2** кладе в `http-status-code` псевдостатуси (2 — не резолвиться, 4 — немає з'єднання,
  6 — TLS) і резолв-помилку віддає як RESOURCE/NOT_FOUND — це враховано.
- **«DNS» чи «немає інтернету»:** без маршруту резолвер теж падає. `bp_route_probe()` питає ядро про
  маршрут (UDP `connect()`, жодного пакета); без маршруту помилка DNS показується як `offline`.
- **У `souphttpsrc` немає властивості `tls-validation-flags`** (вона є, напр., у `rtspsrc`). Тому
  `bp_tls_attach()` на кожному джерелі бере перший наявний гак: (1) `tls-validation-flags` — як у плані;
  (2) сигнал `accept-certificate` (libsoup 3, GStreamer >= 1.24); (3) `tls-database`, загорнута в
  делегуючу базу, що після повної перевірки знімає лише вердикт щодо дат (працює і з libsoup 2).
  `ssl-strict` не вимикається ніколи. Джерела ловляться через `source-setup` і `deep-element-added`
  (HLS-демуксер створює власні HTTP-джерела, яких `source-setup` не бачить).
- Гаки 2 і 3 дають точні прапорці, тож `certificate` і `certificate_untrusted` розрізняються напевно.
  Гак 1 прапорців не дає — тоді причину добирає проба хоста.

Перевірки: `make -C native test` (класифікатор), `make -C native test-gst` (гак 1 на `rtspsrc`),
`node tests/test_app.js` (коди <-> i18n <-> екран помилки), `node tests/e2e_player.js` (наживо:
badssl.com expired / wrong.host / self-signed / untrusted-root, неіснуючий хост, 404; обидва гаки).

Не перевірено (потрібна машина): збірка крос-тулчейном під MGU; який гак реально є у версії
GStreamer на блоці; чи є маршрут за замовчуванням через телематику, коли точка доступу вимкнена
(тоді DNS-збій покажеться як `dns`, а не `offline`); відеосинк і звук MGU в `bp_player`.

## Застереження
Нативний код збирається під MGU (крос-тулчейн) і перевіряється на машині. У цьому репозиторії
спершу дозрівають інтерфейс і логіка (їх видно в емуляторі); приймач додаємо інкрементально.
