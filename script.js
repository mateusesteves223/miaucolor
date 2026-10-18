"use strict";

/* =====================================================================
 * MIAUCOLOR
 * Estado:
 *   solution[r] = c        -> coluna do gato na linha r (uma permutação)
 *   regions[r][c] = id     -> matriz 2D com o id da região (0..N-1)
 *   marks[r][c]  = 0|1|2   -> jogador: vazio | X | gato
 * ===================================================================== */

const PALETTE = [
  "#b9d3e4", "#a577e0", "#ffbb77", "#fccd3c", "#b6dc78",
  "#4a85c9", "#2ec4b3", "#fbbcd8", "#c98048", "#de5959",
    "#8ed6f5", "#e0689a",
  ];
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

const boardEl = document.getElementById("board");
const statusEl = document.getElementById("status");
const livesEl = document.getElementById("lives");
const modalEl = document.getElementById("modal");
const timerEl = document.getElementById("timer");
const levelInfoEl = document.getElementById("level-info");
const levelValueEl = document.getElementById("level-value");
const scoreValueEl = document.getElementById("score-value");

/* ---------- Cronômetro (pausa ao encerrar a partida ou ocultar a aba) ---------- */
let elapsedMs = 0;
let tickStart = null;

const timerElapsed = () => elapsedMs + (tickStart !== null ? performance.now() - tickStart : 0);
function timerStart() { if (tickStart === null) tickStart = performance.now(); }
function timerPause() {
  if (tickStart !== null) { elapsedMs += performance.now() - tickStart; tickStart = null; }
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
    throw new Error(`Transição de estado inválida: ${game.state} → ${next}`);
  }
  game.state = next;
  if (next === GameState.PLAYING) timerStart();
  else timerPause();
}

const isPlaying = () => game.state === GameState.PLAYING;
const isTerminal = () => game.state === GameState.GAME_OVER || game.state === GameState.WON;
const gameTabActive = () => !!document.querySelector('.tab[data-target="game"].active');

function formatTime(secs) {
  return String(Math.floor(secs / 60)).padStart(2, "0") + ":" + String(secs % 60).padStart(2, "0");
}
function renderTimer() {
  const text = "⏱ " + formatTime(Math.floor(timerElapsed() / 1000));
  if (timerEl.textContent !== text) timerEl.textContent = text;
}
setInterval(renderTimer, 500);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    if (isPlaying()) setGameState(GameState.PAUSED);
    persist();
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

/* Salva a partida em andamento (só campanha) para retomar após fechar o app */
function persist() {
  if (!campaignId || isTerminal() || game.state === GameState.IDLE || game.cheated) return;
  Progress.saveProgress({ id: campaignId, marks, lives: game.lives, elapsed: Math.round(timerElapsed()), score: game.score });
}

function renderCell(r, c) {
  const el = cells[r][c];
  const symbol = cellSymbols[r][c];
  const m = marks[r][c];
  const cross = m === 1 || m === 3;

  el.dataset.mark = m;
  el.classList.toggle("has-cat", m === 2);
  symbol.hidden = m === 0;
  symbol.classList.toggle("x", cross);
  symbol.classList.toggle("cat", m === 2);
  symbol.classList.toggle("wrong", m === 3);
  const text = m === 2 ? "🐱" : "";
  if (symbol.textContent !== text) symbol.textContent = text;
}

function renderLives() {
  if (heartNodes.length !== MAX_LIVES) {
    const fragment = document.createDocumentFragment();
    heartNodes = [];
    for (let i = 0; i < MAX_LIVES; i++) {
      const heart = document.createElement("span");
      heart.className = "heart";
      heartNodes.push(heart);
      fragment.appendChild(heart);
    }
    livesEl.replaceChildren(fragment);
  }
  for (let i = 0; i < MAX_LIVES; i++) {
    const heart = heartNodes[i];
    const alive = i < game.lives;
    heart.classList.toggle("lost", !alive);
    const text = alive ? "❤️" : "🖤";
    if (heart.textContent !== text) heart.textContent = text;
  }
}

function updateStatus() {
  let placed = 0;
  for (const row of marks) for (const mark of row) if (mark === 2) placed++;
  const text = `Gatos: ${placed}/${N}`;
  if (statusEl.textContent !== text) statusEl.textContent = text;
}

