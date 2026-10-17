# MiauColor code export

Gerado em: 2026-10-17 01:09:03

## audio.js

- Last modified: 2026-10-16 23:31:06

```js
"use strict";

/* Som e vibração. Os sons são sintetizados com a Web Audio API (sem arquivos de áudio:
 * funciona offline e não tem direitos autorais). O áudio só inicia após um gesto do usuário
 * (política dos navegadores). As preferências ficam em localStorage. */
const Sound = (() => {
  const KEY = "miaucolor:settings:v1";
  const defaults = { sound: true, haptics: true };
  let settings = load();
  let ctx = null;

  function load() {
    try { return { ...defaults, ...JSON.parse(localStorage.getItem(KEY)) }; } catch { return { ...defaults }; }
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* sem espaço */ } }

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  function tone({ freq, to = freq, dur = 0.12, type = "sine", gain = 0.1, delay = 0 }) {
    if (!settings.sound) return;
    const c = ensure();
    if (!c) return;
    const t0 = c.currentTime + delay;
    const osc = c.createOscillator();
    const amp = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    amp.gain.setValueAtTime(0.0001, t0);
    amp.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(amp).connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  const vibrate = pattern => { if (settings.haptics && navigator.vibrate) navigator.vibrate(pattern); };

  return {
    unlock: ensure,
    get sound() { return settings.sound; },
    get haptics() { return settings.haptics; },
    setSound(on) { settings.sound = on; save(); },
    setHaptics(on) { settings.haptics = on; save(); if (on) vibrate(15); },

    tap() { tone({ freq: 520, to: 380, dur: 0.05, type: "triangle", gain: 0.07 }); },
    cat() {                                         // "miau": sobe e desce
      tone({ freq: 520, to: 900, dur: 0.12, type: "sawtooth", gain: 0.05 });
      tone({ freq: 900, to: 460, dur: 0.18, type: "sawtooth", gain: 0.05, delay: 0.11 });
      vibrate(15);
    },
    error() {
      tone({ freq: 190, to: 90, dur: 0.25, type: "square", gain: 0.06 });
      vibrate([30, 40, 30]);
    },
    win() {
      [523, 659, 784, 1047].forEach((f, i) => tone({ freq: f, dur: 0.2, type: "triangle", gain: 0.09, delay: i * 0.1 }));
      vibrate([20, 30, 20, 30, 70]);
    },
    lose() {
      [392, 330, 262].forEach((f, i) => tone({ freq: f, to: f * 0.96, dur: 0.22, type: "triangle", gain: 0.09, delay: i * 0.16 }));
      vibrate(120);
    },
  };
})();
```

## engine.js

- Last modified: 2026-10-16 22:36:29

```js
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
    const usedCols = new Set(), usedRegs = new Set();
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
    INF_SIZE, encodeRegions, difficultyLabel, generateInfinite };
}

/* Cria um Web Worker com o motor embutido; `handlerSrc` define `onmessage` usando `E`.
 * Via Blob, funciona também abrindo o index.html direto do disco. */
function spawnEngineWorker(handlerSrc) {
  const src = `const E = (${createEngine.toString()})();\n${handlerSrc}`;
  const url = URL.createObjectURL(new Blob([src], { type: "text/javascript" }));
  const worker = new Worker(url);
  const terminate = worker.terminate.bind(worker);
  worker.terminate = () => { terminate(); URL.revokeObjectURL(url); };
  return worker;
}
```

## export-full-code.ps1

- Last modified: 2026-10-17 01:08:55

```ps1
$ErrorActionPreference = 'Stop'

$root = $PSScriptRoot
$outputPath = Join-Path $root 'fullCode.md'
$includedExtensions = @(
    '.js', '.mjs', '.cjs', '.jsx',
    '.ts', '.tsx',
    '.py', '.ps1',
    '.html', '.css',
    '.json', '.webmanifest'
)
$excludedDirectories = @('.git', 'node_modules', 'dist', 'build', 'coverage')
$utf8 = New-Object System.Text.UTF8Encoding($true)
$builder = New-Object System.Text.StringBuilder

[void]$builder.AppendLine('# MiauColor code export')
[void]$builder.AppendLine()
[void]$builder.AppendLine("Gerado em: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')")
[void]$builder.AppendLine()

$files = Get-ChildItem -LiteralPath $root -Recurse -File |
    Where-Object {
        $relativePath = $_.FullName.Substring($root.Length).TrimStart('\')
        $pathParts = $relativePath -split '[\\/]'
        $extension = $_.Extension.ToLowerInvariant()

        ($includedExtensions -contains $extension) -and
        ($relativePath -ne 'fullCode.md') -and
        -not ($pathParts | Where-Object { $excludedDirectories -contains $_ })
    } |
    Sort-Object FullName

foreach ($file in $files) {
    $relativePath = $file.FullName.Substring($root.Length).TrimStart('\')
    $isInRoot = $relativePath -notmatch '[\\/]'
    $modifiedAt = $file.LastWriteTime.ToString('yyyy-MM-dd HH:mm:ss')
    $content = [System.IO.File]::ReadAllText($file.FullName)
    $backtickRuns = [regex]::Matches($content, '`+')
    $longestRun = 2

    foreach ($run in $backtickRuns) {
        if ($run.Length -gt $longestRun) {
            $longestRun = $run.Length
        }
    }

    $fence = '`' * ($longestRun + 1)
    $language = $file.Extension.TrimStart('.').ToLowerInvariant()

    [void]$builder.AppendLine("## $($file.Name)")
    [void]$builder.AppendLine()
    [void]$builder.AppendLine("- Last modified: $modifiedAt")
    if (-not $isInRoot) {
        [void]$builder.AppendLine("- Caminho: $relativePath")
    }
    [void]$builder.AppendLine()
    [void]$builder.AppendLine("$fence$language")
    [void]$builder.Append($content)
    if (-not $content.EndsWith("`n")) {
        [void]$builder.AppendLine()
    }
    [void]$builder.AppendLine($fence)
    [void]$builder.AppendLine()
}

