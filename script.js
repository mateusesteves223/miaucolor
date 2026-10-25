"use strict";

/* =====================================================================
 * MEOWCOLOR
 * Estado:
 *   solution[r] = c        -> coluna do gato na linha r (uma permutação)
 *   regions[r][c] = id     -> matriz 2D com o id da região (0..N-1)
 *   marks[r][c]  = 0|1|2   -> jogador: vazio | X | gato
 * ===================================================================== */

/* Paletas por tema; a ordem casa com I18n.colorName (color.N / color.night.N).
 * Só os índices 0–9 aparecem no jogo (N ≤ 10).
 * cozy ("colcha de retalhos"): cada região é um tecido. As cores variam em claridade (claro / médio /
 *   escuro), não só em matiz, e cada índice tem também uma estampa própria no CSS (xadrez, poá, listras...),
 *   para distinguir as regiões mesmo com daltonismo. Escuros (5, 8, 11) recebem gato e ✕ bordados em creme.
 * night ("vitrine noturna"): luzes neon-pastel sobre vidro escuro, também escalonadas em luminosidade. */
const PALETTES = {
  cozy: [
    "#a3cbee", "#a088d6", "#ef9560", "#f5dd7a", "#bfe0a2",
    "#4a69ab", "#4fae9f", "#f5bad0", "#7c5036", "#e06a62",
    "#f6e7b8", "#7d4e7c",
  ],
  night: [
    "#d6e8f5", "#a184ff", "#ff8a33", "#ffe680", "#6edc86",
    "#3d74f0", "#29c4b4", "#ffc2e2", "#9c7a62", "#ff4757",
    "#86d6ff", "#e35ad0",
  ],
};
let PALETTE = PALETTES[Theme.current];
const hexRgb = hex => { const v = parseInt(hex.slice(1), 16); return `${v >> 16} ${(v >> 8) & 255} ${v & 255}`; };
const SYMBOLS = ["", "✕", "🐱"];
const GameState = Object.freeze({
  IDLE: "IDLE",
  PLAYING: "PLAYING",
  PAUSED: "PAUSED",
  GAME_OVER: "GAME_OVER",
  WON: "WON"
});

let N = 7;
let solution = [];
let regions = [];
let marks = [];

/* Idioma: preferência salva (manual) ou o do navegador. `langHooks` re-renderiza o que é gerado por JS. */
I18n.setLanguage(Progress.language || I18n.detect());
const t = I18n.t;
const langHooks = [];

/* Ferramentas de desenvolvedor só aparecem com ?dev na URL (ex.: index.html?dev) */
document.body.classList.toggle("dev-ui", new URLSearchParams(location.search).has("dev"));

/* ---------- Motor (engine.js): geração, solver e dificuldade ---------- */
const E = createEngine();
const { matrix } = E;

/* Gera um nível aleatório com solução ÚNICA (treino livre) */
function generateLevel(n) {
  const { cols, reg } = E.generateUnique(n, Math.random);
  solution = cols;
  regions = reg;
}

/* =====================================================================
 * 4) MECÂNICAS DO JOGO
 * toque    -> alterna ✕ imediatamente (sem atraso)
 * 2 toques -> (mesma célula, em até DOUBLE_TAP_MS) desfaz o ✕ do 1º toque e
 *             tenta colocar gato; confere com `solution` (gabarito)
 *   certo  -> gato fixo | errado -> -1 vida + animação de erro
 * O duplo toque é detectado em pointerup (o evento dblclick é pouco confiável
 * em telas de toque). O tabuleiro é construído uma vez por jogo e as células
 * são atualizadas individualmente (não recriamos o DOM a cada clique).
 * ===================================================================== */
const MAX_LIVES = 3;
const DOUBLE_TAP_MS = 300;
const game = {
  state: GameState.IDLE,
  lives: MAX_LIVES,
  lost: false,
  cheated: false,
  devMode: false,
  dragged: false,
  generating: false,
  drag: null,
  dragStart: null,
  lastTap: { cell: null, t: 0, prev: 0 },
  score: 0,
  combo: 0,
  adHold: false                 // partida pausada enquanto o modal/anúncio de recarga está aberto
};
let cells = [];
let cellSymbols = [];
let heartNodes = [];
let campaignId = null;          // id do nível da campanha (null = treino livre)
let currentLevel = null;

const gameEl = document.getElementById("game");
const boardEl = document.getElementById("board");
const statusEl = document.getElementById("status");
const rackEl = document.getElementById("rack");
let rackDots = [];                 // uma bolinha por região, na ordem dos ids
const livesEl = document.getElementById("lives");
const modalEl = document.getElementById("modal");
const timerEl = document.getElementById("timer-text");
const levelInfoEl = document.getElementById("level-info");
const levelValueEl = document.getElementById("level-value");
const scoreValueEl = document.getElementById("score-value");

/* ---------- Cronômetro (pausa ao encerrar a partida ou ocultar a aba) ---------- */
let elapsedMs = 0;
let tickStart = null;

let timerInterval = 0;             // o display só é atualizado enquanto o tempo corre

const timerElapsed = () => elapsedMs + (tickStart !== null ? performance.now() - tickStart : 0);
function timerStart() {
  if (tickStart === null) tickStart = performance.now();
  if (!timerInterval) timerInterval = setInterval(renderTimer, 500);
}
function timerPause() {
  if (tickStart !== null) { elapsedMs += performance.now() - tickStart; tickStart = null; }
  clearInterval(timerInterval);
  timerInterval = 0;
  renderTimer();
}
function timerReset(ms = 0) { tickStart = null; elapsedMs = ms; renderTimer(); }

const allowedTransitions = Object.freeze({
  [GameState.IDLE]: [GameState.PLAYING, GameState.PAUSED],
  [GameState.PLAYING]: [GameState.PAUSED, GameState.IDLE, GameState.GAME_OVER, GameState.WON],
  [GameState.PAUSED]: [GameState.PLAYING, GameState.IDLE, GameState.GAME_OVER, GameState.WON],
  [GameState.GAME_OVER]: [GameState.IDLE, GameState.PLAYING, GameState.PAUSED],
  [GameState.WON]: [GameState.IDLE, GameState.PLAYING, GameState.PAUSED]
});

function setGameState(next) {
  if (game.state === next) {
    if (next === GameState.PLAYING) timerStart();
    return;
  }
  if (!allowedTransitions[game.state].includes(next)) {
    console.warn(`Transição de estado inválida ignorada: ${game.state} → ${next}`);   // não derruba o handler
    return;
  }
  game.state = next;
  if (next === GameState.PLAYING) { timerStart(); Ads.gameplayStart(); }
  else { timerPause(); Ads.gameplayStop(); }
}

const isPlaying = () => game.state === GameState.PLAYING;
const isTerminal = () => game.state === GameState.GAME_OVER || game.state === GameState.WON;
const gameTabActive = () => !!document.querySelector('.tab[data-target="game"].active');

/* mm:ss; a partir de 1 hora, h:mm:ss */
function formatTime(secs) {
  const two = v => String(v).padStart(2, "0");
  const h = Math.floor(secs / 3600), m = Math.floor(secs / 60) % 60;
  return (h ? `${h}:${two(m)}` : two(m)) + ":" + two(secs % 60);
}
function renderTimer() {
  const text = formatTime(Math.floor(timerElapsed() / 1000));
  if (timerEl.textContent !== text) timerEl.textContent = text;
}
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    if (isPlaying()) setGameState(GameState.PAUSED);
    persistNow();
  } else if (game.state === GameState.PAUSED && gameTabActive() && !game.adHold) {
    setGameState(GameState.PLAYING);
  }
});

function renderLevelInfo() {
  levelValueEl.textContent = campaignId ? String(campaignId) : "—";
}

/* ---------- Pontuação: pop-out na célula + contador animado na HUD ---------- */
const POINTS_BASE = 100;
const POINTS_COMBO_STEP = 25;      // bônus por acerto consecutivo sem errar
const COMBO_CAP = 4;               // bônus máximo: +100
const SCORE_ROLL_DELAY_MS = 200;   // deixa o "+N" aparecer antes de os pontos "entrarem" na HUD
const POINT_POP_MS = 800;
const scoreRollMs = delta => Math.min(1500, 800 + Math.abs(delta) * 2);   // +100 ≈ 1 s

let scoreShown = 0;                // valor atualmente exibido (a animação parte dele)
let scoreRaf = 0;

function pointsFor(combo) { return POINTS_BASE + POINTS_COMBO_STEP * Math.min(combo, COMBO_CAP); }