function buildBoard() {
  boardEl.style.setProperty("--size", N);
  boardEl.classList.remove("locked");
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
        symbol.className = "sym";
        symbol.setAttribute("aria-hidden", "true");
        symbol.hidden = true;
        cell.appendChild(symbol);
        cells[r][c] = cell;
        cellSymbols[r][c] = symbol;
        fragment.appendChild(cell);
      }
    }
    boardEl.replaceChildren(fragment);
  }

  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      cells[r][c].style.background = PALETTE[regions[r][c] % PALETTE.length];
      renderCell(r, c);
    }
  }
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
  Sound.click();
}

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
  shake(cells[r][c]);
  Sound.error();
  if (game.devMode) return;             // modo dev: vidas infinitas
  game.lives--;
  renderLives();
  if (game.lives <= 0) gameOver();
  else persist();
}

function shake(el) {
  for (const target of [el, boardEl]) {
    target.classList.remove("shake");
    void target.offsetWidth;            // reinicia a animação
    target.classList.add("shake");
    setTimeout(() => target.classList.remove("shake"), 600);
  }
}

function lockBoard(nextState) {
  setGameState(nextState);
  boardEl.classList.add("locked");
  clearHints();
  renderTimer();
  Progress.clearProgress();
}

/* extra (opcional): [rótulo, ação] de um botão secundário */
function showModal(emoji, title, text, label, action, extra) {
  modalEl.innerHTML =
    `<div class="modal-card"><div class="modal-emoji">${emoji}</div>
     <h2>${title}</h2><p>${text}</p>
     <div class="modal-actions">
       <button id="modal-btn">${label}</button>
       ${extra ? `<button id="modal-btn2" class="secondary">${extra[0]}</button>` : ""}
     </div></div>`;
  modalEl.classList.add("open");
  document.getElementById("modal-btn").addEventListener("click", action);
  if (extra) document.getElementById("modal-btn2").addEventListener("click", extra[1]);
}

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
  setTimeout(() => Sound.win(), 350);               // depois do "miau" do último gato
  statusEl.textContent = "🎉 Todos os gatos estão em paz!";
  if (!campaignId || game.cheated) {
    setTimeout(() => showModal("🏆", "Parabéns!", "Você resolveu o MiauColor!", "Jogar novamente", newGame), 500);
    return;
  }
  const id = campaignId;
  const secs = Math.round(timerElapsed() / 1000);
  const stars = starsFor(MAX_LIVES - game.lives);
  const prevBest = Progress.best(id);
  Progress.complete(id, stars, secs, Infinity, game.score);     // a campanha não tem fim
  prefetchInfinite(id);
  const record = prevBest && secs < prevBest ? " 🏅 Novo recorde!" : "";
  const text = `<span class="modal-stars">${starText(stars)}</span><br>Pontos: ${Progress.formatScore(game.score)}<br>Tempo: ${formatTime(secs)}${record}`;
  setTimeout(() => showModal("🏆", "Nível concluído!", text, "Próximo nível",
    () => playLevel(id + 1).then(ok => { if (!ok && !game.generating) showLevels(); }),
    ["Níveis", showLevels]), 500);
}

