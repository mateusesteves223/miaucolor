"use strict";

/* Som e vibração. Os sons são sintetizados com a Web Audio API (sem arquivos de áudio:
 * funciona offline e não tem direitos autorais). O áudio só inicia após um gesto do usuário
 * (política dos navegadores). As preferências ficam em localStorage. */
const Sound = (() => {
  const KEY = "miaucolor:settings:v1";
  const defaults = { sound: true, haptics: true };
  let settings = load();
  let ctx = null;

  function load() {
    try { return { ...defaults, ...JSON.parse(localStorage.getItem(KEY)) }; } catch { return { ...defaults }; }
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* sem espaço */ } }

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  function tone({ freq, to = freq, dur = 0.12, type = "sine", gain = 0.1, delay = 0 }) {
    if (!settings.sound) return;
    const c = ensure();
    if (!c) return;
    const t0 = c.currentTime + delay;
    const osc = c.createOscillator();
    const amp = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    amp.gain.setValueAtTime(0.0001, t0);
    amp.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(amp).connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  const vibrate = pattern => { if (settings.haptics && navigator.vibrate) navigator.vibrate(pattern); };

  return {
    unlock: ensure,
    get sound() { return settings.sound; },
    get haptics() { return settings.haptics; },
    setSound(on) { settings.sound = on; save(); },
    setHaptics(on) { settings.haptics = on; save(); if (on) vibrate(15); },

    tap() { tone({ freq: 520, to: 380, dur: 0.05, type: "triangle", gain: 0.07 }); },
    cat() {                                         // "miau": sobe e desce
      tone({ freq: 520, to: 900, dur: 0.12, type: "sawtooth", gain: 0.05 });
      tone({ freq: 900, to: 460, dur: 0.18, type: "sawtooth", gain: 0.05, delay: 0.11 });
      vibrate(15);
    },
    error() {
      tone({ freq: 190, to: 90, dur: 0.25, type: "square", gain: 0.06 });
      vibrate([30, 40, 30]);
    },
    win() {
      [523, 659, 784, 1047].forEach((f, i) => tone({ freq: f, dur: 0.2, type: "triangle", gain: 0.09, delay: i * 0.1 }));
      vibrate([20, 30, 20, 30, 70]);
    },
    lose() {
      [392, 330, 262].forEach((f, i) => tone({ freq: f, to: f * 0.96, dur: 0.22, type: "triangle", gain: 0.09, delay: i * 0.16 }));
      vibrate(120);
    },
  };
})();