/* Rola os dígitos de `scoreShown` até `to` (ease-out suave); chamadas novas retomam do valor atual.
 * Não depende de prefers-reduced-motion: é uma contagem, não um movimento de tela. */
function setScoreDisplay(to, animate = true) {
  cancelAnimationFrame(scoreRaf);
  const from = scoreShown;
  if (!animate || from === to) {
    scoreShown = to;
    scoreValueEl.textContent = String(to);
    return;
  }
  const dur = scoreRollMs(to - from);
  const t0 = performance.now() + SCORE_ROLL_DELAY_MS;
  let bumped = false;
  const step = now => {
    const p = Math.min(1, Math.max(0, (now - t0) / dur));
    if (p > 0 && !bumped) {                        // pulinho ao começar a subir
      bumped = true;
      scoreValueEl.classList.remove("bump");
      void scoreValueEl.offsetWidth;
      scoreValueEl.classList.add("bump");
    }
    scoreShown = Math.round(from + (to - from) * (1 - (1 - p) * (1 - p)));
    scoreValueEl.textContent = String(scoreShown);
    if (p < 1) scoreRaf = requestAnimationFrame(step);
  };
  scoreRaf = requestAnimationFrame(step);
}

function setScore(value, animate = true) {
  game.score = value;
  setScoreDisplay(value, animate);
}

/* Texto flutuante sobre a célula; é removido ao fim da animação (com fallback por timeout) */
function showPointPop(r, c, points) {
  const rect = cells[r][c].getBoundingClientRect();
  const pop = document.createElement("div");
  pop.className = "point-pop";
  pop.textContent = `+${points}`;
  pop.style.left = `${rect.left + rect.width / 2}px`;
  pop.style.top = `${rect.top + rect.height / 2}px`;
  pop.style.fontSize = `${Math.max(14, rect.width * 0.42)}px`;
  document.body.appendChild(pop);
  const remove = () => pop.remove();
  pop.addEventListener("animationend", remove, { once: true });
  setTimeout(remove, POINT_POP_MS + 150);
}

function awardPoints(r, c) {
  const points = pointsFor(game.combo);
  showPointPop(r, c, points);
  Sound.point(game.combo);
  game.combo++;
  setScore(game.score + points);
}

/* Salva a partida em andamento (só campanha) para retomar após fechar o app.
 * Jogadas agendam a gravação (debounce: um arrasto vira uma escrita só); `persistNow` grava na hora
 * (aba oculta, troca de aba). O estado é lido no momento da escrita, então nada fica para trás. */
const PERSIST_DELAY_MS = 400;
let persistTimer = 0;
function persistNow() {
  clearTimeout(persistTimer);
  persistTimer = 0;
  if (!campaignId || isTerminal() || game.state === GameState.IDLE || game.cheated) return;
  Progress.saveProgress({ id: campaignId, marks, lives: game.lives, elapsed: Math.round(timerElapsed()), score: game.score });
}
function persist() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(persistNow, PERSIST_DELAY_MS);
}
window.addEventListener("pagehide", persistNow);

/* ---------- SVG do sprite (index.html): criados uma vez, nunca via innerHTML ---------- */
const SVG_NS = "http://www.w3.org/2000/svg";
function svgEl(cls, viewBox = "0 0 24 24") {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", cls);
  svg.setAttribute("viewBox", viewBox);
  svg.setAttribute("aria-hidden", "true");
  return svg;
}
function svgUse(id, cls) {
  const use = document.createElementNS(SVG_NS, "use");
  use.setAttribute("href", "#" + id);
  if (cls) use.setAttribute("class", cls);
  return use;
}
/* Gato desenhado: orelhas, corpo e olhos são <use> separados para o "sentar" e a piscada da vitória */
function catSvg(cls) {
  const svg = svgEl(cls, "0 0 64 64");
  svg.append(svgUse("cat-ears", "cat-ears"), svgUse("cat-body", "cat-body"),
    svgUse("cat-eyes", "cat-eyes"), svgUse("cat-happy", "cat-happy"));
  return svg;
}
/* ✕ em dois traços levemente curvos (giz de cera); pathLength=1 permite desenhá-los com stroke-dashoffset */
function crossSvg() {
  const svg = svgEl("sym-x");
  // ponto-cruz: cada traço é uma linha grossa + um fio de brilho por cima
  for (const [cls, d] of [["x1", "M6.4 6.6Q12.3 11.7 17.6 17.5"], ["x1 thread", "M6.4 6.6Q12.3 11.7 17.6 17.5"],
                          ["x2", "M17.5 6.4Q11.6 12.2 6.5 17.6"], ["x2 thread", "M17.5 6.4Q11.6 12.2 6.5 17.6"]]) {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("class", cls);
    path.setAttribute("d", d);
    path.setAttribute("pathLength", "1");
    svg.appendChild(path);
  }
  return svg;
}

/* Reinicia uma animação de classe na célula (a classe sai sozinha no animationend da própria célula) */
const PULSES = ["pop-x", "pop-cat", "wave", "shake"];
function pulse(el, cls) {
  if (el.classList.contains(cls)) { el.classList.remove(cls); void el.offsetWidth; }
  el.classList.add(cls);
}

function renderCell(r, c) {
  const el = cells[r][c];
  const symbol = cellSymbols[r][c];
  const m = marks[r][c];
  const cross = m === 1 || m === 3;
  const prev = el.dataset.mark;

  el.dataset.mark = m;
  el.classList.toggle("has-cat", m === 2);
  symbol.hidden = m === 0;
  symbol.classList.toggle("x", cross);
  symbol.classList.toggle("cat", m === 2);
  symbol.classList.toggle("wrong", m === 3);
  if (prev === undefined || prev === String(m)) return;
  if (m === 2) pulse(el, "pop-cat");                        // a célula "infla" e o gato senta
  else if (cross && prev !== "1" && prev !== "3") pulse(el, "pop-x");   // afunda de leve
}

/* Vidas = patinhas. `animate`: a patinha recém-perdida "se solta" e cai (só no erro, não ao retomar) */
function renderLives(animate = false) {
  if (heartNodes.length !== MAX_LIVES) {
    const fragment = document.createDocumentFragment();
    heartNodes = [];
    for (let i = 0; i < MAX_LIVES; i++) {
      const heart = document.createElement("span");
      heart.className = "paw";
      const svg = svgEl("paw-svg");
      svg.append(svgUse("i-paw", "paw-ring"), svgUse("i-paw", "paw-fill"), svgUse("i-eyes", "paw-eyes"));
      heart.appendChild(svg);
      heart.addEventListener("animationend", () => heart.classList.remove("drop"));
      heartNodes.push(heart);
      fragment.appendChild(heart);
    }
    livesEl.replaceChildren(fragment);
  }
  for (let i = 0; i < MAX_LIVES; i++) {
    const heart = heartNodes[i];
    const alive = i < game.lives;
    const wasAlive = !heart.classList.contains("lost");
    heart.classList.toggle("lost", !alive);
    if (animate && wasAlive && !alive) pulse(heart, "drop");
  }
}

/* ---------- Onda quente: linha, coluna ou região "fechada" (tem o gato e todo o resto marcado com ✕) ---------- */
const WAVE_STEP_MS = 25;
const waveDone = new Set();         // unidades já celebradas (voltam a valer se forem desfeitas)
function unitClosed(list) {
  let cat = false;
  for (const [i, j] of list) {
    const m = marks[i][j];
    if (m === 0) return false;
    if (m === 2) cat = true;
  }
  return cat;
}
function checkWaves(r, c) {
  const id = regions[r][c];
  const units = { ["r" + r]: [], ["c" + c]: [], ["g" + id]: [] };
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    if (i === r) units["r" + r].push([i, j]);
    if (j === c) units["c" + c].push([i, j]);
    if (regions[i][j] === id) units["g" + id].push([i, j]);
  }
  for (const [key, list] of Object.entries(units)) {
    if (!unitClosed(list)) { waveDone.delete(key); continue; }
    if (waveDone.has(key)) continue;
    waveDone.add(key);
    playWave(list, r, c);
  }
}
function playWave(list, r0, c0) {
  const els = [];
  for (const [i, j] of list) {
    if (marks[i][j] === 2) continue;                       // o gato mantém a própria animação
    const el = cells[i][j];
    el.style.setProperty("--wave", `${(Math.abs(i - r0) + Math.abs(j - c0)) * WAVE_STEP_MS}ms`);
    el.classList.remove("wave");
    els.push(el);
  }
  if (!els.length) return;
  void boardEl.offsetWidth;                                // um único reflow para reiniciar todas
  for (const el of els) el.classList.add("wave");
}