[System.IO.File]::WriteAllText($outputPath, $builder.ToString(), $utf8)
Write-Output "Exportados $($files.Count) arquivos para $outputPath"
```

## index.html

- Last modified: 2026-10-16 23:36:32

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#1e1b2e">
  <link rel="manifest" href="manifest.webmanifest">
  <link rel="icon" type="image/png" href="icons/icon-192.png">
  <link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <title>MiauColor</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <nav class="sidenav">
  <header>
    <h1>🐱 MiauColor</h1>
    <button id="menu-btn" class="menu-btn" type="button" aria-label="Abrir menu" aria-expanded="false" aria-controls="menu-drop">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
    </button>
    <ul class="rules">
      <li>Um gato por cor</li>
      <li>Um gato por linha e coluna</li>
      <li>Os gatos não podem se encostar</li>
    </ul>
  </header>

  <div class="tabs" role="tablist">
    <button class="tab active" data-target="game">Jogar</button>
    <button class="tab" data-target="levels">Níveis</button>
    <button class="tab" data-target="solver" data-dev>Resolve Nível</button>
    <button class="tab" data-target="help">Guia Help</button>
    <button class="tab" data-target="wiki" data-dev>Documentação Algorítmica</button>
  </div>

  <div id="menu-drop" class="menu-drop"></div>

  </nav>

  <main>
    <!-- ===== ABA 1: JOGO ===== -->
    <section id="game" class="panel active">
      <aside class="sidebar">
      <div class="controls">
        <label>Tamanho:
          <select id="size">
            <option>5</option><option>6</option><option selected>7</option>
            <option>8</option><option>9</option><option>10</option>
          </select>
        </label>
        <button id="new">Novo jogo</button>
        <button id="clear">Limpar</button>
        <button id="sound-btn" type="button" aria-pressed="true">🔊 Som</button>
        <button id="haptics-btn" type="button" aria-pressed="true">📳 Vibração</button>
      </div>
      <div id="level-info" class="level-info"></div>
      <div id="lives" class="lives" aria-label="Vidas"></div>
      <div id="status"></div>
      <div id="timer" class="timer" aria-label="Tempo">⏱ 00:00</div>
      <p class="hint">Clique: marca ✕<br>Duplo clique: coloca 🐱</p>
      <div class="reveal-wrap"><button id="reveal" class="link-btn">Revelar solução</button>
        <div class="dev-card" data-dev>
          <label class="dev-head"><span>🛠️ Modo Dev</span><input type="checkbox" id="dev" class="switch" aria-label="Modo Dev"></label>
          <div class="dev-body">
            <p class="dev-note" id="dev-note" hidden>♾️ Vidas infinitas</p>
            <label class="dev-opt" id="auto-x-wrap" hidden><span>✕ ao redor do gato</span><input type="checkbox" id="auto-x" class="switch" checked></label>
            <label class="dev-opt" id="auto-color-wrap" hidden><span>✕ na cor do gato</span><input type="checkbox" id="auto-color" class="switch" checked></label>
            <button id="find-cat" class="dev-btn" hidden>🔎 Achar um gato</button>
          </div>
        </div>
      </div>
      </aside>
      <div class="stage"><div id="board" aria-label="Tabuleiro"></div></div>
      <div id="modal" class="modal" role="dialog" aria-modal="true"></div>
    </section>

    <!-- ===== ABA: RESOLVE NÍVEL ===== -->
    <!-- ===== MAPA DE NÍVEIS ===== -->
    <section id="levels" class="panel">
      <div class="levels-head">
        <h2>Níveis</h2>
        <span id="levels-total" class="levels-total"></span>
      </div>
      <div id="level-map"></div>
    </section>

    <section id="solver" class="panel">
      <aside class="sidebar">
        <div class="controls">
          <label>Tamanho:
            <select id="s-size">
              <option>5</option><option>6</option><option>7</option>
              <option>8</option><option>9</option><option>10</option>
            </select>
          </label>
          <button id="s-clear">Limpar</button>
        </div>
        <div class="palette-title">Paleta</div>
        <div id="palette" class="palette" role="radiogroup" aria-label="Paleta de cores"></div>
        <div id="s-status" class="s-status"></div>
        <button id="s-solve" class="solve-btn" hidden>🐱 Resolver nível</button>
        <p class="hint">Clique ou arraste para pintar o quadro com as cores do seu nível.</p>
      </aside>
      <div class="stage"><div id="sboard" aria-label="Quadro para pintar"></div></div>
    </section>

    <!-- ===== ABA 2: GUIA HELP ===== -->
    <section id="help" class="panel">
      <article class="doc">
        <h2>Guia de estratégias</h2>
        <p class="guide-intro">Use as regras para eliminar possibilidades. Marque ✕ quando tiver certeza de que uma célula não pode receber gato; guarde seus palpites para quando a lógica não avançar.</p>

        <div class="strategy-grid">
          <section class="strategy-card">
            <span class="strategy-number">01 · DEDUÇÃO</span>
            <h3>Procure uma cor com poucas opções</h3>
            <p>Uma região precisa receber exatamente um gato. Se só restar uma célula possível naquela cor, ela é obrigatória. Se restarem duas, mantenha as duas possibilidades até outra regra eliminar uma.</p>
            <figure class="example">
              <figcaption>Exemplo: a região azul só pode usar uma destas casas.</figcaption>
              <div class="mini-board two-options" role="img" aria-label="Duas células candidatas na região azul">
                <span class="candidate blue"></span><span></span><span class="candidate blue"></span><span></span>
              </div>
              <div class="legend"><span><i class="legend-dot blue"></i> Região azul: 2 candidatas</span></div>
            </figure>
          </section>

          <section class="strategy-card">
            <span class="strategy-number">02 · BLOQUEIO</span>
            <h3>Cor presa em uma linha ou coluna</h3>
            <p>Se todas as posições possíveis de uma cor estão na mesma linha, essa linha já terá seu gato naquela região. Elimine com ✕ as outras cores nas demais casas da linha. A mesma lógica vale para uma coluna.</p>
            <figure class="example">
              <figcaption>A região azul só cabe na linha destacada; as outras casas da linha ficam bloqueadas.</figcaption>
              <div class="mini-board four-cells" role="img" aria-label="Candidatas da região azul e casas bloqueadas na mesma linha">
                <span class="candidate blue"></span><span class="candidate blue"></span><span class="eliminated">✕</span><span class="eliminated">✕</span>
              </div>
              <div class="legend"><span><i class="legend-dot blue"></i> Candidatas azuis</span><span><i class="legend-cross">✕</i> Outras cores eliminadas</span></div>
            </figure>
          </section>

          <section class="strategy-card">
            <span class="strategy-number">03 · PARES</span>
            <h3>Duas cores reservam duas linhas</h3>
            <p>Se duas cores só podem aparecer em duas mesmas linhas, elas ocuparão essas duas linhas — uma em cada. Nenhuma outra cor pode ficar nelas. Marque ✕ nas demais candidatas dessas linhas.</p>
            <figure class="example">
              <figcaption>As regiões azul e dourada estão restritas às linhas A e B.</figcaption>
              <div class="pair-demo" role="img" aria-label="Duas linhas reservadas às regiões azul e dourada; candidatas de outras cores eliminadas">
                <span class="row-label">A</span><span class="candidate blue">A</span><span class="candidate gold">B</span><span class="eliminated">✕</span><span class="eliminated">✕</span>
                <span class="row-label">B</span><span class="candidate blue">A</span><span class="candidate gold">B</span><span class="eliminated">✕</span><span class="eliminated">✕</span>
              </div>
              <div class="legend"><span><i class="legend-dot blue"></i> Azul</span><span><i class="legend-dot gold"></i> Dourada</span><span><i class="legend-cross">✕</i> Outras cores</span></div>
            </figure>
          </section>

          <section class="strategy-card">
            <span class="strategy-number">04 · INTERSEÇÃO</span>
            <h3>Região alinhada com uma linha</h3>
            <p>O raciocínio também funciona ao contrário: se, dentro de uma região, as candidatas estão todas na mesma linha ou coluna, essa linha ou coluna não pode receber outro gato daquela região fora dela.</p>
            <figure class="example">
              <figcaption>As duas candidatas da região verde estão na linha; a candidata fora dela é impossível.</figcaption>
              <div class="mini-board four-cells" role="img" aria-label="Duas candidatas verdes na mesma linha e uma candidata eliminada fora da região">
                <span class="candidate green"></span><span class="candidate green"></span><span></span><span class="eliminated">✕</span>
              </div>
              <div class="legend"><span><i class="legend-dot green"></i> Região verde alinhada</span><span><i class="legend-cross">✕</i> Eliminada pela interseção</span></div>
            </figure>
          </section>

          <section class="strategy-card">
            <span class="strategy-number">05 · VIZINHANÇA</span>
            <h3>Use o espaço ao redor de um gato</h3>
            <p>Depois de confirmar um gato, elimine as casas da mesma linha, coluna e cor. Também elimine as casas vizinhas, inclusive diagonais. Assim os gatos não se encostam.</p>
            <figure class="example">
              <figcaption>Um gato bloqueia as casas ao redor (incluindo diagonais).</figcaption>
              <div class="mini-board neighborhood" role="img" aria-label="Gato no centro e casas vizinhas bloqueadas">
                <span class="blocked">×</span><span class="blocked">×</span><span class="blocked">×</span>
                <span class="blocked">×</span><span class="cat-cell">🐱</span><span class="blocked">×</span>
                <span class="blocked">×</span><span class="blocked">×</span><span class="blocked">×</span>
              </div>
              <div class="legend"><span><i class="legend-cross">×</i> Casas que não podem receber outro gato</span></div>
            </figure>
          </section>

          <section class="strategy-card probability-card">
            <span class="strategy-number">06 · ESCOLHA</span>
            <h3>Se travar, priorize a região mais limitada</h3>
            <p>Conte as candidatas que ainda restam para cada cor. Tente deduzir primeiro a cor com menos opções: cada exclusão afeta linhas, colunas, regiões e vizinhanças. Isso é uma heurística, não uma garantia de que uma casa isolada seja mais provável.</p>
            <div class="guide-note"><strong>Importante:</strong> não escolha só pela aparência ou por “chance”. As candidatas não têm necessariamente probabilidades iguais; prefira uma dedução que respeite todas as regras.</div>
          </section>
        </div>

        <div class="guide-note guide-summary"><strong>Ordem prática:</strong> confira as regras de cada gato confirmado → procure cores com uma única opção → procure linhas ou colunas com uma única opção → aplique bloqueios, pares e interseções → só então avalie uma tentativa.</div>
      </article>
    </section>

    <!-- ===== ABA 3: WIKI ===== -->
    <section id="wiki" class="panel">
      <article class="doc">
        <h2>Documentação Algorítmica</h2>
        <p>Este artigo explica, passo a passo, como o MiauColor gera tabuleiros infinitos e válidos. O código correspondente está em <code>engine.js</code>.</p>

        <nav>
          <strong>Sumário</strong>
          <ul>
            <li><a href="#w-problema">1. O problema</a></li>
            <li><a href="#w-backtracking">2. Backtracking</a></li>
            <li><a href="#w-regioes">3. Geração das regiões</a></li>
            <li><a href="#w-unicidade">4. Solução única</a></li>
            <li><a href="#w-grafos">5. Grafos</a></li>
            <li><a href="#w-estudo">6. Como estudar grafos</a></li>
          </ul>
        </nav>

        <h3 id="w-problema">1. O problema</h3>
        <p>Dado um tabuleiro <em>N × N</em> dividido em <em>N</em> regiões coloridas conexas, devemos colocar exatamente <em>N</em> gatos tais que:</p>
        <ul>
          <li>há exatamente um gato em cada <strong>linha</strong>;</li>
          <li>há exatamente um gato em cada <strong>coluna</strong>;</li>
          <li>há exatamente um gato em cada <strong>região</strong>;</li>
          <li>dois gatos <strong>nunca se tocam</strong>, nem na diagonal (vizinhança de 8 direções).</li>
        </ul>
        <p>Isso é uma instância do <strong>Problema da Cobertura Exata (Exact Cover)</strong>: temos um conjunto de "restrições" (linha 0, linha 1, ..., coluna 0, ..., região 0, ...) e cada posição candidata <code>(r, c)</code> cobre três restrições ao mesmo tempo (sua linha, sua coluna e sua região). Queremos escolher posições de modo que <em>cada restrição seja coberta exatamente uma vez</em>. A restrição de não-adjacência é uma regra extra de exclusão entre candidatas.</p>
        <p>O algoritmo clássico para Cobertura Exata é o <strong>Algoritmo X de Knuth</strong>, implementado com <em>Dancing Links</em> (listas duplamente encadeadas circulares que permitem remover e restaurar colunas em O(1)). Para tabuleiros tão pequenos (N ≤ 10), um backtracking direto, especializado, é mais simples e mais que suficiente.</p>

        <h3 id="w-backtracking">2. Backtracking: posicionando os gatos</h3>
        <h4>A ideia</h4>
        <p>Backtracking é uma busca em profundidade sobre o <em>espaço de decisões</em>. Construímos a solução aos poucos; se uma escolha parcial leva a um beco sem saída, <strong>desfazemos</strong> a última decisão e tentamos outra.</p>
        <h4>Como foi montado</h4>
        <p>Em vez de testar todas as <em>N²</em> células, usamos a restrição "um gato por linha" para <em>embutir</em> a regra na estrutura: a recursão decide <strong>a coluna do gato de cada linha</strong>, uma linha por nível. O estado é só um vetor <code>cols[row]</code>. Assim, "uma por linha" é garantido por construção, e só verificamos:</p>
        <ol>
          <li><strong>Coluna livre:</strong> um <code>Set</code> (<code>usedCols</code>) com as colunas já usadas — teste O(1).</li>
          <li><strong>Sem toque:</strong> como a linha anterior é a única que pode ser vizinha, basta <code>|cols[row-1] − c| &gt; 1</code>. Isso cobre diagonais e a vertical (a vertical já é barrada pela coluna).</li>
        </ol>
<pre><code>solve(row):
  se row == N: retorne verdadeiro            // caso base
  para cada coluna c (em ordem aleatória):
      se c usada ou encosta na linha anterior: continue
      cols[row] = c; marque c                // ESCOLHE
      se solve(row + 1): retorne verdadeiro  // EXPLORA
      desmarque c; cols[row] = -1            // DESFAZ (backtrack)
  retorne falso                              // beco sem saída</code></pre>
        <p><strong>Aleatoriedade:</strong> embaralhamos a ordem das colunas (Fisher-Yates) a cada nível, assim cada chamada produz uma configuração diferente — origem dos "níveis infinitos".</p>
        <p><strong>Complexidade:</strong> no pior caso é O(N!) (o número de permutações), porém a poda pela regra de adjacência corta a árvore drasticamente; para N ≤ 10 é instantâneo.</p>
        <div class="note">Nota: o resultado é uma permutação de colunas. Para N=1 há solução; para N=2 e N=3 não existe nenhuma (por isso o menor tamanho oferecido é 5).</div>

        <h3 id="w-regioes">3. Como as regiões coloridas são criadas</h3>
        <p>Desenhar regiões primeiro e depois procurar gatos seria difícil: quase nenhum mapa teria solução. Fazemos o <strong>processo inverso</strong>: com os gatos já posicionados, cada gato vira a <em>semente</em> de uma região, que então cresce até cobrir o tabuleiro. A solução existe por construção — cada região contém exatamente o gato que a originou.</p>
        <h4>O algoritmo (crescimento multi-fonte, estilo Flood Fill / BFS randomizada)</h4>
        <ol>
          <li>Crie uma matriz <code>regions</code> preenchida com <code>-1</code> ("livre").</li>
          <li>Para cada gato na linha <em>r</em>, marque <code>regions[r][col] = r</code> e coloque a célula na <em>fronteira</em> da região <em>r</em>.</li>
          <li>Enquanto restarem células livres: sorteie uma região; sorteie uma célula da fronteira dela; olhe os 4 vizinhos ortogonais; se algum estiver livre, sorteie um e anexe-o à região (e à fronteira). Se nenhum estiver livre, remova a célula da fronteira.</li>
        </ol>
        <p>Um Flood Fill comum pinta <em>uma</em> área a partir de um ponto. Aqui rodamos N preenchimentos <strong>em paralelo e competindo</strong> pelas mesmas células; a escolha aleatória de região e vizinho dá formas orgânicas e irregulares. Como só anexamos células <em>adjacentes</em> a algo já na região, cada região é garantidamente <strong>conexa</strong>. O laço termina porque cada iteração ou pinta uma célula nova ou reduz a fronteira.</p>
        <p>As cores vêm de uma paleta indexada pelo id da região; as bordas grossas são desenhadas onde o vizinho tem id diferente.</p>

        <h3 id="w-unicidade">4. Garantindo solução única</h3>
        <p>Um mapa gerado dessa forma pode ter <em>mais de uma</em> solução válida, o que frustra o jogador. Por isso, depois de gerar as regiões, rodamos <code>countSolutions</code>: o mesmo backtracking, agora com a restrição extra de região (<code>usedRegs</code>), que <strong>para ao encontrar 2 soluções</strong>. Se o total for 1, o nível é aceito; senão, geramos outro (até 300 tentativas). Esse é o padrão "gerar e testar".</p>

        <h3 id="w-grafos">5. Grafos</h3>
        <h4>5.1 O que é um grafo?</h4>
        <p>Um <strong>grafo</strong> <em>G = (V, E)</em> é formado por um conjunto de <strong>vértices</strong> (ou nós) <em>V</em> e um conjunto de <strong>arestas</strong> <em>E</em>, cada uma ligando dois vértices. Pense em cidades (vértices) e estradas (arestas), pessoas e amizades, páginas web e links.</p>
        <ul>
          <li><strong>Não-direcionado</strong>: a aresta vale nos dois sentidos (amizade). <strong>Direcionado</strong>: tem sentido (seguir alguém).</li>
          <li><strong>Ponderado</strong>: as arestas têm custo (distância). <strong>Não-ponderado</strong>: todas valem o mesmo.</li>
          <li><strong>Grau</strong> de um vértice: número de arestas incidentes.</li>
          <li><strong>Caminho</strong>: sequência de vértices ligados por arestas. <strong>Ciclo</strong>: caminho que volta ao início.</li>
          <li><strong>Conexo</strong>: existe caminho entre quaisquer dois vértices. <strong>Componente conexa</strong>: pedaço máximo conexo.</li>
          <li><strong>Árvore</strong>: grafo conexo sem ciclos. <strong>DAG</strong>: grafo direcionado acíclico.</li>
        </ul>

        <h4>5.2 Como representar um grafo no computador</h4>
        <table>
          <tr><th>Representação</th><th>Memória</th><th>Aresta (u,v)?</th><th>Vizinhos de u</th><th>Quando usar</th></tr>
          <tr><td>Matriz de adjacência</td><td>O(V²)</td><td>O(1)</td><td>O(V)</td><td>Grafos densos</td></tr>
          <tr><td>Lista de adjacência</td><td>O(V+E)</td><td>O(grau)</td><td>O(grau)</td><td>Grafos esparsos (o mais comum)</td></tr>
          <tr><td>Lista de arestas</td><td>O(E)</td><td>O(E)</td><td>O(E)</td><td>Kruskal, ordenar arestas</td></tr>
        </table>

        <h4>5.3 Modelando uma matriz 2D como um grafo</h4>
        <p>O tabuleiro do MiauColor é um <strong>grafo-grade (grid graph)</strong>:</p>
        <ul>
          <li>cada <strong>célula</strong> <code>(r, c)</code> é um <strong>vértice</strong>;</li>
          <li>há uma <strong>aresta</strong> entre células <strong>vizinhas</strong>: cima, baixo, esquerda, direita (conectividade-4). Com as diagonais, seria conectividade-8.</li>
        </ul>
        <p>Note que <strong>não construímos a lista de adjacência</strong>. Ela é <em>implícita</em>: os vizinhos de <code>(r, c)</code> são calculados na hora somando os deslocamentos <code>[[1,0],[-1,0],[0,1],[0,-1]]</code> e descartando o que sai dos limites. Isso economiza memória e é o truque padrão em problemas de grade.</p>
        <p>Exemplo 3×3 — os vértices e as arestas do centro:</p>
<pre><code>(0,0)─(0,1)─(0,2)
  │     │     │
(1,0)─(1,1)─(1,2)      vizinhos de (1,1): (0,1), (2,1), (1,0), (1,2)
  │     │     │
(2,0)─(2,1)─(2,2)      grau: cantos = 2, bordas = 3, centro = 4</code></pre>
        <p>Uma <strong>região colorida</strong> do jogo é exatamente uma <strong>componente conexa</strong> de um subgrafo: o conjunto de células com o mesmo id, ligadas por vizinhança.</p>

        <h4>5.4 DFS e BFS: percorrendo o grafo</h4>
        <p>Ambos visitam todos os vértices alcançáveis a partir de uma origem, usando um conjunto <code>visitado</code> para não repetir. Diferem na estrutura que guarda os "próximos":</p>
        <table>
          <tr><th></th><th>BFS (largura)</th><th>DFS (profundidade)</th></tr>
          <tr><td>Estrutura</td><td>Fila (FIFO)</td><td>Pilha (LIFO) ou recursão</td></tr>
          <tr><td>Ordem</td><td>Por "camadas" de distância</td><td>Vai fundo e depois retrocede</td></tr>
          <tr><td>Complexidade</td><td colspan="2">O(V + E) ambos</td></tr>
          <tr><td>Bom para</td><td>Menor caminho sem pesos, distância</td><td>Componentes, ciclos, ordenação topológica, backtracking</td></tr>
        </table>
<pre><code>BFS(origem):
  fila = [origem]; visitado = {origem}
  enquanto fila não vazia:
      u = fila.remove_primeiro()
      para cada vizinho v de u:
          se v não visitado: marque v; fila.adicione(v)</code></pre>
        <h4>5.5 Como isso cria as regiões do jogo</h4>
        <p>Nosso crescimento de regiões é uma <strong>BFS/DFS multi-fonte</strong>: em vez de uma origem, temos N (os gatos). Cada região possui sua própria <em>fronteira</em> (o equivalente da fila/pilha). Se sempre retirássemos o primeiro elemento da fronteira, teríamos BFS pura: regiões em forma de "losangos" crescendo por camadas. Se sempre retirássemos o último, tenderíamos a DFS: regiões compridas e tortuosas. <strong>Sortear</strong> o elemento da fronteira (nosso caso) mistura os dois comportamentos e produz formas orgânicas.</p>
        <p>E o <strong>backtracking</strong> da seção 2? Ele também é uma DFS — não sobre a grade, mas sobre o <em>grafo de estados</em> da busca (cada vértice é uma configuração parcial; as arestas são "colocar um gato na próxima linha"). Retroceder é voltar na DFS. Grafos aparecem em todo lugar, mesmo quando não estão desenhados.</p>

        <h4>5.6 Aplicações além do jogo</h4>
        <ul>
          <li>Mapas e GPS (Dijkstra, A*), redes sociais (recomendação, comunidades).</li>
          <li>Compiladores e builds (ordenação topológica de dependências).</li>
          <li>Redes de computadores, roteamento e fluxo máximo.</li>
          <li>Editores de imagem ("balde de tinta" é um Flood Fill), IA de jogos.</li>
        </ul>

        <h3 id="w-estudo">6. Guia para iniciantes: como começar a estudar Teoria dos Grafos</h3>
        <ol>
          <li><strong>Pré-requisitos:</strong> arrays/listas, laços, funções, recursão, e noções de conjuntos, mapas (dicionários), pilha e fila.</li>
          <li><strong>Vocabulário:</strong> vértice, aresta, grau, caminho, ciclo, conexo, árvore, direcionado, ponderado.</li>
          <li><strong>Representações:</strong> implemente uma lista de adjacência e uma matriz de adjacência à mão, em sua linguagem favorita.</li>
          <li><strong>BFS e DFS:</strong> o alicerce de tudo. Pratique em grades: contar ilhas, labirinto (menor caminho com BFS), flood fill, componentes conexas.</li>
          <li><strong>Aplicações diretas:</strong> detecção de ciclo, ordenação topológica, verificação de grafo bipartido (2-coloração).</li>
          <li><strong>Caminhos mínimos:</strong> BFS (sem pesos) → Dijkstra (pesos não-negativos, com fila de prioridade) → Bellman-Ford → Floyd-Warshall.</li>
          <li><strong>Árvores geradoras mínimas:</strong> Kruskal (com Union-Find/DSU) e Prim.</li>
          <li><strong>Tópicos avançados:</strong> componentes fortemente conexas (Tarjan/Kosaraju), fluxo máximo (Ford-Fulkerson/Dinic), emparelhamento, LCA.</li>
          <li><strong>Prática constante:</strong> resolva 2–3 problemas por semana em LeetCode, Codeforces, AtCoder, CSES ou URI/beecrowd, sempre começando pelos tags "graph", "bfs" e "dfs".</li>
          <li><strong>Material:</strong> <em>Introduction to Algorithms</em> (CLRS, cap. 20-22), <em>Algorithms</em> (Sedgewick &amp; Wayne), <em>Competitive Programmer's Handbook</em> (gratuito), visualizações em visualgo.net.</li>
        </ol>
        <div class="note">Dica de ouro: antes de codar um problema, pergunte-se "quem são os vértices? quem são as arestas?". Modelar corretamente costuma ser 80% da solução.</div>
        <p><strong>Exercício sugerido:</strong> altere <code>growRegions</code> para sempre tirar a <em>primeira</em> célula da fronteira (BFS pura) e depois a <em>última</em> (DFS-like), e observe como o formato das regiões muda.</p>
      </article>
    </section>
  </main>

  <script src="engine.js"></script>
  <script src="infinite.js"></script>
  <script src="levels.js"></script>
  <script src="levels/manifest.js"></script>
  <script src="progress.js"></script>
  <script src="audio.js"></script>
  <script src="script.js"></script>
</body>
</html>
```

## infinite.js

- Last modified: 2026-10-16 22:39:05

```js
"use strict";

/* Níveis infinitos (a partir do último nível dos packs): sempre 10x10, dificuldade variável.
 * - Determinístico: o nível N vem da seed "inf:N" (mesmo mapa em qualquer dispositivo).
 * - Salvo: cada nível gerado fica em localStorage; se for apagado, é regenerado igual.
 * - Fluido: gera em Web Worker e antecipa os próximos níveis enquanto o jogador joga. */
const InfiniteLevels = (() => {
  const CACHE_KEY = "miaucolor:gen:v1";
  const KEEP = 300;               // quantos níveis gerados manter salvos
  const AHEAD = 3;                // quantos níveis à frente gerar em segundo plano

  let cache = loadCache();        // { id: [regions, solution (string), tier, score, diff] }
  let job = null;                 // { id, worker, promise, urgent }
  let aheadFrom = null;

  function loadCache() {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY)) || {}; } catch { return {}; }
  }
  function saveCache() {
    const ids = Object.keys(cache).map(Number).sort((a, b) => a - b);
    for (const id of ids.slice(0, Math.max(0, ids.length - KEEP))) delete cache[id];
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch { /* sem espaço: segue sem salvar */ }
  }

  const has = id => id in cache;
  const info = id => (has(id) ? { diff: cache[id][4] } : null);

  function store(level) {
    cache[level.id] = [level.regions, level.solution.join(""), level.tier, level.score, level.diff];
    saveCache();
  }

  function decode(id) {
    const [regions, sol, tier, score, diff] = cache[id];
    const n = 10;
    return {
      id, n, tier, score, diff,
      regions: Array.from({ length: n }, (_, r) =>
        Array.from({ length: n }, (_, c) => regions.charCodeAt(r * n + c) - 65)),
      solution: sol.split("").map(Number),
    };
  }

  /* Gera o nível `id` num Worker. Resolve com o nível ou null se cancelado. */
  function generate(id, urgent) {
    if (job && job.id === id) { job.urgent = job.urgent || urgent; return job.promise; }
    if (job) cancel();
    const mine = { id, urgent, worker: null, promise: null, resolve: null };
    job = mine;
    mine.promise = new Promise(resolve => {
      mine.resolve = resolve;
      const finish = level => {
        if (job === mine) job = null;
        if (mine.worker) mine.worker.terminate();
        mine.worker = null;
        if (level) store(level);
        resolve(level);
        pump();
      };
      try {
        mine.worker = spawnEngineWorker("onmessage = e => postMessage(E.generateInfinite(e.data));");
        mine.worker.onmessage = e => finish(e.data);
        mine.worker.onerror = () => { mine.worker.terminate(); mine.worker = null; finish(createEngine().generateInfinite(id)); };
        mine.worker.postMessage(id);
      } catch {
        finish(createEngine().generateInfinite(id));   // sem Worker: gera na thread principal
      }
    });
    return mine.promise;
  }

  function cancel() {
    const old = job;
    job = null;
    if (old.worker) { old.worker.terminate(); old.worker = null; }
    old.resolve(null);
  }

  /* Gera, em segundo plano, os próximos níveis ainda não salvos */
  function pump() {
    if (job || aheadFrom === null) return;
    for (let id = aheadFrom + 1; id <= aheadFrom + AHEAD; id++) {
      if (!has(id)) { generate(id, false); return; }
    }
  }

  function prefetchAhead(fromId) {
    aheadFrom = fromId;
    pump();
  }

  async function get(id) {
    if (!has(id)) {
      const level = await generate(id, true);
      if (!level) return null;       // cancelado por um pedido mais novo
    }
    return decode(id);
  }

  return { has, info, get, prefetchAhead };
})();
```

## levels.js

- Last modified: 2026-10-16 22:37:31

```js
"use strict";

/* Carregador de níveis pré-gerados (ver tools/gen_levels.py).
 * Cada pack é um <script> que chama MiauLevels.register(pack); funciona abrindo
 * index.html direto do disco e é fácil de pré-cachear no service worker.
 * levels/manifest.js informa quantos packs/níveis existem (setMeta). */
const MiauLevels = (() => {
  const packs = new Map();       // número do pack -> níveis
  const byId = new Map();
  let meta = { packs: 0, total: 0, packSize: 20 };

  const setMeta = m => { meta = m; };

  function register(pack) {
    packs.set(pack.pack, pack.levels);
    for (const lv of pack.levels) byId.set(lv.id, lv);
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error("Falha ao carregar " + src));
      document.head.appendChild(s);
    });
  }

  async function loadPack(k) {
    if (!packs.has(k)) await loadScript(`levels/pack-${String(k).padStart(2, "0")}.js`);
    return packs.get(k);
  }

  /* Converte o formato compacto em { n, regions[r][c], solution[r], id, diff, tier } */
  function decode(lv) {
    const regions = Array.from({ length: lv.n }, (_, r) =>
      Array.from({ length: lv.n }, (_, c) => lv.regions.charCodeAt(r * lv.n + c) - 65));
    return { ...lv, regions, solution: lv.solution.slice() };
  }

  /* Acima do último pack o jogo é infinito (ver infinite.js) */
  const isInfinite = id => id > meta.total;
  const needsGeneration = id => isInfinite(id) && !InfiniteLevels.has(id);

  async function get(id) {
    if (isInfinite(id)) return InfiniteLevels.get(id);
    if (!byId.has(id)) {
      try { await loadPack(Math.floor((id - 1) / meta.packSize) + 1); } catch { return null; }
    }
    return byId.has(id) ? decode(byId.get(id)) : null;
  }

  /* Metadados (id, n, diff) de todos os níveis, para o mapa */
  async function loadAll() {
    const out = [];
    for (let k = 1; k <= meta.packs; k++) {
      try { out.push(...await loadPack(k)); } catch { /* pack ausente: ignora */ }
    }
    return out;
  }

  return { register, setMeta, get, loadAll, isInfinite, needsGeneration, get total() { return meta.total; } };
})();
```

