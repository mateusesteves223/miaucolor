"use strict";

/* =====================================================================
 * MEOWDOKU
 * Estado:
 *   solution[r] = c        -> coluna do gato na linha r (uma permutação)
 *   regions[r][c] = id     -> matriz 2D com o id da região (0..N-1)
 *   marks[r][c]  = 0|1|2   -> jogador: vazio | X | gato
 * ===================================================================== */

const PALETTE = [
  "#ffadad", "#ffd6a5", "#fdffb6", "#caffbf", "#9bf6ff",
  "#a0c4ff", "#bdb2ff", "#ffc6ff", "#d0b49f", "#b8e0d2",
];
const SYMBOLS = ["", "✕", "🐱"];

let N = 7;
let solution = [];
let regions = [];
let marks = [];
let solved = false;

/* ---------- Utilidades ---------- */

function shuffle(arr) {                       // Fisher-Yates
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const matrix = (n, fill) => Array.from({ length: n }, () => Array(n).fill(fill));

/* =====================================================================
 * 1) GERAÇÃO DOS GATOS — BACKTRACKING
 * Linha por linha, testamos colunas em ordem aleatória. Como há um gato
 * por linha por construção, só checamos:
 *   - coluna ainda livre            (conjunto `usedCols`)
 *   - não encosta no gato da linha anterior (|c - colAnterior| > 1),
 *     o que cobre as diagonais (mesma linha/coluna já estão excluídas).
 * Se nenhuma coluna serve, retornamos false e o chamador DESFAZ sua
 * escolha e tenta a próxima (retrocesso).
 * ===================================================================== */
function placeCats(n) {
  const cols = Array(n).fill(-1);
  const usedCols = new Set();

  function solve(row) {
    if (row === n) return true;                          // caso base: tudo posicionado
    for (const c of shuffle([...Array(n).keys()])) {
      if (usedCols.has(c)) continue;
      if (row > 0 && Math.abs(cols[row - 1] - c) <= 1) continue;
      cols[row] = c; usedCols.add(c);                    // escolhe
      if (solve(row + 1)) return true;                   // explora
      usedCols.delete(c); cols[row] = -1;                // desfaz (backtrack)
    }
    return false;
  }
  return solve(0) ? cols : null;
}

/* =====================================================================
 * 2) GERAÇÃO DAS REGIÕES — BUSCA EM GRAFO (crescimento multi-fonte)
 * Cada gato é a semente de uma região. A cada passo sorteamos uma região
 * e uma célula livre vizinha (4-direções) de alguma célula dela. É uma
 * BFS/Flood Fill com fila randomizada: como só anexamos células
 * adjacentes, cada região é conexa e o tabuleiro é totalmente coberto.
 * ===================================================================== */
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function growRegions(n, cols) {
  const reg = matrix(n, -1);
  const frontier = [];                        // fronteira de cada região: [r, c] já pintados
  for (let r = 0; r < n; r++) {
    reg[r][cols[r]] = r;                      // semente da região r = gato da linha r
    frontier[r] = [[r, cols[r]]];
  }
  let free = n * n - n;

  while (free > 0) {
    const ids = frontier.map((f, i) => (f.length ? i : -1)).filter(i => i >= 0);
    const id = ids[Math.floor(Math.random() * ids.length)];
    const f = frontier[id];
    const k = Math.floor(Math.random() * f.length);
    const [r, c] = f[k];

    const open = DIRS.map(([dr, dc]) => [r + dr, c + dc])
      .filter(([a, b]) => a >= 0 && b >= 0 && a < n && b < n && reg[a][b] === -1);

    if (!open.length) {                       // célula sem vizinhos livres: sai da fronteira
      f.splice(k, 1);
      continue;
    }
    const [nr, nc] = open[Math.floor(Math.random() * open.length)];
    reg[nr][nc] = id;
    f.push([nr, nc]);
    free--;
  }
  return reg;
}

/* =====================================================================
 * 3) CONTAGEM DE SOLUÇÕES (garante fase com solução única)
 * Mesmo backtracking, agora com a restrição extra "uma região por gato",
 * parando ao achar 2 soluções. Se o mapa de regiões admite mais de uma,
 * descartamos e geramos outro.
 * ===================================================================== */
function countSolutions(n, reg, limit = 2) {
  const cols = Array(n).fill(-1);
  const usedCols = new Set();
  const usedRegs = new Set();
  let count = 0;

  (function go(row) {
    if (count >= limit) return;
    if (row === n) { count++; return; }
    for (let c = 0; c < n; c++) {
      const g = reg[row][c];
      if (usedCols.has(c) || usedRegs.has(g)) continue;
      if (row > 0 && Math.abs(cols[row - 1] - c) <= 1) continue;
      cols[row] = c; usedCols.add(c); usedRegs.add(g);
      go(row + 1);
      usedCols.delete(c); usedRegs.delete(g); cols[row] = -1;
    }
  })(0);
  return count;
}

function generateLevel(n) {
  let cols, reg;
  for (let attempt = 0; attempt < 300; attempt++) {
    cols = placeCats(n);
    reg = growRegions(n, cols);
    if (countSolutions(n, reg) === 1) break;   // se esgotar, usa a última tentativa
  }
  solution = cols;
  regions = reg;
}


/* =====================================================================
 * 4) MECÂNICAS DO JOGO
 * click    -> alterna ✕ (aguarda ~250ms para distinguir de dblclick)
 * dblclick -> tenta colocar gato; confere com `solution` (gabarito)
 *   certo  -> gato fixo | errado -> -1 vida + animação de erro
 * O tabuleiro é construído uma vez por jogo e as células são atualizadas
 * individualmente (não recriamos o DOM a cada clique).
 * ===================================================================== */
const MAX_LIVES = 3;
const CLICK_DELAY = 250;
let lives = MAX_LIVES;
let lost = false;               // perdeu: só pode repetir o mesmo nível
let over = false;                 // fim de jogo (vitória, derrota ou revelação)
let cells = [];

const boardEl = document.getElementById("board");
const statusEl = document.getElementById("status");
const livesEl = document.getElementById("lives");
const modalEl = document.getElementById("modal");

function updateCell(r, c) {
  const el = cells[r][c];
  const m = marks[r][c];
  el.dataset.mark = m;
  el.classList.toggle("has-cat", m === 2);
  el.innerHTML = m === 1 ? '<span class="sym x" aria-hidden="true"></span>'
               : m === 2 ? '<span class="sym cat">🐱</span>' : "";
}

function renderLives() {
  livesEl.innerHTML = "";
  for (let i = 0; i < MAX_LIVES; i++) {
    const h = document.createElement("span");
    h.className = "heart" + (i < lives ? "" : " lost");
    h.textContent = i < lives ? "❤️" : "🖤";
    livesEl.appendChild(h);
  }
}

function updateStatus() {
  const placed = marks.flat().filter(m => m === 2).length;
  statusEl.textContent = `Gatos: ${placed}/${N}`;
}

function buildBoard() {
  boardEl.style.setProperty("--size", N);
  boardEl.innerHTML = "";
  boardEl.classList.remove("locked");
  cells = matrix(N, null);

  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const el = document.createElement("div");
      el.className = "cell";
      el.style.background = PALETTE[regions[r][c] % PALETTE.length];
      // Borda grossa apenas onde o vizinho pertence a outra região
      const thick = (dr, dc) => {
        const a = r + dr, b = c + dc;
        return a < 0 || b < 0 || a >= N || b >= N || regions[a][b] !== regions[r][c];
      };
      el.style.borderTopWidth = thick(-1, 0) ? "3px" : "1px";
      el.style.borderBottomWidth = thick(1, 0) ? "3px" : "1px";
      el.style.borderLeftWidth = thick(0, -1) ? "3px" : "1px";
      el.style.borderRightWidth = thick(0, 1) ? "3px" : "1px";

      let timer = null;
      el.addEventListener("click", () => {
        if (over || marks[r][c] === 2) return;
        clearTimeout(timer);
        timer = setTimeout(() => {
          marks[r][c] = marks[r][c] === 1 ? 0 : 1;
          updateCell(r, c);
        }, CLICK_DELAY);
      });
      el.addEventListener("dblclick", () => {
        clearTimeout(timer);
        if (over || marks[r][c] === 2) return;
        tryCat(r, c);
      });
      cells[r][c] = el;
      boardEl.appendChild(el);
    }
  }
}

