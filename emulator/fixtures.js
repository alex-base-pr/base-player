'use strict';
/* Representative states for the emulator's scene picker: what the backend
 * sends (apps/base_player/receiver.js, backend.js) and, per scene, the notice
 * the frontend would show after a button press. */
var MUSIC = { title: 'Nightcall', artist: 'Kavinsky', album: 'OutRun', playbackState: 'playing', shuffle: 1, repeat: 2,
    controls: { previous: true, playPause: true, next: true, shuffle: true, repeat: true } };
module.exports = [
  { name: 'Not connected', state: { phase: 'idle' } },
  { name: 'Pairing code', state: { phase: 'waiting', mode: 'waiting', pin: '5691' } },
  { name: 'Connected, waiting', state: { phase: 'waiting', mode: 'waiting', connected: true } },
  { name: 'Screen mirroring', state: { phase: 'mirroring', mode: 'mirror', connected: true, frame: { width: 1280, height: 720 } } },
  { name: 'Video playing', state: { phase: 'playing', mode: 'hls', connected: true } },
  { name: 'Music (metadata)', state: { phase: 'audio', mode: 'audio', connected: true, music: MUSIC } },
  { name: 'Music (waiting)', state: { phase: 'waiting', mode: 'audio', pin: '5691', music: {} } },
  { name: 'Error: certificate / clock', state: { phase: 'waiting', mode: 'waiting', pin: '5691', error: 'certificate' } },
  { name: 'Error: no internet', state: { phase: 'waiting', mode: 'waiting', pin: '5691', error: 'offline' } },
  { name: 'Notice', state: { phase: 'idle' }, notice: 'Receiver service is still starting. Please try again.' },
];
