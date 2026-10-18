"use strict";

/* Service worker do MeowColor: o jogo funciona offline depois da primeira visita.
 * - Pré-cache de todo o "app shell" e dos packs de níveis.
 * - Depois: responde do cache e atualiza em segundo plano (stale-while-revalidate),
 *   então uma nova versão publicada aparece na visita seguinte.
 * Ao alterar a lista abaixo (ou para forçar atualização), incremente CACHE. */
const CACHE = "meowcolor-v7";

// Diretório onde o sw.js está hospedado (ex.: "/repo/miaucolor/"), independente do subdiretório.
const BASE = self.location.pathname.replace(/[^/]*$/, "");
const toAbs = p => new URL(BASE + p.replace(/^\.\//, ""), self.location.origin).href;

const PRECACHE_PATHS = [
  "./",
  "index.html",
  "style.css",
  "script.js",
  "engine.js",
  "infinite.js",
  "levels.js",
  "progress.js",
  "i18n.js",
  "audio.js",
  "ads.js",
  "manifest.webmanifest",
  "levels/manifest.js",
  "levels/pack-01.js",
  "levels/pack-02.js",
  "levels/pack-03.js",
  "levels/pack-04.js",
  "levels/pack-05.js",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/apple-touch-icon.png",
];
const PRECACHE = PRECACHE_PATHS.map(toAbs);   // URLs absolutas já resolvidas sob BASE

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.open(CACHE).then(async cache => {
      let cached = await cache.match(req, { ignoreSearch: true });   // ?dev usa o mesmo cache
      // Navegação (ex.: "/repo/miaucolor" sem barra final ou com query): cai no index sob BASE.
      if (!cached && req.mode === "navigate") cached = await cache.match(toAbs("index.html"));
      const network = fetch(req)
        .then(res => { if (res && res.ok) cache.put(req, res.clone()); return res; })
        .catch(() => null);
      if (cached) { network.catch(() => {}); return cached; }
      return (await network) || new Response("Sem conexão", { status: 503, statusText: "Offline" });
    })
  );
});
