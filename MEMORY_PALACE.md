# MeowColor (ex-MiauColor / Meowdoku) — Memory Palace

> **Como usar:** leia inteiro antes de mexer no código. É a fonte de verdade do estado do projeto, das decisões do
> dono e do roadmap. **Ao terminar uma tarefa, atualize o §9 (Roadmap) e o §13 (Changelog).** Escrito em pt-BR; o
> dono conversa em pt-BR. Regras de código obrigatórias estão em `AGENTS.md`.

**TL;DR (EN):** MeowColor is a static, no-backend logic puzzle (LinkedIn-Queens-like: one cat per row, column and
color region; cats can't touch, even diagonally). Vanilla HTML/CSS/JS, no build step. Target platform: **Poki**
(web portal, iframe, Poki SDK ads). 100 pre-generated campaign levels (5×5…10×10) + infinite seeded 10×10 levels +
a seeded **daily challenge** with streak. PT/EN/ES, two themes (Cozy / Night), guided tutorial, teaching hints,
rewarded power-ups, undo. Progress in localStorage.

---

## 1. Dono e preferências (respeite)

- Responder em **pt-BR**, **conciso, direto e crítico**; ser honesto sobre limitações.
- **Duplo toque/duplo clique confirma o gato** (validação imediata contra o gabarito, sem botão "finalizar").
  Toque simples marca ✕ sem atraso. Não mudar.
- Jogo **infinito**: depois do nível 100, sempre **10×10**, dificuldade variável.
- Sem backend. Login/nuvem/ranking só depois da v1.0.
- **Não reintroduzir bordas grossas entre regiões** (C6, rejeitado). Para daltonismo: estampas por região (já no
  tema cozy) e/ou modo com símbolos (C7).
- A **Dica ensina o raciocínio**, nunca aponta a casa do gato nem usa coordenadas (isso é o "Revelar Gato").
- Commits pequenos e focados (`feat(...)`, `fix(...)`), mensagens em pt-BR.

## 2. Regras do jogo (domínio)

Tabuleiro N×N com N regiões. **Exatamente 1 gato por linha, coluna e região**; gatos **não se tocam, nem na
diagonal**. Todo nível tem **solução única** e é resolvível **só com lógica** (sem chute).

Interação:
- **Toque/clique** alterna ✕ na hora. **Arrastar** marca/apaga vários (a 1ª casa define o modo).
- **Dois toques na mesma casa em ≤ 300 ms** (`DOUBLE_TAP_MS`): desfaz o ✕ do 1º toque e tenta o gato. Acerto
  fixa o gato (+pontos, combo); erro = −1 vida (3 patinhas) e a casa vira ✕ vinho fixo (mark 3).
- **Desfazer** (botão na barra e Ctrl/Cmd+Z): volta ✕ do jogador e o "Limpar"; gatos e erros são definitivos.
- Vitória com N gatos; derrota sem vidas. Estrelas: 3 sem erro, 2 com 1, 1 com ≥ 2.

## 3. Ambiente

- **Windows**, PowerShell 5.1 (sem `&&`/`||`) e Git Bash. Projeto em `C:\Users\Mateus\Desktop\Fonts\Meowdoku`,
  **repositório git** (`origin` = `github.com/mateusesteves223/miaucolor`, branch `main`; tag `pre-poki` = última
  versão PWA/AdSense).
- **Node NÃO está instalado.** Python 3.12 (`python`) e **Playwright para Python** estão (`from playwright.sync_api
  import sync_playwright`). Os testes de UI rodam por script Playwright abrindo `file:///…/index.html`.
  Os navegadores do Playwright **não** estão baixados: use `p.chromium.launch(channel="chrome")` (Chrome instalado).
  Rode com `python -I -X utf8` (o console do Windows é cp1252). A CSP do jogo proíbe `eval`: em
  `wait_for_function` passe uma arrow (`"() => cond"`), não uma expressão solta. Os erros de console do SDK da Poki
  ("Unauthorized Game Hosting", sandbox) são esperados fora do domínio da Poki e não são do jogo.
- `index.html`, `script.js`, `style.css` podem ter BOM UTF-8: preserve a codificação (edite com Edit/Python
  lendo e gravando em `utf-8`).
- ⚠️ Armadilha de teste: `Progress` mantém tudo em memória e regrava o objeto inteiro a cada `save()`. Para semear
  `localStorage`, use um init script que roda antes dos scripts da página (ex.: só na 1ª carga via
  `sessionStorage`), senão a página antiga sobrescreve o estado.
- Em viewport estreita (retrato) os controles de partida ficam no menu ⋯ (folha de baixo) → dispare por JS ou abra
  o menu antes (`[data-menu-toggle] >> visible=true`).
- Top-level `let/const` de `script.js` são acessíveis em `page.evaluate` (ambiente léxico global), ex.: `marks`,
  `solution`, `game`, `dailyKey`, `undoStack`, `playLevel(id)`, `playDaily()`, `tryCat(r,c)`.

## 4. Mapa de arquivos

| Arquivo | Papel |
|---|---|
| `index.html` | Estrutura: sprite SVG (ícones e gato), painel **Jogar** (HUD, tabuleiro, barra Desfazer + power-ups, cartão do tutorial), **Níveis** (cartão do diário + mapa), **Guia Help**, abas dev (**Resolve Nível**, **Documentação**), menu ⋯ (partida, ajustes, tema, idioma, regras, tutorial). CSP sem script inline. Ordem dos scripts: `theme.js` (head) → Poki SDK → `engine` → `infinite` → `levels` → `levels/manifest` → `progress` → `i18n` → `audio` → `ads` → `script`. |
| `style.css` | Tema base **"Aconchego"** (cozy, "Mesa do gato": feltro/colcha de retalhos, costura SVG, cantos internos arredondados). Layout por proporção (paisagem com trilhos laterais / retrato com HUD em cima e dock embaixo). |
| `theme-night.css` | Tema **"Noite"** (só regras `[data-theme="night"]`). |
| `theme.js` | `Theme`: `cozy`/`night`, marca `<html data-theme>` antes da 1ª pintura; chave `miaucolor:theme:v1`; sem escolha segue `prefers-color-scheme`. |
| `script.js` | Controlador de UI (monolito ~2200 linhas): estado/FSM, tabuleiro, entrada por ponteiro, desfazer, pontuação, vidas, modais, timer, campanha, diário, power-ups, Dica, **Tutorial**, aba Resolve Nível, abas/menu, idioma/tema, boot. |
| `engine.js` | Motor puro `createEngine()` (sem DOM): PRNG por seed, geração com solução única, solver lógico/dificuldade, `findHint`, power-ups, `generateInfinite`, `generateDaily`. `spawnEngineWorker(src)` cria Worker via Blob (funciona em `file://`). |
| `infinite.js` | `InfiniteLevels`: níveis ≥ 101, cache `miaucolor:gen:v1` (KEEP 300, validado), geração em Worker, prefetch AHEAD 3. |
| `levels.js` + `levels/` | `MiauLevels`: packs `pack-01..05.js/.json` (20 níveis cada) e `manifest.*`, **gerados** por `tools/gen_levels.py`. |
| `progress.js` | `Progress` (chave `miaucolor:v1`, versão atual **8**, migrações encadeadas + sanitização): estrelas, recordes, desbloqueio, `totalScore`, partida em andamento (1 slot, só campanha), itens, idioma, tutorial, **diário** (sequência). |
| `i18n.js` | `I18n`: dicionários `pt`/`en`/`es`, `t(chave, params)` com `{var}` (sem plural: use chaves `xxxOne`), `apply()` para `data-i18n*`, `colorName`, `diffLabel`, `list`. |
| `audio.js` | `Sound`: sons sintetizados (Web Audio) + `navigator.vibrate`; `miaucolor:settings:v1`; destrava após 1º gesto. |
| `ads.js` | `Ads`: **Poki SDK** (`init` → `gameLoadingFinished` → `gameplayStart/Stop`, `commercialBreak` entre partidas, `rewardedBreak` nos power-ups). Sem SDK nada quebra; `?dev` simula o vídeo. |
| `sw.js` | Só **desinstala** o service worker antigo (o jogo não é mais PWA). |
| `tests.html` | Testes no navegador (sem Node), `localStorage` em memória. Título vira `OK — N passaram…`. |
| `tools/gen_levels.py` / `gen_icons.py` | Gerador offline dos packs (Python, `--verify` valida) / ícones PNG. |
| `fonts/` | Quicksand (OFL). `mockups/` = estudos de design (não versionados). |
| `fullCode.md`, `export-full-code.ps1` | Dump de todo o código para colar em outra IA (gerado; pode estar velho). |
| `Instructions` | Nota original do dono (Exact Cover/backtracking, marca "Meowdoku") — manter. |

## 5. Arquitetura e fluxos

### 5.1 Estado (`script.js`)
`N`, `solution[r]=c`, `regions[r][c]`, `marks[r][c]` (0 vazio, 1 ✕, 2 gato, 3 ✕ de erro). Objeto `game`
(`state` da FSM `GameState` IDLE/PLAYING/PAUSED/GAME_OVER/WON, `lives`, `lost`, `cheated`, `devMode`, `drag`,
`lastTap`, `score`, `combo`, `adHold`, `generating`). Modo da partida: `campaignId` (nível) **ou** `dailyKey`
(data do diário) **ou** nenhum (treino livre / tutorial).

### 5.2 Fluxos-chave
- `setGameState` controla timer e `Ads.gameplayStart/Stop`. Aba oculta/troca de aba pausa e `persistNow()`.
- `playLevel(id, resume)` (campanha; gera infinito se preciso; retoma save se `fits`), `newGame()` (treino),
  `playDaily()` (diário), `Tutorial.start()`. Todos zeram os outros modos.
- `tryCat` → `commitCat` (pontos, ondas, vitória) ou erro (−vida). `win()` → `winDaily()` / modal de campanha /
  modal de treino. `gameOver()` → tentar de novo. Botões dos modais de fim passam por `afterBreak` (intersticial
  da Poki).
- `lockBoard` limpa a partida salva **só se for do nível em jogo** (`Progress.clearProgress(campaignId)`).
- `persist()` (debounce 400 ms) salva a partida da campanha (1 slot). Treino e diário não salvam no meio.
- **Desfazer:** `undoStack` de jogadas `{cells:[[r,c,antes,depois]]}` (toque = 1, arraste inteiro = 1) ou
  `{clear:{marks,score,combo}}`. Só reverte casas que ainda estão como a jogada deixou. O duplo toque tira da pilha
  o ✕ do 1º toque. Um gato novo ou erro remove os `clear` da pilha. Zera em `resetBoard`.
- **Power-ups** (estoque em `Progress.items`, 3 iniciais; esgotado → anúncio recompensado dá +3): **Dica**
  (`E.findHint` → técnica do Guia + casas vermelhas até o ✕), **Revelar Gato**, **3x Seguros** (✕ garantidos).
- **Tutorial**: 3 lições (4×4, 4×4, 5×5) com cartão `#coach` e patinha; abre na 1ª visita; "Ver tutorial" no menu.
- **Pontuação**: 100 por gato + 25 por acerto consecutivo (até +100); `totalScore` acumulado (só exibido).

### 5.3 Motor (`engine.js`)
- `rngFor(str)` = FNV-1a + mulberry32 (determinístico). `placeCats` → `growRegions` → `countSolutions` →
  `repairToUnique` → `generateUnique`.
- `gradeLevel` → `{tier, score, steps, opening}` ou `null` (exige chute). Tiers: **1** casa única; **2** região
  presa a linha/coluna (e inverso); **3** k regiões em k linhas/colunas (k=2,3); **4** contradição.
  `score = s1 + 3·s2 + 8·s3 + 15·s4`. Paridade exata com o Python.
- `generateInfinite(id)`: seed `miaucolor:inf:<id>:<tentativa>`, 10×10, rótulo por score (`difficultyLabel`:
  Fácil ≤ 16, Médio ≤ 40, Difícil ≤ 80, Expert).
- `generateDaily(key)`: seed `miaucolor:daily:<AAAA-MM-DD>:<tentativa>`; tamanho por dia da semana
  (`DAILY_SIZES` dom..sáb = 9, 6, 7, 7, 8, 8, 9); exige tier ≥ 2.

### 5.4 Níveis da campanha (packs 1–100)
- Gerados em Python (`random.Random("miaucolor:<n>:c<k>")`, RNG diferente do JS: não reproduzíveis pelo motor JS,
  só a classificação é idêntica).
- **Curva (cotas por tier em `PLAN`)**: 5×5 {1:5, 2:5} · 6×6 {1:3, 2:9, 3:3} · 7×7 {2:10, 3:10, 4:5} ·
  8×8 {2:6, 3:10, 4:9} · 9×9 {2:3, 3:6, 4:6} · 10×10 {2:2, 3:4, 4:4}. Dentro do tamanho: ordem por (tier, score).
  Rótulo do pack = nome do tier (Fácil/Médio/Difícil/Expert).
- Formato: `{id, n, tier, score, diff, regions: "AAB…" (n² letras), solution: [col por linha]}`.

### 5.5 Persistência (localStorage)
- `miaucolor:v1` → `{ v:8, stars, best, unlocked, totalScore, inProgress:{id,marks,lives,elapsed,score}|null,
  items:{hint,revealCat,safeCross}, installed, language, tutorial, daily:{last, streak, bestStreak, done:{data:★}} }`.
  A sequência só conta dias seguidos (vale se o último foi hoje ou ontem); `done` guarda 60 dias.
- `miaucolor:gen:v1` (infinitos), `miaucolor:settings:v1` (som/vibração), `miaucolor:theme:v1`.
- `miaucolor:dev-tune` (só com `?dev`): valores do painel 🎚️ (variáveis CSS, chaves A/B, modo leve, medidor).
- `?dev` na URL: Modo Dev (vidas infinitas, auto-✕, achar gato), abas Resolve Nível e Documentação, vídeo simulado.
  No fim do cartão Dev, **🎚️ Visual / desempenho** (não conta como trapaça): sliders das variáveis `--felt-a`,
  `--felt-a-night`, `--night-dim`, `--lit-mix`, `--x-edge-w/-a`, `--wave-glow`, `--scrim-a-night`; chaves
  "Antigo: …" (`data-legacy-blend/-filter/-blur`) para comparar o peso; modo leve; medidor de FPS/pior quadro;
  "Copiar valores" gera o bloco `:root {…}`.

## 6. Evidências medidas

- Geração JS (Chrome): 7×7 ~6 ms, 8×8 ~56 ms, 9×9 ~330 ms, 10×10 ~2 s mediana (pior caso ~10 s). Infinito ~5 s/nível.
- Distribuição natural 10×10: ~35% Fácil, 25% Médio, 20% Difícil, 15% Expert, ~5% exigem chute.
- Packs antigos (antes de 25/10/2026) tinham **55% Expert** e "dente de serra" (5×5 terminava em Expert e o 6×6
  voltava a Fácil); corrigido pelas cotas do §5.4.

## 7. Decisões tomadas (não reverter sem falar com o dono)

1. Duplo toque confirma o gato; ✕ imediato; detecção por `pointerup`.
2. Validar com `solution` é correto porque todo nível é único.
3. Campanha linear com desbloqueio, estrelas por erros, melhor tempo, retomada (1 slot).
4. ≥ 101 infinito 10×10 com dificuldade emergente.
5. Packs como `<script>` para funcionar em `file://`.
6. Plataforma alvo = **Poki** (sem PWA, sem AdSense, sem páginas legais; tudo na tag `pre-poki`).
7. Dica ensina (técnica + casas a riscar), não entrega o gato. Gato fantasma só no tutorial.
8. Desfazer não volta gatos nem erros (evita "testar" casas sem custo).
9. Diário: mesma seed para todos, tamanho pelo dia da semana, não conta para a campanha, sem save no meio.
10. Renderização leve (celular fraco travava): **nada de `filter`, `mix-blend-mode` ou `backdrop-filter`** no
    tabuleiro/menu; cor da peça por `--fab-n` (`color-mix`); animações das casas só em `opacity`/`transform` de um
    filho (`.sym`, `.patch::before`); arrasto com geometria em cache (`game.drag.geo`); menu sempre montado
    (`.open` + `inert`, sem `hidden`). Modo leve automático `<html data-lite>` (memória ≤ 4 GB ou ≤ 4 núcleos).

## 8. Armadilhas e limitações conhecidas

- **Um slot** de partida salva: abrir outro nível da campanha troca o anterior (B12).
- O diário não salva a partida no meio: recarregar a página recomeça o desafio.
- Regerar os packs muda o mapa de cada id: estrelas e recordes antigos ficam no id (aceito antes do lançamento).
- `Progress.save()` regrava o objeto inteiro (abas simultâneas se sobrescrevem).
- "Revelar solução" (menu) é grátis e encerra a partida.
- Células sem `role`/`tabindex`; tabuleiro não é jogável por teclado (C8).
- 10×10 no celular: casa ≈ 37 px em 393 px (Moto G55), 34 px em 360, 30 px em 320 (abaixo de 44 px; é o limite da
  largura). Mitigado: bandeja sem margem em retrato ≤ 540 px, moldura conta como casa da beirada (`cellAt` por
  geometria) e duplo toque tolera o 2º toque na vizinha (`DOUBLE_TAP_SLOP`). Próximo passo possível: zoom/pan.
- 1ª abertura de um infinito pode levar 5–10 s no celular se o prefetch não terminou.
- Nada testado em **aparelho real** (D3); sons nunca ouvidos por humano em teste.
- Painel 🎚️: os valores padrão das variáveis ainda são chute; o CSS "Antigo" (`data-legacy-*`) é temporário e
  deve sair quando o dono mandar os valores escolhidos (A12).
- `data-lite` pode ligar no Moto G55 (deviceMemory pode reportar 4): confirmar se o visual sem enfeites agrada.
- `fullCode.md` é um dump gerado (212 KB) e pode estar desatualizado.

## 9. Roadmap — status

Legenda: ✅ feito · 🟡 parcial · ⬜ a fazer. **P0** bloqueia lançamento · **P1** polimento · **P2** depois.

### A. Arquitetura e performance
| ID | Item | Status | Notas |
|---|---|---|---|
| A1 | Solução única garantida | ✅ | `repairToUnique` |
| A2 | Geração em Worker | ✅ | treino 9×9+, infinitos, diário |
| A3 | Unificar solvers duplicados | ✅ | aba Resolve Nível usa `E.searchSolutions` |
| A5 | Modularizar `script.js` | ⬜ P1 | ~2200 linhas; candidatos: Tutorial, Resolve Nível, menu/abas, diário |
| A6 | Consolidar CSS | 🟡 | redesign reescreveu o CSS; checar sobras |
| A9 | Testes automatizados | 🟡 | `tests.html` (motor, packs, curva, infinito, diário, progresso, dicas); ⬜ testes de UI versionados (hoje só script Playwright ad hoc) |
| A11 | Packs 101–300 pré-gerados (infinito instantâneo) | ⬜ P2 | o infinito é determinístico: dá para gerar offline |
| A12 | Renderização leve no celular | 🟡 | arrasto e menu fluidos no aparelho fraco (25/10/2026); ⬜ fixar os valores do painel 🎚️ e remover o CSS `data-legacy-*` |

### B. Game loop e retenção
| ID | Item | Status | Notas |
|---|---|---|---|
| B1–B3, B5, B6 | Save, mapa+estrelas, timer/recorde, retomada, próximo nível | ✅ | |
| B4 | Pontuação | ✅ | por gato + combo; `totalScore` sem uso além de exibir |
| B8 | **Desafio diário + sequência** | ✅ | 25/10/2026: `generateDaily`, `Progress.daily`, cartão em Níveis, botão no menu |
| B9 | Dicas | ✅ | Dica que ensina (C14) + power-ups com anúncio recompensado |
| B10 | Custo para "Revelar solução" | ⬜ P1 | |
| B11 | Estatísticas / conquistas / meta para estrelas e pontos | ⬜ P1 | ideia: coleção de gatos/temas desbloqueados com estrelas |
| B12 | Slots de progresso por nível | ⬜ P1 | `inProgress` → mapa |
| B13 | **Desfazer** | ✅ | 25/10/2026: ✕ e "Limpar"; botão + Ctrl/Cmd+Z |
| B14 | Save no meio do diário | ⬜ P2 | |

### C. UX/UI
| ID | Item | Status | Notas |
|---|---|---|---|
| C1–C3, C5 | ✕ imediato + duplo toque, sons, vibração, sem flash | ✅ | |
| C4 | Animações (gato senta, patinha cai, onda, vitória) | ✅ | |
| C6 | Bordas grossas entre regiões | ❌ | rejeitado pelo dono |
| C7 | Modo daltônico | 🟡 P1 | cozy tem estampa por região; night não; avaliar símbolos opcionais |
| C8 | Acessibilidade: teclado no tabuleiro, `role/aria` nas casas | ⬜ P1 | menu já tem foco preso e Esc |
| C9 | Marca única | ✅ | **MeowColor** (chaves de storage mantêm `miaucolor`) |
| C10 | Ferramentas dev atrás de `?dev` | ✅ | |
| C11 | Tutorial guiado | ✅ | 3 lições |
| C12 | Ajustes (som, vibração, tema, idioma) | ✅ | no menu ⋯ |
| C13 | Realce de conflitos | ⬜ P2 | pode conflitar com a validação por duplo toque |
| C14 | Dica que ensina | ✅ | |
| C15 | Temas Aconchego / Noite | ✅ | |
| C16 | i18n PT/EN/ES | ✅ | |
| C17 | Zoom/pan no tabuleiro para 10×10 no celular | ⬜ P1 | só se o teste no G55 mostrar que 37 px por casa ainda é pouco |
| C18 | Menu e 10×10 no celular (layout) | ✅ | 25/10/2026: menu sem quebrar em 320–393 px; bandeja de borda a borda; toque tolerante |

### D. Distribuição
| ID | Item | Status | Notas |
|---|---|---|---|
| D1 | PWA | ❌ | removido (Poki); tag `pre-poki` |
| D2 | **Curva de dificuldade dos packs** | ✅ | 25/10/2026: cotas por tier/tamanho (§5.4) |
| D3 | Testar em iOS/Android reais | ⬜ P0 | duplo toque, safe-area, desempenho do 10×10, sons |
| D7 | Anúncios | ✅ | Poki SDK: intersticial entre partidas + recompensado nos power-ups |
| D8 | Login/nuvem/ranking | ⬜ P2 | exige backend |
| D9 | Telemetria de dificuldade | ⬜ P2 | |
| D10 | Submissão à Poki (QA, tamanho, tempo de carga) | ⬜ P0 | |

## 10. Próximas ações sugeridas

1. **D3** testar em aparelhos reais (o dono testa num **Moto G55**, viewport ≈ 393×873, pelo servidor local na rede:
   `python -m http.server 8765 --bind 0.0.0.0` → `http://<IP do PC>:8765/index.html`). Se o 10×10 ainda estiver
   difícil: zoom com pinça no tabuleiro (C17). **D10** checklist da Poki.
2. **C7** modo daltônico e **C8** teclado/acessibilidade no tabuleiro.
3. **B11** meta para estrelas/pontos (coleção, estatísticas); **B12** slots por nível; **B10** custo do Revelar.
4. **A5** modularizar `script.js`; **A9** versionar o teste de UI.
5. **A11** packs de infinitos pré-gerados.
6. **A12** receber os valores do "Copiar valores" do dono, fixar no `style.css` e apagar as chaves/CSS "Antigo".

## 11. Como verificar

- **Rodar:** abrir `index.html` (ou `python -m http.server 8765 --bind 127.0.0.1`). `?dev` para ferramentas.
- **Testes:** abrir `tests.html` (título `OK — N passaram, 0 falharam`; ~30 s, gera 10×10).
- **Packs:** `python tools/gen_levels.py --verify` (esperado `inválidos: 0`); regenerar: `python tools/gen_levels.py`
  (~10–15 min; sobrescreve `levels/`). Com saída UTF-8 no Windows: `PYTHONIOENCODING=utf-8`.
- **Smoke no console:** `playLevel(1)` → `solution.forEach((c,r)=>tryCat(r,c))` abre o modal de vitória;
  `playDaily()` idem para o diário; `Progress.dailyStreak`.
- **Resetar jogador:** apagar `localStorage["miaucolor:v1"]` e `["miaucolor:gen:v1"]`.

## 12. Prompt de retomada (cole em outra IA)

> Você está continuando o MeowColor (puzzle de gatos/regiões, HTML+CSS+JS puro, sem backend, alvo Poki) em
> `C:\Users\Mateus\Desktop\Fonts\Meowdoku` (repo git). Leia `AGENTS.md` e `MEMORY_PALACE.md` inteiros. Responda em
> pt-BR, conciso e crítico. Mantenha o duplo toque como confirmação do gato e o infinito (≥ 101 sempre 10×10).
> Sem Node: use Python 3.12 + Playwright para testar no navegador. Pegue o próximo item do §10, implemente de forma
> cirúrgica, valide no navegador e em `tests.html`, e atualize §9 e §13.

## 13. Changelog

- **Sessão 1:** auditoria; unicidade garantida; Worker; gerador offline + 100 níveis; duplo toque por `pointerup`;
  campanha (mapa, estrelas, timer, retomada); motor puro com paridade Python; infinito ≥ 101.
- **Sessão 2:** CSS mobile; `?dev`; sons/vibração; `tests.html`; PWA (depois removido).
- **Sessões 3+ (resumo do git log até `b96bd99`):** refatoração da FSM e bitmasks do solver; pontuação com combo;
  power-ups com anúncio recompensado; rebranding **MeowColor** + i18n PT/EN/ES; migração para **Poki** (remove
  PWA/AdSense, `commercialBreak`); segurança (validação do localStorage, sem `innerHTML`, CSP); performance
  (debounce do save, timer só na partida); redesign "almofada ao sol" → "colcha de retalhos" → "Mesa do gato";
  temas Aconchego/Noite; tutorial guiado em 3 lições; Dica que ensina o raciocínio.
- **25/10/2026:**
  - Memory Palace reescrito com o estado real (estava parado na sessão 2).
  - **D2** curva de dificuldade: `tools/gen_levels.py` com cotas de tier por tamanho; packs regenerados; teste da
    curva em `tests.html`.
  - **B13** Desfazer (✕ e "Limpar"), botão na barra + Ctrl/Cmd+Z.
  - **B8** Desafio diário + sequência (`engine.generateDaily`, `Progress` v8 `daily`, cartão em Níveis, botão no
    menu, modal com sequência).
  - Correção: vencer treino/diário apagava a partida salva da campanha (`lockBoard` limpava qualquer save).
  - Menu: botão do diário em linha própria (tinha empurrado "Novo jogo" para a coluna estreita); abas sem quebrar
    em 320 px; em ≤ 360 px os botões da partida perdem o ícone e os ajustes viram uma coluna.
  - Celular/10×10: bandeja de borda a borda em retrato ≤ 540 px e moldura mais fina (casa 33 → 37 px no G55);
    `cellAt` por geometria (moldura = casa da beirada); duplo toque aceita o 2º toque a até meia casa do 1º.
  - Commits na `main` com push: `1ab5a5d` (curva dos níveis), `0718cb1` (desfazer, diário, celular),
    `35f7c67` (Memory Palace).
  - **A12** renderização leve (`7d61455`): textura sem blend, sem `filter` nas peças/✕/região acesa, onda por
    opacity, `pop-x` só no ✕, arrasto sem reflow (+ `getCoalescedEvents`), menu sempre montado sem blur, modo leve
    automático e painel 🎚️ no `?dev`. Dono confirmou no aparelho fraco: arrasto e menu melhoraram.