## manifest.js

- Last modified: 2026-10-16 22:19:35
- Caminho: levels\manifest.js

```js
MiauLevels.setMeta({"packs":5,"total":100,"packSize":20});
```

## manifest.json

- Last modified: 2026-10-16 22:11:30
- Caminho: levels\manifest.json

```json
{"packs": 5, "total": 100, "packSize": 20}
```

## pack-01.js

- Last modified: 2026-10-16 22:11:30
- Caminho: levels\pack-01.js

```js
MiauLevels.register({"pack":1,"levels":[{"n":5,"tier":1,"score":5,"regions":"BBAAABBBAADDDCCDDDCCDDDCE","solution":[2,0,3,1,4],"id":1,"diff":"Fácil"},{"n":5,"tier":1,"score":5,"regions":"BBAAACBBAACBBAACBDDACEDDD","solution":[4,2,0,3,1],"id":2,"diff":"Fácil"},{"n":5,"tier":1,"score":5,"regions":"BBBACBBDDCEDDCCEEDDDEEEDD","solution":[3,1,4,2,0],"id":3,"diff":"Fácil"},{"n":5,"tier":2,"score":8,"regions":"AAAAABDACCBDAACEDEEEEEEEE","solution":[2,0,4,1,3],"id":4,"diff":"Médio"},{"n":5,"tier":2,"score":8,"regions":"ABBBBABBBBCCBBBEEEEDEEEEE","solution":[0,3,1,4,2],"id":5,"diff":"Médio"},{"n":5,"tier":3,"score":16,"regions":"BBBAABBBADEBCCDEEEDDEEEDD","solution":[3,0,2,4,1],"id":6,"diff":"Difícil"},{"n":5,"tier":4,"score":44,"regions":"BAAAABCCADBBCADEEEEDEEEEE","solution":[3,0,2,4,1],"id":7,"diff":"Expert"},{"n":5,"tier":4,"score":64,"regions":"EBBAAEBAACECCCCEDDDDEEEDD","solution":[3,1,4,2,0],"id":8,"diff":"Expert"},{"n":5,"tier":4,"score":86,"regions":"CAABDCCABDCEEBDCEEEDCCEEE","solution":[1,3,0,4,2],"id":9,"diff":"Expert"},{"n":5,"tier":4,"score":124,"regions":"DBAAADBACADEECADDECCDDEEC","solution":[4,1,3,0,2],"id":10,"diff":"Expert"},{"n":6,"tier":1,"score":6,"regions":"BCCCACBBBCCCBFFCEEBDFFEEBDDFFEDDFFEE","solution":[4,0,3,1,5,2],"id":11,"diff":"Fácil"},{"n":6,"tier":1,"score":6,"regions":"AAACCCBEACCCBEECCCBDEEFCBFFEFFBFFFFF","solution":[2,0,4,1,3,5],"id":12,"diff":"Fácil"},{"n":6,"tier":1,"score":6,"regions":"BBBBAABBBBBACFBAAAFFBDAAFDDDDEFFDDEE","solution":[4,2,0,3,5,1],"id":13,"diff":"Fácil"},{"n":6,"tier":2,"score":9,"regions":"AADDDDAADBBCAADDECEADDECEEEDECEFEEEE","solution":[0,3,5,2,4,1],"id":14,"diff":"Médio"},{"n":6,"tier":2,"score":9,"regions":"CCCCCABBBBCAFDDDCCFDFDDCFFFEEEFEEEEE","solution":[5,2,4,1,3,0],"id":15,"diff":"Médio"},{"n":6,"tier":2,"score":9,"regions":"AAAEEEACCCBEAACEEEACCEDDAAAEEDAFAEED","solution":[0,4,2,5,3,1],"id":16,"diff":"Médio"},{"n":6,"tier":2,"score":9,"regions":"AAAAAACABBAACCDEEACCDEEACFFFEECFFFEE","solution":[5,3,0,2,4,1],"id":17,"diff":"Médio"},{"n":6,"tier":2,"score":12,"regions":"EEEAAFEBBCAFEEDCCFEDDDCFEEFFCFFFFFFF","solution":[3,1,4,2,0,5],"id":18,"diff":"Médio"},{"n":6,"tier":4,"score":24,"regions":"CAAAAACCAABACCCAAACCDEEECCDFFECFFFEE","solution":[1,4,0,2,5,3],"id":19,"diff":"Expert"},{"n":6,"tier":4,"score":27,"regions":"BBACCCBBCCCEBCCCCEDDCFEEDFFFEEFFFFFF","solution":[2,0,4,1,5,3],"id":20,"diff":"Expert"}]});
```

## pack-01.json

- Last modified: 2026-10-16 22:11:30
- Caminho: levels\pack-01.json

```json
{"pack":1,"levels":[{"n":5,"tier":1,"score":5,"regions":"BBAAABBBAADDDCCDDDCCDDDCE","solution":[2,0,3,1,4],"id":1,"diff":"Fácil"},{"n":5,"tier":1,"score":5,"regions":"BBAAACBBAACBBAACBDDACEDDD","solution":[4,2,0,3,1],"id":2,"diff":"Fácil"},{"n":5,"tier":1,"score":5,"regions":"BBBACBBDDCEDDCCEEDDDEEEDD","solution":[3,1,4,2,0],"id":3,"diff":"Fácil"},{"n":5,"tier":2,"score":8,"regions":"AAAAABDACCBDAACEDEEEEEEEE","solution":[2,0,4,1,3],"id":4,"diff":"Médio"},{"n":5,"tier":2,"score":8,"regions":"ABBBBABBBBCCBBBEEEEDEEEEE","solution":[0,3,1,4,2],"id":5,"diff":"Médio"},{"n":5,"tier":3,"score":16,"regions":"BBBAABBBADEBCCDEEEDDEEEDD","solution":[3,0,2,4,1],"id":6,"diff":"Difícil"},{"n":5,"tier":4,"score":44,"regions":"BAAAABCCADBBCADEEEEDEEEEE","solution":[3,0,2,4,1],"id":7,"diff":"Expert"},{"n":5,"tier":4,"score":64,"regions":"EBBAAEBAACECCCCEDDDDEEEDD","solution":[3,1,4,2,0],"id":8,"diff":"Expert"},{"n":5,"tier":4,"score":86,"regions":"CAABDCCABDCEEBDCEEEDCCEEE","solution":[1,3,0,4,2],"id":9,"diff":"Expert"},{"n":5,"tier":4,"score":124,"regions":"DBAAADBACADEECADDECCDDEEC","solution":[4,1,3,0,2],"id":10,"diff":"Expert"},{"n":6,"tier":1,"score":6,"regions":"BCCCACBBBCCCBFFCEEBDFFEEBDDFFEDDFFEE","solution":[4,0,3,1,5,2],"id":11,"diff":"Fácil"},{"n":6,"tier":1,"score":6,"regions":"AAACCCBEACCCBEECCCBDEEFCBFFEFFBFFFFF","solution":[2,0,4,1,3,5],"id":12,"diff":"Fácil"},{"n":6,"tier":1,"score":6,"regions":"BBBBAABBBBBACFBAAAFFBDAAFDDDDEFFDDEE","solution":[4,2,0,3,5,1],"id":13,"diff":"Fácil"},{"n":6,"tier":2,"score":9,"regions":"AADDDDAADBBCAADDECEADDECEEEDECEFEEEE","solution":[0,3,5,2,4,1],"id":14,"diff":"Médio"},{"n":6,"tier":2,"score":9,"regions":"CCCCCABBBBCAFDDDCCFDFDDCFFFEEEFEEEEE","solution":[5,2,4,1,3,0],"id":15,"diff":"Médio"},{"n":6,"tier":2,"score":9,"regions":"AAAEEEACCCBEAACEEEACCEDDAAAEEDAFAEED","solution":[0,4,2,5,3,1],"id":16,"diff":"Médio"},{"n":6,"tier":2,"score":9,"regions":"AAAAAACABBAACCDEEACCDEEACFFFEECFFFEE","solution":[5,3,0,2,4,1],"id":17,"diff":"Médio"},{"n":6,"tier":2,"score":12,"regions":"EEEAAFEBBCAFEEDCCFEDDDCFEEFFCFFFFFFF","solution":[3,1,4,2,0,5],"id":18,"diff":"Médio"},{"n":6,"tier":4,"score":24,"regions":"CAAAAACCAABACCCAAACCDEEECCDFFECFFFEE","solution":[1,4,0,2,5,3],"id":19,"diff":"Expert"},{"n":6,"tier":4,"score":27,"regions":"BBACCCBBCCCEBCCCCEDDCFEEDFFFEEFFFFFF","solution":[2,0,4,1,5,3],"id":20,"diff":"Expert"}]}
```

## pack-02.js

- Last modified: 2026-10-16 22:11:30
- Caminho: levels\pack-02.js

```js
MiauLevels.register({"pack":2,"levels":[{"n":6,"tier":4,"score":39,"regions":"BBBAAABBBCAABBBCAABDFCCCFFFCFEFFFFFF","solution":[4,0,3,1,5,2],"id":21,"diff":"Expert"},{"n":6,"tier":4,"score":65,"regions":"BBBAAABBBACABBBACCFDAAACFDAAAEFFFFFE","solution":[3,0,4,1,5,2],"id":22,"diff":"Expert"},{"n":6,"tier":4,"score":83,"regions":"AACCCBECCCDBEECDDBEECCDDFEFCFDFFFFFD","solution":[0,5,2,4,1,3],"id":23,"diff":"Expert"},{"n":6,"tier":4,"score":92,"regions":"BBBBAABBAAAADBBCCADBFFCCDDFFCEDDFFFF","solution":[4,1,3,0,5,2],"id":24,"diff":"Expert"},{"n":6,"tier":4,"score":135,"regions":"AAAABBCCCCDBCCDDDBECCDDBECEEEEEEEEFF","solution":[2,5,1,3,0,4],"id":25,"diff":"Expert"},{"n":7,"tier":2,"score":10,"regions":"AABBCCCGBBBBBCGBBBCBCGBDDCCCGEGDCFCGGGGCFCGGGGGFC","solution":[0,4,6,3,1,5,2],"id":26,"diff":"Médio"},{"n":7,"tier":2,"score":10,"regions":"CAADDBBCCADDBDFCADDDDFFFDGDEFFFFGGEFGGGGGGGGGGGGG","solution":[2,5,1,3,6,0,4],"id":27,"diff":"Médio"},{"n":7,"tier":2,"score":10,"regions":"AAAAEEEAAABEEEACCBBBEAFFDDDEFFFGGGEFFFFGGGFFGGGGG","solution":[0,3,1,4,6,2,5],"id":28,"diff":"Médio"},{"n":7,"tier":2,"score":10,"regions":"AAAAAAACBAACAACCCCCAEDDGCCAEGDGFFAEGDGGFGGGGGGGGG","solution":[5,1,3,0,6,4,2],"id":29,"diff":"Médio"},{"n":7,"tier":2,"score":13,"regions":"CCCCAADECBBDDDECCCDFDEEEEDFDEEEGDFDEEEGDFFEEGGFFF","solution":[5,3,1,4,0,6,2],"id":30,"diff":"Médio"},{"n":7,"tier":2,"score":13,"regions":"AAAAAAABBAAEEEBBBAECCDAAAEECDEEEEFFEEEFFFGEEEEEFG","solution":[3,1,5,0,2,4,6],"id":31,"diff":"Médio"},{"n":7,"tier":3,"score":15,"regions":"AAAACCCAAAACBBAAACCCBACCCCDBAEEDDDBEEGDFBBEEGGFFF","solution":[0,6,3,5,1,4,2],"id":32,"diff":"Difícil"},{"n":7,"tier":3,"score":18,"regions":"AAAAACCACCAACBAACACCBADCCCCBADGEECBADGEFFBADGEEEB","solution":[0,6,4,1,3,5,2],"id":33,"diff":"Difícil"},{"n":7,"tier":3,"score":18,"regions":"ECCAAAAEECCAABEECCCDBECCGGDBEEGGGDFEEGGFFFEGGGGGF","solution":[3,6,2,5,0,4,1],"id":34,"diff":"Difícil"},{"n":7,"tier":3,"score":21,"regions":"AAAACCCAAABBBCAAGGCCCADGGEECAGGGEFCAAAGGFFGGGGGFF","solution":[0,3,5,1,4,6,2],"id":35,"diff":"Difícil"},{"n":7,"tier":3,"score":21,"regions":"CAAAAAACACAABBCACAADFCCCCADFECCCFDFEEEEFDFEGEFFFF","solution":[3,6,2,5,0,4,1],"id":36,"diff":"Difícil"},{"n":7,"tier":3,"score":24,"regions":"BBAAAADCBBDDDDCCGDDDEFFGDEEEFGGEEEEFFGGGGEFGGGGEE","solution":[5,2,0,3,6,1,4],"id":37,"diff":"Difícil"},{"n":7,"tier":4,"score":28,"regions":"DDDAAAABBDAAACDDDDACCDDDDDECDFDFDEDDFDFDDDFFFFGDD","solution":[3,0,6,2,5,1,4],"id":38,"diff":"Expert"},{"n":7,"tier":4,"score":33,"regions":"BBBBBAABCCBBFABBCCBFAGBBCCFDGBECCFFGEECFFFGGEEEEE","solution":[5,0,3,6,2,4,1],"id":39,"diff":"Expert"},{"n":7,"tier":4,"score":33,"regions":"BBBBBBABBBCBBABBBCCCADBBCCGADDDEGGAFFDGGAAFFDDGAA","solution":[6,2,5,0,3,1,4],"id":40,"diff":"Expert"}]});
```

## pack-02.json

- Last modified: 2026-10-16 22:11:30
- Caminho: levels\pack-02.json

```json
{"pack":2,"levels":[{"n":6,"tier":4,"score":39,"regions":"BBBAAABBBCAABBBCAABDFCCCFFFCFEFFFFFF","solution":[4,0,3,1,5,2],"id":21,"diff":"Expert"},{"n":6,"tier":4,"score":65,"regions":"BBBAAABBBACABBBACCFDAAACFDAAAEFFFFFE","solution":[3,0,4,1,5,2],"id":22,"diff":"Expert"},{"n":6,"tier":4,"score":83,"regions":"AACCCBECCCDBEECDDBEECCDDFEFCFDFFFFFD","solution":[0,5,2,4,1,3],"id":23,"diff":"Expert"},{"n":6,"tier":4,"score":92,"regions":"BBBBAABBAAAADBBCCADBFFCCDDFFCEDDFFFF","solution":[4,1,3,0,5,2],"id":24,"diff":"Expert"},{"n":6,"tier":4,"score":135,"regions":"AAAABBCCCCDBCCDDDBECCDDBECEEEEEEEEFF","solution":[2,5,1,3,0,4],"id":25,"diff":"Expert"},{"n":7,"tier":2,"score":10,"regions":"AABBCCCGBBBBBCGBBBCBCGBDDCCCGEGDCFCGGGGCFCGGGGGFC","solution":[0,4,6,3,1,5,2],"id":26,"diff":"Médio"},{"n":7,"tier":2,"score":10,"regions":"CAADDBBCCADDBDFCADDDDFFFDGDEFFFFGGEFGGGGGGGGGGGGG","solution":[2,5,1,3,6,0,4],"id":27,"diff":"Médio"},{"n":7,"tier":2,"score":10,"regions":"AAAAEEEAAABEEEACCBBBEAFFDDDEFFFGGGEFFFFGGGFFGGGGG","solution":[0,3,1,4,6,2,5],"id":28,"diff":"Médio"},{"n":7,"tier":2,"score":10,"regions":"AAAAAAACBAACAACCCCCAEDDGCCAEGDGFFAEGDGGFGGGGGGGGG","solution":[5,1,3,0,6,4,2],"id":29,"diff":"Médio"},{"n":7,"tier":2,"score":13,"regions":"CCCCAADECBBDDDECCCDFDEEEEDFDEEEGDFDEEEGDFFEEGGFFF","solution":[5,3,1,4,0,6,2],"id":30,"diff":"Médio"},{"n":7,"tier":2,"score":13,"regions":"AAAAAAABBAAEEEBBBAECCDAAAEECDEEEEFFEEEFFFGEEEEEFG","solution":[3,1,5,0,2,4,6],"id":31,"diff":"Médio"},{"n":7,"tier":3,"score":15,"regions":"AAAACCCAAAACBBAAACCCBACCCCDBAEEDDDBEEGDFBBEEGGFFF","solution":[0,6,3,5,1,4,2],"id":32,"diff":"Difícil"},{"n":7,"tier":3,"score":18,"regions":"AAAAACCACCAACBAACACCBADCCCCBADGEECBADGEFFBADGEEEB","solution":[0,6,4,1,3,5,2],"id":33,"diff":"Difícil"},{"n":7,"tier":3,"score":18,"regions":"ECCAAAAEECCAABEECCCDBECCGGDBEEGGGDFEEGGFFFEGGGGGF","solution":[3,6,2,5,0,4,1],"id":34,"diff":"Difícil"},{"n":7,"tier":3,"score":21,"regions":"AAAACCCAAABBBCAAGGCCCADGGEECAGGGEFCAAAGGFFGGGGGFF","solution":[0,3,5,1,4,6,2],"id":35,"diff":"Difícil"},{"n":7,"tier":3,"score":21,"regions":"CAAAAAACACAABBCACAADFCCCCADFECCCFDFEEEEFDFEGEFFFF","solution":[3,6,2,5,0,4,1],"id":36,"diff":"Difícil"},{"n":7,"tier":3,"score":24,"regions":"BBAAAADCBBDDDDCCGDDDEFFGDEEEFGGEEEEFFGGGGEFGGGGEE","solution":[5,2,0,3,6,1,4],"id":37,"diff":"Difícil"},{"n":7,"tier":4,"score":28,"regions":"DDDAAAABBDAAACDDDDACCDDDDDECDFDFDEDDFDFDDDFFFFGDD","solution":[3,0,6,2,5,1,4],"id":38,"diff":"Expert"},{"n":7,"tier":4,"score":33,"regions":"BBBBBAABCCBBFABBCCBFAGBBCCFDGBECCFFGEECFFFGGEEEEE","solution":[5,0,3,6,2,4,1],"id":39,"diff":"Expert"},{"n":7,"tier":4,"score":33,"regions":"BBBBBBABBBCBBABBBCCCADBBCCGADDDEGGAFFDGGAAFFDDGAA","solution":[6,2,5,0,3,1,4],"id":40,"diff":"Expert"}]}
```

