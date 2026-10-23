"use strict";

/* Service worker desativado (o jogo não é mais PWA). Este arquivo existe só para quem já tinha o
 * SW antigo instalado: o navegador baixa esta versão, ela apaga os caches, se desregistra e recarrega
 * as abas abertas. Sem ela, um 404 manteria o SW antigo servindo o cache para sempre. */
self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) await caches.delete(key);
    await self.registration.unregister();
    for (const client of await self.clients.matchAll({ type: "window" })) client.navigate(client.url);
  })());
});
