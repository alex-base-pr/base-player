'use strict';
/* Representative states for the emulator's scene picker. */
module.exports = [
  { name: 'Ready (code)', state: { phase: 'idle', pin: '569 156', connected: false } },
  { name: 'Audio (metadata)', state: { phase: 'audio', connected: true, music: { title: 'Nightcall', artist: 'Kavinsky', album: 'OutRun', playbackState: 'playing', shuffle: 1, repeat: 2, controls: { previous:1, playPause:1, next:1, shuffle:1, repeat:1 } } } },
  { name: 'Audio (waiting)', state: { phase: 'audio', connected: false, pin: '569 156', music: {} } },
  { name: 'Screen mirroring', state: { phase: 'mirror', connected: true, mode: 'mirror' } },
  { name: 'Video playing', state: { phase: 'video', connected: true, mode: 'hls' } },
  { name: 'Loading', state: { phase: 'loading', buffering: true } },
  { name: 'Error: certificate/clock', state: { phase: 'error', error: 'certificate' } },
  { name: 'Error: no internet', state: { phase: 'error', error: 'offline' } },
  { name: 'Error: format', state: { phase: 'error', error: 'unsupported' } },
  { name: 'Notice', state: { phase: 'idle', pin: '569 156', notice: 'Receiver still starting. Try again.' } },
];
