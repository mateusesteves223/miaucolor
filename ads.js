"use strict";

/* Anúncios via Poki SDK (único provedor; a versão com AdSense está na tag git `pre-poki`).
 * Ordem exigida pela Poki: init() -> gameLoadingFinished() -> gameplayStart()/gameplayStop().
 * As chamadas de gameplay feitas antes disso só registram o estado desejado e são aplicadas depois.
 * commercialBreak (entre níveis) e rewardedBreak (power-ups) pausam o gameplay e silenciam o som.
 * Sem SDK (bloqueador, offline, file://) nada quebra: os breaks resolvem na hora. Com ?dev na URL,
 * o vídeo recompensado é simulado para testar o fluxo localmente.
 * Nenhuma função daqui lança exceção: falhas viram um resultado. */
const Ads = (() => {
  const SIM_SECONDS = 3;                     // duração do vídeo simulado (?dev)
  const devSim = new URLSearchParams(location.search).has("dev");
  const sdk = () => (typeof PokiSDK !== "undefined" ? PokiSDK : null);

  let initDone = false;                      // init() resolveu (ou falhou: bloqueador)
  let adblock = false;
  let loaded = false;                        // o jogo terminou de carregar (primeiro nível montado)
  let ready = false;                         // gameLoadingFinished() já foi enviado
  let wantGameplay = false;                  // estado pedido pelo jogo
  let gameplayOn = false;                    // estado informado ao SDK
  let busy = false;                          // um break por vez

  const isOffline = () => navigator.onLine === false;
  const call = (fn, ...args) => { try { return sdk()[fn](...args); } catch { return undefined; } };

  function syncGameplay() {
    if (!ready || wantGameplay === gameplayOn) return;
    gameplayOn = wantGameplay;
    call(gameplayOn ? "gameplayStart" : "gameplayStop");
  }

  function flushLoading() {
    if (ready || !initDone || !loaded || !sdk()) return;
    ready = true;
    call("gameLoadingFinished");
    syncGameplay();
  }

  /* Simulação do vídeo recompensado (só com ?dev) */
  function simulateRewarded() {
    return new Promise(resolve => {
      const overlay = document.createElement("div");
      overlay.className = "ad-overlay";
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");
      overlay.dataset.i18nAttr = "aria-label:ads.video.aria";
      overlay.setAttribute("aria-label", I18n.t("ads.video.aria"));
      const box = document.createElement("div");
      box.className = "ad-overlay-card";
      const title = document.createElement("strong");
      title.dataset.i18n = "ads.video.title";
      title.textContent = I18n.t("ads.video.title");
      const count = document.createElement("span");
      count.className = "ad-overlay-count";
      const actions = document.createElement("div");
      actions.className = "modal-actions";
      const claim = document.createElement("button");
      claim.type = "button";
      claim.dataset.i18n = "ads.video.claim";
      claim.textContent = I18n.t("ads.video.claim");
      claim.hidden = true;
      const close = document.createElement("button");
      close.type = "button";
      close.className = "secondary";
      close.dataset.i18n = "ads.video.close";
      close.textContent = I18n.t("ads.video.close");
      actions.append(claim, close);
      box.append(title, count, actions);
      overlay.appendChild(box);
      document.body.appendChild(overlay);

      let left = SIM_SECONDS;
      let timer = 0;
      const finish = ok => { clearInterval(timer); overlay.remove(); resolve(ok); };
      const render = () => { count.textContent = left > 0 ? I18n.t("ads.video.wait", { n: left }) : I18n.t("ads.video.ready"); };
      render();
      timer = setInterval(() => {
        left--;
        render();
        if (left <= 0) { clearInterval(timer); claim.hidden = false; claim.focus(); }
      }, 1000);
      claim.addEventListener("click", () => finish(true));
      close.addEventListener("click", () => finish(false));
    });
  }

  /* Executa um break: gameplay parado e som mudo só enquanto o anúncio roda (callback de início do SDK) */
  async function runBreak(fn) {
    busy = true;
    wantGameplay = false;
    syncGameplay();
    try {
      return await fn(() => Sound.mute(true));
    } finally {
      Sound.mute(false);
      busy = false;
    }
  }

  return {
    init() {
      const s = sdk();
      if (!s) return;
      const done = () => { initDone = true; flushLoading(); };
      try {
        s.init().then(done, () => { adblock = true; done(); });
      } catch { adblock = true; done(); }
    },

    /* Chamado uma vez, quando o primeiro nível está montado e jogável */
    loadingFinished() { loaded = true; flushLoading(); },

    gameplayStart() { wantGameplay = true; syncGameplay(); },
    gameplayStop() { wantGameplay = false; syncGameplay(); },

    /* Intersticial entre partidas. Resolve sempre (sem SDK: na hora). */
    async commercialBreak() {
      if (busy || !ready || adblock || isOffline()) return;
      try {
        await runBreak(onStart => sdk().commercialBreak(onStart));
      } catch { /* sem anúncio: segue o jogo */ }
    },

    /* Resolve sempre: { rewarded: boolean, reason?: "offline" | "busy" | "dismissed" | "unavailable" } */
    async showRewarded() {
      if (busy) return { rewarded: false, reason: "busy" };
      if (isOffline()) return { rewarded: false, reason: "offline" };
      const useSdk = ready && !adblock;
      if (!useSdk && !devSim) return { rewarded: false, reason: "unavailable" };
      try {
        const ok = await runBreak(onStart => (useSdk ? sdk().rewardedBreak(onStart) : simulateRewarded()));
        return ok ? { rewarded: true } : { rewarded: false, reason: "dismissed" };
      } catch {
        return { rewarded: false, reason: "unavailable" };
      }
    },
  };
})();
