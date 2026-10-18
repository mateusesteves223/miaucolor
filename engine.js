"use strict";

/* =====================================================================
 * MOTOR PURO (sem DOM): geração determinística, solver lógico e
 * classificação de dificuldade.
 *
 * createEngine() é autocontida: o mesmo código roda na página e, via
 * toString(), dentro de um Web Worker (funciona até em file://).
 *
 * Geração (por seed, reproduzível em qualquer dispositivo):
 *   1) placeCats    — backtracking: um gato por linha/coluna, sem encostar
 *   2) growRegions  — cada gato é semente de uma região (flood fill sorteado)
 *   3) repairToUnique — busca local até a solução ser ÚNICA
 *
 * Dificuldade (solver lógico, sem chute) — técnicas por "tier":
 *   1  única célula possível numa linha/coluna/região
 *   2  região presa a uma linha/coluna (e o inverso)
 *   3  k regiões presas em k linhas/colunas (k = 2, 3) (e o inverso)
 *   4  eliminação por contradição (simula um gato e vê se algo quebra)
 * ===================================================================== */
function createEngine() {
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const matrix = (n, fill) => Array.from({ length: n }, () => Array(n).fill(fill));

  /* ---------- Aleatoriedade com seed ---------- */
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashSeed(str) {                       // FNV-1a 32 bits
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  const rngFor = str => mulberry32(hashSeed(str));
  const randInt = (rand, n) => Math.floor(rand() * n);

  function shuffle(arr, rand) {                  // Fisher-Yates
    for (let i = arr.length - 1; i > 0; i--) {
      const j = randInt(rand, i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /* ---------- 1) Gatos ---------- */
  function placeCats(n, rand) {
    const cols = Array(n).fill(-1);
    const used = new Set();
    function solve(row) {
      if (row === n) return true;
      for (const c of shuffle([...Array(n).keys()], rand)) {
        if (used.has(c)) continue;
        if (row > 0 && Math.abs(cols[row - 1] - c) <= 1) continue;
        cols[row] = c; used.add(c);
        if (solve(row + 1)) return true;
        used.delete(c); cols[row] = -1;
      }
      return false;
    }
    return solve(0) ? cols : null;
  }

  /* ---------- 2) Regiões ----------
   * `locked`: ids de regiões que NÃO crescem (ficam com 1 célula: um gato "de graça"). */
  function growRegions(n, cols, rand, locked = []) {
    const reg = matrix(n, -1);
    const frontier = [];
    for (let r = 0; r < n; r++) {
      reg[r][cols[r]] = r;
      frontier[r] = locked.includes(r) ? [] : [[r, cols[r]]];
    }
    let free = n * n - n;
    while (free > 0) {
      const ids = [];
      frontier.forEach((f, i) => { if (f.length) ids.push(i); });
      const id = ids[randInt(rand, ids.length)];
      const f = frontier[id];
      const k = randInt(rand, f.length);
      const [r, c] = f[k];
      const open = DIRS.map(([dr, dc]) => [r + dr, c + dc])
        .filter(([a, b]) => a >= 0 && b >= 0 && a < n && b < n && reg[a][b] === -1);
      if (!open.length) { f.splice(k, 1); continue; }
      const [nr, nc] = open[randInt(rand, open.length)];
      reg[nr][nc] = id;
      f.push([nr, nc]);
      free--;
    }
    return reg;
  }

  /* ---------- 3) Unicidade ---------- */
  function countSolutions(n, reg, limit = 2) {
    const cols = Array(n).fill(-1);
    let usedCols = 0, usedRegs = 0;
    let count = 0;
    (function go(row) {
      if (count >= limit) return;
      if (row === n) { count++; return; }
      for (let c = 0; c < n; c++) {
        const g = reg[row][c];
        const colBit = 1 << c, regBit = 1 << g;
        if ((usedCols & colBit) !== 0 || (usedRegs & regBit) !== 0) continue;
        if (row > 0 && Math.abs(cols[row - 1] - c) <= 1) continue;
        cols[row] = c;
        usedCols |= colBit;
        usedRegs |= regBit;
        go(row + 1);
        usedCols &= ~colBit;
        usedRegs &= ~regBit;
        cols[row] = -1;
      }
    })(0);
    return count;
  }

  function regionStaysConnected(reg, n, id, skipR, skipC) {
    let start = null, total = 0;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      if (reg[r][c] !== id || (r === skipR && c === skipC)) continue;
      total++;
      if (!start) start = [r, c];
    }
    if (!start) return false;
    const seen = new Set([start[0] * n + start[1]]);
    const stack = [start];
    while (stack.length) {
      const [r, c] = stack.pop();
      for (const [dr, dc] of DIRS) {
        const a = r + dr, b = c + dc;
        if (a < 0 || b < 0 || a >= n || b >= n || reg[a][b] !== id) continue;
        if ((a === skipR && b === skipC) || seen.has(a * n + b)) continue;
        seen.add(a * n + b);
        stack.push([a, b]);
      }
    }
    return seen.size === total;
  }

  /* Move células de borda entre regiões vizinhas; só aceita se o nº de soluções não aumentar. */
  function repairToUnique(n, cols, reg, rand, maxIter = 4000, cap = 50, locked = []) {
    let current = countSolutions(n, reg, cap);
    for (let i = 0; i < maxIter && current > 1; i++) {
      const r = randInt(rand, n), c = randInt(rand, n);
      if (cols[r] === c) continue;               // nunca move a semente
      const old = reg[r][c];
      const neighbors = [...new Set(DIRS
        .map(([dr, dc]) => (reg[r + dr] ? reg[r + dr][c + dc] : undefined))
        .filter(v => v !== undefined && v !== old && !locked.includes(v)))];
      if (!neighbors.length || !regionStaysConnected(reg, n, old, r, c)) continue;
      reg[r][c] = neighbors[randInt(rand, neighbors.length)];
      const k = countSolutions(n, reg, cap);
      if (k <= current) current = k;
      else reg[r][c] = old;
    }
    return current === 1;
  }

  /* Sempre devolve { cols, reg } com solução única. */
  function generateUnique(n, rand, locked = []) {
    for (let attempt = 0; attempt < 500; attempt++) {
      const cols = placeCats(n, rand);
      const reg = growRegions(n, cols, rand, locked);
      if (countSolutions(n, reg) === 1 || repairToUnique(n, cols, reg, rand, 4000, 50, locked)) {
        return { cols, reg };
      }
    }
    throw new Error("Não foi possível gerar um nível com solução única");
  }

  /* ---------- Solver lógico + dificuldade ----------
   * Devolve { tier, score, steps:{1..4}, opening } ou null se exigir chute.
   * `opening` mede o início do mapa (sem nenhuma jogada): regiões de 1 célula,
   * regiões presas a uma linha/coluna e k regiões em k linhas/colunas. */
  function gradeLevel(n, reg, solution) {
    const cand = matrix(n, true);
    const units = [];                            // ordem: linhas, colunas, regiões (1ª aparição)
    const cells = {};
    for (let i = 0; i < n; i++) { cells["r" + i] = []; units.push("r" + i); }
    for (let j = 0; j < n; j++) { cells["c" + j] = []; units.push("c" + j); }
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      cells["r" + i].push([i, j]);
      cells["c" + j].push([i, j]);
      const g = "g" + reg[i][j];
      if (!cells[g]) { cells[g] = []; units.push(g); }
      cells[g].push([i, j]);
    }
    const done = new Set();
    const placed = [];
    const steps = { 1: 0, 2: 0, 3: 0, 4: 0 };
    const kindOf = u => u[0];
    const idOf = u => +u.slice(1);
    const inUnit = (u, [r, c]) => (kindOf(u) === "r" ? r === idOf(u) : kindOf(u) === "c" ? c === idOf(u) : reg[r][c] === idOf(u));

    function zone(r, c) {
      const z = new Set();
      for (let a = Math.max(0, r - 1); a < Math.min(n, r + 2); a++)
        for (let b = Math.max(0, c - 1); b < Math.min(n, c + 2); b++) z.add(a * n + b);
      for (const [a, b] of cells["r" + r]) z.add(a * n + b);
      for (const [a, b] of cells["c" + c]) z.add(a * n + b);
      for (const [a, b] of cells["g" + reg[r][c]]) z.add(a * n + b);
      return z;
    }
    function put(r, c) {
      for (const idx of zone(r, c)) cand[Math.floor(idx / n)][idx % n] = false;
      done.add("r" + r); done.add("c" + c); done.add("g" + reg[r][c]);
      placed.push([r, c]);
    }
    const live = u => cells[u].filter(([r, c]) => cand[r][c]);
    function kill(list) {
      let ch = false;
      for (const [r, c] of list) if (cand[r][c]) { cand[r][c] = false; ch = true; }
      return ch;
    }
    const combinations = (arr, k) => {
      const out = [];
      (function rec(start, cur) {
        if (cur.length === k) { out.push(cur.slice()); return; }
        for (let i = start; i < arr.length; i++) { cur.push(arr[i]); rec(i + 1, cur); cur.pop(); }
      })(0, []);
      return out;
    };
    const free = kind => units.filter(u => kindOf(u) === kind && !done.has(u));

    function t1() {
      for (const u of units) {
        if (done.has(u)) continue;
        const lv = live(u);
        if (!lv.length) throw new Error("contradição");
        if (lv.length === 1) { put(lv[0][0], lv[0][1]); return true; }
      }
      return false;
    }

    function t2() {
      let ch = false;
      for (const u of units) {
        if (done.has(u)) continue;
        const lv = live(u);
        if (kindOf(u) === "g") {
          for (const [axis, key] of [["r", 0], ["c", 1]]) {
            const vals = new Set(lv.map(p => p[key]));
            if (vals.size === 1) {
              const v = [...vals][0];
              ch = kill(cells[axis + v].filter(p => reg[p[0]][p[1]] !== idOf(u))) || ch;
            }
          }
        } else {
          const gs = new Set(lv.map(([r, c]) => reg[r][c]));
          if (gs.size === 1) {
            const g = [...gs][0];
            ch = kill(cells["g" + g].filter(p => !inUnit(u, p))) || ch;
          }
        }
      }
      return ch;
    }

    function t3sets() {
      let ch = false;
      for (const [axis, key] of [["r", 0], ["c", 1]]) {
        for (const k of [2, 3]) {
          for (const combo of combinations(free("g"), k)) {
            const lines = new Set();
            combo.forEach(u => live(u).forEach(p => lines.add(p[key])));
            if (lines.size === k) {
              const mine = new Set(combo.map(idOf));
              const list = [];
              lines.forEach(ln => cells[axis + ln].forEach(p => { if (!mine.has(reg[p[0]][p[1]])) list.push(p); }));
              ch = kill(list) || ch;
            }
          }
          for (const combo of combinations(free(axis), k)) {
            const gs = new Set();
            combo.forEach(u => live(u).forEach(([r, c]) => gs.add(reg[r][c])));
            if (gs.size === k) {
              const mine = new Set(combo);
              const list = [];
              gs.forEach(g => cells["g" + g].forEach(p => { if (!mine.has(axis + p[key])) list.push(p); }));
              ch = kill(list) || ch;
            }
          }
        }
      }
      return ch;
    }

    function t4contra() {
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
        if (!cand[r][c]) continue;
        const z = zone(r, c);
        const gone = new Set(["r" + r, "c" + c, "g" + reg[r][c]]);
        for (const u of units) {
          if (done.has(u) || gone.has(u)) continue;
          if (cells[u].every(([a, b]) => z.has(a * n + b) || !cand[a][b])) {
            cand[r][c] = false;
            return true;
          }
        }
      }
      return false;
    }

    /* Abertura: o que o mapa oferece antes da 1ª jogada */
    const opening = { singles: 0, lines: 0, sets2: 0, sets3: 0 };
    for (const u of units) {
      if (kindOf(u) !== "g") continue;
      const cs = cells[u];
      if (cs.length === 1) opening.singles++;
      else if (new Set(cs.map(p => p[0])).size === 1 || new Set(cs.map(p => p[1])).size === 1) opening.lines++;
    }
    for (const key of [0, 1]) for (const k of [2, 3]) {
      for (const combo of combinations(units.filter(u => kindOf(u) === "g"), k)) {
        const lines = new Set();
        combo.forEach(u => cells[u].forEach(p => lines.add(p[key])));
        if (lines.size === k) opening[k === 2 ? "sets2" : "sets3"]++;
      }
    }

    try {
      while (placed.length < n) {
        let progressed = false;
        for (const [tier, fn] of [[1, t1], [2, t2], [3, t3sets], [4, t4contra]]) {
          if (fn()) { steps[tier]++; progressed = true; break; }
        }
        if (!progressed) return null;            // exigiria chute
      }
    } catch (e) {
      return null;
    }
    const mine = placed.map(([r, c]) => r * n + c).sort((a, b) => a - b).join();
    const want = solution.map((c, r) => r * n + c).sort((a, b) => a - b).join();
    if (mine !== want) return null;
    const tier = Math.max(...[1, 2, 3, 4].filter(t => steps[t]));
    return { tier, score: steps[1] + 3 * steps[2] + 8 * steps[3] + 15 * steps[4], steps, opening };
  }

  /* ---------- Power-ups: dica, revelar gato e ✕ seguros ----------
   * `marks[r][c]`: 0 vazio | 1 ✕ | 2 gato | 3 ✕ errado. Na dedução só os gatos entram (são sempre
   * certos); os ✕ do jogador podem estar errados e servem apenas para pular dicas já aplicadas. */

  /* Procura a dedução lógica mais simples que ainda traga algo NOVO ao jogador.
   * Devolve { kind, tier, axis?, lines?, regs?, unit?, cells, targets } ou null (sem dedução sem chute).
   *   cells   = casas que justificam a dedução; targets = casas que podem receber ✕ (vazio em "single").
   * kind: single | regionLine | lineRegion | regionSet | lineSet | contradiction */
  function findHint(n, reg, marks) {
    const cells = {};
    for (let i = 0; i < n; i++) cells["r" + i] = [];
    for (let i = 0; i < n; i++) cells["c" + i] = [];
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const g = "g" + reg[i][j];
      (cells[g] = cells[g] || []).push([i, j]);
      cells["r" + i].push([i, j]);
      cells["c" + j].push([i, j]);
    }
    const units = Object.keys(cells);
    const cand = matrix(n, true);
    const done = new Set();
    const kindOf = u => u[0];
    const idOf = u => +u.slice(1);
    const live = u => cells[u].filter(([r, c]) => cand[r][c]);
    const inUnit = (u, [r, c]) => (kindOf(u) === "r" ? r === idOf(u) : kindOf(u) === "c" ? c === idOf(u) : reg[r][c] === idOf(u));
    const free = k => units.filter(u => kindOf(u) === k && !done.has(u));

    function zone(r, c) {
      const z = new Set();
      for (let a = Math.max(0, r - 1); a < Math.min(n, r + 2); a++)
        for (let b = Math.max(0, c - 1); b < Math.min(n, c + 2); b++) z.add(a * n + b);
      for (const u of ["r" + r, "c" + c, "g" + reg[r][c]]) for (const [a, b] of cells[u]) z.add(a * n + b);
      return z;
    }
    function put(r, c) {
      for (const idx of zone(r, c)) cand[Math.floor(idx / n)][idx % n] = false;
      done.add("r" + r); done.add("c" + c); done.add("g" + reg[r][c]);
    }
    const combinations = (arr, k) => {
      const out = [];
      (function rec(start, cur) {
        if (cur.length === k) { out.push(cur.slice()); return; }
        for (let i = start; i < arr.length; i++) { cur.push(arr[i]); rec(i + 1, cur); cur.pop(); }
      })(0, []);
      return out;
    };

    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (marks[r][c] === 2) put(r, c);

    // Próxima dedução (das técnicas mais simples às mais complexas) que elimina ao menos uma casa viva.
    function nextStep() {
      for (const u of units) {                                   // 1) única casa possível
        if (done.has(u)) continue;
        const lv = live(u);
        if (!lv.length) return null;                             // inconsistente: não deveria ocorrer
        if (lv.length === 1) return { kind: "single", tier: 1, unit: u, cells: lv, targets: [] };
      }
      for (const u of units) {                                   // 2) região presa a uma linha/coluna (e o inverso)
        if (done.has(u)) continue;
        const lv = live(u);
        if (kindOf(u) === "g") {
          for (const [axis, key] of [["r", 0], ["c", 1]]) {
            const vals = new Set(lv.map(p => p[key]));
            if (vals.size !== 1) continue;
            const v = [...vals][0];
            const targets = live(axis + v).filter(p => reg[p[0]][p[1]] !== idOf(u));
            if (targets.length) return { kind: "regionLine", tier: 2, axis, lines: [v], regs: [idOf(u)], cells: lv, targets };
          }
        } else {
          const gs = new Set(lv.map(([r, c]) => reg[r][c]));
          if (gs.size !== 1) continue;
          const g = [...gs][0];
          const targets = live("g" + g).filter(p => !inUnit(u, p));
          if (targets.length) return { kind: "lineRegion", tier: 2, axis: kindOf(u), lines: [idOf(u)], regs: [g], cells: lv, targets };
        }
      }
      for (const k of [2, 3]) for (const [axis, key] of [["r", 0], ["c", 1]]) {   // 3) k regiões em k linhas/colunas (e o inverso)
        for (const combo of combinations(free("g"), k)) {
          const lines = new Set();
          combo.forEach(u => live(u).forEach(p => lines.add(p[key])));
          if (lines.size !== k) continue;
          const mine = new Set(combo.map(idOf));
          const targets = [];
          lines.forEach(ln => live(axis + ln).forEach(p => { if (!mine.has(reg[p[0]][p[1]])) targets.push(p); }));
          if (targets.length) {
            return { kind: "regionSet", tier: 3, axis, lines: [...lines].sort((a, b) => a - b), regs: combo.map(idOf),
              cells: combo.flatMap(u => live(u)), targets };
          }
        }
        for (const combo of combinations(free(axis), k)) {
          const gs = new Set();
          combo.forEach(u => live(u).forEach(([r, c]) => gs.add(reg[r][c])));
          if (gs.size !== k) continue;
          const mine = new Set(combo);
          const targets = [];
          gs.forEach(g => live("g" + g).forEach(p => { if (!mine.has(axis + p[key])) targets.push(p); }));
          if (targets.length) {
            return { kind: "lineSet", tier: 3, axis, lines: combo.map(idOf), regs: [...gs].sort((a, b) => a - b),
              cells: combo.flatMap(u => live(u)), targets };
          }
        }
      }
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {   // 4) contradição: com um gato aqui, algo ficaria sem casa
        if (!cand[r][c]) continue;
        const z = zone(r, c);
        const own = new Set(["r" + r, "c" + c, "g" + reg[r][c]]);
        for (const u of units) {
          if (done.has(u) || own.has(u)) continue;
          const lv = live(u);
          if (lv.length && lv.every(([a, b]) => z.has(a * n + b))) {
            return { kind: "contradiction", tier: 4, unit: u, cells: [[r, c]], targets: [[r, c]] };
          }
        }
      }
      return null;
    }

    for (let guard = 0; guard < n * n * 4; guard++) {
      const step = nextStep();
      if (!step) return null;                                    // exigiria chute
      if (step.kind === "single") return step;
      const fresh = step.targets.filter(([r, c]) => marks[r][c] === 0);
      for (const [r, c] of step.targets) cand[r][c] = false;
      if (fresh.length) return { ...step, targets: fresh };      // dedução já aplicada pelo jogador: segue adiante
    }
    return null;
  }

  /* Um gato da solução que o jogador ainda não pôs: [r, c] ou null */
  function pickRevealCat(n, solution, marks, rand = Math.random) {
    const left = [];
    for (let r = 0; r < n; r++) if (marks[r][solution[r]] !== 2) left.push([r, solution[r]]);
    return left.length ? left[randInt(rand, left.length)] : null;
  }

  /* Até k casas vazias SEM gato na solução. Prioriza as que os gatos postos ainda não eliminam. */
  function pickSafeCrosses(n, reg, solution, marks, k = 3, rand = Math.random) {
    const blocked = new Set();
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      if (marks[r][c] !== 2) continue;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        if (i === r || j === c || reg[i][j] === reg[r][c] || (Math.abs(i - r) <= 1 && Math.abs(j - c) <= 1)) blocked.add(i * n + j);
      }
    }
    const useful = [], rest = [];
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      if (marks[r][c] !== 0 || solution[r] === c) continue;
      (blocked.has(r * n + c) ? rest : useful).push([r, c]);
    }
    return shuffle(useful, rand).concat(shuffle(rest, rand)).slice(0, k);
  }

  /* ---------- Níveis infinitos (10x10) ----------
   * O nível `id` sempre sai da mesma seed: reprodutível em qualquer dispositivo.
   * Se o mapa exigir chute (≈5%), passa-se à próxima tentativa (também determinística). */
  const INF_SIZE = 10;
  const encodeRegions = reg => reg.map(row => row.map(v => String.fromCharCode(65 + v)).join("")).join("");

  /* A dificuldade vem do que o solver lógico precisa (passos ponderados), não do tamanho.
   * Em 10x10 a distribuição natural fica ≈ 35% / 25% / 20% / 15%. */
  function difficultyLabel(score) {
    return score <= 16 ? "Fácil" : score <= 40 ? "Médio" : score <= 80 ? "Difícil" : "Expert";
  }

  function generateInfinite(id) {
    for (let attempt = 0; ; attempt++) {
      const rand = rngFor("miaucolor:inf:" + id + ":" + attempt);
      const { cols, reg } = generateUnique(INF_SIZE, rand);
      const g = gradeLevel(INF_SIZE, reg, cols);
      if (g) {
        return { id, n: INF_SIZE, regions: encodeRegions(reg), solution: cols,
          tier: g.tier, score: g.score, diff: difficultyLabel(g.score) };
      }
    }
  }

  return { matrix, DIRS, mulberry32, hashSeed, rngFor, randInt, shuffle, placeCats, growRegions,
    countSolutions, regionStaysConnected, repairToUnique, generateUnique, gradeLevel,
    findHint, pickRevealCat, pickSafeCrosses, INF_SIZE, encodeRegions, difficultyLabel, generateInfinite };
}

/* Cria um Web Worker com o motor embutido; `handlerSrc` define `onmessage` usando `E`.
 * Via Blob, funciona também abrindo o index.html direto do disco. */
function spawnEngineWorker(handlerSrc) {
  const src = `const E = (${createEngine.toString()})();\n${handlerSrc}`;
  const url = URL.createObjectURL(new Blob([src], { type: "text/javascript" }));
  const worker = new Worker(url);
  // Revogação diferida: Safari/WebKit e Firefox mobile buscam o script do Worker de forma assíncrona;
  // revogar na hora quebraria a inicialização. Idempotente (timer + terminate).
  let revoked = false;
  const revoke = () => { if (!revoked) { revoked = true; URL.revokeObjectURL(url); } };
  const timer = setTimeout(revoke, 2000);
  const terminate = worker.terminate.bind(worker);
  worker.terminate = () => { terminate(); clearTimeout(timer); setTimeout(revoke, 2000); };
  return worker;
}
