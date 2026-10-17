"use strict";

/* Carregador de níveis pré-gerados (ver tools/gen_levels.py).
 * Cada pack é um <script> que chama MiauLevels.register(pack); funciona abrindo
 * index.html direto do disco e é fácil de pré-cachear no service worker.
 * levels/manifest.js informa quantos packs/níveis existem (setMeta). */
const MiauLevels = (() => {
  const packs = new Map();       // número do pack -> níveis
  const byId = new Map();
  let meta = { packs: 0, total: 0, packSize: 20 };

  const setMeta = m => { meta = m; };

  function register(pack) {
    packs.set(pack.pack, pack.levels);
    for (const lv of pack.levels) byId.set(lv.id, lv);
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error("Falha ao carregar " + src));
      document.head.appendChild(s);
    });
  }

  async function loadPack(k) {
    if (!packs.has(k)) await loadScript(`levels/pack-${String(k).padStart(2, "0")}.js`);
    return packs.get(k);
  }

  /* Converte o formato compacto em { n, regions[r][c], solution[r], id, diff, tier } */
  function decode(lv) {
    const regions = Array.from({ length: lv.n }, (_, r) =>
      Array.from({ length: lv.n }, (_, c) => lv.regions.charCodeAt(r * lv.n + c) - 65));
    return { ...lv, regions, solution: lv.solution.slice() };
  }

  /* Acima do último pack o jogo é infinito (ver infinite.js) */
  const isInfinite = id => id > meta.total;
  const needsGeneration = id => isInfinite(id) && !InfiniteLevels.has(id);

  async function get(id) {
    if (isInfinite(id)) return InfiniteLevels.get(id);
    if (!byId.has(id)) {
      try { await loadPack(Math.floor((id - 1) / meta.packSize) + 1); } catch { return null; }
    }
    return byId.has(id) ? decode(byId.get(id)) : null;
  }

  /* Metadados (id, n, diff) de todos os níveis, para o mapa */
  async function loadAll() {
    const out = [];
    for (let k = 1; k <= meta.packs; k++) {
      try { out.push(...await loadPack(k)); } catch { /* pack ausente: ignora */ }
    }
    return out;
  }

  return { register, setMeta, get, loadAll, isInfinite, needsGeneration, get total() { return meta.total; } };
})();