## pack-03.js

- Last modified: 2026-10-16 22:11:30
- Caminho: levels\pack-03.js

```js
MiauLevels.register({"pack":3,"levels":[{"n":7,"tier":4,"score":36,"regions":"DAAABBBDDCABBGDDCABGGDDDDEGGDFDEEGGFFFGGGGGGGGGGG","solution":[3,5,2,0,4,1,6],"id":41,"diff":"Expert"},{"n":7,"tier":4,"score":40,"regions":"DBBBBACDDBBBCCDDBEECCDDDECCCFDDEEECFDDDECCFFFFGGC","solution":[5,2,6,1,3,0,4],"id":42,"diff":"Expert"},{"n":7,"tier":4,"score":40,"regions":"AADDDDDDAABDDDDDABDDCDDDDDDDDDDDGEDDFDDGEEDFGGGGE","solution":[0,3,6,2,5,1,4],"id":43,"diff":"Expert"},{"n":7,"tier":4,"score":43,"regions":"CCABBBECCBBBEEFCBDDDEFCDDDEEFCDGGGEFFGGGEEFGGGGGG","solution":[2,4,1,3,6,0,5],"id":44,"diff":"Expert"},{"n":7,"tier":4,"score":43,"regions":"BAAAAAABBBBAAADDDBCCADDDGACAEEDGAAAGGGGAFAGGGGAAA","solution":[6,1,4,2,0,5,3],"id":45,"diff":"Expert"},{"n":7,"tier":4,"score":43,"regions":"DDAABBBDDDBBBBDDDCEEBDFFEEBBDFFFEEEDDDFFFEDGDEEEE","solution":[2,5,3,0,6,4,1],"id":46,"diff":"Expert"},{"n":7,"tier":4,"score":84,"regions":"BBBAAACBBBBBACBFCCCCCBFFDDDCEEFFDDCGEFFCDCGEFFCCC","solution":[5,2,6,4,1,3,0],"id":47,"diff":"Expert"},{"n":7,"tier":4,"score":99,"regions":"CCAAAAACCCAABBCCCAEEEDDCEEEEDDCEEEEDFFGEEEDDFGEEE","solution":[4,6,2,0,5,1,3],"id":48,"diff":"Expert"},{"n":7,"tier":4,"score":114,"regions":"BBBBAAABBBBBAABBBBBCCBEDDDDFEEEDFFFEGDDDDFEGDFFFF","solution":[4,2,5,3,0,6,1],"id":49,"diff":"Expert"},{"n":7,"tier":4,"score":118,"regions":"BAAAAAABBDDCAABBDCCCADDDECCADDDEECCFGGEEEEGGGGGGE","solution":[6,1,5,2,4,0,3],"id":50,"diff":"Expert"},{"n":8,"tier":2,"score":11,"regions":"AAECCCCCAEEECCCBEEDEGCCGEEDGGGGGEEEFFFFGEFFFGGFGEFEFGGGGEEEEHHGG","solution":[1,7,5,2,0,3,6,4],"id":51,"diff":"Médio"},{"n":8,"tier":2,"score":11,"regions":"CCCCAAAACCCAABAFCECCCDFFCECCDDFFEEEEEFFFEEEEHHFFGEHEHFFFGEHHHHHF","solution":[7,5,2,4,1,6,0,3],"id":52,"diff":"Médio"},{"n":8,"tier":2,"score":11,"regions":"BBBBBBAABBBBBBCHBBBBCBCHDBBCCCCHDDBEGCFHDDDDGCFHGDGDGCCHGGGGGHHH","solution":[7,1,4,0,3,6,2,5],"id":53,"diff":"Médio"},{"n":8,"tier":2,"score":11,"regions":"AADDDDDCBBBBDDDCDDDBDCCCDDDDDDCCDEDDEDFCDEDDEFFFGEEEEEEFGGGGGEHF","solution":[1,3,5,2,4,7,0,6],"id":54,"diff":"Médio"},{"n":8,"tier":2,"score":11,"regions":"GGGGBAAAGBBBBAAAGGBBBCCCGGBBCCCDGGEBCCDDGGEBFDDHGGGGFDHHGGGHHHHH","solution":[6,1,5,7,2,4,0,3],"id":55,"diff":"Médio"},{"n":8,"tier":2,"score":11,"regions":"CCDDADBBCCCDDDDBCCDDFDDDEHFFFFDFEHFFFFDFHHHFFFFFHHFFHGGFHHHHHHHF","solution":[4,7,1,6,0,3,5,2],"id":56,"diff":"Médio"},{"n":8,"tier":2,"score":14,"regions":"FFFFFFAAFFBBAAAHFFDCCEEHFDDDCCEHFFDDHHEHFFHHHHHHFFHGGHHHFFHHGHHH","solution":[7,2,4,1,6,0,3,5],"id":57,"diff":"Médio"},{"n":8,"tier":2,"score":14,"regions":"AAAAAAAACAAABDDACCBBBDDACCBEDDDDECCEDDFDECEEFDFDEEEGFFFFEGGGFHHF","solution":[2,4,1,7,0,6,3,5],"id":58,"diff":"Médio"},{"n":8,"tier":2,"score":14,"regions":"CAADDBDDCADDBBDDCADDDDDDEDDHDFFFEEGHHHHFEGGHHHHFEGGGHHHHGGHHHHHH","solution":[2,5,0,4,1,7,3,6],"id":59,"diff":"Médio"},{"n":8,"tier":2,"score":14,"regions":"CADDDDDDCAABBBDDCCACBDDDCCCCDDDDCCECCCCDFCEEECCCCCCCGGGGCCGGGHHG","solution":[1,5,3,7,2,0,4,6],"id":60,"diff":"Médio"}]});
```

## pack-03.json

- Last modified: 2026-10-16 22:11:30
- Caminho: levels\pack-03.json

```json
{"pack":3,"levels":[{"n":7,"tier":4,"score":36,"regions":"DAAABBBDDCABBGDDCABGGDDDDEGGDFDEEGGFFFGGGGGGGGGGG","solution":[3,5,2,0,4,1,6],"id":41,"diff":"Expert"},{"n":7,"tier":4,"score":40,"regions":"DBBBBACDDBBBCCDDBEECCDDDECCCFDDEEECFDDDECCFFFFGGC","solution":[5,2,6,1,3,0,4],"id":42,"diff":"Expert"},{"n":7,"tier":4,"score":40,"regions":"AADDDDDDAABDDDDDABDDCDDDDDDDDDDDGEDDFDDGEEDFGGGGE","solution":[0,3,6,2,5,1,4],"id":43,"diff":"Expert"},{"n":7,"tier":4,"score":43,"regions":"CCABBBECCBBBEEFCBDDDEFCDDDEEFCDGGGEFFGGGEEFGGGGGG","solution":[2,4,1,3,6,0,5],"id":44,"diff":"Expert"},{"n":7,"tier":4,"score":43,"regions":"BAAAAAABBBBAAADDDBCCADDDGACAEEDGAAAGGGGAFAGGGGAAA","solution":[6,1,4,2,0,5,3],"id":45,"diff":"Expert"},{"n":7,"tier":4,"score":43,"regions":"DDAABBBDDDBBBBDDDCEEBDFFEEBBDFFFEEEDDDFFFEDGDEEEE","solution":[2,5,3,0,6,4,1],"id":46,"diff":"Expert"},{"n":7,"tier":4,"score":84,"regions":"BBBAAACBBBBBACBFCCCCCBFFDDDCEEFFDDCGEFFCDCGEFFCCC","solution":[5,2,6,4,1,3,0],"id":47,"diff":"Expert"},{"n":7,"tier":4,"score":99,"regions":"CCAAAAACCCAABBCCCAEEEDDCEEEEDDCEEEEDFFGEEEDDFGEEE","solution":[4,6,2,0,5,1,3],"id":48,"diff":"Expert"},{"n":7,"tier":4,"score":114,"regions":"BBBBAAABBBBBAABBBBBCCBEDDDDFEEEDFFFEGDDDDFEGDFFFF","solution":[4,2,5,3,0,6,1],"id":49,"diff":"Expert"},{"n":7,"tier":4,"score":118,"regions":"BAAAAAABBDDCAABBDCCCADDDECCADDDEECCFGGEEEEGGGGGGE","solution":[6,1,5,2,4,0,3],"id":50,"diff":"Expert"},{"n":8,"tier":2,"score":11,"regions":"AAECCCCCAEEECCCBEEDEGCCGEEDGGGGGEEEFFFFGEFFFGGFGEFEFGGGGEEEEHHGG","solution":[1,7,5,2,0,3,6,4],"id":51,"diff":"Médio"},{"n":8,"tier":2,"score":11,"regions":"CCCCAAAACCCAABAFCECCCDFFCECCDDFFEEEEEFFFEEEEHHFFGEHEHFFFGEHHHHHF","solution":[7,5,2,4,1,6,0,3],"id":52,"diff":"Médio"},{"n":8,"tier":2,"score":11,"regions":"BBBBBBAABBBBBBCHBBBBCBCHDBBCCCCHDDBEGCFHDDDDGCFHGDGDGCCHGGGGGHHH","solution":[7,1,4,0,3,6,2,5],"id":53,"diff":"Médio"},{"n":8,"tier":2,"score":11,"regions":"AADDDDDCBBBBDDDCDDDBDCCCDDDDDDCCDEDDEDFCDEDDEFFFGEEEEEEFGGGGGEHF","solution":[1,3,5,2,4,7,0,6],"id":54,"diff":"Médio"},{"n":8,"tier":2,"score":11,"regions":"GGGGBAAAGBBBBAAAGGBBBCCCGGBBCCCDGGEBCCDDGGEBFDDHGGGGFDHHGGGHHHHH","solution":[6,1,5,7,2,4,0,3],"id":55,"diff":"Médio"},{"n":8,"tier":2,"score":11,"regions":"CCDDADBBCCCDDDDBCCDDFDDDEHFFFFDFEHFFFFDFHHHFFFFFHHFFHGGFHHHHHHHF","solution":[4,7,1,6,0,3,5,2],"id":56,"diff":"Médio"},{"n":8,"tier":2,"score":14,"regions":"FFFFFFAAFFBBAAAHFFDCCEEHFDDDCCEHFFDDHHEHFFHHHHHHFFHGGHHHFFHHGHHH","solution":[7,2,4,1,6,0,3,5],"id":57,"diff":"Médio"},{"n":8,"tier":2,"score":14,"regions":"AAAAAAAACAAABDDACCBBBDDACCBEDDDDECCEDDFDECEEFDFDEEEGFFFFEGGGFHHF","solution":[2,4,1,7,0,6,3,5],"id":58,"diff":"Médio"},{"n":8,"tier":2,"score":14,"regions":"CAADDBDDCADDBBDDCADDDDDDEDDHDFFFEEGHHHHFEGGHHHHFEGGGHHHHGGHHHHHH","solution":[2,5,0,4,1,7,3,6],"id":59,"diff":"Médio"},{"n":8,"tier":2,"score":14,"regions":"CADDDDDDCAABBBDDCCACBDDDCCCCDDDDCCECCCCDFCEEECCCCCCCGGGGCCGGGHHG","solution":[1,5,3,7,2,0,4,6],"id":60,"diff":"Médio"}]}
```

## pack-04.js

- Last modified: 2026-10-16 22:11:30
- Caminho: levels\pack-04.js

```js
MiauLevels.register({"pack":4,"levels":[{"n":8,"tier":2,"score":14,"regions":"BBBDAAAADDBDCCCADDDDDDCAFDHHDEEAFHHHHEEAFFHHEEEAFFHHEHHGHHHHHHHH","solution":[4,2,6,1,5,0,7,3],"id":61,"diff":"Médio"},{"n":8,"tier":2,"score":17,"regions":"DDDDBBAADBBBBAAEDFBBCFAEDFFFFFFEHFFHFGFEHFHHFGFGHHHHHGGGHHHHHHGG","solution":[6,2,4,0,7,1,5,3],"id":62,"diff":"Médio"},{"n":8,"tier":3,"score":19,"regions":"CCCCAAAACAAAAABBCCCCAAEECCCDAAEECFDDAEEGCFHHAHHGCHHHHHHGHHHHHHGG","solution":[4,6,0,3,5,1,7,2],"id":63,"diff":"Difícil"},{"n":8,"tier":4,"score":26,"regions":"EEEEEAAAEBBBBCCAEEEECCAAEDDDCCCCEEEDCCCCEDDDDCFFEEEGDFFFEEEGFFHF","solution":[5,1,4,2,0,7,3,6],"id":64,"diff":"Expert"},{"n":8,"tier":4,"score":34,"regions":"AAACCCCCABBBCDCCBBBDCDCCBBDDDDDCEDDDFDDDEEEDFFFFEEEEEGFFEEHGGGGF","solution":[1,3,6,4,0,7,5,2],"id":65,"diff":"Expert"},{"n":8,"tier":4,"score":44,"regions":"CCCCCCBACCCBBBBBCCDDDBBFCEEDDBBFCCEDDHHFGGGDGHFFGDDDGHHFGGGGGHHF","solution":[7,3,1,4,2,6,0,5],"id":66,"diff":"Expert"},{"n":8,"tier":4,"score":55,"regions":"BBAAAAAABBBAAGDDCEBFGGGDCEBFGFGDEEFFFFGDEFFHFHGGFFHHHHGGHHHHHHGG","solution":[5,2,0,7,1,4,6,3],"id":67,"diff":"Expert"},{"n":8,"tier":4,"score":64,"regions":"BBBAAAFFBDBBEEFFBDDBECEFBDDDEEEFBEEEEEFFBBEHHEFEEGEHHEEEEEEEHHHH","solution":[3,0,5,2,4,6,1,7],"id":68,"diff":"Expert"},{"n":8,"tier":4,"score":70,"regions":"HAAAABBBHAEEABBBHAEEEECCHDEFEECCHEEFEEECHFFFEEECHHFFFCGCHHHHHCCC","solution":[3,5,7,1,4,2,6,0],"id":69,"diff":"Expert"},{"n":8,"tier":4,"score":74,"regions":"BBBABCCCBBBBBCBCBDDBBBBCBDDDDDBCBEEECCCCFEECCCCCEEGGGGCCEEEGGHHC","solution":[3,1,7,5,2,0,4,6],"id":70,"diff":"Expert"},{"n":8,"tier":4,"score":75,"regions":"DDBDDAAADBBDDACADDBDDDCADDDDDECCDEDEEEHCDEEEHFHCDDGEHFHCDGGHHHHH","solution":[7,1,6,0,3,5,2,4],"id":71,"diff":"Expert"},{"n":8,"tier":4,"score":83,"regions":"AAAAAAABDAABBBBBDABBBBCBDDDDBCCBDEEDDCCBDDEEDCFFDEEGGGGFHEGGGGGG","solution":[2,4,6,3,1,7,5,0],"id":72,"diff":"Expert"},{"n":8,"tier":4,"score":87,"regions":"DCAAFFBBDCAFFFBFDCCCFFFFDDDEFEEFGDEEEEFFGDGGGGFFGDGGGGFHGGGGGHHH","solution":[2,6,3,1,4,7,0,5],"id":73,"diff":"Expert"},{"n":8,"tier":4,"score":123,"regions":"BAAAAAAABBBAAACABEBAACCAEEEEACDDFEEECCCHFEEEEECHEEEGEEEHEEGGHHHH","solution":[4,1,5,7,2,0,3,6],"id":74,"diff":"Expert"},{"n":8,"tier":4,"score":157,"regions":"BBBBBAADBEEBCCADBEEEECDDBBEEDDDDEEEFFDFDEEGFFFFDEGGFFFFDHGGGGGFF","solution":[6,3,5,7,1,4,2,0],"id":75,"diff":"Expert"},{"n":9,"tier":2,"score":15,"regions":"AAABBBIIIAABBBBIIICBBBBBBIICCCBBBBIDFCBBEEEIIFFBGGGGIIBBBGGGGGIGBGGHHHGIGGGGGHHII","solution":[2,4,0,8,6,1,3,5,7],"id":76,"diff":"Médio"},{"n":9,"tier":2,"score":15,"regions":"FFAADDDDDCFABBDDDDCFDDDDDEDFFFDDGGEDFGGGGGGEEFFGGFIGGGIFFFFIGGGIFIIFIGIHIIIIIIIII","solution":[2,4,0,3,7,1,6,8,5],"id":77,"diff":"Médio"},{"n":9,"tier":4,"score":35,"regions":"BBBEAAAAABEBEEEEEABEEECEEAABEFECCEADFFFFHHEEEFFFHHGGGEFHFFHHHGEHHHHHGHGEIHHGGGGGG","solution":[5,2,4,8,6,1,7,3,0],"id":78,"diff":"Expert"},{"n":9,"tier":4,"score":35,"regions":"HHCBBAAFFHCCCBAFFFHCBBBAAFFHHHHHDAFFHHEHHHAFFHEEGHHFFIHHHGHFFFIHIIHHHFFIIIIIIIIII","solution":[6,4,1,5,2,7,3,0,8],"id":79,"diff":"Expert"},{"n":9,"tier":4,"score":38,"regions":"GGGAAAAABGGGGGAACBGDDGDACCBGGDGDEHCFGDDDDEHCFGGDEEEHFFIGDHHHHHFIGHHIHHHFIIIIIIHHF","solution":[4,8,6,2,5,7,1,3,0],"id":80,"diff":"Expert"}]});
```

## pack-04.json

- Last modified: 2026-10-16 22:11:30
- Caminho: levels\pack-04.json

