# Один wlan0 тримає CarPlay, hotspot і Base Player

Твоя схема працює, бо на юніті з Broadcom усе сходиться на одному радіо `wlan0` (BCM4359). Штатний BMW wpa_supplicant тримає на ньому P2P-групу бездротового CarPlay (`p2p-*`, 5 ГГц). mgu-uplink через той самий supplicant підключає `wlan0` станцією до Personal Hotspot твого iPhone, бажано на 2.4 ГГц. Base Player оголошується через BMW `mdnsd` саме в підмережі цього hotspot. Отже, iPhone одночасно є клієнтом мережі CarPlay без інтернету і точкою доступу hotspot, а MGU одночасно є group owner для CarPlay і клієнтом hotspot. Ти бачив, що оновлення Store завантажуються під час бездротового CarPlay. Це не аномалія: mgu-uplink свідомо розрахований на такий режим ([README mgu-uplink](https://github.com/robertnisipeanu/mgu-store/blob/main/native/mgu-uplink/README.md); [issue #352](https://github.com/robertnisipeanu/mgu-store/issues/352)). Звідси три виправлення до `base-player/docs/CONNECTION_PLAN.md`. По-перше, CarPlay і hotspot працюють разом. По-друге, mgu-uplink не вимикає Wi-Fi під час CarPlay, а лише обмежує автосканування. По-третє, твій iPhone у CarPlay має до Base Player другий мережевий шлях, через hotspot-лінк, а не лише через `p2p-*`. Найпростіший шлях для друга: його iPhone підключається до твого hotspot або до hotspot авто `wlan_bridge` і бачить «Base Player» як звичайний AirPlay-приймач. Чи може твій власний iPhone одночасно тримати CarPlay і AirPlay на Base Player, невідомо. Мережа, ймовірно, це дозволяє. Заважати можуть iOS (дзеркалення, найімовірніше, заблоковане, а аудіо не перевірене) і BMW HMI, який віддає екран і медіа CarPlay. Перевірити це можна лише на авто і лише read-only. Головне правило: **ніколи не зупиняти й не перезапускати `carplay.service`, ніякого кодування й змін в ECU.** Одна така спроба в upstream скінчилася крахом CarPlay і `mediaddpserver` та перезапуском усього головного пристрою (`base-player/docs/upstream/STATUS.md:374-385`).

## Схема: три ролі на одному чипі й два шляхи до приймача

Нижче зібрано все, що відомо з коду mgu-uplink, коду Base Player і реверс-інжинірингу CarPlay. Позначка `?` означає висновок, який ще не виміряно на твоєму авто.

```
                         стільникова мережа (LTE/5G)
                                   │
                    ┌──────────────┴──────────────────────────────┐
                    │   iPhone ВЛАСНИКА (iOS)                     │
                    │   Wi-Fi роль 1: клієнт мережі CarPlay (5 ГГц)│
                    │   Wi-Fi роль 2: AP Personal Hotspot (2.4 ГГц,│
                    │                 Maximize Compatibility)      │
                    │   Bluetooth: лише виявлення/перепідключення  │
                    └───────┬──────────────────────────┬──────────┘
         CarPlay = AirPlay-сесія                 hotspot-лінк, підмережа
         (екран HEVC/H.264, AAC, iAP2)           hotspot (? зазвичай 172.20.10.x)
                            │                          │         ▲
                            │                          │         │ ? друг як 2-й клієнт
                            │                          │   ┌─────┴──────────┐
                            │                          │   │ iPhone ДРУГА   │──┐
                            │                          │   └────────────────┘  │ або
 ═══════════════════════════╪══════════ MGU (iDrive 7, Broadcom BCM4359, bcmdhd)═══╪════
                            ▼                          ▼                       ▼
                     p2p-*  (P2P GO,            wlan0 (station,          wlan_bridge
                     5 ГГц, CarPlay)            mgu-uplink через         (BMW hotspot;
                            │                   BMW wpa_supplicant)       ? теж P2P GO)
                            │                          │                       │
                 carplay.service                  mgu-uplink (root)            │
                 uid 13002 (cia_13002)            таблиця 110, правила         │
                 ↔ mediaddpserver                 1100/1101/1102,              │
                 НЕ ЧІПАТИ                        nft inet mgu_uplink,         │
                            │                     status.json / lease.json     │
                            │                          │                       │
                            │      ┌───────────────────┴───────────────────────┘
                            │      │  Base Player: nft-правила на wlan_bridge/wlan0/wlan1,
                            │      │  TCP/UDP 7100-7104, UDP 1900; UDP 5353 для сокетів
                            │      │  BMW mdnsd + правило 1099 → таблиця 110 (лише лізa)
                            │      ▼
                            │   BMW mdnsd (/run/mdnsd/mdnsd_uds) ◄── UxPlay «Base Player»
                            │                                         -p 7100 -pw <код>
                            │                                          │          │
                            │                       відео: mguvideosink│          │аудіо: GStreamer
                            │                       /dev/shm/mgu-video-*          ▼
                            │                              │        alsasink smartx:MediaSink_
                            │                              ▼        AudioOut_Front_CF_48_…
                            │                   backend.js → main.js        +
                            │                   VideoBridge (msg 13/op 19)  GENIVI CommandControl:
                            │                              │                connect(OAPGenericMedia
                            ▼                              ▼                → MediaSink_Front)
                 ┌─────────────────── BMW HMI: фокус екрана (ROOT_APP) і main audio ──────────┐
                 │  CarPlay-поверхня (нативна)   vs   mgu-render ivi-шар Base Player          │
                 │  CarPlay main audio           vs   OAPGenericMedia; alternate audio CarPlay │
                 │                                    (навігація) змішується завжди           │
                 └────────────────────────────────────────────────────────────────────────────┘
```

Бездротовий CarPlay починається з Bluetooth. iPhone через iAP2 по RFCOMM просить `RequestAccessoryWiFiConfiguration`, отримує SSID і пароль, підключається до точки доступу авто і через Bonjour знаходить службу керування CarPlay. Після цього головний пристрій надсилає `disableBluetooth`, і все, включно з iAP2, іде через Wi-Fi як AirPlay-сесія ([WWDC17 717, PDF](https://devstreaming-cdn.apple.com/videos/wwdc/2017/717tmz5rl6c2t2k/717/717_developing_wireless_carplay_systems.pdf?dl=1); [Troopers24, SEEMOO](https://troopers.de/downloads/troopers24/TR24_Apple_CarPlay-What's_Under_the_Hood_8MCYKG.pdf)). Звідси важливий наслідок для Base Player: **під час CarPlay Bluetooth-каналу до iPhone немає, працює лише IP.** Сесії потрібно близько **25 Мбіт/с**, а медіа в бездротовому режимі йде стиснутим AAC ([WWDC16 722](https://developer.apple.com/videos/play/wwdc2016/722/)). Apple наполегливо рекомендує 5 ГГц і окремо попереджає, що на продуктивність впливають «додаткові служби», зокрема інтернет-дані ([WWDC17 717, PDF](https://devstreaming-cdn.apple.com/videos/wwdc/2017/717tmz5rl6c2t2k/717/717_developing_wireless_carplay_systems.pdf?dl=1)).

На BMW «точка доступу CarPlay» насправді є Wi-Fi Direct-групою. Коментар у коді mgu-uplink каже, що на юніті з Broadcom і без `wlan1` інтерфейс `wlan0` простоює як станція. BMW-шний supplicant (D-Bus `fi.w1.wpa_supplicant1`, без конфіг-файлу) тримає його батьківським для P2P group owner-ів, на яких працюють «hotspot авто і бездротовий CarPlay». Місця для ще одного інтерфейсу в чипі немає ([carwpa.go:3-17](https://github.com/robertnisipeanu/mgu-store/blob/main/native/mgu-uplink/carwpa.go)). Твоє авто саме такого варіанту: в upstream-стенді аплінком був `wlan0` (`base-player/docs/upstream/STATUS.md:292`). Сесію CarPlay mgu-uplink розпізнає лише читанням. Він шукає ESTABLISHED TCP від uid 13002 (`carplay.service`, `User=cia_13002`) на не-loopback адресу і приріст байтів на `p2p-*` за 30 с. Дротовий CarPlay дає таке з'єднання без P2P-трафіку ([projection.go:3-19](https://github.com/robertnisipeanu/mgu-store/blob/main/native/mgu-uplink/projection.go)).

### Чому радіо витримує дві ролі одночасно

BCM4359 є 2×2 dual-band чипом з **Real Simultaneous Dual Band (RSDB)**. У ньому два ядра 802.11, тож 2.4 і 5 ГГц можуть працювати справді одночасно, без поділу часу ([AnandTech](https://anandtech.com/show/9035); [linux-wireless](https://www.mail-archive.com/linux-wireless@vger.kernel.org/msg16816.html)). Автор mgu-uplink пише, що станція на тому самому діапазоні, що й група CarPlay, «ділить ядро радіо» ([wifiband.go:3-8](https://github.com/robertnisipeanu/mgu-store/blob/main/native/mgu-uplink/wifiband.go)). Тому за замовчуванням `wifi_5ghz = off`: мережу, видиму на 2.4 ГГц, mgu-uplink підключає тільки на 2.4 ГГц. Поки CarPlay активний і аплінк ще не підключений, автосканування йде лише на «іншому» діапазоні, ніж група телефону. Якщо діапазон групи невідомий, сканування стає на паузу (`wifi.paused: carplay`). **Мережа, до якої вже підключено, лишається підключеною** ([README, розділи «The band» і «During wireless CarPlay»](https://github.com/robertnisipeanu/mgu-store/blob/main/native/mgu-uplink/README.md); [wifi.go:469-500](https://github.com/robertnisipeanu/mgu-store/blob/main/native/mgu-uplink/wifi.go#L469)). Чи firmware BMW справді вмикає RSDB, а не почергове перемикання каналів (MCC/VSDB), не підтверджено. Схема працювала б в обох випадках, але при MCC CarPlay ризикує якістю сильніше.

## Твоя схема крок за кроком, а що в ній виправити в CONNECTION_PLAN

Публічний issue #352 описує конфігурацію, яка точно збігається з твоєю: iDrive 7 `P18_23w44.2-1-3`, Broadcom без `wlan1`, `wifi.backend: car-supplicant`, mgu-uplink 0.7.13. Там збережено Personal Hotspot «того самого iPhone, що веде бездротовий CarPlay», на 2.4 ГГц, канал 6. Після підключення аплінк «лишається онлайн» усю поїздку. Єдина вада: після старту перше автоматичне підключення не відбувається, і потрібен ручний тап. Автор назвав це багом ([issue #352](https://github.com/robertnisipeanu/mgu-store/issues/352)). Для iOS 27.2 є окрема пастка: пароль hotspot не приймався, доки не увімкнули Maximize Compatibility ([issue #149](https://github.com/robertnisipeanu/mgu-store/issues/149)).

| Крок | Що відбувається | Де це видно | Статус |
|---|---|---|---|
| 1 | Запалювання. iPhone і MGU знаходять одне одного через Bluetooth, iAP2 передає облікові дані Wi-Fi | — | факт (WWDC17) |
| 2 | iPhone підключається до групи CarPlay `p2p-*` на 5 ГГц. Bluetooth вимикається, CarPlay іде по Wi-Fi | `/proc/net/dev` (`p2p-*`), TCP uid 13002 | факт (код mgu-uplink) |
| 3 | На iPhone увімкнено Personal Hotspot з Maximize Compatibility (2.4 ГГц, WPA2) | iPhone: екран Personal Hotspot | факт (#149, #352) |
| 4 | mgu-uplink шукає збережений hotspot лише на 2.4 ГГц, не забираючи радіо з каналу CarPlay, і підключає `wlan0` через BMW supplicant | `status.json`: `wifi.backend`, `wifi.freq`, `wifi.paused` | факт (README). Перше автопідключення може не спрацювати (#352) |
| 5 | DHCP-ліза на `wlan0`. Store і Base Player виходять в інтернет лише для дозволених UID через таблицю 110 | `/run/mgu-uplink/lease.json` | факт |
| 6 | Base Player (`network.js` кожні 5 с) бачить лізу на `wlan0`. Він відкриває 5353 для сокетів BMW `mdnsd` і ставить правило 1099 → таблиця 110, тож «Base Player» оголошується в підмережі hotspot | `/run/base-player-rt/mdns-routes.json`, `nft list ruleset` | факт (код). На твоєму авто не виміряно |
| 7 | iPhone друга підключається до твого hotspot або до hotspot авто `wlan_bridge` і бачить «Base Player» у списку AirPlay. Пароль приймача: 6-значний код з екрана авто | AirPlay picker друга | висновок, треба виміряти |
| 8 | Друг вмикає музику, дзеркалення або YouTube. Base Player бере `OAPGenericMedia → MediaSink_Front`, а картинка йде на ivi-шар, коли водій відкрив застосунок | `backend.js` стан, екран | факт (код). Співіснування з CarPlay-аудіо не виміряно |

Звідси чотири поправки до `CONNECTION_PLAN.md`. Перша: рядки 49-50 твердять, що бездротовий CarPlay і Personal Hotspot «на практиці разом не працюють», а mgu-uplink «ставить Wi-Fi на паузу». Це **хибно** для твого авто. Пауза стосується лише автосканування до підключення, а не вже підключеної мережі. Друга: рядки 42-44 кажуть, що телефон у бездротовому CarPlay «не може дістатися» приймача. Це правда лише щодо `p2p-*`. Через hotspot-лінк у iPhone є другий L2-зв'язок з MGU, і Base Player оголошується саме там. Третя: рядки 22-24 кажуть, що hotspot-виявлення «відкотили». Це суперечить коду. Відкотили власний mDNS-responder 0.4.8, а механізм 0.4.7/0.5.1 (5353 лише для сокетів BMW `mdnsd` плюс правило 1099) є в `airplay/network.js:93-106, 168-308` (`base-player/docs/upstream/STATUS.md:52-61, 88-111`). Отже, hotspot-виявлення реалізоване, але на твоєму авто не перевірене. Четверта: варіант «дротовий CarPlay + LTE-стік» (рядки 56-57) лишається робочим, але для інтернету він більше не потрібен. А варіант «відповідати на `p2p-*`» (рядок 58) варто прибрати з плану зовсім, бо є безпечніший шлях через hotspot.

Примітка про друга. MacRumors і BMWBlog пишуть, що hotspot авто не працює разом з CarPlay. Ці статті стосуються іншого випадку: **iPhone водія** намагається підключитися до LTE-hotspot BMW, маючи станцію вже зайнятою мережею CarPlay ([MacRumors](https://www.macrumors.com/review/bmw-wireless-carplay)). На телефон друга, який не в CarPlay, це обмеження не поширюється. Невідомо інше: чи працює `wlan_bridge` на Broadcom-юніті одночасно з групою CarPlay і станцією аплінка (це вже третя роль на одному чипі). Також невідомо, чи Personal Hotspot iOS пропускає трафік між двома клієнтами (MGU і телефоном друга). Обидва питання треба поміряти.

## Чи зможе твій iPhone AirPlay-ти на Base Player, не виходячи з CarPlay

Відповідь розкладається на три рівні, і вони мають різний ступінь певності. **Мережа: найімовірніше так.** iPhone і MGU ділять підмережу hotspot, а Base Player оголошується саме там. Apple вимагає, щоб AirPlay-ціль була в «тій самій Wi-Fi-мережі», що й iPhone ([Apple, iPhone User Guide](https://support.apple.com/en-asia/guide/iphone/iph315e0d58d/14.0/ios)). Чи шукає iOS AirPlay-приймачі на інтерфейсі власного hotspot, де телефон є AP, а не клієнтом, джерела не кажуть. Це перша річ, яку треба перевірити. **iOS: дзеркалення, найімовірніше, ні, а аудіо невідомо.** CarPlay уже є AirPlay-сесією, у якій iPhone відправник, а авто приймач ([Troopers24](https://troopers.de/downloads/troopers24/TR24_Apple_CarPlay-What's_Under_the_Hood_8MCYKG.pdf)). За повідомленнями користувачів, запис і трансляція екрана недоступні під час CarPlay ([Apple Community 253863457](https://discussions.apple.com/thread/253863457)). Mac Observer пише, що AirPlay і CarPlay не працюють одночасно на одному пристрої, але інший пристрій AirPlay-ити може ([Mac Observer](https://www.macobserver.com/tips/carplay-vs-airplay/)). Аудіо через route picker і передача YouTube-URL кодер екрана не використовують. Але аудіомаршрут iPhone у CarPlay належить CarPlay, тож вибір іншої цілі, швидше за все, забере звук з авто або буде відхилений. Жодного першоджерела немає. Apple, щоправда, сама додала «AirPlay video on CarPlay» в iOS 26.4. Це відео з будь-якого AirPlay-застосунку на екран авто, лише на стоянці і лише якщо автовиробник це реалізував ([MacRumors, 18.02.2026](https://www.macrumors.com/2026/02/18/ios-26-4-major-new-carplay-feature-revealed/)). Отже, iOS уміє вести відео-AirPlay всередині CarPlay-приймача. Для стороннього другого приймача це нічого не доводить, а iDrive 7 цю функцію навряд чи підтримує. **HMI: CarPlay, найімовірніше, переможе.** Upstream бачив, що «CarPlay автоматично перебирав картинку або медіа», а ручне відключення CarPlay в iDrive повертало AirPlay (`base-player/docs/upstream/HISTORY.md:98-103`). Правила Apple для головних пристроїв кажуть «не переривати активну CarPlay-сесію» і «відновлювати останній режим користувача» ([WWDC17 717, PDF](https://devstreaming-cdn.apple.com/videos/wwdc/2017/717tmz5rl6c2t2k/717/717_developing_wireless_carplay_systems.pdf?dl=1)). Тож навіть якщо iOS віддасть потік, HMI може повернути екран і main audio CarPlay.

Практичний висновок такий. Для тебе як водія «CarPlay + свій AirPlay» поки є експериментом, а не функцією. Перевіряти його варто на стоянці, як матрицю {route picker аудіо, Screen Mirroring, YouTube AirPlay}, і лише спостерігати. Для пасажира Base Player уже зараз має робочий шлях: другий телефон. Upstream і раніше підтверджував AirPlay лише без активного CarPlay на тому самому телефоні (`base-player/docs/upstream/IMPLEMENTATION.md:38-41`). Третій шлях, «звільнити» CarPlay через BMW DevicePresentation, upstream зробив і за бажанням власника повністю прибрав у 0.2.6. Цей виклик рівносильний ручному «Відключити» в iDrive (`base-player/docs/upstream/HISTORY.md:108-115`). Під правило «не чіпати CarPlay» він не підпадає формально, але порушує його по суті, тому лишається забороненим.

### Що факт, а що висновок

| Твердження | Статус | Підстава |
|---|---|---|
| Бездротовий CarPlay і hotspot того самого iPhone для mgu-uplink працюють одночасно | **факт** (ти, #352) | спостереження власника; [issue #352](https://github.com/robertnisipeanu/mgu-store/issues/352) |
| CarPlay на твоєму MGU іде через P2P GO `p2p-*` на `wlan0` | факт з коду стороннього автора | [carwpa.go](https://github.com/robertnisipeanu/mgu-store/blob/main/native/mgu-uplink/carwpa.go), [projection.go](https://github.com/robertnisipeanu/mgu-store/blob/main/native/mgu-uplink/projection.go) |
| Hotspot у тебе йде саме по Wi-Fi через `wlan0`, а не USB/BT PAN | **висновок** | `device.kind` у `status.json` не знято |
| Канал CarPlay-групи 5 ГГц, hotspot 2.4 ГГц, RSDB без перемикання каналів | висновок | `iw dev`/`iw phy` не знято |
| `wlan_bridge` є P2P GO над `wlan0` і працює разом з CarPlay | висновок | прямого джерела немає |
| Base Player оголошується в підмережі hotspot через BMW `mdnsd` | факт з коду, не виміряно | `airplay/network.js:93-106, 168-308` |
| Друг на твоєму hotspot бачить «Base Player» | висновок | ізоляція клієнтів hotspot iOS невідома |
| Твій iPhone у CarPlay бачить «Base Player» | висновок | iOS-поведінка на інтерфейсі власного hotspot невідома |
| Дзеркалення з iPhone у CarPlay заблоковане | висновок, слабкі звіти | [Apple Community](https://discussions.apple.com/thread/253863457), [Mac Observer](https://www.macobserver.com/tips/carplay-vs-airplay/) |
| `connect(OAPGenericMedia, MediaSink_Front)` поки грає CarPlay-медіа | невідомо | `base-player/docs/CONNECTION_PLAN.md:54-55` |
| Зупинка `carplay.service` валить HU | **факт** | `base-player/docs/upstream/STATUS.md:374-385` |

## Read-only заміри на авто, які закривають усі відкриті питання

Усі заміри робляться по SSH з ENET лише командами читання, на стоянці і з активним бездротовим CarPlay. Під час них **заборонено**: `systemctl stop|restart|kill|mask` для `carplay.service` і `aapd.service`, будь-які виклики `CarPlayManager`/DevicePresentation, кодування через E-Sys/NCD, зміни в ECU, `wpa_cli`/D-Bus-записи в BMW supplicant. Також не варто запускати ручний `wifi-scan` mgu-uplink під час CarPlay: він сканує всі канали і знімає радіо з каналу CarPlay ([README](https://github.com/robertnisipeanu/mgu-store/blob/main/native/mgu-uplink/README.md)). Знімати краще двічі, з активним CarPlay і без нього, і порівнювати пари значень, а не окремі числа.

| Питання | Команда (тільки читання) | Що шукати |
|---|---|---|
| Яким транспортом іде hotspot | `cat /run/mgu-uplink/status.json` | `device.kind`=`wifi`, `wifi.backend`=`car-supplicant`, `wifi.freq` (≈2437 = 2.4 ГГц), `wifi.paused`, `state`=`online` |
| Ліза й підмережа | `cat /run/mgu-uplink/lease.json`; `ip -br addr` | `interface`=`wlan0`, ip/prefix (очікувано 172.20.10.x/28), чи немає перетину з `wlan_bridge` |
| Інтерфейси й канали | `iw dev`; `cat /run/base-player/p2p.json` | `p2p-*` з частотою 5 ГГц, `wlan0` managed на 2.4 ГГц, `valid interface combinations`, `#channels <= 2` (ознака RSDB) |
| Чи живий hotspot авто разом з CarPlay | `iw dev`; `ip -br addr show wlan_bridge` | чи є `wlan_bridge` UP з адресою під час CarPlay |
| Маршрутизація | `ip rule`; `ip route show table 110` | правила 1099/1100/1101/1102, default через hotspot |
| Сесія CarPlay | `cat /proc/net/dev`; `awk` по `/proc/net/tcp` для uid 13002 | приріст rx на `p2p-*`; ESTABLISHED uid 13002 |
| На чому слухає `mdnsd` | `cat /proc/net/udp /proc/net/udp6` (порт `14E9`); `ls -l /proc/<pid mdnsd>/fd` | сокети 5353 і чи бачить `mdnsd` адресу `wlan0` |
| Файрвол | `nft list ruleset` | правила `base-player-rt` на `wlan0` і `wlan_bridge`; жодних на `p2p-*` |
| Стан приймача | `cat /run/base-player/status.json`; `journalctl -u base-player-receiver --no-pager -n 200` | `running`, `discovery_failed` |
| Чи бачить друга MGU | `ip neigh show dev wlan0` | MAC/IP телефону друга в підмережі hotspot |
| Аудіомаршрут | `inspect_bmw_contracts.js` / `getListMainConnections` (метод читання) | джерело на `MediaSink_Front` до і після старту AirPlay друга, стан `CS_*` |

На стороні телефонів заміри такі. На твоєму iPhone: лічильник підключених пристроїв на екрані Personal Hotspot, а при активному CarPlay ще три спроби: Screen Mirroring, route picker у «Музиці» і AirPlay з YouTube, з фіксацією, чи є «Base Player» у списку і що стається зі звуком CarPlay. На телефоні друга: той самий список, спершу на твоєму hotspot, потім на `wlan_bridge`. Якщо є Mac, підключений до твого hotspot, команда `dns-sd -B _airplay._tcp` об'єктивно покаже, чи йде оголошення в підмережу.

## Що це означає для коду Base Player

| Тема | Рішення | Файли |
|---|---|---|
| Де оголошуватись | Лишити `WLAN = ['wlan_bridge','wlan0','wlan1']` і механізм 5353 + правило 1099 тільки для інтерфейсу лізи. **Ніколи** не відкривати 7100-7104/5353 на `p2p-*`: це інтерфейс CarPlay, а hotspot-шлях робить його непотрібним. Пункт 3 з розділу CarPlay у плані прибрати | `airplay/network.js`, `CONNECTION_PLAN.md` |
| Пізня ліза (#352) | Hotspot може з'явитися через хвилини після старту, тому пункти D і E стають критичними. Перереєструвати UxPlay, коли з'являється або змінюється ліза чи перезапускається `mdnsd`, але лише без активної сесії. HLS вирішувати за поточним станом, а не раз на Connect | `backend.js`, `receiver.js` |
| Виявлення CarPlay | Робити тільки читанням: `status.json` (`wifi.paused`) плюс приріст на `p2p-*` і TCP uid 13002, як у `projection.go`. `carplay_focus.js` лишається `canClaim:false`, без викликів | новий read-only модуль, `carplay_focus.js` |
| Підказка на екрані | Коли CarPlay активний, показувати: «Ваш iPhone у CarPlay. Пасажир: підключіться до hotspot "<ssid>" і виберіть Base Player». SSID брати з `status.json` | `view.js`, `i18n.js` |
| Аудіомаршрут | Брати маршрут лише на подію `media` (пункт B). `CS_SUSPENDED` вважати нормальним станом, бо дзвінки й підказки навігації його ставлять (пункт C). Якщо AudioManager відмовив або водій сам вибрав CarPlay, не боротися: показати повідомлення і чекати наступної події `media`. Під час CarPlay не відновлювати автоматично «попереднє» джерело на `release`, бо це запис у вибір джерела BMW від імені водія. Підказки навігації CarPlay змішуються поверх нашого звуку, це очікувано | `audio_route.js`, `backend.js` |
| Ефір | Під час CarPlay дзеркалення й HLS ділять радіо з потоком CarPlay близько 25 Мбіт/с. Лишити `1280x720@30`, додати опцію зниження fps або роздільності, коли CarPlay активний, і поміряти, чи CarPlay не сипеться | `receiver.js` |
| Фокус екрана | Нічого не перехоплювати. Картинка показується, коли водій відкрив застосунок. Можна додати паузу декодування, поки поверхня невидима, щоб не палити CPU на фоні | `main.js`, `backend.js` |
| Другий телефон | Повідомляти на екрані, що приймач зайнятий, або дати новому телефону перехопити сесію (`-nohold`). Для сценарію «друг» це важливо | `receiver.js`, `view.js` |
| Заборона | `launch.js` «Never touches CarPlay» лишається інваріантом. Тест має перевіряти, що жоден шлях коду не викликає `systemctl` щодо `carplay`/`aapd` і не звертається до `CarPlayManager`/DevicePresentation | тести runtime |

## Conclusion

Завдяки hotspot-лінку тепер найпростіше думати про Base Player як про пристрій у **підмережі твого hotspot**, а не в мережі CarPlay. CarPlay лишається окремою P2P-групою, яку Base Player не бачить і не чіпає. Усе корисне (інтернет для Store і YouTube, оголошення приймача, підключення друга) живе на `wlan0` у тій самій підмережі. Тож задача «друг AirPlay-їть, поки я в CarPlay» зводиться до двох вимірюваних питань: чи пропускає iOS-hotspot трафік між клієнтами і чи віддає BMW AudioManager `MediaSink_Front` при живому CarPlay. Питання про твій власний iPhone окреме, і його вирішує політика iOS, а не мережа.

Друге спостереження: найбільший технічний ризик схеми — ефір, а не протоколи. Одне радіо BCM4359 несе CarPlay, аплінк і, можливо, `wlan_bridge`, і кожен мегабіт AirPlay-відео конкурує з потоком CarPlay. Тому перший запуск сценарію з другом варто робити з обмеженим бітрейтом і з паралельним спостереженням за плавністю CarPlay. Якщо firmware працює в MCC, а не в RSDB, правильною відповіддю буде ще нижчий бітрейт або аудіо-профіль для пасажира, а не будь-яке втручання в CarPlay.
