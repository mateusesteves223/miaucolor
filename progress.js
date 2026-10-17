"use strict";

/* Progresso do jogador em localStorage (versionado para não quebrar saves futuros).
 * { v, stars: {id: 1..3}, best: {id: segundos}, unlocked: id, inProgress: {id, marks, lives, elapsed} } */
const Progress = (() => {
  const KEY = "miaucolor:v1";
  const defaults = () => ({ v: 1, stars: {}, best: {}, unlocked: 1, inProgress: null });

  function load() {
    try {
      const d = JSON.parse(localStorage.getItem(KEY));
      return d && d.v === 1 ? { ...defaults(), ...d } : defaults();
    } catch {
      return defaults();                     // JSON corrompido ou storage indisponível
    }
  }

  let data = load();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch {} };

  return {
    get unlocked() { return data.unlocked; },
    stars: id => data.stars[id] || 0,
    best: id => data.best[id] || null,
    totalStars: () => Object.values(data.stars).reduce((a, b) => a + b, 0),

    /* Nível para continuar: a partida em andamento ou o último desbloqueado */
    current: () => (data.inProgress ? data.inProgress.id : data.unlocked),

    complete(id, stars, secs, totalLevels) {
      data.stars[id] = Math.max(data.stars[id] || 0, stars);
      if (!data.best[id] || secs < data.best[id]) data.best[id] = secs;
      if (id >= data.unlocked && id < totalLevels) data.unlocked = id + 1;
      data.inProgress = null;
      save();
    },

    saveProgress(p) { data.inProgress = p; save(); },
    getProgress: id => (data.inProgress && data.inProgress.id === id ? data.inProgress : null),
    clearProgress() { if (data.inProgress) { data.inProgress = null; save(); } },
  };
})();