```json
{"pack":4,"levels":[{"n":8,"tier":2,"score":14,"regions":"BBBDAAAADDBDCCCADDDDDDCAFDHHDEEAFHHHHEEAFFHHEEEAFFHHEHHGHHHHHHHH","solution":[4,2,6,1,5,0,7,3],"id":61,"diff":"Médio"},{"n":8,"tier":2,"score":17,"regions":"DDDDBBAADBBBBAAEDFBBCFAEDFFFFFFEHFFHFGFEHFHHFGFGHHHHHGGGHHHHHHGG","solution":[6,2,4,0,7,1,5,3],"id":62,"diff":"Médio"},{"n":8,"tier":3,"score":19,"regions":"CCCCAAAACAAAAABBCCCCAAEECCCDAAEECFDDAEEGCFHHAHHGCHHHHHHGHHHHHHGG","solution":[4,6,0,3,5,1,7,2],"id":63,"diff":"Difícil"},{"n":8,"tier":4,"score":26,"regions":"EEEEEAAAEBBBBCCAEEEECCAAEDDDCCCCEEEDCCCCEDDDDCFFEEEGDFFFEEEGFFHF","solution":[5,1,4,2,0,7,3,6],"id":64,"diff":"Expert"},{"n":8,"tier":4,"score":34,"regions":"AAACCCCCABBBCDCCBBBDCDCCBBDDDDDCEDDDFDDDEEEDFFFFEEEEEGFFEEHGGGGF","solution":[1,3,6,4,0,7,5,2],"id":65,"diff":"Expert"},{"n":8,"tier":4,"score":44,"regions":"CCCCCCBACCCBBBBBCCDDDBBFCEEDDBBFCCEDDHHFGGGDGHFFGDDDGHHFGGGGGHHF","solution":[7,3,1,4,2,6,0,5],"id":66,"diff":"Expert"},{"n":8,"tier":4,"score":55,"regions":"BBAAAAAABBBAAGDDCEBFGGGDCEBFGFGDEEFFFFGDEFFHFHGGFFHHHHGGHHHHHHGG","solution":[5,2,0,7,1,4,6,3],"id":67,"diff":"Expert"},{"n":8,"tier":4,"score":64,"regions":"BBBAAAFFBDBBEEFFBDDBECEFBDDDEEEFBEEEEEFFBBEHHEFEEGEHHEEEEEEEHHHH","solution":[3,0,5,2,4,6,1,7],"id":68,"diff":"Expert"},{"n":8,"tier":4,"score":70,"regions":"HAAAABBBHAEEABBBHAEEEECCHDEFEECCHEEFEEECHFFFEEECHHFFFCGCHHHHHCCC","solution":[3,5,7,1,4,2,6,0],"id":69,"diff":"Expert"},{"n":8,"tier":4,"score":74,"regions":"BBBABCCCBBBBBCBCBDDBBBBCBDDDDDBCBEEECCCCFEECCCCCEEGGGGCCEEEGGHHC","solution":[3,1,7,5,2,0,4,6],"id":70,"diff":"Expert"},{"n":8,"tier":4,"score":75,"regions":"DDBDDAAADBBDDACADDBDDDCADDDDDECCDEDEEEHCDEEEHFHCDDGEHFHCDGGHHHHH","solution":[7,1,6,0,3,5,2,4],"id":71,"diff":"Expert"},{"n":8,"tier":4,"score":83,"regions":"AAAAAAABDAABBBBBDABBBBCBDDDDBCCBDEEDDCCBDDEEDCFFDEEGGGGFHEGGGGGG","solution":[2,4,6,3,1,7,5,0],"id":72,"diff":"Expert"},{"n":8,"tier":4,"score":87,"regions":"DCAAFFBBDCAFFFBFDCCCFFFFDDDEFEEFGDEEEEFFGDGGGGFFGDGGGGFHGGGGGHHH","solution":[2,6,3,1,4,7,0,5],"id":73,"diff":"Expert"},{"n":8,"tier":4,"score":123,"regions":"BAAAAAAABBBAAACABEBAACCAEEEEACDDFEEECCCHFEEEEECHEEEGEEEHEEGGHHHH","solution":[4,1,5,7,2,0,3,6],"id":74,"diff":"Expert"},{"n":8,"tier":4,"score":157,"regions":"BBBBBAADBEEBCCADBEEEECDDBBEEDDDDEEEFFDFDEEGFFFFDEGGFFFFDHGGGGGFF","solution":[6,3,5,7,1,4,2,0],"id":75,"diff":"Expert"},{"n":9,"tier":2,"score":15,"regions":"AAABBBIIIAABBBBIIICBBBBBBIICCCBBBBIDFCBBEEEIIFFBGGGGIIBBBGGGGGIGBGGHHHGIGGGGGHHII","solution":[2,4,0,8,6,1,3,5,7],"id":76,"diff":"Médio"},{"n":9,"tier":2,"score":15,"regions":"FFAADDDDDCFABBDDDDCFDDDDDEDFFFDDGGEDFGGGGGGEEFFGGFIGGGIFFFFIGGGIFIIFIGIHIIIIIIIII","solution":[2,4,0,3,7,1,6,8,5],"id":77,"diff":"Médio"},{"n":9,"tier":4,"score":35,"regions":"BBBEAAAAABEBEEEEEABEEECEEAABEFECCEADFFFFHHEEEFFFHHGGGEFHFFHHHGEHHHHHGHGEIHHGGGGGG","solution":[5,2,4,8,6,1,7,3,0],"id":78,"diff":"Expert"},{"n":9,"tier":4,"score":35,"regions":"HHCBBAAFFHCCCBAFFFHCBBBAAFFHHHHHDAFFHHEHHHAFFHEEGHHFFIHHHGHFFFIHIIHHHFFIIIIIIIIII","solution":[6,4,1,5,2,7,3,0,8],"id":79,"diff":"Expert"},{"n":9,"tier":4,"score":38,"regions":"GGGAAAAABGGGGGAACBGDDGDACCBGGDGDEHCFGDDDDEHCFGGDEEEHFFIGDHHHHHFIGHHIHHHFIIIIIIHHF","solution":[4,8,6,2,5,7,1,3,0],"id":80,"diff":"Expert"}]}
```

## pack-05.js

- Last modified: 2026-10-16 22:11:30
- Caminho: levels\pack-05.js

```js
MiauLevels.register({"pack":5,"levels":[{"n":9,"tier":4,"score":38,"regions":"BBAAAAAAABBABBBAAABBCBEBBAABBBBEBDAABBBBEEEEAFFBHEAAAAFFHHHHHGAFFFHHIIIAFFFFHHHII","solution":[5,0,2,6,4,1,7,3,8],"id":81,"diff":"Expert"},{"n":9,"tier":4,"score":42,"regions":"CCCCCCBBACEECEBBBACEEEEEBBACCCEEBBDAGEEEEBBDDGGEGGGFFIGGGGGIIIIHHHGGGGGIHHHHIIIII","solution":[8,5,0,7,2,6,3,1,4],"id":82,"diff":"Expert"},{"n":9,"tier":4,"score":45,"regions":"FCCCCABBBFFCCCCBBBFFCCCEBDBFFFFCEEDBFFFFEEGDBFFFFFEGGGFFFFIIGGGHFFIIIIIGFFFIIIIII","solution":[5,8,2,7,4,1,6,0,3],"id":83,"diff":"Expert"},{"n":9,"tier":4,"score":50,"regions":"IAAAABBBEIAAABBBBEIIBBBCCBEIIBDDCCBEIDDDDCCEEIIFCCCCCCIFFFFGCCCIIIFFGGGHIIIFFFFGG","solution":[1,4,6,3,7,2,5,8,0],"id":84,"diff":"Expert"},{"n":9,"tier":4,"score":50,"regions":"EEEBBAAAAEEEEBDDAAEEEFBDDDCEEFFDDGGIEFFDDFGGIHFFFFFGIIHIIFIGGIIHHIFIGIIIHIIIIIIII","solution":[7,4,8,5,0,2,6,1,3],"id":85,"diff":"Expert"},{"n":9,"tier":4,"score":65,"regions":"BAAAAADDFBAACCCDFFAAHHFCDDFAHHFFDDDFAEHFFFFFFAAHFIFGGFIIHFIFFGGIIHFIFIGGIIIIIIIII","solution":[4,0,5,7,1,3,8,2,6],"id":86,"diff":"Expert"},{"n":9,"tier":4,"score":71,"regions":"BBBBAAAAABCCBBBBAACCCEEBBBACEEEBBDDACCCEBEDAACFEEEEEGACFEGGEGGACHHHGEEGAIIIIGGGGG","solution":[8,4,2,7,5,1,6,3,0],"id":87,"diff":"Expert"},{"n":9,"tier":4,"score":78,"regions":"DDDDDDDACDBBDDDDDCBBDDFDCDCGGGDFDCDCGEDDFFCCCGGDDDFCCCGGIIDHHCCIIIIDHHICIIIIIIIIC","solution":[7,2,8,3,1,5,0,6,4],"id":88,"diff":"Expert"},{"n":9,"tier":4,"score":90,"regions":"AACCCCDDDAACDDCCDBCCCCDCDDDCCCCDDDFDCECHHHDFFICCCCHHFFICCCGGHHHIIICGHHCHIIICCCCCH","solution":[0,8,3,5,1,7,4,6,2],"id":89,"diff":"Expert"},{"n":9,"tier":4,"score":134,"regions":"BBBBBBAAABBCCBBABBBBBCCBBBBDDCCCCBBIGDCCCCEEIGDFCCCEEIGGFHICCEIGFFHICCEIFFIIIIIII","solution":[6,8,4,1,7,2,0,3,5],"id":90,"diff":"Expert"},{"n":10,"tier":2,"score":13,"regions":"CCCBBBDDAACCFFDBDDDAJCFDDDDDIEJJFIIDDIIEJJFIIIIIIEJJFFFIGIGGJFFIIIGGGGJJHIIIGIGIJJJJIIIIGIJJJJJIIIII","solution":[8,5,1,6,9,3,7,2,4,0],"id":91,"diff":"Médio"},{"n":10,"tier":2,"score":13,"regions":"DCCBBBABBBDDCCBBBBEBDCCEEEBEEEDEEEEEBBEFFEFEEEEEEFFFFFFEFEEFGGFFFFFFFFGGFJHIJJJFGGFJIIIIJFGJJJJJJJJF","solution":[6,9,2,0,8,3,1,4,7,5],"id":92,"diff":"Médio"},{"n":10,"tier":2,"score":13,"regions":"AAAAAAAAAAABBBAAAAAAEEEBCCCCAAEIEBCCCDDAIIECCCCDDAIIECEEFFDDIEEEEEFFGDIHEIEEEFGGIIIIIEEFFGJJIIIIIFFF","solution":[9,3,5,7,2,6,8,1,4,0],"id":93,"diff":"Médio"},{"n":10,"tier":2,"score":13,"regions":"FFFADDDGGGFBAADDGGGGFFFDDGGGGCFFFDDGGCCCFFFDDDGGEIFFFHHDDGGIFHFHHDGGGIFHHHHDGGIIFDDHDDGIIIDDDDDJGGII","solution":[3,1,9,4,8,0,6,2,7,5],"id":94,"diff":"Médio"},{"n":10,"tier":4,"score":28,"regions":"AAAAEEEEEEACCCEEDBEEFCFCEEDEEEFFFEEHDEGGFFFFEHHEHGFFHHHHHHHGHFHHHGGHHGHFFFHHGGGGHIFHHGGGGGHHHHHHHJJJ","solution":[2,7,3,6,4,0,9,5,1,8],"id":95,"diff":"Expert"},{"n":10,"tier":4,"score":28,"regions":"CGGGGAAAAACGGBGAGAGGCCCGGAGGGGIGGGGAGDDGIEEEGGGFDDIEGGGGDFDDIIIIGGDDDDHIIIIIIDDDJIIJIJJJDDJJJJJJJDDD","solution":[9,3,1,8,2,7,5,0,4,6],"id":96,"diff":"Expert"},{"n":10,"tier":4,"score":43,"regions":"AADDDDCCCCADDBDDCDDCADDBDCCCDCADBBDDCDDCAEEBBDDDCCAEEBBDDFFCEEBBJGDCFCEEEJJJICHCJJJJIIICCCJIIIICCCCC","solution":[1,3,9,4,2,7,5,8,6,0],"id":97,"diff":"Expert"},{"n":10,"tier":4,"score":61,"regions":"BBBAAAADDDBBBAJJDDGDBBBBJCDDGGBBJJJCEDDGJBJJCCEDDGJBJFEEEDGGJJJJIIIGGGJHJJJIGGIGJJIIIIIIIGJJIIIGGGGG","solution":[4,2,5,8,6,3,9,1,7,0],"id":98,"diff":"Expert"},{"n":10,"tier":4,"score":61,"regions":"BBBBBAAAIIBBBBBBBCCIBBCCBBBCCICCCCCCBCDIJECCCCCCIIJEGGGCFCHIJJJGCCFHHIJGGGJCHHHIJGJJJCIIIIJJJJJJJJJJ","solution":[5,0,2,8,1,6,3,7,9,4],"id":99,"diff":"Expert"},{"n":10,"tier":4,"score":87,"regions":"GGGGGAAADDGGBBIAAADDGBBIIAEADCGGIIIEEDDDGIIIEEEJJDGIIFEIEJDDGGIFFIJJJJGGIFIIIJHJIGIIIIIIJJIIIIJJJJJJ","solution":[6,2,9,7,5,3,1,8,0,4],"id":100,"diff":"Expert"}]});
```

## pack-05.json

- Last modified: 2026-10-16 22:11:30
- Caminho: levels\pack-05.json

```json
{"pack":5,"levels":[{"n":9,"tier":4,"score":38,"regions":"BBAAAAAAABBABBBAAABBCBEBBAABBBBEBDAABBBBEEEEAFFBHEAAAAFFHHHHHGAFFFHHIIIAFFFFHHHII","solution":[5,0,2,6,4,1,7,3,8],"id":81,"diff":"Expert"},{"n":9,"tier":4,"score":42,"regions":"CCCCCCBBACEECEBBBACEEEEEBBACCCEEBBDAGEEEEBBDDGGEGGGFFIGGGGGIIIIHHHGGGGGIHHHHIIIII","solution":[8,5,0,7,2,6,3,1,4],"id":82,"diff":"Expert"},{"n":9,"tier":4,"score":45,"regions":"FCCCCABBBFFCCCCBBBFFCCCEBDBFFFFCEEDBFFFFEEGDBFFFFFEGGGFFFFIIGGGHFFIIIIIGFFFIIIIII","solution":[5,8,2,7,4,1,6,0,3],"id":83,"diff":"Expert"},{"n":9,"tier":4,"score":50,"regions":"IAAAABBBEIAAABBBBEIIBBBCCBEIIBDDCCBEIDDDDCCEEIIFCCCCCCIFFFFGCCCIIIFFGGGHIIIFFFFGG","solution":[1,4,6,3,7,2,5,8,0],"id":84,"diff":"Expert"},{"n":9,"tier":4,"score":50,"regions":"EEEBBAAAAEEEEBDDAAEEEFBDDDCEEFFDDGGIEFFDDFGGIHFFFFFGIIHIIFIGGIIHHIFIGIIIHIIIIIIII","solution":[7,4,8,5,0,2,6,1,3],"id":85,"diff":"Expert"},{"n":9,"tier":4,"score":65,"regions":"BAAAAADDFBAACCCDFFAAHHFCDDFAHHFFDDDFAEHFFFFFFAAHFIFGGFIIHFIFFGGIIHFIFIGGIIIIIIIII","solution":[4,0,5,7,1,3,8,2,6],"id":86,"diff":"Expert"},{"n":9,"tier":4,"score":71,"regions":"BBBBAAAAABCCBBBBAACCCEEBBBACEEEBBDDACCCEBEDAACFEEEEEGACFEGGEGGACHHHGEEGAIIIIGGGGG","solution":[8,4,2,7,5,1,6,3,0],"id":87,"diff":"Expert"},{"n":9,"tier":4,"score":78,"regions":"DDDDDDDACDBBDDDDDCBBDDFDCDCGGGDFDCDCGEDDFFCCCGGDDDFCCCGGIIDHHCCIIIIDHHICIIIIIIIIC","solution":[7,2,8,3,1,5,0,6,4],"id":88,"diff":"Expert"},{"n":9,"tier":4,"score":90,"regions":"AACCCCDDDAACDDCCDBCCCCDCDDDCCCCDDDFDCECHHHDFFICCCCHHFFICCCGGHHHIIICGHHCHIIICCCCCH","solution":[0,8,3,5,1,7,4,6,2],"id":89,"diff":"Expert"},{"n":9,"tier":4,"score":134,"regions":"BBBBBBAAABBCCBBABBBBBCCBBBBDDCCCCBBIGDCCCCEEIGDFCCCEEIGGFHICCEIGFFHICCEIFFIIIIIII","solution":[6,8,4,1,7,2,0,3,5],"id":90,"diff":"Expert"},{"n":10,"tier":2,"score":13,"regions":"CCCBBBDDAACCFFDBDDDAJCFDDDDDIEJJFIIDDIIEJJFIIIIIIEJJFFFIGIGGJFFIIIGGGGJJHIIIGIGIJJJJIIIIGIJJJJJIIIII","solution":[8,5,1,6,9,3,7,2,4,0],"id":91,"diff":"Médio"},{"n":10,"tier":2,"score":13,"regions":"DCCBBBABBBDDCCBBBBEBDCCEEEBEEEDEEEEEBBEFFEFEEEEEEFFFFFFEFEEFGGFFFFFFFFGGFJHIJJJFGGFJIIIIJFGJJJJJJJJF","solution":[6,9,2,0,8,3,1,4,7,5],"id":92,"diff":"Médio"},{"n":10,"tier":2,"score":13,"regions":"AAAAAAAAAAABBBAAAAAAEEEBCCCCAAEIEBCCCDDAIIECCCCDDAIIECEEFFDDIEEEEEFFGDIHEIEEEFGGIIIIIEEFFGJJIIIIIFFF","solution":[9,3,5,7,2,6,8,1,4,0],"id":93,"diff":"Médio"},{"n":10,"tier":2,"score":13,"regions":"FFFADDDGGGFBAADDGGGGFFFDDGGGGCFFFDDGGCCCFFFDDDGGEIFFFHHDDGGIFHFHHDGGGIFHHHHDGGIIFDDHDDGIIIDDDDDJGGII","solution":[3,1,9,4,8,0,6,2,7,5],"id":94,"diff":"Médio"},{"n":10,"tier":4,"score":28,"regions":"AAAAEEEEEEACCCEEDBEEFCFCEEDEEEFFFEEHDEGGFFFFEHHEHGFFHHHHHHHGHFHHHGGHHGHFFFHHGGGGHIFHHGGGGGHHHHHHHJJJ","solution":[2,7,3,6,4,0,9,5,1,8],"id":95,"diff":"Expert"},{"n":10,"tier":4,"score":28,"regions":"CGGGGAAAAACGGBGAGAGGCCCGGAGGGGIGGGGAGDDGIEEEGGGFDDIEGGGGDFDDIIIIGGDDDDHIIIIIIDDDJIIJIJJJDDJJJJJJJDDD","solution":[9,3,1,8,2,7,5,0,4,6],"id":96,"diff":"Expert"},{"n":10,"tier":4,"score":43,"regions":"AADDDDCCCCADDBDDCDDCADDBDCCCDCADBBDDCDDCAEEBBDDDCCAEEBBDDFFCEEBBJGDCFCEEEJJJICHCJJJJIIICCCJIIIICCCCC","solution":[1,3,9,4,2,7,5,8,6,0],"id":97,"diff":"Expert"},{"n":10,"tier":4,"score":61,"regions":"BBBAAAADDDBBBAJJDDGDBBBBJCDDGGBBJJJCEDDGJBJJCCEDDGJBJFEEEDGGJJJJIIIGGGJHJJJIGGIGJJIIIIIIIGJJIIIGGGGG","solution":[4,2,5,8,6,3,9,1,7,0],"id":98,"diff":"Expert"},{"n":10,"tier":4,"score":61,"regions":"BBBBBAAAIIBBBBBBBCCIBBCCBBBCCICCCCCCBCDIJECCCCCCIIJEGGGCFCHIJJJGCCFHHIJGGGJCHHHIJGJJJCIIIIJJJJJJJJJJ","solution":[5,0,2,8,1,6,3,7,9,4],"id":99,"diff":"Expert"},{"n":10,"tier":4,"score":87,"regions":"GGGGGAAADDGGBBIAAADDGBBIIAEADCGGIIIEEDDDGIIIEEEJJDGIIFEIEJDDGGIFFIJJJJGGIFIIIJHJIGIIIIIIJJIIIIJJJJJJ","solution":[6,2,9,7,5,3,1,8,0,4],"id":100,"diff":"Expert"}]}
```

