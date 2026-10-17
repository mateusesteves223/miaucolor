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

let N = 7;
let solution = [];
let regions = [];
let marks = [];
let solved = false;

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
let lives = MAX_LIVES;
let lost = false;               // perdeu: só pode repetir o mesmo nível
let over = false;                 // fim de jogo (vitória, derrota ou revelação)
let cells = [];
let cellSymbols = [];
let heartNodes = [];
let devMode = false;
let cheated = false;            // modo dev usado na partida: não conta para estrelas/progresso
let campaignId = null;          // id do nível da campanha (null = treino livre)
let currentLevel = null;

const boardEl = document.getElementById("board");
const statusEl = document.getElementById("status");
const livesEl = document.getElementById("lives");
const modalEl = document.getElementById("modal");
const timerEl = document.getElementById("timer");
const levelInfoEl = document.getElementById("level-info");

/* ---------- Cronômetro (pausa ao encerrar a partida ou ocultar a aba) ---------- */
let elapsedMs = 0;
let tickStart = null;

const timerElapsed = () => elapsedMs + (tickStart !== null ? performance.now() - tickStart : 0);
function timerStart() { if (tickStart === null) tickStart = performance.now(); }
function timerPause() {
  if (tickStart !== null) { elapsedMs += performance.now() - tickStart; tickStart = null; }
}
function timerReset(ms = 0) { tickStart = null; elapsedMs = ms; renderTimer(); }

function formatTime(secs) {
  return String(Math.floor(secs / 60)).padStart(2, "0") + ":" + String(secs % 60).padStart(2, "0");
}
function renderTimer() {
  const text = "⏱ " + formatTime(Math.floor(timerElapsed() / 1000));
  if (timerEl.textContent !== text) timerEl.textContent = text;
}
setInterval(renderTimer, 500);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) { timerPause(); persist(); }
  else if (!over) timerStart();
});

function renderLevelInfo() {
  levelInfoEl.textContent = campaignId && currentLevel
    ? `Nível ${campaignId} · ${currentLevel.diff} · ${N}×${N}`
    : `Treino livre · ${N}×${N}`;
}

