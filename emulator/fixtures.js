'use strict';
/* Representative states for the emulator's scene picker: what the backend
 * sends (apps/base_player/receiver.js, backend.js) and, per scene, the notice
 * the frontend would show after a button press. */
var MUSIC = { title: 'Nightcall', artist: 'Kavinsky', album: 'OutRun', playbackState: 'playing', shuffle: 1, repeat: 2,
    controls: { previous: true, playPause: true, next: true, shuffle: true, repeat: true } };
module.exports = [
  { name: 'Ready to connect', state: { phase: 'idle' } },
  { name: 'Starting', state: { phase: 'starting' } },
  { name: 'Pairing code', state: { phase: 'waiting', mode: 'waiting', pin: '5691' } },
  { name: 'Connected, waiting', state: { phase: 'waiting', mode: 'waiting', connected: true } },
  { name: 'Music playing', state: { phase: 'audio', mode: 'audio', connected: true, music: MUSIC } },
  { name: 'Music, Cyrillic title', state: { phase: 'audio', mode: 'audio', connected: true, music: { title: '\u041a\u0443\u0440\u2019\u0454\u0440 / \u041a\u0443\u0440\u044c\u0435\u0440 2 \u0441\u0435\u0437\u043e\u043d', artist: '\u041e\u043a\u0435\u0430\u043d \u0415\u043b\u044c\u0437\u0438', album: '', playbackState: 'paused', shuffle: 0, repeat: 0, controls: { previous: true, playPause: true, next: true, shuffle: false, repeat: false } } } },
  { name: 'Music, waiting', state: { phase: 'waiting', mode: 'audio', pin: '5691', music: {} } },
  { name: 'Video loading', state: { phase: 'loading', mode: 'hls', connected: true } },
  { name: 'Error: certificate / clock', state: { phase: 'waiting', mode: 'waiting', connected: true, error: 'certificate' } },
  { name: 'Error: no internet', state: { phase: 'waiting', mode: 'waiting', pin: '5691', error: 'offline' } },
  { name: 'Ready, Web TV on', state: { phase: 'idle', webTv: true, webTvAvailable: true } },
  { name: 'Web TV loading', state: { phase: 'loading', mode: 'webtv', webTvPhase: 'loading', webTv: true, webTvAvailable: true } },
  { name: 'Web TV error', state: { phase: 'loading', mode: 'webtv', webTvPhase: 'loading', error: 'webtv_network', webTv: true, webTvAvailable: true } },
  { name: 'Event log', state: { phase: 'waiting', mode: 'waiting', connected: true, logView: { url: 'http://192.168.1.1:7105', lines: [
    '09:41:02 app backend started, Base Player 0.4.1, node v8.17.0', '09:41:02 net internet: no', '09:41:20 ui start auto',
    '09:41:21 state phase=waiting mode=waiting connected=false', '09:41:21 airplay MGU_FEATURES video-modes',
    '09:42:05 state connected=true', '09:42:07 airplay MGU_AUDIO_PLAY', '09:42:07 state phase=audio mode=audio',
    '09:43:30 airplay MGU_MODE hls', '09:43:31 airplay MGU_MEDIA_FAILED offline', '09:43:31 diag hls_dns_failed',
    '09:43:31 state phase=waiting mode=waiting error=offline'] } } },
  { name: 'Event log, no Wi-Fi', state: { phase: 'idle', logView: { url: '', lines: [], loading: true } } },
  { name: 'Receiver missing', state: { phase: 'idle' }, notice: 'Receiver is missing: install "Base Player receiver" in the Store from the "Releases" source.' },
];
