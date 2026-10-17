# MiauColor — Memory Palace (contexto para qualquer agente/LLM)

> **Como usar este arquivo:** leia inteiro antes de tocar no código. Ele é a fonte de verdade do estado do
> projeto, das decisões do dono e do roadmap. **Ao terminar qualquer tarefa, atualize as seções
> "Roadmap" (status) e "Changelog de sessão" no fim.** Escrito em pt-BR; o dono conversa em pt-BR.

**TL;DR (EN):** MiauColor is a static, no-backend logic puzzle (LinkedIn-Queens-like: one cat per row, column and
color region; cats can't touch, even diagonally). Vanilla HTML/CSS/JS. A campaign of 100 pre-generated levels
(5×5…10×10) followed by *infinite* seeded 10×10 levels with varying difficulty. Progress in localStorage.
Remaining work: audio/haptics, visual polish, accessibility, PWA, real-device testing, tests, relabeling.

---

## 1. Papel e pedido original do dono

O dono pediu uma **auditoria Product Manager + Tech Lead sênior** para transformar o protótipo em produto
polido (PWA ou empacotamento mobile). Áreas: (1) Arquitetura/Performance, (2) Game Loop/Retenção,
(3) UX/UI/Polimento, (4) Escopo MVP vs v1.0. Depois pediu para **implementar** os itens, um a um.

**Preferências do dono (respeite):**
- Responder em **português (pt-BR)**, de forma **concisa, direta e crítica**; ser honesto sobre limitações.
- **O duplo clique/duplo toque é a mecânica de confirmação do gato e deve ser mantido** (validação em tempo
  de execução, sem botão "finalizar"). Já foi implementado de forma confiável em toque (ver §5).
- O jogo deve ser **infinito**: após o nível 100, sempre **10×10**, com dificuldade variável.
- Não precisa de backend (jogo estático). Login/nuvem/ranking ficam para depois da v1.0.
- O dono mencionou que a assinatura de tokens do contexto anterior estava acabando → este documento existe
  para continuidade.

## 2. Regras do jogo (domínio)

Tabuleiro N×N com N regiões coloridas. Colocar **exatamente 1 gato por linha, por coluna e por região**;
gatos **não podem se tocar, nem na diagonal**. Todo nível tem **solução única**.

Interação (campanha e treino):
- **Toque/clique simples** na célula → alterna ✕ **imediatamente** (sem atraso).
- **Dois toques na mesma célula em ≤ 300 ms** (`DOUBLE_TAP_MS`) → desfaz o ✕ do 1º toque e **tenta colocar o
  gato**: confere com `solution`; acerto fixa o gato, erro = −1 vida (3 vidas) e célula vira ✕ vinho (mark=3).
- **Arrastar** marca/apaga vários ✕ (o 1º quadrado define o modo).
- Vitória quando N gatos corretos. Derrota quando as vidas acabam.

## 3. Ambiente e restrições de trabalho

- **Windows**, shell PowerShell (sem `&&`/`||`). Caminhos com `\`.
- **Node NÃO está instalado.** **Python 3.12 está** (`python`). Não há suíte de testes automatizada.
- Projeto em `c:\Users\Mateus\Desktop\fonts\miaucolor\` (não é repositório git). Pastas vizinhas (`Camera/`,
  `finanças/`) **não** fazem parte do MiauColor.
- Arquivos `index.html`, `script.js`, `style.css` começam com **BOM UTF-8** — edições pontuais funcionam; não
  regrave o arquivo inteiro sem preservar a codificação UTF-8.
- Ferramentas de edição: alterar arquivos só via ferramentas de edição/criação (não por redirecionamento de shell).
- **Como foi testado:** ferramenta de browser (Playwright) abrindo `file:///…/miaucolor/index.html`,
  executando JS com `page.evaluate`. Em viewport estreita o layout vira `body.compact` e os controles
  (`#size`, `#new`…) vão para o menu suspenso → **não são "visíveis"**; dispare por JS
  (`s.value="10"; s.dispatchEvent(new Event("change"))`).
- ⚠️ **Armadilha de teste:** `Progress` guarda os dados em memória e `persist()` roda em `visibilitychange`.
  Ao preparar `localStorage` por script, **neutralize antes** (`window.persist = () => {}`) ou a página antiga
  sobrescreve seu estado ao recarregar.
- Apps abertos no navegador de teste podem estar com estado velho; sempre `reload` após editar arquivos.

## 4. Mapa de arquivos (`miaucolor/`)

| Arquivo | Papel |
|---|---|
| `index.html` | Estrutura: sidenav + abas (**Jogar**, **Níveis**, **Resolve Nível**, **Guia Help**, **Documentação Algorítmica**), painel do jogo (sidebar + `#board`), modal. Ordem dos scripts: `engine.js` → `infinite.js` → `levels.js` → `levels/manifest.js` → `progress.js` → `script.js`. |
| `style.css` | Estilos. Vários blocos de override empilhados (layout tela cheia → menu lateral → responsivo/compact). Final do arquivo: campanha (info do nível, timer, mapa, modal). |
| `script.js` | Jogo: estado, `buildBoard`, entrada por ponteiro, `tryCat`, vidas, modal, timer, `playLevel`, `newGame`, mapa de níveis, aba "Resolve Nível" (solver do usuário), menu compacto, boot. **Monolito de UI** (ainda não modularizado). |
| `engine.js` | **Motor puro** `createEngine()` (sem DOM): PRNG com seed, geração, unicidade, solver lógico/dificuldade, geração infinita. Também `spawnEngineWorker(handlerSrc)` (Worker via Blob com o motor embutido via `toString()`; funciona em `file://`). |
| `infinite.js` | `InfiniteLevels`: cache em localStorage, geração em Worker, prefetch dos próximos níveis. |
| `levels.js` | `MiauLevels`: registro/carregamento de packs (`<script>` dinâmico), `get(id)`, `loadAll()`, `isInfinite/needsGeneration`, `setMeta`. |
| `levels/` | `pack-01..05.js/.json` (20 níveis cada), `manifest.js/.json`. **Gerados** por `tools/gen_levels.py`. |
| `audio.js` | `Sound`: sons sintetizados (Web Audio, sem arquivos) + `navigator.vibrate`; chaves persistidas em `miaucolor:settings:v1`; áudio só após 1º gesto. |
| `sw.js` | Service worker: pré-cache do app shell + packs (`PRECACHE` é uma **lista fixa** — atualize se mudar a lista de arquivos/packs) e stale-while-revalidate. **Incremente `CACHE`** ao publicar mudanças que precisem invalidar. Só registra em http(s). |
| `manifest.webmanifest`, `icons/` | PWA: nome, cores, ícones 192/512 (any+maskable) e `apple-touch-icon`. Ícones gerados por `tools/gen_icons.py` (Python puro). |
| `tests.html` | Testes automatizados no navegador (sem Node), com `localStorage` em memória. Abra o arquivo; título da aba vira `OK — N passaram…`; `window.__testResults`. ~20 s (2 testes geram 10×10). |
| `progress.js` | `Progress`: estrelas, melhor tempo, nível desbloqueado, partida em andamento. |
| `tools/gen_levels.py` | Gerador offline (Python), classifica dificuldade, escreve packs e valida (`--verify`). |
| `README.md` | Doc de usuário/dev (atualizado). |
| `Instructions` | Texto original do dono (conversa sobre Exact Cover/backtracking). Marca "Meowdoku". |
| `MEMORY_PALACE.md` | Este arquivo. |

## 5. Arquitetura e fluxos (o que o código faz hoje)

### 5.1 Estado global em `script.js`
`N`, `solution[r]=c`, `regions[r][c]=id`, `marks[r][c]` (0 vazio, 1 ✕, 2 gato, 3 erro), `lives`, `over`,
`lost` (trava "mesmo nível" **só no treino**), `generating`, `devMode`, `cheated` (dev usado → não conta
progresso), `campaignId` (null = treino livre), `currentLevel`, `cells[][]` (DOM), timer
(`elapsedMs`, `tickStart`).

### 5.2 Funções-chave (`script.js`)
- Entrada: handlers `pointerdown/move/up` em `#board` (delegação; **sem** listeners por célula). `lastTap`
  implementa o duplo toque. `endDrag` persiste se houve arraste.
- `tryCat(r,c)` valida contra `solution`; `win()`, `gameOver()`, `lockBoard()` (pausa timer + limpa
  progresso salvo), `showModal(emoji,title,text,label,action,[label2,action2])`, `showLevels()`.
- `resetBoard()` (reseta marks/vidas/timer/`cheated=devMode`), `retryLevel()`, `newGame()` (**treino livre**;
  zera `campaignId`; 9×9+ via `generateLevelAsync` → Worker), `playLevel(id, resume=true)` (campanha; pack ou
  infinito; mostra "⏳ Gerando nível…" se precisar gerar; restaura partida salva), `startCampaign(id)`,
  `prefetchInfinite(id)`.
- Mapa: `renderLevelMap()`, `levelButton()`, `levelGroup()`; seção "∞ Infinito" mostra os últimos 60 liberados.
- Timer: `timerStart/Pause/Reset/Elapsed`, pausa em `visibilitychange` e ao sair da aba **Jogar**.
- `persist()` salva a partida em andamento (**um único slot**, só campanha, não se `cheated`).
- Estrelas: `starsFor(errors)=max(1,3-errors)`; texto `starText`.
- Modo Dev (checkbox na sidebar): vidas infinitas, auto-✕, "achar um gato". **Ainda visível ao jogador.**
- Aba "Resolve Nível": o usuário pinta um mapa e `findSolutions` (backtracking) mostra os gatos. Duplica
  lógica do motor (candidato a unificar).

### 5.3 Motor (`engine.js`)
- `rngFor(str)` = FNV-1a + mulberry32 → **determinístico**.
- `placeCats` (backtracking) → `growRegions` (flood fill sorteado; `locked` = regiões que não crescem) →
  `countSolutions` → `repairToUnique` (busca local: move células de borda entre regiões vizinhas mantendo
  conexidade, aceita se #soluções não aumenta; `cap=50`, `maxIter=4000`) → `generateUnique`.
- `gradeLevel(n, reg, solution)` → `{tier, score, steps{1..4}, opening}` ou `null` (se exigir chute).
  Tiers: **1** única célula possível; **2** região presa a linha/coluna (e inverso); **3** k regiões em k
  linhas/colunas, k=2,3 (e inverso); **4** eliminação por contradição. `score = s1 + 3·s2 + 8·s3 + 15·s4`.
  Paridade **exata** com a versão Python (100/100 níveis).
- `generateInfinite(id)`: seed `"miaucolor:inf:"+id+":"+attempt`; tenta até o mapa ser resolvível por lógica;
  rótulo por score (`difficultyLabel`): **Fácil ≤16, Médio ≤40, Difícil ≤80, Expert >80**.

### 5.4 Níveis
- **Packs (1–100):** 10×(5×5), 15×(6×6), 25×(7×7), 25×(8×8), 15×(9×9), 10×(10×10); ordem por tamanho e score.
  Gerados em **Python** com `random.Random(f"miaucolor:{n}:{slot}:{attempt}")` — **RNG diferente do JS**:
  os packs não são reproduzíveis pelo motor JS (só a classificação é idêntica).
- **Infinitos (≥101):** sempre 10×10, determinísticos por id, cache em `localStorage` (`KEEP=300`),
  prefetch `AHEAD=3` a partir de `max(id, unlocked, total)` quando `id ≥ total-10`.
- Formato de nível no pack: `{ "id":1, "n":5, "tier":1, "score":10, "diff":"Fácil", "regions":"AABB…" (n² letras
  A.., row-major), "solution":[col por linha] }`. Pack: `{ "pack":k, "levels":[…] }`; `.js` chama
  `MiauLevels.register(pack)`. Manifest: `MiauLevels.setMeta({packs,total,packSize})`.

### 5.5 Persistência (localStorage)
- `miaucolor:v1` → `{ v:1, stars:{id:1..3}, best:{id:segundos}, unlocked:id, inProgress:{id,marks,lives,elapsed}|null }`.
- `miaucolor:gen:v1` → `{ id: [regionsString, solutionDigits, tier, score, diff] }` (só infinitos).
- `miaucolor:settings:v1` → `{ sound:bool, haptics:bool }`.
- **Modo desenvolvedor:** `index.html?dev` mostra Modo Dev, aba Resolve Nível e Documentação (`[data-dev]`,
  `body.dev-ui`). Sem `?dev` ficam ocultos.

## 6. Evidências medidas (não refazer sem necessidade)

- **Bug original:** o gerador antigo (300 tentativas) **nunca** achava nível único a partir de 7×7
  (5×5: 35 tentativas médias; 6×6: 10/20 caíam no fallback; 7×7+: 20/20). Níveis 7×7 chegavam a
  **mediana de 75 soluções válidas** e o jogo validava contra um gabarito único. **Corrigido.**
- **Reparo:** 5×5–8×8 100% únicos; 9×9 ~9/10 e 10×10 ~6/10 por rodada de reparo (por isso o laço externo).
- **Tempos JS (Chrome headless, `repair maxIter=4000, cap=50`)**: 7×7 mediana 6 ms; 8×8 56 ms; 9×9 ~330 ms;
  10×10 ~2 s mediana, pior caso 9–10 s (+ gradeLevel). Menos iterações pioram muito; `cap=50` foi o melhor.
  Em amostra de níveis infinitos: ~5 s/nível em média.
- **Distribuição natural 10×10** (19 amostras): ~35% Fácil, 25% Médio, 20% Difícil, 15% Expert, ~5% exigem
  chute. Pistas de abertura (regiões 1×1, região em 1 linha, 2-em-2, 3-em-3) **correlacionam fraco** com
  dificuldade; o que decide é o score do solver.
- **Packs 1–100 por tier atual:** 6 Fácil, 31 Médio, 8 Difícil, **55 Expert** (escala desbalanceada; tier 4
  domina níveis grandes).
- Nível em cache abre em ~7 ms.

## 7. Decisões já tomadas (não reverter sem falar com o dono)

1. Duplo toque confirma o gato; toque simples marca ✕ sem delay; detecção via `pointerup` (não `dblclick`).
2. Validar jogada com `solution` é correto **porque** a unicidade é garantida em todos os níveis.
3. Campanha linear com desbloqueio, 3 estrelas por erros (0/1/≥2), melhor tempo, retomada de partida.
4. ≥101: infinito, 10×10, seed por id, classe de dificuldade **emergente** (sem rejeição por classe: custaria
   vários 10×10 ≈ 5 s cada).
5. Packs como `<script>` (`.js`) para funcionar em `file://`; `.json` existe para PWA/fetch futuro.
6. Treino livre ("Novo jogo") não conta para a campanha; mantém a trava "mesmo nível após derrota".
   Na campanha a derrota oferece "Tentar o mesmo nível" / "Níveis".
7. Sem backend. Hospedagem estática basta (PWA exige https ou localhost).

## 8. Armadilhas e limitações conhecidas

- `Progress.save()` regrava o objeto inteiro em memória (abas simultâneas se sobrescrevem).
- **Um slot** de partida em andamento: abrir outro nível troca/perde o anterior.
- Reabrir nível já concluído começa do zero; estrelas só sobem.
- `Limpar` apaga também gatos já fixados; "Revelar solução" é grátis e encerra a partida (sem custo/registro).
- Abas "Guia Help" e "Níveis" ficam no menu principal; **Guia Help** foi mantido de propósito (guia de estratégias para o
  jogador; deve ser substituído pelo tutorial C11).
- `Instructions` (nota original do dono) ainda cita "Meowdoku" — mantido de propósito.
- Células são `div` sem `role`/`tabindex`/`aria-*`; modal sem foco/Esc; cores parecidas na `PALETTE`
  (`#b9d3e4`/`#8ed6f5`, `#de5959`/`#e0689a`, `#fccd3c`/`#ffbb77`); o dono rejeitou a borda grossa entre regiões (C6),
  então o modo daltônico (C7) é o caminho.
- O CSS ainda tem blocos de override empilhados (layout tela cheia → menu lateral → responsivo/compact).
- Os sons são sintetizados (timbres simples): **nunca ouvidos por um humano durante os testes** (só verificado por
  contagem de osciladores/vibrações). Vale ajustar timbre/volume em aparelho real.
- Células 10×10 em tela de 360 px ≈ 32 px (abaixo de 44 px recomendados).
- Primeira geração de um nível infinito pode levar ~5 s (PC) se o prefetch não terminou; em celular provavelmente mais.
- O 10×10 infinito gera em Worker, mas o pior caso do reparo chega a ~10 s.
- Variável global `solution` acessível pelo console (aceito: jogo offline).
- Nada testado em **aparelho real** (iOS/Android); testes foram com mouse e viewport pequena no Chrome.

## 9. Roadmap — status

Legenda: ✅ feito · 🟡 parcial · ⬜ a fazer. Prioridade: **P0** bloqueia v1.0 · **P1** polimento v1.0 · **P2** pós-v1.0.

### A. Arquitetura e performance
| ID | Item | Status | Notas |
|---|---|---|---|
| A1 | Garantir solução única (reparo) e validar por regras | ✅ | `repairToUnique` no motor |
| A2 | Geração fora da thread principal (Worker) | ✅ | `spawnEngineWorker`, 9×9+ no treino e infinitos |
| A3 | Unificar solvers duplicados | 🟡 P1 | `engine.countSolutions` vs `findSolutions` (aba Resolve Nível) em `script.js` |
| A4 | Delegação de eventos no tabuleiro | ✅ | pointer events no `#board` |
| A5 | Modularizar `script.js` | 🟡 P1 | extraídos: engine/progress/levels/infinite; falta separar UI do jogo, solver tab, layout/menu |
| A6 | CSS: consolidar overrides, remover hack `100vmax`, `@media (hover:hover)`, `touch-action: manipulation`, `-webkit-tap-highlight-color`, `viewport-fit=cover` + `env(safe-area-inset-*)` | 🟡 | ✅ hack 100vmax→`::after`, hover só com mouse, touch-action, tap-highlight, safe-area, viewport-fit; ⬜ consolidar os blocos de override |
| A7 | Estrutura p/ centenas de fases (packs, manifest, loader sob demanda) | ✅ | |
| A8 | Níveis infinitos determinísticos + cache + prefetch | ✅ | |
| A9 | Testes automatizados (paridade solver, unicidade, determinismo, regressão de UI) | 🟡 | ✅ `tests.html` (13 testes: motor, 100 níveis, infinito, progresso); ⬜ testes de UI/fluxo (estrelas, retomada, modal) |
| A10 | Service worker pré-cacheando `levels/*` | ✅ | `sw.js`; verificado offline em http://localhost |

### B. Game loop e retenção
| ID | Item | Status | Notas |
|---|---|---|---|
| B1 | Salvar progresso (localStorage versionado) | ✅ | `progress.js` |
| B2 | Mapa de níveis + estrelas + desbloqueio | ✅ | aba **Níveis** |
| B3 | Cronômetro + melhor tempo | ✅ | pausa ao ocultar/sair da aba |
| B4 | Pontuação numérica | 🟡 P1 | hoje só estrelas/tempo; definir fórmula (`base − tempo − erros·k`) se desejado |
| B5 | Retomar partida em andamento | ✅ | 1 slot (limitação §8) |
| B6 | Transição "Próximo nível" | ✅ | modal com estrelas/tempo/recorde |
| B7 | Corrigir trava pós-derrota | 🟡 | ✅ campanha; treino mantém trava por escolha original — confirmar com o dono |
| B8 | Desafio diário + streak | ⬜ P1/P2 | fácil com o motor: seed `daily:YYYYMMDD` |
| B9 | Dicas (custo/limite) | ⬜ P2 | "Achar um gato" do Modo Dev é o embrião |
| B10 | Custo/registro para "Revelar solução" | ⬜ P1 | |
| B11 | Estatísticas (níveis, tempo médio, streak) | ⬜ P2 | |
| B12 | Slots de progresso por nível (não perder ao trocar) | ⬜ P1 | `inProgress` → mapa `{id: …}` |

### C. UX/UI e polimento
| ID | Item | Status | Notas |
|---|---|---|---|
| C1 | Toque simples ✕ imediato + duplo toque confirma | ✅ | decisão do dono |
| C2 | Sons (tap/gato/erro/vitória/derrota) + mute | ✅ | `audio.js`; botão "🔊 Som" persistente; só após 1º gesto |
| C3 | Háptica (`navigator.vibrate`) + chave | ✅ | botão "📳 Vibração" persistente |
| C4 | Animações: gato pula, coração quebra, confete/estrelas na vitória | ⬜ P1 | |
| C5 | Remover flash de tela cheia; `prefers-reduced-motion` | ✅ | `body.flash` removido; erro = realce `::after` |
| C6 | Bordas grossas entre regiões | ⬜ | **implementado e revertido a pedido do dono** (não gostou do visual; commit `bde0cdd` tinha a versão com bordas). Não reintroduzir sem pedir; para daltonismo usar o modo C7 (ícones/números) |
| C7 | Modo daltônico (ícones/números por região) + paleta com distância perceptual | ⬜ P1 | |
| C8 | Acessibilidade: `role/tabindex/aria`, teclado, foco/Esc no modal | ⬜ P1 | |
| C9 | Unificar nome/marca (MiauColor) e README/comentários | ✅ | `Instructions` mantido (nota do dono) |
| C10 | Esconder Modo Dev e tirar Resolve Nível/Docs do menu principal (flag `?dev`) | ✅ | **Guia Help** mantido (decisão de PM; vira tutorial em C11) |
| C11 | Tutorial interativo (3 níveis) substituindo "Guia Help" | ⬜ P1 | |
| C12 | Tela de configurações (som, háptica, tema, daltonismo) | ⬜ P1 | |
| C13 | Realce de conflitos em tempo real | ⬜ P2 | ⚠️ pode conflitar com a mecânica de validação por duplo toque; discutir antes |

### D. Escopo v1.0 / distribuição
| ID | Item | Status | Notas |
|---|---|---|---|
| D1 | PWA: `manifest.webmanifest`, ícones 192/512, `theme-color`, service worker | ✅ | verificado: SW ativo, 19 arquivos em cache, recarga e vitória **offline**; ⚠️ instalação em aparelho real não testada |
| D2 | Reclassificar dificuldade dos 100 níveis dos packs pelo mesmo score do 10×10 | ⬜ P1 | hoje 55% "Expert"; avaliar por tamanho |
| D3 | Testar em iOS e Android reais (duplo toque, safe-area, performance do 10×10) | ⬜ P0 | |
| D4 | Mais packs/curadoria (campanha curada além de 100) | ⬜ P2 | infinito já cobre |
| D5 | Hospedagem estática (GitHub Pages/Netlify/…) | ⬜ P0 | **ação do dono**: repo `mateusesteves223/miaucolor` → Settings → Pages → Deploy from branch `main` / root. O app usa caminhos relativos (funciona em subpasta). |
| D6 | Empacotar com Capacitor (Android/iOS) | ⬜ P2 | |
| D7 | Anúncios recompensados, IAP, remover anúncios | ⬜ P2 | |
| D8 | Login/nuvem, ranking, compartilhar nível por código | ⬜ P2 | exige backend (só aqui) |
| D9 | Analytics/telemetria de dificuldade (tempo/erros por nível) | ⬜ P2 | |

## 10. Próximas ações sugeridas (ordem recomendada)

(Concluídos: CSS mobile, áudio/háptica, marca/`?dev`, `tests.html`, PWA/service worker — ver §9 e §13.)

1. **D5** publicar (ação do dono: GitHub Pages) e validar a instalação do PWA em aparelhos reais (**D3**).
2. **D2** reclassificação dos packs; **B12** slots por nível; **B10** custo de "Revelar solução".
3. **C8** acessibilidade (roles/aria, teclado, foco/Esc no modal) e **C7** modo daltônico.
4. **A9 (resto)** testes de fluxo de UI; **A3/A5** unificar solvers e modularizar `script.js`.
5. **C4** animações de vitória/erro; **C11** tutorial; **C12** tela de configurações.
6. **D3** teste em aparelhos reais (duplo toque, safe-area, timbre/volume dos sons, desempenho do 10×10) e ajuste de
   `DOUBLE_TAP_MS`/tamanho de célula.

## 11. Como verificar o projeto (receitas)

- **Rodar:** abrir `index.html` (ou `python -m http.server 8765 --bind 127.0.0.1` na pasta e `http://127.0.0.1:8765`;
  o service worker só registra em http/https).
- **Testes:** abrir `tests.html` (esperado: título `OK — 13 passaram, 0 falharam`, ~20 s).
- **Regerar ícones:** `python tools\gen_icons.py`. **Ao mudar arquivos do app ou os packs**, atualize `PRECACHE` e
  incremente `CACHE` em `sw.js`.
- **Revalidar packs:** `python tools\gen_levels.py --verify` (esperado: `inválidos: 0`).
- **Regenerar packs (≈8 min):** `python tools\gen_levels.py` (sobrescreve `levels/pack-*` e `manifest.*`).
- **Smoke no navegador** (console da página): 
  `playLevel(1)` → `solution.forEach((c,r)=>tryCat(r,c))` deve abrir o modal "Nível concluído!";
  `createEngine().generateInfinite(101).regions === E.encodeRegions(regions)` após `await playLevel(101)`
  deve ser `true`; `findSolutions(N, regions, 3).count === 1`.
- **Estado do jogador:** `localStorage["miaucolor:v1"]`, `localStorage["miaucolor:gen:v1"]` (apagar para resetar).

## 12. Prompt de retomada (cole em outra IA)

> Você está continuando o projeto MiauColor (puzzle de gatos/regiões, HTML+CSS+JS puro, sem backend) em
> `c:\Users\Mateus\Desktop\fonts\miaucolor\`. Leia `MEMORY_PALACE.md` por completo. Responda em pt-BR, de forma
> concisa e crítica. Mantenha o duplo toque como confirmação do gato e o jogo infinito (≥101 sempre 10×10).
> Não há Node; use Python 3.12 e o navegador (Playwright) para testar. Pegue o próximo item **P0** do §10,
> implemente de forma cirúrgica, **valide no navegador**, e então atualize o status no §9 e o §13 deste arquivo.

## 13. Changelog de sessão (acrescente ao final)

- **Sessão 1 (auditoria + implementação):**
  - Auditoria completa entregue (4 áreas) com benchmarks do gerador.
  - ✅ Unicidade garantida (reparo) · ✅ Worker p/ tamanhos grandes · ✅ gerador offline + 100 níveis + loader.
  - ✅ Duplo toque por `pointerup` + ✕ imediato.
  - ✅ Campanha: mapa, estrelas, timer, progresso, retomada, próximo nível, fluxo de derrota.
  - ✅ Motor puro `engine.js` (seed, solver lógico, dificuldade) com paridade 100/100 vs Python.
  - ✅ Níveis infinitos ≥101 (10×10, determinísticos, cache, prefetch, mapa "∞").
  - ✅ README atualizado e este Memory Palace criado.
  - Pendente: tudo marcado ⬜ no §9 (foco imediato: C5, C6, A6, C2, C9, C10, A9, D1).
- **Sessão 2 (retomada a partir do commit `66cc01c` do GitHub):**
  - Contexto: alterações locais não commitadas de outro agente foram guardadas em `git stash` (não aplicadas;
    `git stash list`) a pedido do dono ("reverter para o GitHub"). Não dê `stash pop` sem falar com o dono.
  - ✅ CSS mobile (commit `bde0cdd`): realce via `::after`, sem flash de tela,
    `prefers-reduced-motion`, hover só com mouse, `touch-action`, tap-highlight, safe-area, `viewport-fit=cover`.
  - ✅ Marca única MiauColor + ferramentas de dev atrás de `?dev` (commit `dd39627`).
  - ✅ Sons e vibração com chaves persistentes (`audio.js`), verificados por contagem de osciladores/vibrações.
  - ✅ `tests.html` (A9 parcial): 13 testes passando (paridade solver com os 100 níveis, unicidade, determinismo,
    progresso com `localStorage` em memória). Commit `c8c1fe9`.
  - ✅ PWA (D1/A10): `manifest.webmanifest`, ícones gerados em Python puro, `sw.js` (offline verificado).
  - Pendente (foco imediato): D5 (publicar — ação do dono) + D3 (aparelhos reais), D2, B12, B10, C8, C7, A3/A5.