/* Salva a partida em andamento (só campanha) para retomar após fechar o app */
function persist() {
  if (!campaignId || over || cheated) return;
  Progress.saveProgress({ id: campaignId, marks, lives, elapsed: Math.round(timerElapsed()) });
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
    const alive = i < lives;
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
let drag = null;     // { mode: 1 | 0 } enquanto o ponteiro está pressionado
let dragStart = null;
let dragged = false;

function cellAt(x, y) {
  const el = document.elementFromPoint(x, y);
  const cell = el && el.closest ? el.closest(".cell") : null;
  return cell && boardEl.contains(cell) ? cell : null;
}

function dragApply(cell) {
  const r = +cell.dataset.r, c = +cell.dataset.c;
  const m = marks[r][c];
  if (m >= 2 || m === drag.mode) return;
  marks[r][c] = drag.mode;
  renderCell(r, c);
}

boardEl.addEventListener("pointerdown", e => {
  dragged = false;
  if (over || e.button !== 0) return;
  const cell = cellAt(e.clientX, e.clientY);
  if (!cell) return;
  const m = marks[+cell.dataset.r][+cell.dataset.c];
  if (m >= 2) return;
  dragStart = cell;
  drag = { mode: m === 1 ? 0 : 1 };
});

boardEl.addEventListener("pointermove", e => {
  if (!drag) return;
  const cell = cellAt(e.clientX, e.clientY);
  if (!cell) return;
  if (!dragged) {
    if (cell === dragStart) return;
    dragged = true;
    dragApply(dragStart);
  }
  dragApply(cell);
});

/* Toque simples alterna ✕ na hora; segundo toque na mesma célula confirma o gato */
let lastTap = { cell: null, t: 0, prev: 0 };

boardEl.addEventListener("pointerup", e => {
  const cell = dragStart;                       // célula do pointerdown (null se inválido)
  if (!cell || dragged || over) return;
  const r = +cell.dataset.r, c = +cell.dataset.c;
  if (marks[r][c] >= 2) return;
  const now = performance.now();
  if (lastTap.cell === cell && now - lastTap.t <= DOUBLE_TAP_MS) {
    marks[r][c] = lastTap.prev;                 // desfaz o ✕ do primeiro toque
    renderCell(r, c);
    lastTap = { cell: null, t: 0, prev: 0 };
    tryCat(r, c);
    return;
  }
  lastTap = { cell, t: now, prev: marks[r][c] };
  marks[r][c] = marks[r][c] === 1 ? 0 : 1;
  renderCell(r, c);
  Sound.tap();
  persist();
});

const endDrag = () => { if (dragged) persist(); drag = null; dragStart = null; };
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

function tryCat(r, c) {
  if (solution[r] === c) {
    marks[r][c] = 2;
    if (devMode && autoXEl.checked) autoCross(r, c);
    if (devMode && autoColorEl.checked) autoCrossRegion(r, c);
    renderCell(r, c);
    updateStatus();
    Sound.cat();
    persist();
    if (marks.flat().filter(m => m === 2).length === N) win();
    return;
  }
  marks[r][c] = 3;                 // erro: ✕ vinho fixo
  renderCell(r, c);
  shake(cells[r][c]);
  Sound.error();
  if (devMode) return;             // modo dev: vidas infinitas
  lives--;
  renderLives();
  if (lives <= 0) gameOver();
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

function lockBoard() {
  over = true;
  boardEl.classList.add("locked");
  timerPause();
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
  lockBoard();
  setTimeout(() => Sound.win(), 350);               // depois do "miau" do último gato
  statusEl.textContent = "🎉 Todos os gatos estão em paz!";
  if (!campaignId || cheated) {
    setTimeout(() => showModal("🏆", "Parabéns!", "Você resolveu o MiauColor!", "Jogar novamente", newGame), 500);
    return;
  }
  const id = campaignId;
  const secs = Math.round(timerElapsed() / 1000);
  const stars = starsFor(MAX_LIVES - lives);
  const prevBest = Progress.best(id);
  Progress.complete(id, stars, secs, Infinity);     // a campanha não tem fim
  prefetchInfinite(id);
  const record = prevBest && secs < prevBest ? " 🏅 Novo recorde!" : "";
  const text = `<span class="modal-stars">${starText(stars)}</span><br>Tempo: ${formatTime(secs)}${record}`;
  setTimeout(() => showModal("🏆", "Nível concluído!", text, "Próximo nível",
    () => playLevel(id + 1).then(ok => { if (!ok && !generating) showLevels(); }),
    ["Níveis", showLevels]), 500);
}

function gameOver() {
  if (!campaignId) lost = true;      // trava "mesmo nível" só no treino livre
  lockBoard();
  setTimeout(() => Sound.lose(), 250);
  statusEl.textContent = "💀 Game over";
  setTimeout(() => showModal("😿", "Fim de jogo", "Suas vidas acabaram. Tente novamente o mesmo nível!",
    "Tentar o mesmo nível", retryLevel, campaignId ? ["Níveis", showLevels] : null), 700);
}

function resetBoard() {
  marks = matrix(N, 0);
  lives = MAX_LIVES;
  over = false;
  cheated = devMode;
  modalEl.classList.remove("open");
  buildBoard();
  renderLives();
  updateStatus();
  renderLevelInfo();
  timerReset();
  timerStart();
}

function retryLevel() {
  lost = false;
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

let generating = false;
async function newGame() {
  if (generating) return;
  const sizeEl = document.getElementById("size");
  if (lost) {                       // após derrota, o nível não muda
    sizeEl.value = N;
    retryLevel();
    return;
  }
  const n = parseInt(sizeEl.value, 10);
  campaignId = null;                // sair da campanha: a partida salva continua guardada
  currentLevel = null;
  if (n >= ASYNC_FROM) {
    generating = true;
    over = true;
    boardEl.classList.add("locked");
    statusEl.textContent = "⏳ Gerando nível…";
    await generateLevelAsync(n);
    generating = false;
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
  if (generating) return false;
  const slow = MiauLevels.needsGeneration(id);     // nível infinito ainda não salvo
  if (slow) {
    generating = true;
    over = true;
    modalEl.classList.remove("open");
    boardEl.classList.add("locked");
    timerPause();
    statusEl.textContent = "⏳ Gerando nível…";
  }
  const lv = await MiauLevels.get(id);
  if (slow) generating = false;
  if (!lv) {
    if (slow) statusEl.textContent = "Não foi possível gerar o nível";
    return false;
  }
  campaignId = id;
  currentLevel = lv;
  N = lv.n;
  solution = lv.solution;
  regions = lv.regions;
  lost = false;
  document.getElementById("size").value = N;
  resetBoard();
  prefetchInfinite(id);

  const saved = resume && !cheated && Progress.getProgress(id);
  if (saved && saved.marks.length === N) {
    marks = saved.marks;
    lives = saved.lives;
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) renderCell(r, c);
    renderLives();
    updateStatus();
    timerReset(saved.elapsed);
    timerStart();
  }
  return true;
}

function clearBoard() {
  if (over) return;
  marks = matrix(N, 0);          // gatos já fixados também voltam ao vazio, vidas são mantidas
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) renderCell(r, c);
  updateStatus();
  persist();
}

function showSolution() {
  marks = matrix(N, 0);
  solution.forEach((c, r) => (marks[r][c] = 2));
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) renderCell(r, c);
  lockBoard();
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
  devMode = devEl.checked;
  if (devMode) cheated = true;      // trapaça: a partida não gera estrelas nem progresso
  findCatBtn.hidden = !devMode;
  autoXWrap.hidden = !devMode;
  document.getElementById("dev-note").hidden = !devMode;
  autoColorWrap.hidden = !devMode;
});
findCatBtn.addEventListener("click", () => {
  if (over) return;
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
    b.addEventListener("click", () => {
      sColor = i;
      paletteEl.querySelectorAll(".swatch").forEach((s, k) => s.classList.toggle("active", k === i));
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
    if (btn.dataset.target === "game") { if (!over) timerStart(); }
    else { timerPause(); persist(); }            // o tempo só corre na aba do jogo
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
  levelsTotalEl.textContent = `★ ${Progress.totalStars()}`;
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
