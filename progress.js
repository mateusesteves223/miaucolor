"use strict";

/* Progresso do jogador em localStorage (versionado para não quebrar saves futuros).
 * { v, stars: {id: 1..3}, best: {id: segundos}, unlocked: id, inProgress: {id, marks, lives, elapsed} } */
const Progress = (() => {
  // Chave fixa (independente da versão do formato): a versão fica em data.v.
  const KEY = "miaucolor:v1";
  const isObj = o => o !== null && typeof o === "object" && !Array.isArray(o);

  /* Migrações encadeadas: migrations[n] converte um save da versão n para n+1.
   * Para evoluir o formato, adicione migrations[2] = d => ({ ...d, novoCampo: ... })
   * e o CURRENT_VERSION passa a ser calculado automaticamente. Nunca descarte dados antigos. */
  const migrations = {
    1: d => ({ ...d, v: 2 }),                // v1 -> v2: formato idêntico; apenas marca a versão
  };
  const CURRENT_VERSION = Math.max(...Object.keys(migrations).map(Number)) + 1;

  const defaults = () => ({ v: CURRENT_VERSION, stars: {}, best: {}, unlocked: 1, inProgress: null });

  function migrate(raw) {
    let d = { ...raw };
    let v = Number.isInteger(d.v) && d.v >= 1 ? d.v : 1;
    while (v < CURRENT_VERSION) {
      const fn = migrations[v];
      if (!fn) break;                        // lacuna na cadeia: mantém o que há e sanitiza
      d = fn(d);
      v = d.v = v + 1;
    }
    d.v = CURRENT_VERSION;                   // saves de versão futura também são preservados (sanitizados)
    return d;
  }

  // Garante os tipos esperados; valores inválidos caem nos padrões.
  function sanitize(d) {
    const out = defaults();
    const num = (n, min) => typeof n === "number" && isFinite(n) && n >= min;
    for (const k of ["stars", "best"]) {
      if (!isObj(d[k])) continue;
      for (const [id, val] of Object.entries(d[k])) {
        if (k === "stars" ? Number.isInteger(val) && val >= 1 && val <= 3 : num(val, 0)) out[k][id] = val;
      }
    }
    if (Number.isInteger(d.unlocked) && d.unlocked >= 1) out.unlocked = d.unlocked;
    const p = d.inProgress;
    out.inProgress = isObj(p) && Number.isInteger(p.id) && p.id >= 1 ? p : null;
    return out;
  }

  // Fallback em memória: usado quando localStorage lança (modo anônimo, bloqueio, cota).
  let memoryStore = null;

  function readRaw() {
    try {
      const s = localStorage.getItem(KEY);
      if (s !== null) return JSON.parse(s);
    } catch { /* storage indisponível ou JSON corrompido */ }
    return memoryStore;
  }

  function load() {
    try {
      const raw = readRaw();
      return isObj(raw) ? sanitize(migrate(raw)) : defaults();
    } catch {
      return defaults();
    }
  }

  let data = load();                         // estado em memória é sempre a fonte da sessão
  const save = () => {
    try { memoryStore = JSON.parse(JSON.stringify(data)); } catch { /* ignora */ }
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* segue só em memória */ }
  };

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
