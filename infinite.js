"use strict";

/* Níveis infinitos (a partir do último nível dos packs): sempre 10x10, dificuldade variável.
 * - Determinístico: o nível N vem da seed "inf:N" (mesmo mapa em qualquer dispositivo).
 * - Salvo: cada nível gerado fica em localStorage; se for apagado, é regenerado igual.
 * - Fluido: gera em Web Worker e antecipa os próximos níveis enquanto o jogador joga. */
const InfiniteLevels = (() => {
  const CACHE_KEY = "miaucolor:gen:v1";
  const KEEP = 300;               // quantos níveis gerados manter salvos
  const AHEAD = 3;                // quantos níveis à frente gerar em segundo plano

  /* O cache vem do localStorage (não confiável): só entram entradas bem formadas. Uma entrada
   * descartada não perde nada, o nível é regenerado igual a partir da seed. */
  const DIFFS = ["Fácil", "Médio", "Difícil", "Expert"];   // rótulos de difficultyLabel (engine.js)
  const validEntry = e => Array.isArray(e) && e.length === 5 &&
    typeof e[0] === "string" && /^[A-J]{100}$/.test(e[0]) &&
    typeof e[1] === "string" && /^\d{10}$/.test(e[1]) && new Set(e[1]).size === 10 &&
    Number.isInteger(e[2]) && typeof e[3] === "number" && isFinite(e[3]) && DIFFS.includes(e[4]);

  let cache = loadCache();        // { id: [regions, solution (string), tier, score, diff] }
  let job = null;                 // { id, worker, promise, urgent }
  let aheadFrom = null;

  function loadCache() {
    let raw;
    try { raw = JSON.parse(localStorage.getItem(CACHE_KEY)); } catch { return {}; }
    const out = {};
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      for (const [id, e] of Object.entries(raw)) if (/^[1-9]\d*$/.test(id) && validEntry(e)) out[id] = e;
    }
    return out;
  }
  function saveCache() {
    const ids = Object.keys(cache).map(Number).sort((a, b) => a - b);
    for (const id of ids.slice(0, Math.max(0, ids.length - KEEP))) delete cache[id];
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch { /* sem espaço: segue sem salvar */ }
  }

  const has = id => id in cache;
  const info = id => (has(id) ? { diff: cache[id][4] } : null);

  function store(level) {
    cache[level.id] = [level.regions, level.solution.join(""), level.tier, level.score, level.diff];
    saveCache();
  }

  function decode(id) {
    const [regions, sol, tier, score, diff] = cache[id];
    const n = 10;
    return {
      id, n, tier, score, diff,
      regions: Array.from({ length: n }, (_, r) =>
        Array.from({ length: n }, (_, c) => regions.charCodeAt(r * n + c) - 65)),
      solution: sol.split("").map(Number),
    };
  }

  /* Gera o nível `id` num Worker. Resolve com o nível ou null se cancelado. */
  function generate(id, urgent) {
    if (job && job.id === id) { job.urgent = job.urgent || urgent; return job.promise; }
    if (job) cancel();
    const mine = { id, urgent, worker: null, promise: null, resolve: null };
    job = mine;
    mine.promise = new Promise(resolve => {
      mine.resolve = resolve;
      const finish = level => {
        if (job === mine) job = null;
        if (mine.worker) mine.worker.terminate();
        mine.worker = null;
        if (level) store(level);
        resolve(level);
        pump();
      };
      try {
        mine.worker = spawnEngineWorker("onmessage = e => postMessage(E.generateInfinite(e.data));");
        mine.worker.onmessage = e => finish(e.data);
        mine.worker.onerror = () => { mine.worker.terminate(); mine.worker = null; finish(createEngine().generateInfinite(id)); };
        mine.worker.postMessage(id);
      } catch {
        finish(createEngine().generateInfinite(id));   // sem Worker: gera na thread principal
      }
    });
    return mine.promise;
  }

  function cancel() {
    const old = job;
    job = null;
    if (old.worker) { old.worker.terminate(); old.worker = null; }
    old.resolve(null);
  }

  /* Gera, em segundo plano, os próximos níveis ainda não salvos */
  function pump() {
    if (job || aheadFrom === null) return;
    for (let id = aheadFrom + 1; id <= aheadFrom + AHEAD; id++) {
      if (!has(id)) { generate(id, false); return; }
    }
  }

  function prefetchAhead(fromId) {
    aheadFrom = fromId;
    pump();
  }

  async function get(id) {
    if (!has(id)) {
      const level = await generate(id, true);
      if (!level) return null;       // cancelado por um pedido mais novo
    }
    return decode(id);
  }

  return { has, info, get, prefetchAhead };
})();
