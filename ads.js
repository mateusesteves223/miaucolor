"use strict";

/* Anúncios: banner fixo de rodapé + anúncios recompensados (rewarded).
 * Por padrão usa uma SIMULAÇÃO (sem rede, sem SDK). Para integrar uma rede real, chame
 * Ads.setProvider({ showBanner(el), showRewarded() }) antes de Ads.init():
 *   showBanner(el)   -> renderiza o banner dentro de `el` (pode ser assíncrono);
 *   showRewarded()   -> Promise<boolean> (true = o usuário assistiu até o fim).
 * Nenhuma função daqui lança exceção: falhas (offline, SDK ausente) viram um resultado.
 *
 * Google AdSense: troque as duas constantes abaixo pelos IDs reais da sua conta (e use o mesmo
 * publisher em ads.txt). Enquanto forem os valores de teste (zeros), nada é baixado do Google e a
 * simulação continua ativa. Com IDs reais, o banner passa a ser um bloco AdSense; o AdSense para
 * sites não tem vídeo recompensado, então o rewarded segue na simulação até haver um provedor próprio. */
const Ads = (() => {
  const ADSENSE_CLIENT_ID = "ca-pub-0000000000000000";   // ID do publisher (ads.txt: pub-XXXXXXXXXXXXXXXX)
  const ADSENSE_BANNER_SLOT = "0000000000";              // ID do bloco de anúncios do banner
  const ADSENSE_SRC = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js";
  const SIM_SECONDS = 3;                     // duração do vídeo simulado
  let bannerEl = null;
  let provider = null;
  let busy = false;                          // um único anúncio recompensado por vez
  let adsenseLoading = null;                 // Promise do <script> do AdSense (evita injetar duas vezes)

  const isOffline = () => typeof navigator !== "undefined" && navigator.onLine === false;
  // Modo produção só com IDs reais (16 dígitos, não todos zeros); caso contrário, simulação
  const isProduction = () => /^ca-pub-\d{16}$/.test(ADSENSE_CLIENT_ID) && !/^ca-pub-0+$/.test(ADSENSE_CLIENT_ID)
    && /^\d{6,}$/.test(ADSENSE_BANNER_SLOT) && !/^0+$/.test(ADSENSE_BANNER_SLOT);

  /* Injeta a tag do AdSense sob demanda. Idempotente; em falha (offline/bloqueador) libera nova tentativa. */
  function loadAdSense() {
    if (adsenseLoading) return adsenseLoading;
    adsenseLoading = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.async = true;
      s.crossOrigin = "anonymous";
      s.src = `${ADSENSE_SRC}?client=${encodeURIComponent(ADSENSE_CLIENT_ID)}`;
      s.addEventListener("load", () => resolve());
      s.addEventListener("error", () => { s.remove(); adsenseLoading = null; reject(new Error("adsense")); });
      document.head.appendChild(s);
    });
    return adsenseLoading;
  }

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

  /* Provedor AdSense: banner real; rewarded continua na simulação (AdSense não oferece vídeo recompensado) */
  const adsenseProvider = {
    async showBanner(el) {
      await loadAdSense();
      const ins = document.createElement("ins");
      ins.className = "adsbygoogle";
      ins.dataset.adClient = ADSENSE_CLIENT_ID;
      ins.dataset.adSlot = ADSENSE_BANNER_SLOT;
      ins.dataset.adFormat = "horizontal";
      ins.dataset.fullWidthResponsive = "false";
      el.replaceChildren(ins);
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    },
    showRewarded: () => simulation.showRewarded(),
  };

  function loadBanner() {
    if (!bannerEl) return;
    try {
      const out = (provider || simulation).showBanner(bannerEl);
      if (out && typeof out.catch === "function") out.catch(() => simulation.showBanner(bannerEl));
    } catch { /* banner é opcional: o espaço reservado continua no lugar */ }
  }

  return {
    /* Monta o banner no #ad-banner (altura fixa no CSS: sem salto de layout) e o recarrega ao voltar online */
    init() {
      bannerEl = document.getElementById("ad-banner");
      if (!bannerEl) return;
      if (!provider && isProduction()) provider = adsenseProvider;
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