function tryCat(r, c) {
  if (solution[r] === c) {
    marks[r][c] = 2;
    updateCell(r, c);
    updateStatus();
    if (marks.flat().filter(m => m === 2).length === N) win();
    return;
  }
  lives--;
  marks[r][c] = 0;
  updateCell(r, c);
  renderLives();
  shake(cells[r][c]);
  if (lives <= 0) gameOver();
}

function shake(el) {
  for (const target of [el, boardEl, document.body]) {
    const cls = target === document.body ? "flash" : "shake";
    target.classList.remove(cls);
    void target.offsetWidth;            // reinicia a animação
    target.classList.add(cls);
    setTimeout(() => target.classList.remove(cls), 600);
  }
}

function lockBoard() { over = true; boardEl.classList.add("locked"); }

function showModal(emoji, title, text, label, action) {
  modalEl.innerHTML =
    `<div class="modal-card"><div class="modal-emoji">${emoji}</div>
     <h2>${title}</h2><p>${text}</p>
     <button id="modal-btn">${label}</button></div>`;
  modalEl.classList.add("open");
  document.getElementById("modal-btn").addEventListener("click", action);
}

function win() {
  lockBoard();
  statusEl.textContent = "🎉 Todos os gatos estão em paz!";
  setTimeout(() => showModal("🏆", "Parabéns!", "Você resolveu o Miaudoku!", "Jogar novamente", newGame), 500);
}