function gameOver() {
  if (!isPlaying()) return;
  if (!campaignId) game.lost = true;      // trava "mesmo nível" só no treino livre
  lockBoard(GameState.GAME_OVER);
  setTimeout(() => Sound.lose(), 250);
  statusEl.textContent = "💀 Game over";
  setTimeout(() => showModal("😿", "Fim de jogo", "Suas vidas acabaram. Tente novamente o mesmo nível!",
    "Tentar o mesmo nível", retryLevel, campaignId ? ["Níveis", showLevels] : null), 700);
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
    try {
      const worker = spawnEngineWorker("onmessage = e => postMessage(E.generateUnique(e.data, Math.random));");
      activeGenWorker = worker;
      const release = () => { worker.terminate(); if (activeGenWorker === worker) activeGenWorker = null; };
      worker.onmessage = e => { solution = e.data.cols; regions = e.data.reg; release(); resolve(); };
      worker.onerror = () => { release(); fallback(); };
      worker.postMessage(n);
    } catch {
      fallback();
    }
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
    statusEl.textContent = "⏳ Gerando nível…";
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
    statusEl.textContent = "⏳ Gerando nível…";
  }
  const lv = await MiauLevels.get(id);
  if (slow) game.generating = false;
  if (!lv) {
    if (slow) statusEl.textContent = "Não foi possível gerar o nível";
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

  const saved = resume && !game.cheated && Progress.getProgress(id);
  if (saved && saved.marks.length === N) {
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
  statusEl.textContent = "Solução revelada";
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
function bindToggle(id, label, getter, setter) {
  const btn = document.getElementById(id);
  const render = () => {
    const on = getter();
    btn.setAttribute("aria-pressed", on);
    btn.textContent = `${label}: ${on ? "ligado" : "desligado"}`;
    btn.classList.toggle("off", !on);
  };
  btn.addEventListener("click", () => { setter(!getter()); render(); });
  render();
}
bindToggle("sound-btn", "🔊 Som", () => Sound.sound, v => Sound.setSound(v));
bindToggle("haptics-btn", "📳 Vibração", () => Sound.haptics, v => Sound.setHaptics(v));
window.addEventListener("pointerdown", () => Sound.unlock(), { once: true });   // áudio só após um gesto
document.getElementById("reveal").addEventListener("click", showSolution);
document.getElementById("size").addEventListener("change", newGame);

/* =====================================================================
 * 5b) POWER-UPS: Dica, Revelar Gato e 3x ✕ Seguros (estoque em Progress.items).
 * Com estoque 0 o botão oferece recarga (+3) via anúncio recompensado (ads.js).
 * Os ✕ e gatos postos aqui nunca dão pontos nem combo.
 * ===================================================================== */
const COLOR_NAMES = [
  "Azul-gelo", "Roxo", "Laranja", "Amarelo", "Verde", "Azul",
  "Turquesa", "Rosa", "Marrom", "Vermelho", "Azul-céu", "Magenta",
];                                                   // mesma ordem de PALETTE
const colorName = id => COLOR_NAMES[id % COLOR_NAMES.length];
const REWARD_UNITS = 3;
const HINT_CELLS_MS = 5000;
const HINT_TEXT_MS = 9000;

const hudMsgEl = document.getElementById("hint-msg");
const itemUi = {};
document.querySelectorAll(".pu-btn").forEach(btn => {
  itemUi[btn.dataset.item] = { btn, badge: btn.querySelector(".pu-badge") };
  btn.addEventListener("click", () => usePowerUp(btn.dataset.item));
});
const ITEM_LABELS = { hint: "💡 Dica", revealCat: "🐱 Revelar Gato", safeCross: "✕ 3x Seguros" };

function renderItems() {
  for (const [key, { btn, badge }] of Object.entries(itemUi)) {
    const n = Progress.item(key);
    const text = n > 0 ? String(n) : `🎬 +${REWARD_UNITS}`;
    if (badge.textContent !== text) badge.textContent = text;
    btn.classList.toggle("empty", n === 0);
    btn.setAttribute("aria-label", n > 0
      ? `${ITEM_LABELS[key]}: ${n} restantes`
      : `${ITEM_LABELS[key]}: esgotado. Assistir vídeo para ganhar +${REWARD_UNITS}`);
  }
}

/* Caixa de mensagem sobre a barra de power-ups: some sozinha ou ao toque */
let hudMsgTimer = 0;
function hideHudMessage() { clearTimeout(hudMsgTimer); hudMsgEl.hidden = true; }
function showHudMessage(text, ms = HINT_TEXT_MS) {
  clearTimeout(hudMsgTimer);
  hudMsgEl.textContent = text;
  hudMsgEl.hidden = false;
  hudMsgTimer = setTimeout(hideHudMessage, ms);
}
hudMsgEl.addEventListener("click", hideHudMessage);

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

const listText = list => (list.length < 2 ? list.join("") : `${list.slice(0, -1).join(", ")} e ${list[list.length - 1]}`);
function unitText(u) {
  const id = +u.slice(1);
  return u[0] === "g" ? `a cor ${colorName(id)}` : u[0] === "r" ? `a linha ${id + 1}` : `a coluna ${id + 1}`;
}

function hintMessage(h) {
  const word = h.axis === "r" ? "linha" : "coluna";
  const Word = word[0].toUpperCase() + word.slice(1);
  const regs = (h.regs || []).map(colorName);
  const lines = (h.lines || []).map(v => v + 1);
  switch (h.kind) {
    case "single": {
      const [r, c] = h.cells[0];
      const who = unitText(h.unit);
      return `${who[0].toUpperCase() + who.slice(1)} só tem uma casa válida: linha ${r + 1}, coluna ${c + 1}. Dê dois toques para pôr o gato.`;
    }
    case "regionLine":
      return `A cor ${regs[0]} só possui casas válidas na ${Word} ${lines[0]}. Marque ✕ nas casas das outras cores dessa ${word}.`;
    case "lineRegion":
      return `Na ${Word} ${lines[0]}, só a cor ${regs[0]} tem casas válidas. Marque ✕ nas demais casas dessa cor.`;
    case "regionSet":
      return `As cores ${listText(regs)} só possuem casas válidas nas ${Word}s ${listText(lines)}. Nenhuma outra cor pode ter gato nelas: marque ✕.`;
    case "lineSet":
      return `As ${Word}s ${listText(lines)} só possuem casas válidas nas cores ${listText(regs)}. Essas cores não podem ter gato fora delas: marque ✕.`;
    default: {
      const [r, c] = h.cells[0];
      return `Se houvesse um gato na linha ${r + 1}, coluna ${c + 1}, ${unitText(h.unit)} ficaria sem nenhuma casa válida. Marque ✕ aqui.`;
    }
  }
}

function useHint() {
  const h = E.findHint(N, regions, marks);
  if (!h) {                                          // sem dedução simples: não gasta o item
    showHudMessage("Sem dedução simples no momento. Tente Revelar Gato.", 4000);
    return;
  }
  if (!Progress.useItem("hint")) return;
  renderItems();
  Sound.click();
  highlightCells(h.cells, h.targets);
  showHudMessage(hintMessage(h));
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
    showHudMessage("Não há mais casas livres sem gato para marcar.", 4000);
    return;
  }
  if (!Progress.useItem("safeCross")) return;
  renderItems();
  for (const [r, c] of picks) { marks[r][c] = 1; renderCell(r, c); }
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
  showModal("🎬", "Itens esgotados",
    `Seus itens deste tipo acabaram! Assista a um vídeo curto para recarregar +${REWARD_UNITS} unidades`,
    `🎬 Assistir vídeo (+${REWARD_UNITS})`, () => watchForItem(key), ["Agora não", closeRecharge]);
}

function closeRecharge() {
  modalEl.classList.remove("open");
  game.adHold = false;
  if (game.state === GameState.PAUSED && !document.hidden && gameTabActive()) setGameState(GameState.PLAYING);
}

async function watchForItem(key) {
  const watchBtn = document.getElementById("modal-btn");
  if (watchBtn) watchBtn.disabled = true;            // evita toques repetidos durante o anúncio
  const res = await Ads.showRewarded();
  if (res.rewarded) {
    Progress.addItem(key, REWARD_UNITS);
    renderItems();
    Sound.point();
  }
  closeRecharge();
  if (res.rewarded) showHudMessage(`+${REWARD_UNITS} de ${ITEM_LABELS[key]} recarregados!`, 3000);
  else if (res.reason === "offline") showHudMessage("Sem conexão: não foi possível carregar o vídeo. Tente novamente online.", 4000);
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

function findSolutions(n, reg, limit = 2) {
  const cols = Array(n).fill(-1), usedCols = new Set(), usedRegs = new Set();
  let count = 0, first = null;
  (function go(row) {
    if (count >= limit) return;
    if (row === n) { if (!count) first = cols.slice(); count++; return; }
    for (let c = 0; c < n; c++) {
      const g = reg[row][c];
      if (usedCols.has(c) || usedRegs.has(g)) continue;
      if (row > 0 && Math.abs(cols[row - 1] - c) <= 1) continue;
      cols[row] = c; usedCols.add(c); usedRegs.add(g);
      go(row + 1);
      usedCols.delete(c); usedRegs.delete(g); cols[row] = -1;
    }
  })(0);
  return { count, first };
}

function buildPalette() {
  paletteEl.innerHTML = "";
  for (let i = 0; i < PALETTE.length; i++) {
    const b = document.createElement("button");
    b.type = "button"; b.className = "swatch" + (i === sColor ? " active" : "");
    b.style.background = PALETTE[i]; b.setAttribute("aria-label", "Cor " + (i + 1));
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
  sCells[r][c].style.background = PALETTE[sColor];
  updateSolverStatus();
}

function clearCats() {
  sBoard.querySelectorAll(".sym").forEach(e => e.remove());
  sBoard.querySelectorAll(".has-cat").forEach(e => e.classList.remove("has-cat"));
}

function updateSolverStatus() {
  const total = sN * sN;
  let painted = 0;
  const used = new Set();
  for (const row of sGrid) for (const v of row) if (v >= 0) { painted++; used.add(v); }
  sSolveBtn.hidden = !(painted === total && used.size === sN);
  sStatus.className = "s-status";
  if (painted < total) sStatus.textContent = `Pintadas ${painted}/${total}`;
  else if (used.size !== sN) { sStatus.textContent = `Use exatamente ${sN} cores (usadas: ${used.size})`; sStatus.classList.add("bad"); }
  else { sStatus.textContent = "Quadro completo!"; sStatus.classList.add("ok"); }
}

function buildSolverBoard() {
  sN = +sSizeEl.value;
  
  sBoard.style.setProperty("--size", sN);
  sBoard.innerHTML = "";
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
  const { count, first } = findSolutions(sN, sGrid);
  clearCats();
  if (!count) {
    sStatus.className = "s-status bad";
    sStatus.textContent = "Este quadro não tem solução. Confira as cores.";
    return;
  }
  first.forEach((c, r) => {
    sCells[r][c].classList.add("has-cat");
    sCells[r][c].insertAdjacentHTML("beforeend", '<span class="sym cat">🐱</span>');
  });
  sStatus.className = "s-status ok";
  sStatus.textContent = count > 1 ? "Há mais de uma solução; mostrando a primeira." : "Solução única encontrada!";
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
    if (btn.dataset.target === "levels") renderLevelMap();
    if (btn.dataset.target === "game") {
      if (game.state === GameState.PAUSED && !document.hidden && !game.adHold) setGameState(GameState.PLAYING);
    } else if (isPlaying()) {
      setGameState(GameState.PAUSED);
      persist();
    } else if (game.state === GameState.PAUSED) {
      persist();
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
  b.setAttribute("aria-label", `Nível ${id}` + (diff ? `, ${diff}` : "") + (locked ? ", bloqueado" : `, ${stars} de 3 estrelas`));
  b.innerHTML = `<span class="lv-num">${locked ? "🔒" : id}</span>` +
    `<span class="lv-stars">${locked ? "" : starText(stars)}</span>` +
    (diff && !locked ? `<span class="lv-diff">${diff}</span>` : "");
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
  levelsTotalEl.textContent = `★ ${Progress.totalStars()} · 🏆 ${Progress.formatScore(Progress.totalScore)} pts`;
  levelMapEl.innerHTML = "";
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
    section = levelGroup("∞ Infinito · 10×10",
      first > total + 1 ? `(últimos ${INFINITE_SHOWN} de ${last - total})` : "dificuldade variável");
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

/* Menu compacto: em telas pequenas, abas, controles e regras vão para um menu suspenso */
const compactMq = matchMedia("(max-width: 700px), (max-height: 520px)");
const menuBtn = document.getElementById("menu-btn");
const menuDrop = document.getElementById("menu-drop");
const menuItems = [".tabs", ".controls", ".rules", ".hint", ".reveal-wrap"].map(sel => {
  const el = document.querySelector(sel);
  const home = document.createComment(sel);   // marca o lugar original
  el.before(home);
  return { el, home };
});

function setMenu(open) {
  menuDrop.classList.toggle("open", open);
  menuBtn.setAttribute("aria-expanded", open);
}

function applyLayout() {
  document.body.classList.toggle("compact", compactMq.matches);
  for (const { el, home } of menuItems) {
    if (compactMq.matches) menuDrop.appendChild(el);
    else home.after(el);
  }
  setMenu(false);
}

menuBtn.addEventListener("click", () => setMenu(!menuDrop.classList.contains("open")));
menuDrop.addEventListener("click", e => { if (e.target.closest("button")) setMenu(false); });
document.addEventListener("click", e => {
  if (!menuDrop.contains(e.target) && !menuBtn.contains(e.target)) setMenu(false);
});
document.addEventListener("keydown", e => { if (e.key === "Escape") setMenu(false); });
compactMq.addEventListener("change", applyLayout);
applyLayout();
/* PWA: registra o service worker (só em http/https; em file:// o navegador não permite) */
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}

/* Abre direto na campanha (partida em andamento ou último nível liberado); sem packs, cai no treino livre */
(async () => {
  if (MiauLevels.total && await playLevel(Progress.current())) return;
  newGame();
})();
