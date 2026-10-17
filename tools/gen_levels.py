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