/* A linha de status mostra quantas cores ainda faltam ou uma mensagem fixa (vitória, derrota...) guardada
 * por chave, para ser retraduzida ao trocar de idioma. */
let statusKey = null;
function renderStatus() {
  let text;
  if (statusKey) text = t(statusKey);
  else {
    let placed = 0;
    for (const row of marks) for (const mark of row) if (mark === 2) placed++;
    const left = N - placed;
    text = left === 1 ? t("status.leftOne") : t("status.left", { n: left });
  }
  if (statusEl.textContent !== text) statusEl.textContent = text;
}
function updateStatus() { statusKey = null; renderStatus(); syncRegionGlow(); }   // toda mudança de gatos passa por aqui
function setStatusKey(key) { statusKey = key; renderStatus(); }
langHooks.push(renderStatus);

function buildBoard() {
  boardEl.style.setProperty("--size", N);
  boardEl.classList.remove("locked", "won", "lost", "shake");
  gameEl.classList.remove("spot-open");
  clearCatFx();
  waveDone.clear();
  if (cells.length !== N) {
    cells = matrix(N, null);
    cellSymbols = matrix(N, null);
    const fragment = document.createDocumentFragment();
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const cell = document.createElement("div");
        const symbol = document.createElement("span");
        cell.className = "cell";
        cell.dataset.r = r; cell.dataset.c = c;
        cell.addEventListener("animationend", e => { if (e.target === cell) cell.classList.remove(...PULSES); });
        symbol.className = "sym";
        symbol.setAttribute("aria-hidden", "true");
        symbol.hidden = true;
        symbol.append(crossSvg(), catSvg("sym-cat"));
        // .patch = o feltro da casa; .fil = preenchimento curvo dos cantos côncavos da região (só aparecem com .ctl etc.)
        cell.append(node("span", "patch"), node("span", "fil fil-tl"), node("span", "fil fil-tr"),
          node("span", "fil fil-br"), node("span", "fil fil-bl"), symbol);
        cells[r][c] = cell;
        cellSymbols[r][c] = symbol;
        fragment.appendChild(cell);
      }
    }
    boardEl.replaceChildren(fragment, seamSvg);
  }
  if (rackDots.length !== N) {
    rackDots = [];
    for (let i = 0; i < N; i++) {
      const dot = node("span", "rack-dot");
      dot.appendChild(catSvg("rack-cat"));
      rackDots.push(dot);
    }
    rackEl.replaceChildren(...rackDots);
  }

  paintRegions();
  drawSeams();
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const cell = cells[r][c];
      const id = regions[r][c];
      cell.style.setProperty("--i", r + c);                // ordem da varredura diagonal da vitória (night)
      // bordas de região: o retalho recua e ganha costura só nos lados que encostam em outra região
      const edge = (i, j) => i < 0 || j < 0 || i >= N || j >= N || regions[i][j] !== id;
      cell.classList.toggle("et", edge(r - 1, c));
      cell.classList.toggle("er", edge(r, c + 1));
      cell.classList.toggle("eb", edge(r + 1, c));
      cell.classList.toggle("el", edge(r, c - 1));
      // canto côncavo (os dois vizinhos são da região, a diagonal não): o pesponto faz a curva por dentro
      for (const [cls, dr, dc] of [["ctl", -1, -1], ["ctr", -1, 1], ["cbr", 1, 1], ["cbl", 1, -1]])
        cell.classList.toggle(cls, !edge(r + dr, c) && !edge(r, c + dc) && edge(r + dr, c + dc));
      cell.classList.remove(...PULSES);
      delete cell.dataset.mark;                            // tabuleiro novo: sem animação de entrada
      renderCell(r, c);
    }
  }
  syncRegionGlow();
}

/* Cor de cada região no tema atual: --fab (tecido, cozy) e --c-rgb (vidro, night); data-f escolhe a estampa.
 * Também a cor média do tabuleiro (--glow-rgb em #game), que tinge a luz da moldura e o spot da vitória. */
function paintRegions() {
  let R = 0, G = 0, B = 0;
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const idx = regions[r][c] % PALETTE.length;
    const rgb = hexRgb(PALETTE[idx]);
    const st = cells[r][c].style;
    st.setProperty("--fab", PALETTE[idx]);
    st.setProperty("--c-rgb", rgb);
    cells[r][c].dataset.f = idx;
    if (rackDots[regions[r][c]]) {
      rackDots[regions[r][c]].style.setProperty("--fab", PALETTE[idx]);
      rackDots[regions[r][c]].dataset.f = idx;
    }
    const [x, y, z] = rgb.split(" ").map(Number);
    R += x; G += y; B += z;
  }
  const n = N * N || 1;
  gameEl.style.setProperty("--glow-rgb", `${Math.round(R / n)} ${Math.round(G / n)} ${Math.round(B / n)}`);
}

/* Região com gato fica "acesa" (.lit; só o tema night desenha). Recalculado a cada mudança de gatos. */
function syncRegionGlow() {
  if (cells.length !== N || marks.length !== N) return;
  const lit = new Set();
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (marks[r][c] === 2) lit.add(regions[r][c]);
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) cells[r][c].classList.toggle("lit", lit.has(regions[r][c]));
  rackDots.forEach((dot, id) => dot.classList.toggle("done", lit.has(id)));
}

/* ---------- Costura: um contorno tracejado contínuo por região, em SVG por cima do feltro ----------
 * Unidade = 1 casa. O contorno de cada região é o polígono das suas bordas, recuado para dentro e com
 * cantos arredondados: convexos acompanham o raio do feltro, côncavos acompanham a curva do .fil.
 * As medidas casam com o CSS do .cell (--s, --rr). */
const SEAM = { s: .045, rr: .24, k: .1 };
const seamSvg = svgEl("seams", "0 0 7 7");
seamSvg.setAttribute("preserveAspectRatio", "none");
const fmt = v => +v.toFixed(4);

/* Bordas da região como laços fechados de vértices (sentido horário: o interior fica à direita) */
function regionLoops(id) {
  const out = new Map();                       // "x,y" -> arestas que saem dali
  const add = (x1, y1, x2, y2) => {
    const k = x1 + "," + y1;
    if (!out.has(k)) out.set(k, []);
    out.get(k).push({ x1, y1, x2, y2, dx: x2 - x1, dy: y2 - y1, used: false });
  };
  const other = (i, j) => i < 0 || j < 0 || i >= N || j >= N || regions[i][j] !== id;
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    if (regions[r][c] !== id) continue;
    if (other(r - 1, c)) add(c, r, c + 1, r);
    if (other(r, c + 1)) add(c + 1, r, c + 1, r + 1);
    if (other(r + 1, c)) add(c + 1, r + 1, c, r + 1);
    if (other(r, c - 1)) add(c, r + 1, c, r);
  }
  const loops = [];
  for (const list of out.values()) for (const first of list) {
    if (first.used) continue;
    const loop = [];
    let e = first;
    while (e && !e.used) {
      e.used = true;
      loop.push(e);
      // num vértice com duas saídas (regiões que se tocam só na diagonal), dobra à direita primeiro
      const next = (out.get(e.x2 + "," + e.y2) || []).filter(n => !n.used);
      const turn = n => e.dx * n.dy - e.dy * n.dx;
      e = next.find(n => turn(n) > 0) || next.find(n => turn(n) === 0) || next[0];
    }
    // só os vértices onde a direção muda
    const corners = [];
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i], b = loop[(i + 1) % loop.length];
      if (a.dx !== b.dx || a.dy !== b.dy) corners.push({ x: a.x2, y: a.y2, a: [a.dx, a.dy], b: [b.dx, b.dy] });
    }
    if (corners.length) loops.push(corners);
  }
  return loops;
}

