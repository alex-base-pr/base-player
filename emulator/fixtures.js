'use strict';
/* Representative states for the emulator's scene picker. */
module.exports = [
  { name: 'Готово (код)', state: { phase: 'idle', pin: '569 156', connected: false } },
  { name: 'Звук (метадані)', state: { phase: 'audio', connected: true, music: { title: 'Nightcall', artist: 'Kavinsky', album: 'OutRun', playbackState: 'playing', shuffle: 1, repeat: 2, controls: { previous:1, playPause:1, next:1, shuffle:1, repeat:1 } } } },
  { name: 'Звук (очікування)', state: { phase: 'audio', connected: false, pin: '569 156', music: {} } },
  { name: 'Повтор екрана', state: { phase: 'mirror', connected: true, mode: 'mirror' } },
  { name: 'Відео грає', state: { phase: 'video', connected: true, mode: 'hls' } },
  { name: 'Завантаження', state: { phase: 'loading', buffering: true } },
  { name: 'Помилка: сертифікат/годинник', state: { phase: 'error', error: 'certificate' } },
  { name: 'Помилка: нема інтернету', state: { phase: 'error', error: 'offline' } },
  { name: 'Помилка: формат', state: { phase: 'error', error: 'unsupported' } },
  { name: 'Нотіс', state: { phase: 'idle', pin: '569 156', notice: 'Приймач ще запускається. Спробуй ще раз.' } },
];