function gameOver() {
  lost = true;
  lockBoard();
  statusEl.textContent = "💀 Game over";
  setTimeout(() => showModal("😿", "Fim de jogo", "Suas vidas acabaram. Tente novamente o mesmo nível!", "Tentar o mesmo nível", retryLevel), 700);
}

function resetBoard() {
  marks = matrix(N, 0);
  lives = MAX_LIVES;
  over = false;
  modalEl.classList.remove("open");
  buildBoard();
  renderLives();
  updateStatus();
}

function retryLevel() {
  lost = false;
  resetBoard();
}

function newGame() {
  const sizeEl = document.getElementById("size");
  if (lost) {                       // após derrota, o nível não muda
    sizeEl.value = N;
    retryLevel();
    return;
  }
  N = parseInt(sizeEl.value, 10);
  generateLevel(N);
  resetBoard();
}

function clearBoard() {
  if (over) return;
  marks = matrix(N, 0);          // gatos já fixados também voltam ao vazio, vidas são mantidas
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) updateCell(r, c);
  updateStatus();
}

function showSolution() {
  marks = matrix(N, 0);
  solution.forEach((c, r) => (marks[r][c] = 2));
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) updateCell(r, c);
  lockBoard();
  updateStatus();
  statusEl.textContent = "Solução revelada";
}

document.getElementById("new").addEventListener("click", newGame);
document.getElementById("clear").addEventListener("click", clearBoard);
document.getElementById("reveal").addEventListener("click", showSolution);
document.getElementById("size").addEventListener("change", newGame);

/* Abas */
document.querySelectorAll(".tab").forEach(btn =>
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(b => b.classList.toggle("active", b === btn));
    document.querySelectorAll(".panel").forEach(p =>
      p.classList.toggle("active", p.id === btn.dataset.target));
  }));

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
newGame();