function seamPath(loops) {
  const d = SEAM.s + SEAM.k;                              // da divisa até a costura
  const convex = SEAM.rr - SEAM.k, concave = SEAM.rr + 2 * SEAM.s + SEAM.k;
  let path = "";
  for (const corners of loops) {
    const pts = corners.map(({ x, y, a, b }) => {
      const right = v => [-v[1], v[0]];
      const ra = right(a), rb = right(b);
      const vx = x + d * (ra[0] + rb[0]), vy = y + d * (ra[1] + rb[1]);
      const cw = a[0] * b[1] - a[1] * b[0] > 0;              // curva à direita = canto convexo
      const rad = cw ? convex : concave;
      return { p1: [vx - a[0] * rad, vy - a[1] * rad], p2: [vx + b[0] * rad, vy + b[1] * rad], rad, cw };
    });
    const last = pts[pts.length - 1];
    path += `M${fmt(last.p2[0])} ${fmt(last.p2[1])}`;
    for (const p of pts)
      path += `L${fmt(p.p1[0])} ${fmt(p.p1[1])}A${fmt(p.rad)} ${fmt(p.rad)} 0 0 ${p.cw ? 1 : 0} ${fmt(p.p2[0])} ${fmt(p.p2[1])}`;
    path += "Z";
  }
  return path;
}

function drawSeams() {
  seamSvg.setAttribute("viewBox", `0 0 ${N} ${N}`);
  const paths = [];
  for (let id = 0; id < N; id++) {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", seamPath(regionLoops(id)));
    path.dataset.f = id % PALETTE.length;
    paths.push(path);
  }
  seamSvg.replaceChildren(...paths);
  if (seamSvg.parentNode !== boardEl) boardEl.appendChild(seamSvg);
}

/* Clique e arraste: o primeiro quadrado define se o gesto pinta ✕ ou apaga ✕ */
function cellAt(x, y) {
  const el = document.elementFromPoint(x, y);
  const cell = el && el.closest ? el.closest(".cell") : null;
  return cell && boardEl.contains(cell) ? cell : null;
}

function dragApply(cell) {
  const r = +cell.dataset.r, c = +cell.dataset.c;
  const m = marks[r][c];
  if (m >= 2 || m === game.drag.mode) return;
  marks[r][c] = game.drag.mode;
  renderCell(r, c);
  checkWaves(r, c);
  Sound.click();
}

/* Dentro do iframe da Poki: espaço/setas não rolam a página-mãe e o toque longo não abre menu de contexto */
const SCROLL_KEYS = new Set([" ", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "PageUp", "PageDown"]);
window.addEventListener("keydown", e => {
  if (SCROLL_KEYS.has(e.key) && !(e.target.closest && e.target.closest("input, select, textarea, button"))) e.preventDefault();
});
for (const el of [boardEl, document.getElementById("sboard")]) el.addEventListener("contextmenu", e => e.preventDefault());

boardEl.addEventListener("pointerdown", e => {
  game.dragged = false;
  if (!isPlaying() || e.button !== 0) return;
  const cell = cellAt(e.clientX, e.clientY);
  if (!cell) return;
  const m = marks[+cell.dataset.r][+cell.dataset.c];
  if (m >= 2) return;
  game.dragStart = cell;
  game.drag = { mode: m === 1 ? 0 : 1 };
});

boardEl.addEventListener("pointermove", e => {
  if (!isPlaying() || !game.drag) return;
  const cell = cellAt(e.clientX, e.clientY);
  if (!cell) return;
  if (!game.dragged) {
    if (cell === game.dragStart) return;
    game.dragged = true;
    dragApply(game.dragStart);
  }
  dragApply(cell);
});

/* Toque simples alterna ✕ na hora; segundo toque na mesma célula confirma o gato */
boardEl.addEventListener("pointerup", e => {
  const cell = game.dragStart;                  // célula do pointerdown (null se inválido)
  if (!cell || game.dragged || !isPlaying()) return;
  const r = +cell.dataset.r, c = +cell.dataset.c;
  if (marks[r][c] >= 2) return;
  const now = performance.now();
  if (game.lastTap.cell === cell && now - game.lastTap.t <= DOUBLE_TAP_MS) {
    marks[r][c] = game.lastTap.prev;            // desfaz o ✕ do primeiro toque
    renderCell(r, c);
    game.lastTap = { cell: null, t: 0, prev: 0 };
    tryCat(r, c);
    return;
  }
  game.lastTap = { cell, t: now, prev: marks[r][c] };
  marks[r][c] = marks[r][c] === 1 ? 0 : 1;
  renderCell(r, c);
  checkWaves(r, c);
  Sound.click();
  persist();
});

const endDrag = () => {
  if (game.dragged) persist();
  game.drag = null;
  game.dragStart = null;
};
window.addEventListener("pointerup", endDrag);
window.addEventListener("pointercancel", endDrag);

/* Modo dev: ✕ na linha, coluna e vizinhança (inclusive diagonais) do gato */
function autoCross(r, c) {
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const near = Math.abs(i - r) <= 1 && Math.abs(j - c) <= 1;
    if ((i === r || j === c || near) && marks[i][j] === 0) {
      marks[i][j] = 1;
      renderCell(i, j);
    }
  }
}

/* Modo dev: ✕ no restante da região (cor) do gato */
function autoCrossRegion(r, c) {
  const id = regions[r][c];
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    if (regions[i][j] === id && marks[i][j] === 0) {
      marks[i][j] = 1;
      renderCell(i, j);
    }
  }
}

/* Põe o gato `(r, c)` (já validado) e confere a vitória. `award`: false nos gatos revelados por power-up. */
function commitCat(r, c, award) {
  marks[r][c] = 2;
  if (game.devMode && autoXEl.checked) autoCross(r, c);
  if (game.devMode && autoColorEl.checked) autoCrossRegion(r, c);
  renderCell(r, c);
  checkWaves(r, c);
  catFx(r, c);
  updateStatus();
  Sound.cat();
  if (award) awardPoints(r, c);
  persist();
  if (marks.flat().filter(m => m === 2).length === N) win();
}

function tryCat(r, c) {
  if (!isPlaying()) return;
  if (solution[r] === c) {
    commitCat(r, c, true);
    return;
  }
  marks[r][c] = 3;                 // erro: ✕ vinho fixo
  game.combo = 0;
  renderCell(r, c);
  checkWaves(r, c);
  shake(cells[r][c]);
  Sound.error();
  if (game.devMode) return;             // modo dev: vidas infinitas
  game.lives--;
  renderLives(true);
  if (game.lives <= 0) gameOver();
  else persist();
}

/* Gato posto (night): pulso de luz corre pela linha e coluna e a região "respira".
 * Classes passageiras com atraso em --d; o tema cozy não as desenha. */
const catFxEls = [];
let catFxTimer = 0;
function clearCatFx() {
  clearTimeout(catFxTimer);
  for (const el of catFxEls) el.classList.remove("fx-pulse", "fx-breath");
  catFxEls.length = 0;
}
function catFx(r, c) {
  clearCatFx();
  const id = regions[r][c];
  const list = [];
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    if (i === r && j === c) continue;
    if (regions[i][j] === id) list.push([cells[i][j], "fx-breath", 140]);
    else if (i === r || j === c) list.push([cells[i][j], "fx-pulse", 30 * (Math.abs(i - r) + Math.abs(j - c))]);
  }
  void boardEl.offsetWidth;                          // um único reflow reinicia todas as animações
  for (const [el, cls, d] of list) {
    el.style.setProperty("--d", `${d}ms`);
    el.classList.add(cls);
    catFxEls.push(el);
  }
  catFxTimer = setTimeout(clearCatFx, 1400);
}

/* Erro: a célula balança e fica rosada. O tabuleiro ganha .shake também, mas só o tema night o faz tremer
 * (no cozy o tabuleiro fica parado para não punir de forma agressiva). */
function shake(el) {
  pulse(el, "shake");
  setTimeout(() => el.classList.remove("shake"), 900);
  boardEl.classList.remove("shake");
  void boardEl.offsetWidth;
  boardEl.classList.add("shake");
  setTimeout(() => boardEl.classList.remove("shake"), 300);
}

function lockBoard(nextState) {
  setGameState(nextState);
  boardEl.classList.add("locked");
  clearHints();
  renderTimer();
  Progress.clearProgress();
}

/* `build()` devolve { emoji, title, text, label, action, extra? } (extra = [rótulo, ação] de um botão secundário).
 * `text` é uma string ou uma lista de linhas; cada linha é uma string ou { cls, text } (vira <span class>).
 * Tudo entra como textContent (nunca HTML). É uma função para que o modal aberto possa ser remontado ao trocar de idioma. */