## manifest.webmanifest

- Last modified: 2026-10-16 23:36:32

```webmanifest
{
  "name": "MiauColor",
  "short_name": "MiauColor",
  "description": "Quebra-cabeça de lógica: um gato por linha, coluna e cor — sem se tocarem.",
  "lang": "pt-BR",
  "start_url": "./index.html",
  "scope": "./",
  "display": "standalone",
  "background_color": "#1e1b2e",
  "theme_color": "#1e1b2e",
  "icons": [
    { "src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "maskable" },
    { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

## progress.js

- Last modified: 2026-10-16 22:19:35

```js
"use strict";

/* Progresso do jogador em localStorage (versionado para não quebrar saves futuros).
 * { v, stars: {id: 1..3}, best: {id: segundos}, unlocked: id, inProgress: {id, marks, lives, elapsed} } */
const Progress = (() => {
  const KEY = "miaucolor:v1";
  const defaults = () => ({ v: 1, stars: {}, best: {}, unlocked: 1, inProgress: null });

  function load() {
    try {
      const d = JSON.parse(localStorage.getItem(KEY));
      return d && d.v === 1 ? { ...defaults(), ...d } : defaults();
    } catch {
      return defaults();                     // JSON corrompido ou storage indisponível
    }
  }

  let data = load();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch {} };

  return {
    get unlocked() { return data.unlocked; },
    stars: id => data.stars[id] || 0,
    best: id => data.best[id] || null,
    totalStars: () => Object.values(data.stars).reduce((a, b) => a + b, 0),

    /* Nível para continuar: a partida em andamento ou o último desbloqueado */
    current: () => (data.inProgress ? data.inProgress.id : data.unlocked),

    complete(id, stars, secs, totalLevels) {
      data.stars[id] = Math.max(data.stars[id] || 0, stars);
      if (!data.best[id] || secs < data.best[id]) data.best[id] = secs;
      if (id >= data.unlocked && id < totalLevels) data.unlocked = id + 1;
      data.inProgress = null;
      save();
    },

    saveProgress(p) { data.inProgress = p; save(); },
    getProgress: id => (data.inProgress && data.inProgress.id === id ? data.inProgress : null),
    clearProgress() { if (data.inProgress) { data.inProgress = null; save(); } },
  };
})();
```

## script.js

- Last modified: 2026-10-16 23:40:04

```js
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
function renderTimer() { timerEl.textContent = "⏱ " + formatTime(Math.floor(timerElapsed() / 1000)); }
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

function updateCell(r, c) {
  const el = cells[r][c];
  const m = marks[r][c];
  el.dataset.mark = m;
  el.classList.toggle("has-cat", m === 2);
  el.innerHTML = m === 1 || m === 3 ? '<span class="sym x' + (m === 3 ? ' wrong' : '') + '" aria-hidden="true"></span>'
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

      el.dataset.r = r; el.dataset.c = c;
      cells[r][c] = el;
      boardEl.appendChild(el);
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
  updateCell(r, c);
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
    updateCell(r, c);
    lastTap = { cell: null, t: 0, prev: 0 };
    tryCat(r, c);
    return;
  }
  lastTap = { cell, t: now, prev: marks[r][c] };
  marks[r][c] = marks[r][c] === 1 ? 0 : 1;
  updateCell(r, c);
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
      updateCell(i, j);
    }
  }
}

/* Modo dev: ✕ no restante da região (cor) do gato */
function autoCrossRegion(r, c) {
  const id = regions[r][c];
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    if (regions[i][j] === id && marks[i][j] === 0) {
      marks[i][j] = 1;
      updateCell(i, j);
    }
  }
}

