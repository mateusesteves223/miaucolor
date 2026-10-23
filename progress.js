"use strict";

/* Progresso do jogador em localStorage (versionado para não quebrar saves futuros).
 * { v, stars: {id: 1..3}, best: {id: segundos}, unlocked: id, totalScore, inProgress: {id, marks, lives, elapsed, score},
 *   items: {hint, revealCat, safeCross}, installed, language } */
const Progress = (() => {
  // Chave fixa (independente da versão do formato): a versão fica em data.v.
  // Mantida após o rebranding para MeowColor: renomear apagaria os saves existentes.
  const KEY = "miaucolor:v1";
  const LANGS = ["pt", "en", "es"];          // idiomas suportados (espelha I18n.LANGS)
  const isObj = o => o !== null && typeof o === "object" && !Array.isArray(o);

  /* Migrações encadeadas: migrations[n] converte um save da versão n para n+1.
   * Para evoluir o formato, adicione migrations[2] = d => ({ ...d, novoCampo: ... })
   * e o CURRENT_VERSION passa a ser calculado automaticamente. Nunca descarte dados antigos. */
  const migrations = {
    1: d => ({ ...d, v: 2 }),                // v1 -> v2: formato idêntico; apenas marca a versão
    2: d => ({ ...d, totalScore: Number.isFinite(d.totalScore) && d.totalScore >= 0 ? d.totalScore : 0, v: 3 }),   // v2 -> v3: placar geral
    3: d => ({ ...d, items: { ...defaultItems(), ...(isObj(d.items) ? d.items : {}) }, v: 4 }),                   // v3 -> v4: inventário de power-ups
        4: d => ({ ...d, installed: d.installed === true, v: 5 }),                                                    // v4 -> v5: flag de PWA instalado
    5: d => ({ ...d, language: LANGS.includes(d.language) ? d.language : null, v: 6 }),                             // v5 -> v6: idioma escolhido manualmente (null = automático)
      };
  const CURRENT_VERSION = Math.max(...Object.keys(migrations).map(Number)) + 1;

  const ITEM_KEYS = ["hint", "revealCat", "safeCross"];
  const ITEM_START = 3;                      // estoque inicial (e de saves antigos) de cada item
  const ITEM_MAX = 99;
  function defaultItems() { return { hint: ITEM_START, revealCat: ITEM_START, safeCross: ITEM_START }; }

  const defaults = () => ({ v: CURRENT_VERSION, stars: {}, best: {}, unlocked: 1, totalScore: 0,   inProgress: null, items: defaultItems(), installed: false, language: null });

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
    if (num(d.totalScore, 0)) out.totalScore = Math.floor(d.totalScore);
    if (d.installed === true) out.installed = true;
    if (LANGS.includes(d.language)) out.language = d.language;
    if (isObj(d.items)) {
      for (const k of ITEM_KEYS) {
        if (Number.isInteger(d.items[k]) && d.items[k] >= 0) out.items[k] = Math.min(d.items[k], ITEM_MAX);
      }
    }
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
    get totalScore() { return data.totalScore; },

    /* 1234 -> "1.2k", 45800 -> "45.8k", 1250000 -> "1.2M" (truncado, nunca arredonda para cima) */
    formatScore(num) {
      const n = Math.max(0, Math.floor(Number(num) || 0));
      const short = (tenths, s) => (tenths / 10).toString() + s;   // aritmética inteira evita 45.8 -> 45.7
      if (n >= 1e6) return short(Math.floor(n / 1e5), "M");
      if (n >= 1e3) return short(Math.floor(n / 100), "k");
      return String(n);
    },

    /* Nível para continuar: a partida em andamento ou o último desbloqueado */
    current: () => (data.inProgress ? data.inProgress.id : data.unlocked),

    complete(id, stars, secs, totalLevels, score = 0) {
      if (Number.isFinite(score) && score > 0) data.totalScore += Math.floor(score);
      data.stars[id] = Math.max(data.stars[id] || 0, stars);
      if (!data.best[id] || secs < data.best[id]) data.best[id] = secs;
      if (id >= data.unlocked && id < totalLevels) data.unlocked = id + 1;
      data.inProgress = null;
      save();
    },

    /* Inventário de power-ups: hint | revealCat | safeCross */
    item: key => data.items[key] || 0,
    useItem(key) {                           // consome 1 unidade; false se não há estoque
      if (!ITEM_KEYS.includes(key) || data.items[key] <= 0) return false;
      data.items[key]--;
      save();
      return true;
    },
    addItem(key, n = 3) {                    // credita unidades (ex.: recompensa de anúncio); devolve o novo estoque
      if (!ITEM_KEYS.includes(key) || !Number.isInteger(n) || n <= 0) return this.item(key);
      data.items[key] = Math.min(ITEM_MAX, data.items[key] + n);
      save();
      return data.items[key];
    },

    /* Idioma escolhido manualmente ("pt" | "en" | "es"); null = seguir o navegador */
    get language() { return data.language; },
    setLanguage(lang) {
      if (lang !== null && !LANGS.includes(lang)) return;
      data.language = lang;
      save();
    },

    saveProgress(p) { data.inProgress = p; save(); },
    getProgress: id => (data.inProgress && data.inProgress.id === id ? data.inProgress : null),
    clearProgress() { if (data.inProgress) { data.inProgress = null; save(); } },
  };
})();