let modalBuild = null;
let modalAfter = null;
function node(tag, cls, text) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text !== undefined) el.textContent = text;
  return el;
}
/* Ilustração do topo do cartão (substitui os emojis): gato feliz, gato sonolento ou "play" do vídeo */
function modalArt(kind, stars) {
  const art = node("div", "modal-art " + kind);
  if (kind === "ad") art.appendChild(svgEl("modal-ic")).appendChild(svgUse("i-play"));
  else {
    const cat = catSvg("modal-cat");
    if (kind === "over") cat.querySelector(".cat-happy").setAttribute("href", "#cat-sleepy");
    art.appendChild(cat);
  }
  if (stars === undefined) return [art];
  const row = node("div", "modal-stars");
  row.setAttribute("role", "img");
  row.setAttribute("aria-label", starText(stars));
  for (let i = 0; i < 3; i++) {
    const star = svgEl("modal-star" + (i < stars ? " on" : ""));
    star.style.setProperty("--i", i);
    star.appendChild(svgUse("i-star"));
    row.appendChild(star);
  }
  return [art, row];
}
function renderModal() {
  const { icon, stars, title, text, label, action, extra } = modalBuild();
  const p = node("p");
  (Array.isArray(text) ? text : [text]).forEach((line, i) => {
    if (i) p.appendChild(node("br"));
    p.append(typeof line === "string" ? line : node("span", line.cls, line.text));
  });
  const actions = node("div", "modal-actions");
  const btn = node("button", "", label);
  btn.id = "modal-btn";
  btn.addEventListener("click", action);
  actions.appendChild(btn);
  if (extra) {
    const btn2 = node("button", "secondary", extra[0]);
    btn2.id = "modal-btn2";
    btn2.addEventListener("click", extra[1]);
    actions.appendChild(btn2);
  }
  const card = node("div", "modal-card");
  card.append(...modalArt(icon, stars), node("h2", "", title), p, actions);
  modalEl.replaceChildren(card);
  if (modalAfter) modalAfter();
}
function showModal(build, after = null) {
  modalBuild = build;
  modalAfter = after;
  renderModal();
  modalEl.classList.add("open");
}
langHooks.push(() => {
  if (!modalEl.classList.contains("open") || !modalBuild) return;
  renderModal();
  if (rechargeBusy) setRechargeBusy(true);
});

function showLevels() {
  modalEl.classList.remove("open");
  document.querySelector('.tab[data-target="levels"]').click();
}

/* 3 estrelas sem erros, 2 com um erro, 1 com dois ou mais */
const starsFor = errors => Math.max(1, 3 - errors);
const starText = n => "★".repeat(n) + "☆".repeat(3 - n);

function win() {
  if (!isPlaying()) return;
  lockBoard(GameState.WON);
  celebrate();
  setTimeout(() => Sound.win(), 350);               // depois do "miau" do último gato
  setStatusKey("status.won");
  if (!campaignId || game.cheated) {
    setTimeout(() => showModal(() => ({
      icon: "win", title: t("modal.free.title"), text: t("modal.free.text"),
      label: t("modal.free.btn"), action: () => afterBreak(newGame),
    })), 500);
    return;
  }
  const id = campaignId;
  const secs = Math.round(timerElapsed() / 1000);
  const stars = starsFor(MAX_LIVES - game.lives);
  const score = game.score;
  const prevBest = Progress.best(id);
  Progress.complete(id, stars, secs, Infinity, score);     // a campanha não tem fim
  prefetchInfinite(id);
  const isRecord = !!prevBest && secs < prevBest;
  setTimeout(() => {
    showModal(() => ({
      icon: "win",
      stars,
      title: t("modal.win.title"),
      text: [
        t("modal.win.points", { n: Progress.formatScore(score) }),
        t("modal.win.time", { t: formatTime(secs) }) + (isRecord ? " " + t("modal.win.record") : ""),
      ],
      label: t("modal.win.next"),
      action: () => afterBreak(() => playLevel(id + 1).then(ok => { if (!ok && !game.generating) showLevels(); })),
      extra: [t("modal.levels"), showLevels],
    }));
  }, 500);
}

/* Vitória: os gatos piscam (^ ^) em sequência, linha a linha, e as cores se saturam por um instante */
function celebrate() {
  solution.forEach((c, r) => cells[r][c].style.setProperty("--blink", r));
  boardEl.classList.add("won");
  gameEl.classList.add("spot-open");                  // night: o spot de fundo se abre
}

function gameOver() {
  if (!isPlaying()) return;
  if (!campaignId) game.lost = true;      // trava "mesmo nível" só no treino livre
  lockBoard(GameState.GAME_OVER);
  boardEl.classList.add("lost");
  setTimeout(() => Sound.lose(), 250);
  setStatusKey("status.over");
  setTimeout(() => showModal(() => ({
    icon: "over", title: t("modal.over.title"), text: t("modal.over.text"),
    label: t("modal.over.retry"), action: () => afterBreak(retryLevel),
    extra: campaignId ? [t("modal.levels"), showLevels] : null,
  })), 700);
}

function resetBoard() {
  marks = matrix(N, 0);
  game.lives = MAX_LIVES;
  game.cheated = game.devMode;
  game.adHold = false;
  clearHints();
  modalEl.classList.remove("open");
  buildBoard();
  renderLives();
  updateStatus();
  renderLevelInfo();
  setScore(0, false);
  game.combo = 0;
  timerReset();
  setGameState(!document.hidden && gameTabActive() ? GameState.PLAYING : GameState.PAUSED);
}

/* Intersticial da Poki entre partidas (só nos botões dos modais de fim de jogo: nunca antes da 1ª partida).
 * `adHold` mantém a partida pausada e bloqueia cliques repetidos enquanto o anúncio roda. */
async function afterBreak(start) {
  if (game.adHold) return;
  game.adHold = true;
  modalEl.classList.remove("open");
  await Ads.commercialBreak();
  game.adHold = false;
  return start();
}

function retryLevel() {
  game.lost = false;
  resetBoard();
}

/* Gera em Web Worker (tamanhos grandes levam segundos e travariam a página). */
const ASYNC_FROM = 9;
let activeGenWorker = null;   // referência ao Worker de geração em andamento
function cancelActiveGenWorker() {
  if (activeGenWorker) { activeGenWorker.terminate(); activeGenWorker = null; }
}
function generateLevelAsync(n) {
  cancelActiveGenWorker();    // encerra Worker anterior antes de iniciar outro
  return new Promise(resolve => {
    const fallback = () => { generateLevel(n); resolve(); };   // sem Worker: thread principal
    const start = retries => {                                 // um Worker que falha ganha mais uma tentativa
      try {
        const worker = spawnEngineWorker("onmessage = e => postMessage(E.generateUnique(e.data, Math.random));");
        activeGenWorker = worker;
        const release = () => { worker.terminate(); if (activeGenWorker === worker) activeGenWorker = null; };
        worker.onmessage = e => { solution = e.data.cols; regions = e.data.reg; release(); resolve(); };
        worker.onerror = () => { release(); if (retries > 0) start(retries - 1); else fallback(); };
        worker.postMessage(n);
      } catch {
        fallback();
      }
    };
    start(1);
  });
}

async function newGame() {
  if (game.generating) return;
  const sizeEl = document.getElementById("size");
  if (game.lost) {                       // após derrota, o nível não muda
    sizeEl.value = N;
    retryLevel();
    return;
  }
  const n = parseInt(sizeEl.value, 10);
  campaignId = null;                // sair da campanha: a partida salva continua guardada
  currentLevel = null;
  if (n >= ASYNC_FROM) {
    game.generating = true;
    setGameState(GameState.IDLE);
    boardEl.classList.add("locked");
    setStatusKey("status.generating");
    await generateLevelAsync(n);
    game.generating = false;
  } else {
    generateLevel(n);
  }
  N = n;
  sizeEl.value = n;
  resetBoard();
}

/* Perto do fim dos packs (e depois dele) gera os próximos níveis infinitos em segundo plano */
function prefetchInfinite(id) {
  const total = MiauLevels.total;
  if (total && id >= total - 10) InfiniteLevels.prefetchAhead(Math.max(id, Progress.unlocked, total));
}

