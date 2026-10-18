"use strict";

/* Anúncios: banner fixo de rodapé + anúncios recompensados (rewarded).
 * Por padrão usa uma SIMULAÇÃO (sem rede, sem SDK). Para integrar uma rede real, chame
 * Ads.setProvider({ showBanner(el), showRewarded() }) antes de Ads.init():
 *   showBanner(el)   -> renderiza o banner dentro de `el` (pode ser assíncrono);
 *   showRewarded()   -> Promise<boolean> (true = o usuário assistiu até o fim).
 * Nenhuma função daqui lança exceção: falhas (offline, SDK ausente) viram um resultado. */
const Ads = (() => {
  const SIM_SECONDS = 3;                     // duração do vídeo simulado
  let bannerEl = null;
  let provider = null;
  let busy = false;                          // um único anúncio recompensado por vez

  const isOffline = () => typeof navigator !== "undefined" && navigator.onLine === false;

  /* Provedor de simulação: banner de espaço reservado e vídeo com contagem regressiva */
  const simulation = {
    showBanner(el) {
      const label = document.createElement("span");
      label.className = "ad-banner-label";
      label.textContent = "Publicidade";
      el.replaceChildren(label);
    },
    showRewarded() {
      return new Promise(resolve => {
        const overlay = document.createElement("div");
        overlay.className = "ad-overlay";
        overlay.setAttribute("role", "dialog");
        overlay.setAttribute("aria-modal", "true");
        overlay.setAttribute("aria-label", "Anúncio em vídeo");
        const box = document.createElement("div");
        box.className = "ad-overlay-card";
        const title = document.createElement("strong");
        title.textContent = "🎬 Anúncio (simulação)";
        const count = document.createElement("span");
        count.className = "ad-overlay-count";
        const actions = document.createElement("div");
        actions.className = "modal-actions";
        const claim = document.createElement("button");
        claim.type = "button";
        claim.textContent = "Receber recompensa";
        claim.hidden = true;
        const close = document.createElement("button");
        close.type = "button";
        close.className = "secondary";
        close.textContent = "Fechar";
        actions.append(claim, close);
        box.append(title, count, actions);
        overlay.appendChild(box);
        document.body.appendChild(overlay);

        let left = SIM_SECONDS;
        let timer = 0;
        const finish = ok => { clearInterval(timer); overlay.remove(); resolve(ok); };
        const render = () => { count.textContent = left > 0 ? `Recompensa em ${left}s…` : "Pronto! Recompensa liberada."; };
        render();
        timer = setInterval(() => {
          left--;
          render();
          if (left <= 0) { clearInterval(timer); claim.hidden = false; claim.focus(); }
        }, 1000);
        claim.addEventListener("click", () => finish(true));
        close.addEventListener("click", () => finish(false));
      });
    },
  };

  function loadBanner() {
    if (!bannerEl) return;
    try {
      const out = (provider || simulation).showBanner(bannerEl);
      if (out && typeof out.catch === "function") out.catch(() => {});
    } catch { /* banner é opcional: o espaço reservado continua no lugar */ }
  }

  return {
    /* Monta o banner no #ad-banner (altura fixa no CSS: sem salto de layout) e o recarrega ao voltar online */
    init() {
      bannerEl = document.getElementById("ad-banner");
      if (!bannerEl) return;
      if (!isOffline()) loadBanner();
      window.addEventListener("online", loadBanner);
    },

    setProvider(p) { provider = p && typeof p.showRewarded === "function" ? p : null; },

    /* Resolve sempre: { rewarded: boolean, reason?: "offline" | "busy" | "dismissed" | "error" } */
    async showRewarded() {
      if (busy) return { rewarded: false, reason: "busy" };
      if (isOffline()) return { rewarded: false, reason: "offline" };
      busy = true;
      try {
        const ok = await (provider || simulation).showRewarded();
        return ok ? { rewarded: true } : { rewarded: false, reason: "dismissed" };
      } catch {
        return { rewarded: false, reason: "error" };
      } finally {
        busy = false;
      }
    },
  };
})();
