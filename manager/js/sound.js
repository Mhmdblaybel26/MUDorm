/* ==========================================================================
   sound.js — short sound effects for the whole site (DMS.sound).

   The sounds are generated with the Web Audio API, so there are no audio
   files to load. Five effects:
     notify   two-note chime when a notification arrives
     success  a saved change, a sent request
     info     neutral messages
     warning  something needs attention
     error    an action failed
   Sounds are on by default and can be switched off with the speaker button
   in the header (remembered in localStorage as dms.sound).

   Browsers only allow sound after the visitor has clicked or pressed a key,
   so nothing plays before the first interaction with the page.
   ========================================================================== */
(function (global) {
  'use strict';
  const DMS = (global.DMS = global.DMS || {});
  const storage = DMS.storage;
  const KEY = 'dms.sound';
  const listeners = [];
  let context = null;

  // Per sound: wave shape, loudness, and notes as [frequency in Hz, start in s, length in s].
  const SOUNDS = {
    notify: { wave: 'sine', gain: 0.16, notes: [[880, 0, 0.18], [1318.5, 0.13, 0.42]] },
    success: { wave: 'sine', gain: 0.1, notes: [[523.25, 0, 0.11], [783.99, 0.09, 0.22]] },
    info: { wave: 'sine', gain: 0.08, notes: [[659.25, 0, 0.16]] },
    warning: { wave: 'triangle', gain: 0.1, notes: [[440, 0, 0.13], [392, 0.12, 0.2]] },
    error: { wave: 'triangle', gain: 0.12, notes: [[233.08, 0, 0.15], [196, 0.14, 0.26]] },
  };

  function enabled() { return storage.get(KEY) !== 'off'; }

  function play(name) {
    const sound = SOUNDS[name];
    if (!sound || !context || !enabled()) return;
    const now = context.currentTime;
    sound.notes.forEach(function (note) {
      const start = now + note[1];
      const end = start + note[2];
      const oscillator = context.createOscillator();
      const volume = context.createGain();
      oscillator.type = sound.wave;
      oscillator.frequency.value = note[0];
      // Quick fade in and a longer fade out, so the note never clicks.
      volume.gain.setValueAtTime(0.0001, start);
      volume.gain.exponentialRampToValueAtTime(sound.gain, start + 0.015);
      volume.gain.exponentialRampToValueAtTime(0.0001, end);
      oscillator.connect(volume);
      volume.connect(context.destination);
      oscillator.start(start);
      oscillator.stop(end + 0.03);
    });
  }

  function setEnabled(on) {
    if (on) storage.remove(KEY);
    else storage.set(KEY, 'off');
    listeners.forEach(function (fn) { fn(on); });
    if (on) play('info');
  }

  // The audio context may only be created after a click or key press.
  function unlock() {
    document.removeEventListener('pointerdown', unlock, true);
    document.removeEventListener('keydown', unlock, true);
    const AudioContext = global.AudioContext || global.webkitAudioContext;
    if (!AudioContext) return;
    try {
      context = new AudioContext();
      if (context.state === 'suspended') context.resume();
    } catch (e) {
      context = null;
    }
  }
  document.addEventListener('pointerdown', unlock, true);
  document.addEventListener('keydown', unlock, true);

  DMS.sound = {
    play: play,
    enabled: enabled,
    setEnabled: setEnabled,
    toggle: function () { setEnabled(!enabled()); },
    onChange: function (fn) { listeners.push(fn); },
  };
})(window);