/* Carrega um nível da campanha (packs ou infinito), retomando a partida salva se houver */
async function playLevel(id, resume = true) {
  if (game.generating) return false;
  const slow = MiauLevels.needsGeneration(id);     // nível infinito ainda não salvo
  if (slow) {
    game.generating = true;
    setGameState(GameState.IDLE);
    modalEl.classList.remove("open");
    boardEl.classList.add("locked");
    setStatusKey("status.generating");
  }
  const lv = await MiauLevels.get(id);
  if (slow) game.generating = false;
  if (!lv) {
    if (slow) setStatusKey("status.genFail");
    return false;
  }
  campaignId = id;
  currentLevel = lv;
  N = lv.n;
  solution = lv.solution;
  regions = lv.regions;
  game.lost = false;
  document.getElementById("size").value = N;
  resetBoard();
  prefetchInfinite(id);

  // Save só vale se bater com este nível: gato (2) só onde a solução tem gato, ✕ errado (3) só onde não tem
  const fits = s => s.marks.length === N &&
    s.marks.every((row, r) => row.every((m, c) => (m === 2 ? solution[r] === c : m === 3 ? solution[r] !== c : true)));
  const saved = resume && !game.cheated && Progress.getProgress(id);
  if (saved && fits(saved)) {
    marks = saved.marks;
    game.lives = saved.lives;
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) renderCell(r, c);
    renderLives();
    updateStatus();
    const placed = marks.flat().filter(m => m === 2).length;
    setScore(Number.isFinite(saved.score) && saved.score >= 0 ? saved.score : placed * POINTS_BASE, false);   // saves antigos não têm score
    timerReset(saved.elapsed);
    if (!document.hidden && gameTabActive()) setGameState(GameState.PLAYING);
  }
  return true;
}

function clearBoard() {
  if (!isPlaying()) return;
  marks = matrix(N, 0);          // gatos já fixados também voltam ao vazio, vidas são mantidas
  waveDone.clear();
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) renderCell(r, c);
  setScore(0);                   // sem gatos no tabuleiro, sem pontos (evita farmar limpando e recolocando)
  game.combo = 0;
  updateStatus();
  persist();
}

function showSolution() {
  if (!isPlaying()) return;
  marks = matrix(N, 0);
  solution.forEach((c, r) => (marks[r][c] = 2));
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) renderCell(r, c);
  lockBoard(GameState.GAME_OVER);
  updateStatus();
  setStatusKey("status.revealed");
}

const devEl = document.getElementById("dev");
const autoXEl = document.getElementById("auto-x");
const autoXWrap = document.getElementById("auto-x-wrap");
const autoColorEl = document.getElementById("auto-color");
const autoColorWrap = document.getElementById("auto-color-wrap");
const findCatBtn = document.getElementById("find-cat");
devEl.addEventListener("change", () => {
  game.devMode = devEl.checked;
  if (game.devMode) game.cheated = true;      // trapaça: a partida não gera estrelas nem progresso
  findCatBtn.hidden = !game.devMode;
  autoXWrap.hidden = !game.devMode;
  document.getElementById("dev-note").hidden = !game.devMode;
  autoColorWrap.hidden = !game.devMode;
});
findCatBtn.addEventListener("click", () => {
  if (!isPlaying()) return;
  const left = solution.map((c, r) => [r, c]).filter(([r, c]) => marks[r][c] !== 2);
  if (!left.length) return;
  const [r, c] = left[Math.floor(Math.random() * left.length)];
  tryCat(r, c);
});

document.getElementById("new").addEventListener("click", newGame);
document.getElementById("clear").addEventListener("click", clearBoard);

/* Chaves de som e vibração (preferências persistentes) */
function bindToggle(id, labelKey, getter, setter) {
  const btn = document.getElementById(id);
  const labelEl = btn.querySelector(".set-label");
  const render = () => {
    const on = getter();
    btn.setAttribute("aria-pressed", on);
    labelEl.textContent = t(labelKey);
    btn.setAttribute("aria-label", t("toggle.state", { label: t(labelKey), state: t(on ? "toggle.on" : "toggle.off") }));
    btn.classList.toggle("off", !on);
  };
  btn.addEventListener("click", () => { setter(!getter()); render(); });
  langHooks.push(render);
  render();
}
bindToggle("sound-btn", "ctrl.sound", () => Sound.sound, v => Sound.setSound(v));
bindToggle("haptics-btn", "ctrl.haptics", () => Sound.haptics, v => Sound.setHaptics(v));
window.addEventListener("pointerdown", () => Sound.unlock(), { once: true });   // áudio só após um gesto
document.getElementById("reveal").addEventListener("click", showSolution);
document.getElementById("size").addEventListener("change", newGame);

/* =====================================================================
 * 5b) POWER-UPS: Dica, Revelar Gato e 3x ✕ Seguros (estoque em Progress.items).
 * Com estoque 0 o botão oferece recarga (+3) via anúncio recompensado (ads.js).
 * Os ✕ e gatos postos aqui nunca dão pontos nem combo.
 * ===================================================================== */
const COLOR_COUNT = PALETTE.length;
const colorName = id => I18n.colorName(id % COLOR_COUNT, Theme.current);   // mesma ordem de PALETTE
const REWARD_UNITS = 3;
const HINT_CELLS_MS = 5000;
const HINT_TEXT_MS = 9000;

const hudMsgEl = document.getElementById("hint-msg");
const itemUi = {};
document.querySelectorAll(".pu-btn").forEach(btn => {
  itemUi[btn.dataset.item] = { btn, badge: btn.querySelector(".pu-badge") };
  btn.addEventListener("click", () => usePowerUp(btn.dataset.item));
});
const itemLabel = key => t(`item.${key}.label`);

function renderItems() {
  for (const [key, { btn, badge }] of Object.entries(itemUi)) {
    const n = Progress.item(key);
    const text = n > 0 ? String(n) : `+${REWARD_UNITS}`;   // esgotado: o CSS desenha o "play" do vídeo antes
    if (badge.textContent !== text) badge.textContent = text;
    btn.classList.toggle("empty", n === 0);
    const label = t(`item.${key}.aria`);
    btn.setAttribute("aria-label", n > 0
      ? t("item.left", { label, n })
      : t("item.empty", { label, n: REWARD_UNITS }));
  }
}
langHooks.push(renderItems);

/* Caixa de mensagem sobre a barra de power-ups: some sozinha ou ao toque.
 * `build` devolve o texto, para poder ser retraduzido enquanto a mensagem está visível. */
let hudMsgTimer = 0;
let hudMsgBuild = null;
function hideHudMessage() { clearTimeout(hudMsgTimer); hudMsgBuild = null; hudMsgEl.hidden = true; }
function showHudMessage(build, ms = HINT_TEXT_MS) {
  clearTimeout(hudMsgTimer);
  hudMsgBuild = build;
  hudMsgEl.textContent = build();
  hudMsgEl.hidden = false;
  hudMsgTimer = setTimeout(hideHudMessage, ms);
}
hudMsgEl.addEventListener("click", hideHudMessage);
langHooks.push(() => { if (hudMsgBuild && !hudMsgEl.hidden) hudMsgEl.textContent = hudMsgBuild(); });

/* Realce temporário: `glow` = casas que explicam a dica; `target` = casas a marcar */
let hintEls = [];
let hintTimer = 0;
function clearHighlights() {
  clearTimeout(hintTimer);
  for (const [el, cls] of hintEls) el.classList.remove(cls);
  hintEls = [];
}
function clearHints() { clearHighlights(); hideHudMessage(); }
function highlightCells(glow, target, ms = HINT_CELLS_MS) {
  clearHighlights();
  const add = (list, cls) => list.forEach(([r, c]) => { cells[r][c].classList.add(cls); hintEls.push([cells[r][c], cls]); });
  add(glow, "hint-glow");
  add(target, "hint-target");
  hintTimer = setTimeout(clearHighlights, ms);
}

const listText = I18n.list;
function unitText(u) {
  const id = +u.slice(1);
  return u[0] === "g" ? t("unit.color", { name: colorName(id) }) : t(u[0] === "r" ? "unit.row" : "unit.col", { n: id + 1 });
}

/* Dica "inteligente": o texto é montado a partir de h.kind + parâmetros (cores, linhas/colunas) no idioma atual */
function hintMessage(h) {
  const axis = t(h.axis === "r" ? "axis.row" : "axis.col");
  const axes = t(h.axis === "r" ? "axis.rows" : "axis.cols");
  const cap = s => s[0].toUpperCase() + s.slice(1);
  const regs = (h.regs || []).map(colorName);
  const lines = (h.lines || []).map(v => v + 1);
  switch (h.kind) {
    case "single": {
      const [r, c] = h.cells[0];
      return t("hint.single", { Who: cap(unitText(h.unit)), r: r + 1, c: c + 1 });
    }
    case "regionLine":
      return t("hint.regionLine", { color: regs[0], axis, n: lines[0] });
    case "lineRegion":
      return t("hint.lineRegion", { color: regs[0], axis, n: lines[0] });
    case "regionSet":
      return t("hint.regionSet", { colors: listText(regs), axes, lines: listText(lines) });
    case "lineSet":
      return t("hint.lineSet", { Axes: cap(axes), axes, colors: listText(regs), lines: listText(lines) });
    default: {
      const [r, c] = h.cells[0];
      return t("hint.contradiction", { r: r + 1, c: c + 1, unit: unitText(h.unit) });
    }
  }
}

