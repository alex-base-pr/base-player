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
  { name: 'Receiver missing', state: { phase: 'idle' }, notice: 'Receiver is missing: install "Base Player receiver" in the Store from the "Releases" source.' },
];