function tryCat(r, c) {
  if (solution[r] === c) {
    marks[r][c] = 2;
    if (devMode && autoXEl.checked) autoCross(r, c);
    if (devMode && autoColorEl.checked) autoCrossRegion(r, c);
    updateCell(r, c);
    updateStatus();
    Sound.cat();
    persist();
    if (marks.flat().filter(m => m === 2).length === N) win();
    return;
  }
  marks[r][c] = 3;                 // erro: ✕ vinho fixo
  updateCell(r, c);
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
function generateLevelAsync(n) {
  return new Promise(resolve => {
    const fallback = () => { generateLevel(n); resolve(); };   // sem Worker: thread principal
    try {
      const worker = spawnEngineWorker("onmessage = e => postMessage(E.generateUnique(e.data, Math.random));");
      worker.onmessage = e => { solution = e.data.cols; regions = e.data.reg; worker.terminate(); resolve(); };
      worker.onerror = () => { worker.terminate(); fallback(); };
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
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) updateCell(r, c);
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
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) updateCell(r, c);
  updateStatus();
  persist();
}

function showSolution() {
  marks = matrix(N, 0);
  solution.forEach((c, r) => (marks[r][c] = 2));
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) updateCell(r, c);
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
```

## style.css

- Last modified: 2026-10-16 23:40:04

```css
:root {
  --bg: #1e1b2e;
  --panel: #2a2640;
  --text: #f1eefc;
  --muted: #a9a3c7;
  --accent: #ff9f6b;
  --err: #ff4d6d;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: system-ui, "Segoe UI", sans-serif;
  background: var(--bg);
  color: var(--text);
  line-height: 1.6;
}
header { text-align: center; padding: 1.2rem 1rem 0; }
header h1 { margin: 0; font-size: 2rem; }
header p { margin: .2rem 0 0; color: var(--muted); }

.tabs { display: flex; justify-content: center; gap: .5rem; margin: 1rem 0; flex-wrap: wrap; }
.tab {
  background: var(--panel); color: var(--text); border: 2px solid transparent;
  padding: .55rem 1.1rem; border-radius: 999px; cursor: pointer; font-size: 1rem;
}
.tab:hover { border-color: var(--accent); }
.tab.active { background: var(--accent); color: #2a1a10; font-weight: 700; }

main { max-width: 900px; margin: 0 auto; padding: 0 1rem 3rem; }
.panel { display: none; }
.panel.active { display: block; }

/* ---------- Jogo ---------- */
.controls { display: flex; gap: .6rem; justify-content: center; align-items: center; flex-wrap: wrap; margin-bottom: 1rem; }
.controls select, .controls button {
  padding: .5rem .9rem; border-radius: 8px; border: none; font-size: 1rem;
  background: var(--panel); color: var(--text); cursor: pointer;
}
.controls button:hover { background: #3a3560; }
#status { text-align: center; min-height: 1.6rem; margin-bottom: .8rem; color: var(--muted); }
#status.win { color: #7dffb0; font-weight: 700; font-size: 1.2rem; }

.lives { display: flex; justify-content: center; gap: .5rem; margin-bottom: .4rem; font-size: 1.8rem; }
.heart { display: inline-block; transition: transform .3s, opacity .3s; }
.heart.lost { opacity: .45; transform: scale(.8); }
.hint { text-align: center; color: var(--muted); margin: .8rem 0 .2rem; }
.reveal-wrap { text-align: center; }
.link-btn { background: none; border: none; color: var(--muted); font-size: .8rem; cursor: pointer; text-decoration: underline; opacity: .6; }
.link-btn:hover { opacity: 1; }

#board, #sboard {
  --size: 7;
  --gap: 4px;
  display: grid;
  grid-template-columns: repeat(var(--size), minmax(0, 1fr));
  grid-template-rows: repeat(var(--size), minmax(0, 1fr));
  width: min(92vw, 560px);
  aspect-ratio: 1 / 1;
  margin: 0 auto;
  gap: var(--gap);
  padding: var(--gap);
  box-sizing: border-box;
  background: #14121f;
  border-radius: 6px;
  overflow: hidden;
  box-shadow: 0 10px 30px rgba(0,0,0,.45);
  container-type: inline-size;
}
#board.locked .cell { cursor: default; }
.cell {
  position: relative;
  display: flex; align-items: center; justify-content: center;
  aspect-ratio: 1 / 1;
  min-width: 0; min-height: 0;
  overflow: hidden;
  box-sizing: border-box;
  cursor: pointer; user-select: none;
  border-radius: calc(100cqw / var(--size) * .045);
  color: #222;
  line-height: 1;
  transition: filter .15s, transform .15s;
}
/* camada de realce (gato fixo / erro) sem animar box-shadow */
.cell::after { content: ""; position: absolute; inset: 0; pointer-events: none; opacity: 0; }
.cell.has-cat::after { background: rgba(255,255,255,.18); opacity: 1; }
/* hover só com mouse: em telas de toque ele "gruda" após o toque */
@media (hover: hover) {
  .cell:hover { filter: brightness(1.12); }
  #board:not(.locked) .cell:not(.has-cat):hover, #sboard .cell:hover { transform: scale(.96); }
}
.sym {
  position: relative; z-index: 1;                /* acima da camada ::after */
  font-size: calc(100cqw / var(--size) * .55);   /* proporcional à célula */
  line-height: 1;
  animation: pop .2s ease-out;
}
.sym.x {
  width: .75em;
  height: .75em;
  animation-duration: .12s;
}
.sym.x::before, .sym.x::after {
  content: "";
  position: absolute;
  top: 50%;
  left: 0;
  width: 100%;
  height: .18em;
  border-radius: 999px;
  background: #f4f2f7;
}
.sym.x::before { transform: translateY(-50%) rotate(45deg); }
.sym.x::after { transform: translateY(-50%) rotate(-45deg); }

@keyframes pop { from { transform: scale(.2); opacity: 0; } to { transform: scale(1); } }
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  20% { transform: translateX(-6px); } 40% { transform: translateX(6px); }
  60% { transform: translateX(-4px); } 80% { transform: translateX(4px); }
}
@keyframes errfade { 0% { opacity: 0; } 30% { opacity: 1; } 100% { opacity: 0; } }
.cell.shake { animation: shake .5s; }
.cell.shake::after { background: rgba(255,0,40,.75); animation: errfade .6s; }
#board.shake { animation: shake .5s; }

/* Sem movimento para quem pede menos animação (o realce vermelho do erro continua) */
@media (prefers-reduced-motion: reduce) {
  .cell.shake, #board.shake { animation: none; }
  .sym, .modal.open, .modal-card, .menu-drop.open, .solve-btn { animation: none; }
  .cell, .heart, .swatch { transition: none; }
}

.modal { position: fixed; inset: 0; display: none; align-items: center; justify-content: center; background: rgba(10,8,25,.75); z-index: 10; }
.modal.open { display: flex; animation: fade .3s; }
.modal-card { background: var(--panel); padding: 2rem 2.5rem; border-radius: 16px; text-align: center; animation: pop .35s ease-out; max-width: 90vw; }
.modal-emoji { font-size: 4rem; }
.modal-card h2 { margin: .3rem 0; color: var(--accent); }
.modal-card button { margin-top: 1rem; padding: .6rem 1.4rem; border: none; border-radius: 999px; background: var(--accent); color: #2a1a10; font-weight: 700; font-size: 1rem; cursor: pointer; }
@keyframes fade { from { opacity: 0; } }
/* ---------- Texto (Guia e Wiki) ---------- */
.doc { background: var(--panel); padding: 1.5rem 2rem; border-radius: 12px; }
.doc h2 { margin-top: 0; color: var(--accent); }
.doc h3 { color: #ffd1b3; margin-top: 2rem; border-bottom: 1px solid #443f66; padding-bottom: .2rem; }
.doc h4 { color: #c9c2f0; margin-bottom: .2rem; }
.doc code, .doc pre { background: #17142a; border-radius: 6px; }
.doc code { padding: .1rem .35rem; }
.doc pre { padding: 1rem; overflow-x: auto; }
.doc pre code { padding: 0; }
.doc table { border-collapse: collapse; margin: 1rem 0; }
.doc th, .doc td { border: 1px solid #443f66; padding: .4rem .8rem; }
.doc .note { border-left: 4px solid var(--accent); padding: .3rem 1rem; background: #332e52; border-radius: 0 8px 8px 0; }
.doc nav ul { columns: 2; }
.guide-intro { color: var(--muted); max-width: 70ch; }
.strategy-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr)); gap: 1rem; margin-top: 1.3rem; }
.strategy-card { min-width: 0; padding: 1.1rem; border: 1px solid #443f66; border-radius: 14px; background: #25213a; }
.strategy-number { color: var(--accent); font-size: .72rem; font-weight: 800; letter-spacing: .1em; }
.strategy-card h3 { margin: .35rem 0 .5rem; color: var(--text); font-size: 1.05rem; border: 0; }
.strategy-card p { margin: 0; color: var(--muted); font-size: .92rem; }
.example { margin: 1rem 0 0; padding: .85rem; border-radius: 10px; background: #1b182b; }
.example figcaption { min-height: 2.7em; margin-bottom: .7rem; color: #d8d3eb; font-size: .8rem; }
.mini-board { display: grid; width: min(100%, 230px); min-height: 48px; margin: 0 auto; overflow: hidden; border: 2px solid #625c78; border-radius: 8px; background: #625c78; gap: 2px; }
.two-options { grid-template-columns: repeat(4, 1fr); }
.four-cells { grid-template-columns: repeat(4, 1fr); }
.mini-board > span, .pair-demo > span:not(.row-label) { display: flex; align-items: center; justify-content: center; min-width: 0; min-height: 44px; background: #302b46; color: var(--text); font-weight: 700; }
.candidate.blue { background: #5273a7 !important; }
.candidate.gold { background: #a47c3f !important; }
.candidate.green { background: #478565 !important; }
.eliminated { color: #ffb3c0 !important; font-size: 1.2rem; }
.legend { display: flex; justify-content: center; flex-wrap: wrap; gap: .35rem .8rem; margin-top: .6rem; color: var(--muted); font-size: .72rem; }
.legend > span { display: inline-flex; align-items: center; gap: .3rem; }
.legend-dot { display: inline-block; width: .65rem; height: .65rem; border-radius: 50%; background: #888; }
.legend-dot.blue { background: #5273a7; }
.legend-dot.gold { background: #a47c3f; }
.legend-dot.green { background: #478565; }
.legend-cross { color: #ffb3c0; font-style: normal; font-weight: 800; }
.pair-demo { display: grid; grid-template-columns: 1rem repeat(4, minmax(0, 1fr)); gap: 2px; width: min(100%, 230px); margin: 0 auto; overflow: hidden; border-radius: 8px; background: #625c78; }
.pair-demo .row-label { display: flex; align-items: center; justify-content: center; color: var(--muted); font-size: .7rem; }
.pair-demo > span:not(.row-label) { min-height: 38px; font-size: .75rem; }
.guide-note { margin-top: .8rem; padding: .7rem .85rem; border-left: 3px solid var(--accent); border-radius: 0 8px 8px 0; background: #332e52; color: #d8d3eb; font-size: .82rem; }
.guide-summary { margin-top: 1.2rem; }
.neighborhood { grid-template-columns: repeat(3, 1fr); width: 150px; }
.neighborhood > span { min-height: 38px; }
.blocked { color: #ffb3c0 !important; background: #492a3b !important; }
.cat-cell { background: #ffcf88 !important; font-size: 1.15rem; }

/* ---------- Layout em tela cheia: menu lateral + tabuleiro ---------- */
html, body { height: 100%; }
body { display: flex; flex-direction: column; overflow: hidden; }
header { padding: .6rem 1rem 0; }
header h1 { font-size: 1.6rem; }
header p { font-size: .9rem; line-height: 1.3; }
.tabs { margin: .6rem 0; }
main { flex: 1; min-height: 0; width: 100%; max-width: none; overflow-y: auto; padding: 0 1rem 1rem; }
.doc { max-width: 900px; margin: 0 auto; }
#game.active, #solver.active { display: flex; gap: 1.5rem; height: 100%; }
.sidebar {
  flex: 0 0 220px; display: flex; flex-direction: column; gap: .8rem;
  background: var(--panel); border-radius: 16px; padding: 1.2rem; align-self: stretch; overflow-y: auto;
}
.sidebar .controls { flex-direction: column; align-items: stretch; margin: 0; }
.sidebar .controls label { display: flex; flex-direction: column; gap: .3rem; color: var(--muted); }
.sidebar .controls select, .sidebar .controls button { width: 100%; }
.sidebar .lives { margin: 0; }
.sidebar #status { margin: 0; }
.sidebar .hint { margin: 0; font-size: .85rem; }
.reveal-wrap { margin-top: auto; }
.stage { flex: 1; min-width: 0; min-height: 0; container-type: size; display: flex; align-items: center; justify-content: center; padding: 0; }
.stage #board, .stage #sboard { width: min(100cqw, 100cqh); }

/* ---------- Menu principal à esquerda + painel de controles ---------- */
body { flex-direction: row; }
.sidenav {
  flex: 0 0 210px; display: flex; flex-direction: column; gap: 1rem;
  background: var(--panel); padding: 1.2rem 1rem; overflow-y: auto;
}
.sidenav header { text-align: left; padding: 0; }
.sidenav header h1 { font-size: 1.5rem; }
.sidenav .rules {
  list-style: none; margin: 0; padding: .75rem 0 0;
  border-top: 1px solid #443f66; color: var(--muted); font-size: .85rem;
}
.sidenav .rules li { position: relative; padding: .4rem 0 .4rem 1.4rem; line-height: 1.35; }
.sidenav .rules li::before {
  content: "🐾"; position: absolute; left: 0; top: .37rem;
  font-size: .85rem;
  filter: brightness(0) invert(1);
}
.sidenav .tabs { flex-direction: column; justify-content: flex-start; margin: 0; flex-wrap: nowrap; }
.sidenav .tab { text-align: left; border-radius: 12px; background: #231f38; }
.sidenav .tab.active { background: var(--accent); }
main { padding: 1rem; min-width: 0; }
#game.active, #solver.active { align-items: center; }
.sidebar { flex: 0 0 204px; align-self: center; padding: .9rem; background: #231f38; max-height: 100%; }
.sidebar .reveal-wrap { margin-top: .4rem; }
.stage { align-self: stretch; }

/* ---------- Links ---------- */
a { color: var(--accent); text-decoration: none; border-bottom: 1px solid rgba(255,159,107,.4); transition: color .15s, border-color .15s; }
a:hover { color: #ffd1b3; border-bottom-color: #ffd1b3; }
a:visited { color: #d9a7ff; }
a:focus-visible, button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 4px; }

/* ---------- Responsividade ---------- */
/* A página nunca rola no jogo: o tabuleiro ocupa o espaço restante e permanece quadrado. */
body { height: 100dvh; overflow: hidden; }
main { display: flex; flex-direction: column; }
.panel { flex: 0 0 auto; }
#game.active, #solver.active { flex: 1 1 auto; min-height: 0; height: auto; }
.sidebar, .stage { min-width: 0; min-height: 0; }
.doc { width: min(100%, 1000px); }
.doc pre { max-width: 100%; }
.doc table { display: block; max-width: 100%; overflow-x: auto; }

.menu-btn {
  display: none; align-items: center; justify-content: center; flex: 0 0 auto;
  width: 2.6rem; height: 2.6rem; padding: 0; border: 0; border-radius: 12px;
  background: #231f38; color: var(--text); cursor: pointer; transition: background .15s;
}
.menu-btn:hover, .menu-btn[aria-expanded="true"] { background: var(--accent); color: #2a1a10; }
.menu-btn svg { width: 1.4rem; height: 1.4rem; }
.menu-drop { display: none; }

/* Modo compacto (celular ou janela baixa): barra superior + menu suspenso */
body.compact { flex-direction: column; }
body.compact .sidenav {
  position: relative; z-index: 20; flex: 0 0 auto; flex-direction: row; align-items: center;
  gap: 0; padding: .5rem .75rem; overflow: visible;
}
body.compact .sidenav header { flex: 1; display: flex; align-items: center; justify-content: space-between; gap: .75rem; }
body.compact .sidenav header h1 { font-size: 1.3rem; }
body.compact .menu-btn { display: inline-flex; }
body.compact .menu-drop.open {
  position: absolute; top: 100%; left: 0; right: 0; display: flex; flex-direction: column; gap: .9rem;
  max-height: calc(100dvh - 3.7rem); overflow-y: auto; padding: .9rem .75rem 1.1rem;
  background: var(--panel); border-top: 1px solid #443f66; border-radius: 0 0 16px 16px;
  box-shadow: 0 18px 30px rgba(0, 0, 0, .55); animation: fade .15s;
}
.menu-drop .controls { justify-content: stretch; align-items: end; margin: 0; }
.menu-drop .controls label { display: flex; flex: 1 1 100%; flex-direction: column; gap: .3rem; color: var(--muted); }
.menu-drop .controls select { width: 100%; }
.menu-drop .controls button { flex: 1; }
.menu-drop .hint { margin: 0; font-size: .85rem; text-align: left; }
.menu-drop .reveal-wrap { margin: 0; text-align: left; }
.menu-drop .rules { margin: 0; }

body.compact main { padding: .6rem; }
body.compact #game.active, body.compact #solver.active { flex-direction: column; align-items: stretch; gap: .5rem; }
body.compact .sidebar {
  flex: 0 0 auto; align-self: stretch; flex-direction: row; align-items: center; justify-content: space-between;
  max-height: none; padding: .35rem .8rem; border-radius: 12px; overflow: visible;
}
body.compact .sidebar .lives { justify-content: flex-start; font-size: 1.3rem; }
body.compact .sidebar #status { font-size: .9rem; min-height: 0; }
body.compact .stage { flex: 1 1 0; width: 100%; }
body.compact .doc { padding: 1rem; }
body.compact .doc nav ul { columns: 1; }.menu-drop .controls select, .menu-drop .controls button { background: #231f38; border: 1px solid #443f66; }
.menu-drop .controls button:hover { background: #3a3560; }

#board { touch-action: none; user-select: none; -webkit-user-select: none; }

.sym.x.wrong::before, .sym.x.wrong::after { background: #b0243f; }
.dev-card { margin-top: .8rem; padding: .55rem .65rem; border: 1px solid #3b3659; border-radius: 12px; background: #1c1930; text-align: left; }
.dev-card [hidden] { display: none !important; }
.dev-head, .dev-opt { display: flex; align-items: center; justify-content: space-between; gap: .6rem; cursor: pointer; }
.dev-head { color: var(--text, #eee); font-size: .85rem; font-weight: 600; }
.dev-body { display: flex; flex-direction: column; gap: .5rem; }
.dev-body > :first-child:not([hidden]) { margin-top: .55rem; padding-top: .55rem; border-top: 1px solid #3b3659; }
.dev-note { margin: 0; color: var(--accent); font-size: .72rem; }
.dev-opt { color: var(--muted); font-size: .76rem; line-height: 1.25; }
.switch { appearance: none; -webkit-appearance: none; flex: 0 0 auto; position: relative; width: 32px; height: 18px; margin: 0; border-radius: 999px; background: #4a4568; cursor: pointer; transition: background .15s; }
.switch::after { content: ""; position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; border-radius: 50%; background: #fff; transition: transform .15s; }
.switch:checked { background: var(--accent); }
.switch:checked::after { transform: translateX(14px); }
.switch:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.dev-btn { padding: .45rem .6rem; border: 1px solid #4a4568; border-radius: 8px; background: #2a2640; color: inherit; font-size: .8rem; cursor: pointer; }
.dev-btn:hover { background: #3a3560; }
.dev-head { white-space: nowrap; }
.sidebar { scrollbar-width: thin; scrollbar-color: #4a4568 transparent; }

/* ---------- Resolve Nível ---------- */
#sboard { touch-action: none; user-select: none; -webkit-user-select: none; }
#sboard .cell { background: #3a3750; }
.palette { display: grid; grid-template-columns: repeat(5, 1fr); gap: .4rem; }
.palette-title { color: var(--muted); font-size: .9rem; }
.swatch { aspect-ratio: 1; border: 2px solid transparent; border-radius: 8px; cursor: pointer; padding: 0; transition: transform .12s, border-color .12s; }
.swatch:hover { transform: scale(1.08); }
.swatch.active { border-color: #fff; box-shadow: 0 0 0 2px var(--accent); }
.s-status { color: var(--muted); font-size: .85rem; text-align: center; line-height: 1.4; }
.s-status.ok { color: #9be39b; }
.s-status.bad { color: #ff9aa8; }
.solve-btn { background: var(--accent); color: #2a1a10; font-weight: 700; border: none; border-radius: 10px; padding: .7rem; cursor: pointer; animation: pop .25s ease-out; }
.solve-btn:hover { filter: brightness(1.1); }
.solve-btn[hidden] { display: none; }
#sboard .sym.cat { animation: pop .3s ease-out; }

/* ---------- Campanha: info do nível, cronômetro, mapa e modal ---------- */
.level-info { color: var(--accent); font-weight: 700; font-size: .85rem; text-align: center; }
.timer { color: var(--muted); font-variant-numeric: tabular-nums; text-align: center; font-size: .95rem; }
body.compact .sidebar { flex-wrap: wrap; gap: .1rem .8rem; }
body.compact .sidebar .level-info { flex: 1 0 100%; text-align: left; font-size: .8rem; }
body.compact .sidebar .timer { font-size: .85rem; }

.modal-actions { display: flex; gap: .6rem; justify-content: center; flex-wrap: wrap; }
.modal-card button.secondary { background: transparent; color: var(--text); border: 2px solid #4a4568; }
.modal-card button.secondary:hover { border-color: var(--accent); }
.modal-stars { color: #ffd15c; font-size: 2rem; letter-spacing: .15em; }

.levels-head { display: flex; align-items: baseline; justify-content: space-between; gap: 1rem; max-width: 900px; margin: 0 auto; }
.levels-head h2 { margin: .2rem 0 .6rem; color: var(--accent); }
.levels-total { color: #ffd15c; font-weight: 700; }
#level-map { max-width: 900px; margin: 0 auto; padding-bottom: 1.5rem; }
.level-group { margin: 1.2rem 0 .5rem; color: var(--muted); font-size: .95rem; font-weight: 600; }
.level-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(68px, 1fr)); gap: .5rem; }
.lv-btn {
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: .1rem;
  min-height: 64px; padding: .4rem .2rem; border: 2px solid transparent; border-radius: 12px;
  background: var(--panel); color: var(--text); cursor: pointer; font: inherit;
  touch-action: manipulation; -webkit-tap-highlight-color: transparent;
}
.lv-num { font-size: 1.2rem; font-weight: 700; line-height: 1.1; }
.lv-stars { font-size: .75rem; color: #ffd15c; letter-spacing: .08em; min-height: 1em; }
.lv-diff { font-size: .6rem; color: var(--muted); }
.level-group small { font-weight: 400; opacity: .8; }

/* Ferramentas de desenvolvedor (Modo Dev, Resolve Nível, Documentação): só com ?dev na URL */
body:not(.dev-ui) [data-dev] { display: none !important; }

/* Chaves de som/vibração: discretas, ficam esmaecidas quando desligadas */
#sound-btn.off, #haptics-btn.off { opacity: .6; }
.lv-btn.done { background: #33305a; }
.lv-btn.current { border-color: var(--accent); }
.lv-btn.locked { opacity: .45; cursor: not-allowed; }
@media (hover: hover) { .lv-btn:not(:disabled):hover { border-color: var(--accent); } }

/* ---------- Mobile: toque e áreas seguras (notch / barra de gestos) ---------- */
body {
  touch-action: manipulation;                    /* sem zoom por duplo toque fora do tabuleiro */
  -webkit-tap-highlight-color: transparent;
  padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
}
```

## sw.js

- Last modified: 2026-10-16 23:40:22

```js
"use strict";

/* Service worker do MiauColor: o jogo funciona offline depois da primeira visita.
 * - Pré-cache de todo o "app shell" e dos packs de níveis.
 * - Depois: responde do cache e atualiza em segundo plano (stale-while-revalidate),
 *   então uma nova versão publicada aparece na visita seguinte.
 * Ao alterar a lista abaixo (ou para forçar atualização), incremente CACHE. */
const CACHE = "miaucolor-v2";

const PRECACHE = [
  "./",
  "index.html",
  "style.css",
  "script.js",
  "engine.js",
  "infinite.js",
  "levels.js",
  "progress.js",
  "audio.js",
  "manifest.webmanifest",
  "levels/manifest.js",
  "levels/pack-01.js",
  "levels/pack-02.js",
  "levels/pack-03.js",
  "levels/pack-04.js",
  "levels/pack-05.js",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/apple-touch-icon.png",
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.open(CACHE).then(async cache => {
      const cached = await cache.match(req, { ignoreSearch: true });   // ?dev usa o mesmo cache
      const network = fetch(req)
        .then(res => { if (res && res.ok) cache.put(req, res.clone()); return res; })
        .catch(() => null);
      if (cached) { network.catch(() => {}); return cached; }
      return (await network) || new Response("Sem conexão", { status: 503, statusText: "Offline" });
    })
  );
});
```

## tests.html

- Last modified: 2026-10-16 23:35:03

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>MiauColor — testes</title>
  <style>
    body { font: 14px/1.5 system-ui, sans-serif; background: #1e1b2e; color: #f1eefc; padding: 1rem 1.5rem; }
    h1 { font-size: 1.2rem; }
    #summary { font-weight: 700; margin: .5rem 0 1rem; }
    .row { padding: .15rem 0; }
    .pass::before { content: "✅ "; }
    .fail::before { content: "❌ "; }
    .fail { color: #ff9aa8; }
    small { color: #a9a3c7; }
  </style>
</head>
<body>
  <h1>MiauColor — testes automatizados</h1>
  <p><small>Abra este arquivo no navegador (sem servidor). O localStorage é substituído por uma versão em memória:
  seu progresso real não é tocado.</small></p>
  <div id="summary">Executando…</div>
  <div id="results"></div>

  <!-- localStorage em memória: precisa vir ANTES dos scripts que o leem -->
  <script>
    (() => {
      const store = new Map();
      const mem = {
        getItem: k => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => { store.set(k, String(v)); },
        removeItem: k => { store.delete(k); },
        clear: () => store.clear(),
      };
      Object.defineProperty(window, "localStorage", { value: mem, configurable: true });
    })();
  </script>
  <script src="engine.js"></script>
  <script src="infinite.js"></script>
  <script src="levels.js"></script>
  <script src="levels/manifest.js"></script>
  <script src="progress.js"></script>
  <script>
    "use strict";
    const E = createEngine();
    const tests = [];
    const test = (name, fn) => tests.push({ name, fn });
    const assert = (cond, msg) => { if (!cond) throw new Error(msg || "asserção falhou"); };
    const eq = (a, b, msg) => assert(JSON.stringify(a) === JSON.stringify(b), `${msg || "valores diferentes"}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);

    const decodeRegions = (n, s) => Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => s.charCodeAt(r * n + c) - 65));
    function regionsConnected(reg, n) {
      for (let id = 0; id < n; id++) {
        const cells = [];
        for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (reg[r][c] === id) cells.push([r, c]);
        if (!cells.length) return false;
        const seen = new Set([cells[0][0] * n + cells[0][1]]), stack = [cells[0]];
        while (stack.length) {
          const [r, c] = stack.pop();
          for (const [dr, dc] of E.DIRS) {
            const a = r + dr, b = c + dc;
            if (a >= 0 && b >= 0 && a < n && b < n && reg[a][b] === id && !seen.has(a * n + b)) { seen.add(a * n + b); stack.push([a, b]); }
          }
        }
        if (seen.size !== cells.length) return false;
      }
      return true;
    }
    function validPlacement(n, reg, sol) {            // regras do jogo aplicadas à solução
      if (new Set(sol).size !== n) return false;
      if (new Set(sol.map((c, r) => reg[r][c])).size !== n) return false;
      for (let r = 1; r < n; r++) if (Math.abs(sol[r] - sol[r - 1]) <= 1) return false;
      return true;
    }

    /* ---------- Motor ---------- */
    test("PRNG: mesma seed, mesma sequência; seeds diferentes divergem", () => {
      const a = E.rngFor("x"), b = E.rngFor("x"), c = E.rngFor("y");
      const sa = [a(), a(), a()], sb = [b(), b(), b()], sc = [c(), c(), c()];
      eq(sa, sb, "sequências iguais");
      assert(JSON.stringify(sa) !== JSON.stringify(sc), "seeds diferentes devem divergir");
    });
    test("PRNG: valores em [0, 1)", () => {
      const r = E.rngFor("faixa");
      for (let i = 0; i < 1000; i++) { const v = r(); assert(v >= 0 && v < 1, "fora de [0,1): " + v); }
    });
    test("generateUnique 5x5..8x8: solução única, regiões conexas, jogada válida", () => {
      for (const n of [5, 6, 7, 8]) {
        const { cols, reg } = E.generateUnique(n, E.rngFor("teste:" + n));
        eq(E.countSolutions(n, reg, 3), 1, `${n}x${n} deve ter 1 solução`);
        assert(regionsConnected(reg, n), `${n}x${n}: região desconexa`);
        assert(validPlacement(n, reg, cols), `${n}x${n}: solução viola as regras`);
      }
    });
    test("generateUnique é determinístico por seed", () => {
      eq(E.generateUnique(7, E.rngFor("det")), E.generateUnique(7, E.rngFor("det")));
    });
    test("gradeLevel devolve null para mapa com solução errada", () => {
      const { cols, reg } = E.generateUnique(6, E.rngFor("err"));
      const wrong = cols.slice(); [wrong[0], wrong[1]] = [wrong[1], wrong[0]];
      assert(E.gradeLevel(6, reg, wrong) === null, "gabarito errado deveria ser rejeitado");
    });
    test("difficultyLabel: limites das classes", () => {
      eq([E.difficultyLabel(10), E.difficultyLabel(16), E.difficultyLabel(17), E.difficultyLabel(40), E.difficultyLabel(41), E.difficultyLabel(80), E.difficultyLabel(81)],
        ["Fácil", "Fácil", "Médio", "Médio", "Difícil", "Difícil", "Expert"]);
    });

    /* ---------- Packs (100 níveis) ---------- */
    test("manifest: 5 packs, 100 níveis", () => { eq([MiauLevels.total], [100]); });
    test("100 níveis dos packs: únicos, conexos, válidos e com tier/score idênticos ao gerador Python", async () => {
      const ids = new Set();
      for (let id = 1; id <= 100; id++) {
        const lv = await MiauLevels.get(id);
        assert(lv, `nível ${id} não carregou`);
        assert(!ids.has(id) && lv.id === id, `id duplicado/errado ${id}`); ids.add(id);
        assert(new Set(lv.regions.flat()).size === lv.n, `nível ${id}: nº de regiões ≠ n`);
        eq(E.countSolutions(lv.n, lv.regions, 3), 1, `nível ${id} deve ter solução única`);
        assert(regionsConnected(lv.regions, lv.n), `nível ${id}: região desconexa`);
        assert(validPlacement(lv.n, lv.regions, lv.solution), `nível ${id}: gabarito inválido`);
        const g = E.gradeLevel(lv.n, lv.regions, lv.solution);
        assert(g && g.tier === lv.tier && g.score === lv.score, `nível ${id}: dificuldade diverge (JS ${g && g.tier}/${g && g.score} × pack ${lv.tier}/${lv.score})`);
      }
    });
    test("MiauLevels: 101 é infinito, 100 não; nível 0 devolve null", async () => {
      assert(MiauLevels.isInfinite(101) && !MiauLevels.isInfinite(100), "limite do infinito");
      assert((await MiauLevels.get(0)) === null, "nível 0 deveria ser null");
    });

    /* ---------- Infinito ---------- */
    test("generateInfinite(101): determinístico, 10x10, único, jogada válida, rótulo coerente (≈ 10 s)", () => {
      const a = E.generateInfinite(101), b = E.generateInfinite(101);
      eq(a, b, "mesma seed deve gerar o mesmo nível");
      eq([a.n], [10]);
      const reg = decodeRegions(10, a.regions);
      eq(E.countSolutions(10, reg, 3), 1, "solução única");
      assert(regionsConnected(reg, 10), "região desconexa");
      assert(validPlacement(10, reg, a.solution), "gabarito inválido");
      eq([a.diff], [E.difficultyLabel(a.score)], "rótulo ≠ score");
    });
    test("generateInfinite: ids diferentes geram níveis diferentes", () => {
      assert(E.generateInfinite(102).regions !== E.generateInfinite(103).regions, "níveis iguais");
    });

    /* ---------- Progresso ---------- */
    test("Progress: estrelas só sobem, recorde de tempo, desbloqueio e partida em andamento", () => {
      eq([Progress.unlocked, Progress.totalStars()], [1, 0], "estado inicial");
      Progress.saveProgress({ id: 1, marks: [[0]], lives: 3, elapsed: 5 });
      eq([Progress.getProgress(1) !== null, Progress.getProgress(2)], [true, null], "slot por nível");
      Progress.complete(1, 2, 30, Infinity);
      eq([Progress.stars(1), Progress.best(1), Progress.unlocked, Progress.getProgress(1)], [2, 30, 2, null], "1ª conclusão");
      Progress.complete(1, 1, 40, Infinity);
      eq([Progress.stars(1), Progress.best(1)], [2, 30], "pior resultado não sobrescreve");
      Progress.complete(1, 3, 20, Infinity);
      eq([Progress.stars(1), Progress.best(1), Progress.unlocked], [3, 20, 2], "melhor resultado atualiza; não re-libera");
      Progress.complete(150, 1, 10, Infinity);
      eq([Progress.unlocked], [151], "sem teto: o infinito continua liberando");
    });
    test("Progress: save persiste e sobrevive a JSON inválido", () => {
      localStorage.setItem("miaucolor:v1", "{não é json");
      // recarregar o módulo não é possível aqui; garante apenas que o estado em memória segue consistente
      Progress.complete(2, 3, 12, Infinity);
      eq([Progress.stars(2)], [3]);
      assert(JSON.parse(localStorage.getItem("miaucolor:v1")).stars[2] === 3, "não gravou");
    });

    /* ---------- Runner ---------- */
    (async () => {
      const results = document.getElementById("results");
      let pass = 0, fail = 0;
      window.__testResults = [];
      for (const t of tests) {
        const t0 = performance.now();
        let ok = true, err = "";
        try { await t.fn(); } catch (e) { ok = false; err = e.message; }
        const ms = Math.round(performance.now() - t0);
        ok ? pass++ : fail++;
        window.__testResults.push({ name: t.name, ok, err, ms });
        const row = document.createElement("div");
        row.className = "row " + (ok ? "pass" : "fail");
        row.innerHTML = `${t.name} <small>(${ms} ms)</small>` + (ok ? "" : `<br><small>${err}</small>`);
        results.appendChild(row);
      }
      const summary = document.getElementById("summary");
      summary.textContent = `${pass} passaram, ${fail} falharam (${tests.length} testes)`;
      document.title = (fail ? "FALHOU" : "OK") + " — " + summary.textContent;
      window.__testsDone = true;
    })();
  </script>
</body>
</html>
```

## gen_icons.py

- Last modified: 2026-10-16 23:35:46
- Caminho: tools\gen_icons.py

```py
#!/usr/bin/env python3
"""Gera os ícones PNG do PWA (sem dependências: só zlib/struct).

Uso: python tools/gen_icons.py   -> icons/icon-192.png, icon-512.png, apple-touch-icon.png

Desenho: carinha de gato laranja sobre fundo roxo escuro, em tela cheia, com tudo dentro
da "zona segura" central (80%), para funcionar também como ícone maskable do Android.
"""
import struct
import zlib
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "icons"

BG = (42, 38, 64)            # --panel
CAT = (255, 159, 107)        # --accent
EAR_INNER = (255, 205, 175)
EYE = (42, 26, 16)
NOSE = (214, 84, 112)


def in_circle(x, y, cx, cy, r):
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r


def in_tri(x, y, a, b, c):
    def sign(p1, p2, p3):
        return (p1[0] - p3[0]) * (p2[1] - p3[1]) - (p2[0] - p3[0]) * (p1[1] - p3[1])
    p = (x, y)
    d1, d2, d3 = sign(p, a, b), sign(p, b, c), sign(p, c, a)
    neg = d1 < 0 or d2 < 0 or d3 < 0
    pos = d1 > 0 or d2 > 0 or d3 > 0
    return not (neg and pos)


def color_at(x, y):
    """Cor do ponto (x, y) em coordenadas normalizadas 0..1."""
    # olhos e nariz por cima da cabeça
    if in_circle(x, y, 0.415, 0.545, 0.034) or in_circle(x, y, 0.585, 0.545, 0.034):
        return EYE
    if in_tri(x, y, (0.465, 0.61), (0.535, 0.61), (0.5, 0.65)):
        return NOSE
    # parte interna das orelhas
    if in_tri(x, y, (0.285, 0.26), (0.275, 0.42), (0.42, 0.35)) or in_tri(x, y, (0.715, 0.26), (0.725, 0.42), (0.58, 0.35)):
        return EAR_INNER
    # orelhas e cabeça
    if in_tri(x, y, (0.25, 0.17), (0.23, 0.47), (0.47, 0.33)) or in_tri(x, y, (0.75, 0.17), (0.77, 0.47), (0.53, 0.33)):
        return CAT
    if in_circle(x, y, 0.5, 0.57, 0.265):
        return CAT
    return BG


def render(size, ss=3):
    rows = []
    for py in range(size):
        row = bytearray([0])                       # filtro PNG "None"
        for px in range(size):
            r = g = b = 0
            for sy in range(ss):
                for sx in range(ss):
                    c = color_at((px + (sx + .5) / ss) / size, (py + (sy + .5) / ss) / size)
                    r += c[0]; g += c[1]; b += c[2]
            n = ss * ss
            row += bytes((r // n, g // n, b // n))
        rows.append(bytes(row))
    return b"".join(rows)


def png(size, raw):
    def chunk(tag, data):
        body = tag + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)
    header = struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)       # 8 bits, RGB
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")


if __name__ == "__main__":
    OUT.mkdir(exist_ok=True)
    for name, size in (("icon-192.png", 192), ("icon-512.png", 512), ("apple-touch-icon.png", 180)):
        (OUT / name).write_bytes(png(size, render(size)))
        print("gerado", OUT / name)
```

## gen_levels.py

- Last modified: 2026-10-16 22:19:35
- Caminho: tools\gen_levels.py

```py
#!/usr/bin/env python3
"""Gerador offline de níveis do MiauColor.

Uso:  python tools/gen_levels.py            (gera levels/pack-XX.json e .js)
      python tools/gen_levels.py --verify   (só valida os packs existentes)

- Determinístico: cada nível sai de uma seed fixa ("n-slot-tentativa").
- Garante solução ÚNICA (backtracking + reparo por busca local).
- Classifica a dificuldade com um solver LÓGICO (sem chute). Níveis que exigem
  tentativa-e-erro são descartados.

Técnicas (tier):
  1  única célula possível em linha/coluna/região
  2  região confinada a uma linha/coluna (e o inverso)
  3  k regiões em k linhas/colunas (e o inverso)
  4  eliminação por contradição (simula um gato e vê se algo fica impossível)
"""
import argparse
import itertools
import json
import random
import sys
from pathlib import Path

DIRS = ((1, 0), (-1, 0), (0, 1), (0, -1))
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "levels"
PACK_SIZE = 20
# (tamanho, quantidade, tier mínimo aceito)
PLAN = [(5, 10, 1), (6, 15, 1), (7, 25, 2), (8, 25, 2), (9, 15, 2), (10, 10, 2)]
TIER_NAMES = {1: "Fácil", 2: "Médio", 3: "Difícil", 4: "Expert"}


# ---------------------------------------------------------------- geração
def place_cats(n, rng):
    cols, used = [-1] * n, set()

    def solve(row):
        if row == n:
            return True
        order = list(range(n))
        rng.shuffle(order)
        for c in order:
            if c in used or (row and abs(cols[row - 1] - c) <= 1):
                continue
            cols[row] = c
            used.add(c)
            if solve(row + 1):
                return True
            used.discard(c)
            cols[row] = -1
        return False

    return cols if solve(0) else None


def grow_regions(n, cols, rng):
    reg = [[-1] * n for _ in range(n)]
    frontier = []
    for r in range(n):
        reg[r][cols[r]] = r
        frontier.append([(r, cols[r])])
    free = n * n - n
    while free:
        ids = [i for i, f in enumerate(frontier) if f]
        i = rng.choice(ids)
        f = frontier[i]
        k = rng.randrange(len(f))
        r, c = f[k]
        open_ = [(r + a, c + b) for a, b in DIRS
                 if 0 <= r + a < n and 0 <= c + b < n and reg[r + a][c + b] == -1]
        if not open_:
            f.pop(k)
            continue
        nr, nc = rng.choice(open_)
        reg[nr][nc] = i
        f.append((nr, nc))
        free -= 1
    return reg


def count_solutions(n, reg, limit=2):
    cols, used_c, used_g, count = [-1] * n, set(), set(), [0]

    def go(row):
        if count[0] >= limit:
            return
        if row == n:
            count[0] += 1
            return
        for c in range(n):
            g = reg[row][c]
            if c in used_c or g in used_g or (row and abs(cols[row - 1] - c) <= 1):
                continue
            cols[row] = c
            used_c.add(c)
            used_g.add(g)
            go(row + 1)
            used_c.discard(c)
            used_g.discard(g)
            cols[row] = -1

    go(0)
    return count[0]


def region_connected(reg, n, rid, skip):
    cells = [(r, c) for r in range(n) for c in range(n) if reg[r][c] == rid and (r, c) != skip]
    if not cells:
        return False
    seen, stack, s = {cells[0]}, [cells[0]], set(cells)
    while stack:
        r, c = stack.pop()
        for a, b in DIRS:
            p = (r + a, c + b)
            if p in s and p not in seen:
                seen.add(p)
                stack.append(p)
    return len(seen) == len(s)


def repair(n, cols, reg, rng, max_iter=4000, cap=50):
    cur = count_solutions(n, reg, cap)
    for _ in range(max_iter):
        if cur == 1:
            return True
        r, c = rng.randrange(n), rng.randrange(n)
        if cols[r] == c:
            continue
        old = reg[r][c]
        nb = {reg[r + a][c + b] for a, b in DIRS if 0 <= r + a < n and 0 <= c + b < n} - {old}
        if not nb or not region_connected(reg, n, old, (r, c)):
            continue
        reg[r][c] = rng.choice(sorted(nb))
        k = count_solutions(n, reg, cap)
        if k <= cur:
            cur = k
        else:
            reg[r][c] = old
    return cur == 1


def generate_unique(n, rng):
    while True:
        cols = place_cats(n, rng)
        reg = grow_regions(n, cols, rng)
        if count_solutions(n, reg) == 1 or repair(n, cols, reg, rng):
            return cols, reg


# --------------------------------------------------------- solver lógico
def grade(n, reg, solution):
    """Resolve só com lógica. Devolve (tier, score) ou None se exigir chute."""
    cand = [[True] * n for _ in range(n)]
    cells = {("r", i): [(i, j) for j in range(n)] for i in range(n)}
    cells.update({("c", j): [(i, j) for i in range(n)] for j in range(n)})
    for r in range(n):
        for c in range(n):
            cells.setdefault(("g", reg[r][c]), []).append((r, c))
    done, placed = set(), []
    steps = {1: 0, 2: 0, 3: 0, 4: 0}

    def zone(r, c):
        return {(a, b) for a in range(max(0, r - 1), min(n, r + 2))
                for b in range(max(0, c - 1), min(n, c + 2))} \
            | set(cells[("r", r)]) | set(cells[("c", c)]) | set(cells[("g", reg[r][c])])

    def put(r, c):
        for a, b in zone(r, c):
            cand[a][b] = False
        done.update({("r", r), ("c", c), ("g", reg[r][c])})
        placed.append((r, c))

    def live(u):
        return [(r, c) for r, c in cells[u] if cand[r][c]]

    def kill(cs):
        ch = False
        for r, c in cs:
            if cand[r][c]:
                cand[r][c] = False
                ch = True
        return ch

    def t1():
        for u in cells:
            if u in done:
                continue
            lv = live(u)
            if not lv:
                raise ValueError("contradição")
            if len(lv) == 1:
                put(*lv[0])
                return True
        return False

    def t2():
        ch = False
        for u in cells:
            if u in done:
                continue
            lv = live(u)
            kind = u[0]
            if kind == "g":
                for axis, key in (("r", 0), ("c", 1)):
                    vals = {p[key] for p in lv}
                    if len(vals) == 1:
                        ch |= kill([p for p in cells[(axis, vals.pop())] if reg[p[0]][p[1]] != u[1]])
            else:
                gs = {reg[r][c] for r, c in lv}
                if len(gs) == 1:
                    ch |= kill([p for p in cells[("g", gs.pop())] if p not in cells[u]])
        return ch

    def t3_sets():
        ch = False
        free = lambda kind: [u for u in cells if u[0] == kind and u not in done]
        for axis, key in (("r", 0), ("c", 1)):
            for k in (2, 3):
                for combo in itertools.combinations(free("g"), k):
                    lines = {p[key] for u in combo for p in live(u)}
                    if len(lines) == k:
                        mine = {u[1] for u in combo}
                        ch |= kill([p for ln in lines for p in cells[(axis, ln)]
                                    if reg[p[0]][p[1]] not in mine])
                for combo in itertools.combinations(free(axis), k):
                    gs = {reg[r][c] for u in combo for r, c in live(u)}
                    if len(gs) == k:
                        mine = set(combo)
                        ch |= kill([p for g in gs for p in cells[("g", g)] if (axis, p[key]) not in mine])
        return ch

    def t3_contra():
        for r in range(n):
            for c in range(n):
                if not cand[r][c]:
                    continue
                z = zone(r, c)
                gone = {("r", r), ("c", c), ("g", reg[r][c])}
                for u in cells:
                    if u in done or u in gone:
                        continue
                    if all((p in z) or not cand[p[0]][p[1]] for p in cells[u]):
                        cand[r][c] = False
                        return True
        return False

    try:
        while len(placed) < n:
            for tier, fn in ((1, t1), (2, t2), (3, t3_sets), (4, t3_contra)):
                if fn():
                    steps[tier] += 1
                    break
            else:
                return None
    except ValueError:
        return None
    if sorted(placed) != sorted((r, c) for r, c in enumerate(solution)):
        return None
    tier = max(t for t, v in steps.items() if v)
    return tier, steps[1] + 3 * steps[2] + 8 * steps[3] + 15 * steps[4]


# ------------------------------------------------------------------ packs
def encode(reg):
    return "".join(chr(65 + v) for row in reg for v in row)


def decode(n, s):
    return [[ord(s[r * n + c]) - 65 for c in range(n)] for r in range(n)]


def build_levels():
    levels = []
    for n, qty, min_tier in PLAN:
        got = []
        for slot in range(qty):
            attempt = 0
            while True:
                rng = random.Random(f"miaucolor:{n}:{slot}:{attempt}")
                attempt += 1
                cols, reg = generate_unique(n, rng)
                g = grade(n, reg, cols)
                if g and g[0] >= min_tier:
                    got.append({"n": n, "tier": g[0], "score": g[1],
                                "regions": encode(reg), "solution": cols})
                    break
        got.sort(key=lambda L: L["score"])       # mais simples primeiro dentro do tamanho
        levels += got
        print(f"  {n}x{n}: {qty} níveis, tiers {sorted({L['tier'] for L in got})}", flush=True)
    for i, L in enumerate(levels, 1):
        L["id"] = i
        L["diff"] = TIER_NAMES[L["tier"]]
    return levels


def write_packs(levels):
    OUT.mkdir(exist_ok=True)
    for old in OUT.glob("pack-*"):
        old.unlink()
    packs = [levels[i:i + PACK_SIZE] for i in range(0, len(levels), PACK_SIZE)]
    for k, chunk in enumerate(packs, 1):
        data = {"pack": k, "levels": chunk}
        text = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
        (OUT / f"pack-{k:02d}.json").write_text(text, encoding="utf-8")
        # .js permite abrir index.html direto do disco (fetch não funciona em file://)
        (OUT / f"pack-{k:02d}.js").write_text(f"MiauLevels.register({text});\n", encoding="utf-8")
    meta = {"packs": len(packs), "total": len(levels), "packSize": PACK_SIZE}
    (OUT / "manifest.json").write_text(json.dumps(meta), encoding="utf-8")
    (OUT / "manifest.js").write_text(f"MiauLevels.setMeta({json.dumps(meta)});\n", encoding="utf-8")
    print(f"{len(levels)} níveis em {len(packs)} packs -> {OUT}")


def verify():
    files = sorted(OUT.glob("pack-*.json"))
    if not files:
        sys.exit("nenhum pack encontrado")
    total = bad = 0
    ids = set()
    for f in files:
        for L in json.loads(f.read_text(encoding="utf-8"))["levels"]:
            total += 1
            n, reg = L["n"], decode(L["n"], L["regions"])
            ok = (L["id"] not in ids and len(L["regions"]) == n * n
                  and len(set(L["regions"])) == n
                  and count_solutions(n, reg, 2) == 1
                  and all(region_connected(reg, n, i, (-1, -1)) for i in range(n)))
            g = grade(n, reg, L["solution"]) if ok else None
            ok = ok and g is not None and g[0] == L["tier"]
            ids.add(L["id"])
            if not ok:
                bad += 1
                print("INVÁLIDO:", f.name, L["id"])
    print(f"verificados {total} níveis, inválidos: {bad}")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--verify", action="store_true")
    if ap.parse_args().verify:
        verify()
    else:
        write_packs(build_levels())
        verify()
```