function useHint() {
  const h = E.findHint(N, regions, marks);
  if (!h) {                                          // sem dedução simples: não gasta o item
    showHudMessage(() => t("hint.none"), 4000);
    return;
  }
  if (!Progress.useItem("hint")) return;
  renderItems();
  Sound.click();
  highlightCells(h.cells, h.targets);
  showHudMessage(() => hintMessage(h));
}

function useRevealCat() {
  const pick = E.pickRevealCat(N, solution, marks);
  if (!pick || !Progress.useItem("revealCat")) return;
  renderItems();
  commitCat(pick[0], pick[1], false);
  if (isPlaying()) highlightCells([pick], [], 1500);
}

function useSafeCross() {
  const picks = E.pickSafeCrosses(N, regions, solution, marks, 3);
  if (!picks.length) {
    showHudMessage(() => t("hint.noSafe"), 4000);
    return;
  }
  if (!Progress.useItem("safeCross")) return;
  renderItems();
  for (const [r, c] of picks) { marks[r][c] = 1; renderCell(r, c); checkWaves(r, c); }
  Sound.click();
  highlightCells(picks, [], 1500);
  persist();
}

const ITEM_ACTIONS = { hint: useHint, revealCat: useRevealCat, safeCross: useSafeCross };

function usePowerUp(key) {
  if (!isPlaying()) return;
  if (Progress.item(key) <= 0) offerRecharge(key);
  else ITEM_ACTIONS[key]();
}

/* Recarga: pausa a partida, mostra o convite e, após o anúncio, credita +3 do item */
function offerRecharge(key) {
  if (game.adHold) return;
  game.adHold = true;
  setGameState(GameState.PAUSED);
  showModal(() => ({
    icon: "ad", title: t("modal.recharge.title"), text: t("modal.recharge.text", { n: REWARD_UNITS }),
    label: t("modal.recharge.watch", { n: REWARD_UNITS }), action: () => watchForItem(key),
    extra: [t("modal.recharge.later"), closeRecharge],
  }));
}

function setRechargeBusy(busy) {
  for (const id of ["modal-btn", "modal-btn2"]) {
    const btn = document.getElementById(id);
    if (!btn) continue;
    btn.disabled = busy;
    btn.style.opacity = busy ? "0.6" : "";
  }
}

function closeRecharge() {
  rechargeBusy = false;
  setRechargeBusy(false);
  modalEl.classList.remove("open");
  game.adHold = false;
  if (game.state === GameState.PAUSED && !document.hidden && gameTabActive()) setGameState(GameState.PLAYING);
}

let rechargeBusy = false;                            // trava síncrona: um único anúncio por convite
async function watchForItem(key) {
  if (rechargeBusy) return;
  rechargeBusy = true;
  setRechargeBusy(true);                             // antes do await: bloqueia toques repetidos no mesmo instante
  let res;
  try {
    res = await Ads.showRewarded();
  } catch {
    res = { rewarded: false, reason: "error" };
  }
  if (res.rewarded) {
    Progress.addItem(key, REWARD_UNITS);
    renderItems();
    Sound.point();
  }
  closeRecharge();
  if (res.rewarded) showHudMessage(() => t("item.recharged", { n: REWARD_UNITS, label: itemLabel(key) }), 3000);
  else if (res.reason === "offline") showHudMessage(() => t("ads.offline"), 4000);
  else if (res.reason === "unavailable") showHudMessage(() => t("ads.unavailable"), 4000);
}

renderItems();
Ads.init();


/* =====================================================================
 * 6) RESOLVE NÍVEL: o usuário pinta um mapa existente e o backtracking
 * (uma coluna, uma região e nenhum gato encostado por linha) mostra os gatos.
 * ===================================================================== */
const sBoard = document.getElementById("sboard");
const sSizeEl = document.getElementById("s-size");
const sStatus = document.getElementById("s-status");
const sSolveBtn = document.getElementById("s-solve");
const paletteEl = document.getElementById("palette");
let sN = 7, sGrid = [], sCells = [], sColor = 0, sPaint = false;
sSizeEl.value = sN;

function buildPalette() {
  paletteEl.replaceChildren();
  for (let i = 0; i < PALETTE.length; i++) {
    const b = document.createElement("button");
    b.type = "button"; b.className = "swatch" + (i === sColor ? " active" : "");
    b.style.background = PALETTE[i]; b.setAttribute("aria-label", t("solver.swatch", { n: i + 1 }));
    b.setAttribute("role", "radio");
    b.setAttribute("aria-checked", String(i === sColor));
    b.addEventListener("click", () => {
      sColor = i;
      paletteEl.querySelectorAll(".swatch").forEach((swatch, k) => {
        swatch.classList.toggle("active", k === i);
        swatch.setAttribute("aria-checked", String(k === i));
      });
    });
    paletteEl.appendChild(b);
  }
}

function paintCell(r, c) {
  if (sGrid[r][c] === sColor) return;
  clearCats();
  sGrid[r][c] = sColor;
  sCells[r][c].style.backgroundColor = PALETTE[sColor];
  updateSolverStatus();
}

function clearCats() {
  sBoard.querySelectorAll(".sym").forEach(e => e.remove());
  sBoard.querySelectorAll(".has-cat").forEach(e => e.classList.remove("has-cat"));
}

/* Mensagem do solver: `solverMsg` guarda { key, params, cls } para ser retraduzida; null = status do preenchimento */
let solverMsg = null;
function renderSolverStatus() {
  const total = sN * sN;
  let painted = 0;
  const used = new Set();
  for (const row of sGrid) for (const v of row) if (v >= 0) { painted++; used.add(v); }
  sSolveBtn.hidden = !(painted === total && used.size === sN);
  let msg = solverMsg;
  if (!msg) {
    if (painted < total) msg = { key: "solver.painted", params: { n: painted, total }, cls: "" };
    else if (used.size !== sN) msg = { key: "solver.exact", params: { n: sN, used: used.size }, cls: "bad" };
    else msg = { key: "solver.complete", cls: "ok" };
  }
  sStatus.className = "s-status" + (msg.cls ? " " + msg.cls : "");
  sStatus.textContent = t(msg.key, msg.params);
}
function updateSolverStatus() { solverMsg = null; renderSolverStatus(); }
langHooks.push(renderSolverStatus, () => {
  paletteEl.querySelectorAll(".swatch").forEach((b, i) => b.setAttribute("aria-label", t("solver.swatch", { n: i + 1 })));
});

function buildSolverBoard() {
  sN = +sSizeEl.value;
  
  sBoard.style.setProperty("--size", sN);
  sBoard.replaceChildren();
  sGrid = matrix(sN, -1);
  sCells = matrix(sN, null);
  for (let r = 0; r < sN; r++) for (let c = 0; c < sN; c++) {
    const el = document.createElement("div");
    el.className = "cell"; el.dataset.r = r; el.dataset.c = c;
    sCells[r][c] = el; sBoard.appendChild(el);
  }
  buildPalette();
  updateSolverStatus();
}

function solveDrawn() {
  const { count, first } = E.searchSolutions(sN, sGrid);
  clearCats();
  if (!count) {
    solverMsg = { key: "solver.none", cls: "bad" };
    renderSolverStatus();
    return;
  }
  first.forEach((c, r) => {
    sCells[r][c].classList.add("has-cat");
    const sym = node("span", "sym cat");
    sym.appendChild(catSvg("sym-cat"));
    sCells[r][c].appendChild(sym);
  });
  solverMsg = { key: count > 1 ? "solver.multi" : "solver.unique", cls: "ok" };
  renderSolverStatus();
}

