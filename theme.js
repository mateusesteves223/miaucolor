"use strict";

/* Tema visual: "cozy" (Almofada ao sol, claro) ou "night" (Vitrine noturna, escuro).
 * Carregado no <head> (sem defer) para marcar <html data-theme> antes da primeira pintura, sem piscar.
 * A preferência fica em localStorage; sem preferência salva, segue o esquema de cores do sistema. */
const Theme = (() => {
  const KEY = "miaucolor:theme:v1";
  const THEMES = ["cozy", "night"];
  const META_COLOR = { cozy: "#f6efe6", night: "#0e0d14" };
  const listeners = [];

  let saved = null;
  try { saved = localStorage.getItem(KEY); } catch { /* sem storage: só a preferência do sistema */ }
  let current = THEMES.includes(saved) ? saved
    : (matchMedia("(prefers-color-scheme: dark)").matches ? "night" : "cozy");

  function paint() {
    document.documentElement.dataset.theme = current;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = META_COLOR[current];
  }

  function set(next) {
    if (!THEMES.includes(next) || next === current) return;
    current = next;
    try { localStorage.setItem(KEY, current); } catch { /* segue só nesta sessão */ }
    paint();
    for (const fn of listeners) fn(current);
  }

  paint();

  /* Modo leve (<html data-lite>): celular com pouca memória ou poucos núcleos perde só os enfeites (style.css).
   * O painel 🎚️ do Modo Dev pode forçar ligado/desligado (chave própria, separada do progresso). */
  let lite = navigator.deviceMemory <= 4 || navigator.hardwareConcurrency <= 4;
  try {
    const tune = JSON.parse(localStorage.getItem("miaucolor:dev-tune") || "null");
    if (tune && typeof tune.flags?.lite === "boolean" && new URLSearchParams(location.search).has("dev")) lite = tune.flags.lite;
  } catch { /* sem storage ou JSON inválido: fica o automático */ }
  document.documentElement.toggleAttribute("data-lite", lite);

  return {
    THEMES, set,
    get current() { return current; },
    onChange(fn) { listeners.push(fn); },
  };
})();