function solverCellAt(x, y) {
  const el = document.elementFromPoint(x, y);
  return el && el.closest ? el.closest("#sboard .cell") : null;
}
function solverPaintAt(x, y) {
  const el = solverCellAt(x, y);
  if (el) paintCell(+el.dataset.r, +el.dataset.c);
}
sBoard.addEventListener("pointerdown", e => { sPaint = true; solverPaintAt(e.clientX, e.clientY); });
sBoard.addEventListener("pointermove", e => { if (sPaint) solverPaintAt(e.clientX, e.clientY); });
window.addEventListener("pointerup", () => { sPaint = false; });
window.addEventListener("pointercancel", () => { sPaint = false; });
sSizeEl.addEventListener("change", buildSolverBoard);
document.getElementById("s-clear").addEventListener("click", buildSolverBoard);
sSolveBtn.addEventListener("click", solveDrawn);
buildSolverBoard();
/* Abas */
document.querySelectorAll(".tab").forEach(btn =>
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(b => b.classList.toggle("active", b === btn));
    document.querySelectorAll(".panel").forEach(p =>
      p.classList.toggle("active", p.id === btn.dataset.target));
    document.body.dataset.panel = btn.dataset.target;      // fora do jogo aparece a barra "voltar ao jogo"
    if (btn.dataset.target === "levels") renderLevelMap();
    if (btn.dataset.target === "game") {
      if (game.state === GameState.PAUSED && !document.hidden && !game.adHold) setGameState(GameState.PLAYING);
    } else if (isPlaying()) {
      setGameState(GameState.PAUSED);
      persistNow();
    } else if (game.state === GameState.PAUSED) {
      persistNow();
    }
  }));

/* ---------- Mapa de níveis ---------- */
const levelMapEl = document.getElementById("level-map");
const levelsTotalEl = document.getElementById("levels-total");

const INFINITE_SHOWN = 60;                      // últimos níveis infinitos listados no mapa

function levelButton(id, diff) {
  const locked = id > Progress.unlocked;
  const stars = Progress.stars(id);
  const b = document.createElement("button");
  b.type = "button";
  b.className = "lv-btn" + (locked ? " locked" : "") + (stars ? " done" : "") +
    (id === Progress.unlocked && !stars ? " current" : "");
  b.disabled = locked;
  b.setAttribute("aria-label", t("level.aria", { id }) + (diff ? `, ${I18n.diffLabel(diff)}` : "") + ", " + (locked ? t("level.locked") : t("level.stars", { n: stars })));
  const num = node("span", "lv-num", locked ? undefined : String(id));
  if (locked) num.appendChild(svgEl("lv-lock")).appendChild(svgUse("i-lock"));
  b.append(num, node("span", "lv-stars", locked ? "" : starText(stars)));
  if (diff && !locked) b.appendChild(node("span", "lv-diff", I18n.diffLabel(diff)));
  b.addEventListener("click", () => startCampaign(id));
  return b;
}

function levelGroup(title, hint) {
  const h = document.createElement("h3");
  h.className = "level-group";
  h.textContent = title;
  if (hint) { const s = document.createElement("small"); s.textContent = hint; h.append(" ", s); }
  const grid = document.createElement("div");
  grid.className = "level-grid";
  levelMapEl.append(h, grid);
  return grid;
}

async function renderLevelMap() {
  const all = await MiauLevels.loadAll();
  levelsTotalEl.textContent = t("levels.total", { stars: Progress.totalStars(), score: Progress.formatScore(Progress.totalScore) });
  levelMapEl.replaceChildren();
  let section = null;
  let lastN = 0;
  for (const lv of all) {
    if (lv.n !== lastN) {                        // um bloco por tamanho de tabuleiro
      lastN = lv.n;
      section = levelGroup(`${lv.n}×${lv.n}`);
    }
    section.appendChild(levelButton(lv.id, lv.diff));
  }

  const total = MiauLevels.total;
  if (Progress.unlocked > total) {               // campanha infinita: 10×10 com dificuldade variável
    const last = Progress.unlocked;
    const first = Math.max(total + 1, last - INFINITE_SHOWN + 1);
    section = levelGroup(t("levels.infinite"),
      first > total + 1 ? t("levels.infiniteLast", { n: INFINITE_SHOWN, total: last - total }) : t("levels.infiniteVar"));
    for (let id = first; id <= last; id++) {
      const info = InfiniteLevels.info(id);
      section.appendChild(levelButton(id, info && info.diff));
    }
  }
}

async function startCampaign(id) {
  document.querySelector('.tab[data-target="game"]').click();
  if (!(await playLevel(id))) newGame();
}

/* Layout por proporção: paisagem (trilhos laterais) ou retrato (HUD em cima, dock embaixo).
 * A troca é toda em CSS (@media aspect-ratio); aqui só se marca o <body> para o menu ⋯
 * abrir como cartão central (paisagem) ou folha de baixo (retrato). Nada muda de lugar no DOM. */
const portraitMq = matchMedia("(max-aspect-ratio: 23/20)");
const applyLayout = () => document.body.classList.toggle("portrait", portraitMq.matches);
portraitMq.addEventListener("change", applyLayout);
applyLayout();

/* Menu ⋯ sobreposto: abas Níveis/Ajuda, partida, ajustes, idioma e regras */
const menuDrop = document.getElementById("menu-drop");
const menuScrim = document.querySelector(".menu-scrim");
const menuToggles = document.querySelectorAll("[data-menu-toggle]");
const menuFocusable = () => [...menuDrop.querySelectorAll("button, select, input")]
  .filter(el => !el.disabled && el.getClientRects().length);

function setMenu(open) {
  if (open === !menuDrop.hidden) return;
  menuDrop.hidden = !open;
  menuScrim.hidden = !open;
  menuToggles.forEach(b => b.setAttribute("aria-expanded", open));
  if (open) {
    menuDrop.querySelector("[data-menu-close]").focus();
    return;
  }
  const visible = [...menuToggles].find(b => b.getClientRects().length);   // o ⋯ do trilho ou o da barra de página
  if (visible) visible.focus({ preventScroll: true });
}

menuToggles.forEach(b => b.addEventListener("click", () => setMenu(menuDrop.hidden)));
menuScrim.addEventListener("click", () => setMenu(false));
menuDrop.addEventListener("click", e => { if (e.target.closest(".tab, [data-menu-close]")) setMenu(false); });
document.addEventListener("keydown", e => {
  if (menuDrop.hidden) return;
  if (e.key === "Escape") { setMenu(false); return; }
  if (e.key !== "Tab") return;
  const list = menuFocusable();                     // foco preso no menu enquanto ele está aberto
  if (!list.length) return;
  const first = list[0], last = list[list.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
});
/* Barra das páginas: volta ao jogo */
document.querySelectorAll("[data-go]").forEach(b =>
  b.addEventListener("click", () => document.querySelector(`.tab[data-target="${b.dataset.go}"]`).click()));

/* ---------- Idioma: seletor PT/EN/ES e atualização da interface sem recarregar ---------- */
const langBtns = document.querySelectorAll(".lang-btn");

/* Traduz o DOM estático (data-i18n*) e re-renderiza tudo o que o JS gera (status, modais, itens, mapa de níveis...) */
function updateLanguage() {
  document.documentElement.lang = I18n.htmlLang;
  document.title = t("app.title");
  I18n.apply();
  for (const btn of langBtns) {
    const on = btn.dataset.lang === I18n.lang;
    btn.classList.toggle("active", on);
    btn.setAttribute("aria-pressed", on);
  }
  for (const hook of langHooks) hook();
  if (document.getElementById("levels").classList.contains("active")) renderLevelMap();
}

/* ---------- Tema: Aconchego (claro) ou Noite (escuro); troca na hora, sem perder a partida ---------- */
const themeBtns = document.querySelectorAll("[data-theme-set]");
function renderThemeBtns() {
  for (const btn of themeBtns) {
    const on = btn.dataset.themeSet === Theme.current;
    btn.classList.toggle("active", on);
    btn.setAttribute("aria-pressed", on);
  }
}
themeBtns.forEach(btn => btn.addEventListener("click", () => Theme.set(btn.dataset.themeSet)));
Theme.onChange(() => {
  PALETTE = PALETTES[Theme.current];
  renderThemeBtns();
  if (cells.length === N && regions.length === N) paintRegions();
  buildPalette();
  for (let r = 0; r < sN; r++) for (let c = 0; c < sN; c++)
    if (sGrid[r][c] >= 0) sCells[r][c].style.backgroundColor = PALETTE[sGrid[r][c]];
});
renderThemeBtns();

for (const btn of langBtns) {
  btn.addEventListener("click", () => {
    if (btn.dataset.lang === I18n.lang) return;
    I18n.setLanguage(btn.dataset.lang);
    Progress.setLanguage(I18n.lang);             // escolha manual persistida; sem escolha, segue o navegador
    updateLanguage();
  });
}
updateLanguage();

/* Abre direto na campanha (partida em andamento ou último nível liberado); sem packs, cai no treino livre */
(async () => {
  if (!(MiauLevels.total && await playLevel(Progress.current()))) await newGame();
  Ads.loadingFinished();
})();
