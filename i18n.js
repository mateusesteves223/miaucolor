"use strict";

/* Internacionalização (pt | en | es) sem dependências.
 *  - I18n.t(chave, params): busca no dicionário do idioma atual (fallback: pt) e interpola "{nome}".
 *  - I18n.detect(): escolhe o idioma a partir de navigator.languages / navigator.language.
 *  - I18n.apply(raiz): traduz o DOM estático via atributos:
 *      data-i18n="chave"            -> textContent
 *      data-i18n-html="chave"       -> innerHTML (só use com textos deste arquivo, que são confiáveis)
 *      data-i18n-attr="attr:chave;attr2:chave2" -> atributos (aria-label, title, ...)
 * O módulo não toca em localStorage: quem o usa (script.js) lê/grava a preferência via Progress. */
const I18n = (() => {
  const LANGS = ["pt", "en", "es"];
  const FALLBACK = "en";                       // navegador em idioma não suportado
  const HTML_LANG = { pt: "pt-BR", en: "en", es: "es" };

  const DICT = {
    pt: {
      "app.name": "MeowColor",
      "app.title": "MeowColor",

      "rules.color": "Um gato por cor",
      "rules.line": "Um gato por linha e coluna",
      "rules.touch": "Os gatos não podem se encostar",

      "menu.open": "Abrir menu",
      "lang.group": "Idioma",
      "lang.pt": "Português",
      "lang.en": "English",
      "lang.es": "Español",

      "tab.game": "Jogar",
      "tab.levels": "Níveis",
      "tab.solver": "Resolve Nível",
      "tab.help": "Guia Help",
      "pwa.install": "📲 Instalar App (Jogar Offline)",
      "legal.aria": "Informações legais",
      "legal.privacy.link": "Política de Privacidade",
      "legal.terms.link": "Termos de Uso",
      "legal.contact.link": "Contato",
      "legal.close": "Fechar",

      "hud.level": "NÍVEL ATUAL",
      "hud.score": "PONTOS",
      "item.group": "Power-ups",
      "item.hint.label": "Dica",
      "item.hint.aria": "Dica inteligente",
      "item.revealCat.label": "Revelar Gato",
      "item.revealCat.aria": "Revelar gato",
      "item.safeCross.label": "3x Seguros",
      "item.safeCross.aria": "3 X seguros",
      "item.left": "{label}: {n} restantes",
      "item.empty": "{label}: esgotado. Assistir vídeo para ganhar +{n}",
      "item.recharged": "+{n} de {label} recarregados!",

      "ctrl.size": "Tamanho:",
      "ctrl.new": "Novo jogo",
      "ctrl.clear": "Limpar",
      "ctrl.sound": "🔊 Som",
      "ctrl.haptics": "📳 Vibração",
      "toggle.state": "{label}: {state}",
      "toggle.on": "ligado",
      "toggle.off": "desligado",
      "ctrl.lives": "Vidas",
      "ctrl.timer": "Tempo",
      "ctrl.board": "Tabuleiro",
      "ctrl.reveal": "Revelar solução",
      "ctrl.tapHint": "Clique: marca ✕<br>Duplo clique: coloca 🐱",
      "modal.aria": "Mensagem do jogo",

      "status.cats": "Gatos: {n}/{total}",
      "status.won": "🎉 Todos os gatos estão em paz!",
      "status.over": "💀 Game over",
      "status.generating": "⏳ Gerando nível…",
      "status.genFail": "Não foi possível gerar o nível",
      "status.revealed": "Solução revelada",

      "modal.levels": "Níveis",
      "modal.free.title": "Parabéns!",
      "modal.free.text": "Você resolveu o {app}!",
      "modal.free.btn": "Jogar novamente",
      "modal.win.title": "Nível concluído!",
      "modal.win.points": "Pontos: {n}",
      "modal.win.time": "Tempo: {t}",
      "modal.win.record": "🏅 Novo recorde!",
      "modal.win.next": "Próximo nível",
      "modal.over.title": "Fim de jogo",
      "modal.over.text": "Suas vidas acabaram. Tente novamente o mesmo nível!",
      "modal.over.retry": "Tentar o mesmo nível",
      "modal.recharge.title": "Itens esgotados",
      "modal.recharge.text": "Seus itens deste tipo acabaram! Assista a um vídeo curto para recarregar +{n} unidades",
      "modal.recharge.watch": "🎬 Assistir vídeo (+{n})",
      "modal.recharge.later": "Agora não",
      "ads.offline": "Sem conexão: não foi possível carregar o vídeo. Tente novamente online.",
      "ads.banner": "Publicidade",
      "ads.banner.aria": "Publicidade",
      "ads.video.aria": "Anúncio em vídeo",
      "ads.video.title": "🎬 Anúncio (simulação)",
      "ads.video.wait": "Recompensa em {n}s…",
      "ads.video.ready": "Pronto! Recompensa liberada.",
      "ads.video.claim": "Receber recompensa",
      "ads.video.close": "Fechar",

      "axis.row": "linha",
      "axis.rows": "linhas",
      "axis.col": "coluna",
      "axis.cols": "colunas",
      "list.and": "e",
      "unit.color": "a cor {name}",
      "unit.row": "a linha {n}",
      "unit.col": "a coluna {n}",
      "hint.single": "{Who} só tem uma casa válida: linha {r}, coluna {c}. Dê dois toques para pôr o gato.",
      "hint.regionLine": "A cor {color} só possui casas válidas na {axis} {n}. Marque ✕ nas casas das outras cores dessa {axis}.",
      "hint.lineRegion": "Na {axis} {n}, só a cor {color} tem casas válidas. Marque ✕ nas demais casas dessa cor.",
      "hint.regionSet": "As cores {colors} só possuem casas válidas nas {axes} {lines}. Nenhuma outra cor pode ter gato nelas: marque ✕.",
      "hint.lineSet": "As {axes} {lines} só possuem casas válidas nas cores {colors}. Essas cores não podem ter gato fora delas: marque ✕.",
      "hint.contradiction": "Se houvesse um gato na linha {r}, coluna {c}, {unit} ficaria sem nenhuma casa válida. Marque ✕ aqui.",
      "hint.none": "Sem dedução simples no momento. Tente Revelar Gato.",
      "hint.noSafe": "Não há mais casas livres sem gato para marcar.",

      "color.0": "Azul-gelo", "color.1": "Roxo", "color.2": "Laranja", "color.3": "Amarelo",
      "color.4": "Verde", "color.5": "Azul", "color.6": "Turquesa", "color.7": "Rosa",
      "color.8": "Marrom", "color.9": "Vermelho", "color.10": "Azul-céu", "color.11": "Magenta",
      "diff.easy": "Fácil", "diff.medium": "Médio", "diff.hard": "Difícil", "diff.expert": "Expert",

      "levels.title": "Níveis",
      "levels.total": "★ {stars} · 🏆 {score} pts",
      "levels.infinite": "∞ Infinito · 10×10",
      "levels.infiniteLast": "(últimos {n} de {total})",
      "levels.infiniteVar": "dificuldade variável",
      "level.aria": "Nível {id}",
      "level.locked": "bloqueado",
      "level.stars": "{n} de 3 estrelas",

      "solver.size": "Tamanho:",
      "solver.palette": "Paleta",
      "solver.paletteAria": "Paleta de cores",
      "solver.swatch": "Cor {n}",
      "solver.paletteHint": "Toque em uma cor para selecioná-la; deslize para ver as demais.",
      "solver.solve": "🐱 Resolver nível",
      "solver.draw": "Clique ou arraste para pintar o quadro com as cores do seu nível.",
      "solver.boardAria": "Quadro para pintar",
      "solver.painted": "Pintadas {n}/{total}",
      "solver.exact": "Use exatamente {n} cores (usadas: {used})",
      "solver.complete": "Quadro completo!",
      "solver.none": "Este quadro não tem solução. Confira as cores.",
      "solver.multi": "Há mais de uma solução; mostrando a primeira.",
      "solver.unique": "Solução única encontrada!",

      "pwa.promoTitle": "📲 Leve o {app} com você",
      "pwa.promo1": "⚡ Acesso rápido na tela inicial",
      "pwa.promo2": "📶 Economia de dados",
      "pwa.promo3": "✈️ Funciona 100% offline",
      "pwa.promoBtn": "Instalar grátis",
      "ios.title": "📲 Instalar no iPhone/iPad",
      "ios.intro": "Para instalar no seu iPhone/iPad:",
      "ios.step1": "Toque no botão <strong>Compartilhar</strong> no rodapé do Safari.",
      "ios.step2": "Selecione <strong>“Adicionar à Tela de Início”</strong>.",
      "ios.note": "Depois é só abrir o {app} pelo ícone na tela inicial, mesmo sem internet.",
      "ios.ok": "Entendi",

      "guide.title": "Guia de estratégias",
      "guide.intro": "Use as regras para eliminar possibilidades. Marque ✕ quando tiver certeza de que uma célula não pode receber gato; guarde seus palpites para quando a lógica não avançar.",
      "guide.summary": "<strong>Ordem prática:</strong> confira as regras de cada gato confirmado → procure cores com uma única opção → procure linhas ou colunas com uma única opção → aplique bloqueios, pares e interseções → só então avalie uma tentativa.",
      "g1.n": "01 · DEDUÇÃO",
      "g1.t": "Procure uma cor com poucas opções",
      "g1.p": "Uma região precisa receber exatamente um gato. Se só restar uma célula possível naquela cor, ela é obrigatória. Se restarem duas, mantenha as duas possibilidades até outra regra eliminar uma.",
      "g1.cap": "Exemplo: a região azul só pode usar uma destas casas.",
      "g1.aria": "Duas células candidatas na região azul",
      "g1.l1": "Região azul: 2 candidatas",
      "g2.n": "02 · BLOQUEIO",
      "g2.t": "Cor presa em uma linha ou coluna",
      "g2.p": "Se todas as posições possíveis de uma cor estão na mesma linha, essa linha já terá seu gato naquela região. Elimine com ✕ as outras cores nas demais casas da linha. A mesma lógica vale para uma coluna.",
      "g2.cap": "A região azul só cabe na linha destacada; as outras casas da linha ficam bloqueadas.",
      "g2.aria": "Candidatas da região azul e casas bloqueadas na mesma linha",
      "g2.l1": "Candidatas azuis",
      "g2.l2": "Outras cores eliminadas",
      "g3.n": "03 · PARES",
      "g3.t": "Duas cores reservam duas linhas",
      "g3.p": "Se duas cores só podem aparecer em duas mesmas linhas, elas ocuparão essas duas linhas — uma em cada. Nenhuma outra cor pode ficar nelas. Marque ✕ nas demais candidatas dessas linhas.",
      "g3.cap": "As regiões azul e dourada estão restritas às linhas A e B.",
      "g3.aria": "Duas linhas reservadas às regiões azul e dourada; candidatas de outras cores eliminadas",
      "g3.l1": "Azul",
      "g3.l2": "Dourada",
      "g3.l3": "Outras cores",
      "g4.n": "04 · INTERSEÇÃO",
      "g4.t": "Região alinhada com uma linha",
      "g4.p": "O raciocínio também funciona ao contrário: se, dentro de uma região, as candidatas estão todas na mesma linha ou coluna, essa linha ou coluna não pode receber outro gato daquela região fora dela.",
      "g4.cap": "As duas candidatas da região verde estão na linha; a candidata fora dela é impossível.",
      "g4.aria": "Duas candidatas verdes na mesma linha e uma candidata eliminada fora da região",
      "g4.l1": "Região verde alinhada",
      "g4.l2": "Eliminada pela interseção",
      "g5.n": "05 · VIZINHANÇA",
      "g5.t": "Use o espaço ao redor de um gato",
      "g5.p": "Depois de confirmar um gato, elimine as casas da mesma linha, coluna e cor. Também elimine as casas vizinhas, inclusive diagonais. Assim os gatos não se encostam.",
      "g5.cap": "Um gato bloqueia as casas ao redor (incluindo diagonais).",
      "g5.aria": "Gato no centro e casas vizinhas bloqueadas",
      "g5.l1": "Casas que não podem receber outro gato",
      "g6.n": "06 · ESCOLHA",
      "g6.t": "Se travar, priorize a região mais limitada",
      "g6.p": "Conte as candidatas que ainda restam para cada cor. Tente deduzir primeiro a cor com menos opções: cada exclusão afeta linhas, colunas, regiões e vizinhanças. Isso é uma heurística, não uma garantia de que uma casa isolada seja mais provável.",
      "g6.note": "<strong>Importante:</strong> não escolha só pela aparência ou por “chance”. As candidatas não têm necessariamente probabilidades iguais; prefira uma dedução que respeite todas as regras.",

      "legal.privacy.title": "Política de Privacidade",
      "legal.terms.title": "Termos de Uso",
      "legal.contact.title": "Contato",
      "legal.privacy.body": `
        <p><small>Última atualização: 18/10/2026</small></p>
        <p>O <strong>{app}</strong> respeita a sua privacidade e foi feito para coletar o mínimo possível, em conformidade com a Lei Geral de Proteção de Dados (LGPD, Lei nº 13.709/2018).</p>
        <h3>Armazenamento local</h3>
        <p>O jogo usa o <code>localStorage</code> do seu navegador apenas para salvar o progresso neste aparelho: estrelas, pontos, níveis concluídos, itens (power-ups) e preferências de idioma, som e vibração. Esses dados <strong>não são enviados</strong> a nenhum servidor nosso e podem ser apagados a qualquer momento limpando os dados do site no navegador.</p>
        <h3>Dados pessoais</h3>
        <p>Não exigimos cadastro e <strong>não coletamos dados pessoais que identifiquem você diretamente</strong>, como nome, e-mail ou telefone. Só tratamos o e-mail se você nos escrever voluntariamente, e apenas para responder à sua mensagem.</p>
        <h3>Publicidade e serviços de terceiros</h3>
        <p>O jogo utiliza serviços de terceiros, como o <strong>Google AdSense</strong>, para exibir anúncios. O Google e seus parceiros podem usar <strong>cookies</strong> e identificadores semelhantes (e processar dados como endereço IP e informações do dispositivo) para veicular <strong>anúncios personalizados</strong> com base em suas visitas a este e a outros sites.</p>
        <ul>
          <li>Saiba como o Google usa dados: <a href="https://policies.google.com/technologies/partner-sites" target="_blank" rel="noopener noreferrer">policies.google.com/technologies/partner-sites</a>.</li>
          <li>Você pode desativar a personalização de anúncios em <a href="https://adssettings.google.com" target="_blank" rel="noopener noreferrer">adssettings.google.com</a> ou em <a href="https://www.aboutads.info" target="_blank" rel="noopener noreferrer">aboutads.info</a>.</li>
        </ul>
        <h3>Seus direitos</h3>
        <p>Nos termos do art. 18 da LGPD, você pode solicitar informações, correção ou eliminação de dados que porventura tratemos. Para isso, use o canal na seção <strong>Contato</strong>.</p>
        <h3>Alterações</h3>
        <p>Esta política pode ser atualizada. A data da última revisão fica indicada no topo desta página.</p>`,
      "legal.terms.body": `
        <p><small>Última atualização: 18/10/2026</small></p>
        <p>Ao jogar o <strong>{app}</strong>, você concorda com os termos abaixo.</p>
        <h3>Uso gratuito</h3>
        <p>O jogo é <strong>gratuito</strong> e pode ser financiado por anúncios. Não há cobrança para jogar nem para obter itens.</p>
        <h3>Fornecido "como está"</h3>
        <p>O jogo é fornecido <strong>"como está"</strong> e "conforme disponível", sem garantias de qualquer tipo, expressas ou implícitas, incluindo funcionamento ininterrupto ou livre de erros. Não nos responsabilizamos por perdas de progresso, que fica salvo apenas no seu navegador.</p>
        <h3>Bens virtuais</h3>
        <p>Estrelas, pontos e itens (dicas, revelar gato, 3x seguros etc.) são <strong>bens virtuais sem valor monetário real</strong>: não podem ser trocados por dinheiro, vendidos ou transferidos.</p>
        <h3>Uso adequado</h3>
        <p>Não é permitido tentar prejudicar o funcionamento do jogo, nem usar o conteúdo para fins comerciais sem autorização.</p>
        <h3>Alterações</h3>
        <p>Podemos alterar, suspender o jogo ou atualizar estes termos a qualquer momento. O uso continuado após a atualização indica concordância.</p>`,
      "legal.contact.body": `
        <p>Tem feedback, uma dúvida, encontrou um problema ou quer exercer seus direitos de titular de dados? Fale com a gente:</p>
        <p><a href="mailto:contato@meowcolor.example">contato@meowcolor.example</a></p>
        <p><small>Respondemos assim que possível.</small></p>`,
    },

    en: {
      "app.name": "MeowColor",
      "app.title": "MeowColor",

      "rules.color": "One cat per color",
      "rules.line": "One cat per row and column",
      "rules.touch": "Cats cannot touch each other",

      "menu.open": "Open menu",
      "lang.group": "Language",
      "lang.pt": "Português",
      "lang.en": "English",
      "lang.es": "Español",

      "tab.game": "Play",
      "tab.levels": "Levels",
      "tab.solver": "Solve Level",
      "tab.help": "Help Guide",
      "pwa.install": "📲 Install App (Play Offline)",
      "legal.aria": "Legal information",
      "legal.privacy.link": "Privacy Policy",
      "legal.terms.link": "Terms of Use",
      "legal.contact.link": "Contact",
      "legal.close": "Close",

      "hud.level": "CURRENT LEVEL",
      "hud.score": "SCORE",
      "item.group": "Power-ups",
      "item.hint.label": "Hint",
      "item.hint.aria": "Smart hint",
      "item.revealCat.label": "Reveal Cat",
      "item.revealCat.aria": "Reveal cat",
      "item.safeCross.label": "3 Safe ✕",
      "item.safeCross.aria": "3 safe X marks",
      "item.left": "{label}: {n} left",
      "item.empty": "{label}: out of stock. Watch a video to get +{n}",
      "item.recharged": "+{n} {label} refilled!",

      "ctrl.size": "Size:",
      "ctrl.new": "New game",
      "ctrl.clear": "Clear",
      "ctrl.sound": "🔊 Sound",
      "ctrl.haptics": "📳 Vibration",
      "toggle.state": "{label}: {state}",
      "toggle.on": "on",
      "toggle.off": "off",
      "ctrl.lives": "Lives",
      "ctrl.timer": "Time",
      "ctrl.board": "Board",
      "ctrl.reveal": "Reveal solution",
      "ctrl.tapHint": "Tap: marks ✕<br>Double tap: places 🐱",
      "modal.aria": "Game message",

      "status.cats": "Cats: {n}/{total}",
      "status.won": "🎉 All the cats are at peace!",
      "status.over": "💀 Game over",
      "status.generating": "⏳ Generating level…",
      "status.genFail": "Could not generate the level",
      "status.revealed": "Solution revealed",

      "modal.levels": "Levels",
      "modal.free.title": "Congratulations!",
      "modal.free.text": "You solved {app}!",
      "modal.free.btn": "Play again",
      "modal.win.title": "Level complete!",
      "modal.win.points": "Score: {n}",
      "modal.win.time": "Time: {t}",
      "modal.win.record": "🏅 New record!",
      "modal.win.next": "Next level",
      "modal.over.title": "Game over",
      "modal.over.text": "You ran out of lives. Try the same level again!",
      "modal.over.retry": "Retry this level",
      "modal.recharge.title": "Out of items",
      "modal.recharge.text": "You ran out of this item! Watch a short video to refill +{n} units",
      "modal.recharge.watch": "🎬 Watch video (+{n})",
      "modal.recharge.later": "Not now",
      "ads.offline": "No connection: the video could not be loaded. Try again when you are online.",
      "ads.banner": "Advertisement",
      "ads.banner.aria": "Advertisement",
      "ads.video.aria": "Video ad",
      "ads.video.title": "🎬 Ad (simulation)",
      "ads.video.wait": "Reward in {n}s…",
      "ads.video.ready": "Done! Reward unlocked.",
      "ads.video.claim": "Claim reward",
      "ads.video.close": "Close",

      "axis.row": "row",
      "axis.rows": "rows",
      "axis.col": "column",
      "axis.cols": "columns",
      "list.and": "and",
      "unit.color": "{name} color",
      "unit.row": "row {n}",
      "unit.col": "column {n}",
      "hint.single": "{Who} has only one valid cell: row {r}, column {c}. Double tap to place the cat.",
      "hint.regionLine": "{color} color only has valid cells in {axis} {n}. Mark ✕ on the cells of the other colors in that {axis}.",
      "hint.lineRegion": "In {axis} {n}, only the {color} color has valid cells. Mark ✕ on the other cells of that color.",
      "hint.regionSet": "The colors {colors} only have valid cells in {axes} {lines}. No other color can have a cat there: mark ✕.",
      "hint.lineSet": "{Axes} {lines} only have valid cells in the colors {colors}. Those colors cannot have a cat outside of them: mark ✕.",
      "hint.contradiction": "If there were a cat at row {r}, column {c}, {unit} would be left with no valid cell. Mark ✕ here.",
      "hint.none": "No simple deduction right now. Try Reveal Cat.",
      "hint.noSafe": "There are no more free cells without a cat to mark.",

      "color.0": "Ice blue", "color.1": "Purple", "color.2": "Orange", "color.3": "Yellow",
      "color.4": "Green", "color.5": "Blue", "color.6": "Turquoise", "color.7": "Pink",
      "color.8": "Brown", "color.9": "Red", "color.10": "Sky blue", "color.11": "Magenta",
      "diff.easy": "Easy", "diff.medium": "Medium", "diff.hard": "Hard", "diff.expert": "Expert",

      "levels.title": "Levels",
      "levels.total": "★ {stars} · 🏆 {score} pts",
      "levels.infinite": "∞ Infinite · 10×10",
      "levels.infiniteLast": "(last {n} of {total})",
      "levels.infiniteVar": "variable difficulty",
      "level.aria": "Level {id}",
      "level.locked": "locked",
      "level.stars": "{n} of 3 stars",

      "solver.size": "Size:",
      "solver.palette": "Palette",
      "solver.paletteAria": "Color palette",
      "solver.swatch": "Color {n}",
      "solver.paletteHint": "Tap a color to select it; swipe to see the others.",
      "solver.solve": "🐱 Solve level",
      "solver.draw": "Tap or drag to paint the board with your level's colors.",
      "solver.boardAria": "Board to paint",
      "solver.painted": "Painted {n}/{total}",
      "solver.exact": "Use exactly {n} colors (used: {used})",
      "solver.complete": "Board complete!",
      "solver.none": "This board has no solution. Check the colors.",
      "solver.multi": "There is more than one solution; showing the first.",
      "solver.unique": "Unique solution found!",

      "pwa.promoTitle": "📲 Take {app} with you",
      "pwa.promo1": "⚡ Quick access from your home screen",
      "pwa.promo2": "📶 Saves data",
      "pwa.promo3": "✈️ Works 100% offline",
      "pwa.promoBtn": "Install for free",
      "ios.title": "📲 Install on iPhone/iPad",
      "ios.intro": "To install on your iPhone/iPad:",
      "ios.step1": "Tap the <strong>Share</strong> button at the bottom of Safari.",
      "ios.step2": "Select <strong>“Add to Home Screen”</strong>.",
      "ios.note": "Then just open {app} from the icon on your home screen, even without internet.",
      "ios.ok": "Got it",

      "guide.title": "Strategy guide",
      "guide.intro": "Use the rules to eliminate possibilities. Mark ✕ when you are sure a cell cannot hold a cat; save your guesses for when logic runs out.",
      "guide.summary": "<strong>Practical order:</strong> check the rules for each confirmed cat → look for colors with a single option → look for rows or columns with a single option → apply blocks, pairs and intersections → only then consider a guess.",
      "g1.n": "01 · DEDUCTION",
      "g1.t": "Look for a color with few options",
      "g1.p": "A region must receive exactly one cat. If only one possible cell is left in that color, it is mandatory. If two are left, keep both possibilities until another rule eliminates one.",
      "g1.cap": "Example: the blue region can only use one of these cells.",
      "g1.aria": "Two candidate cells in the blue region",
      "g1.l1": "Blue region: 2 candidates",
      "g2.n": "02 · BLOCKING",
      "g2.t": "Color trapped in a row or column",
      "g2.p": "If all the possible positions of a color are in the same row, that row will already have its cat in that region. Eliminate the other colors in the rest of the row with ✕. The same logic applies to a column.",
      "g2.cap": "The blue region only fits in the highlighted row; the other cells in the row are blocked.",
      "g2.aria": "Blue region candidates and blocked cells in the same row",
      "g2.l1": "Blue candidates",
      "g2.l2": "Other colors eliminated",
      "g3.n": "03 · PAIRS",
      "g3.t": "Two colors reserve two rows",
      "g3.p": "If two colors can only appear in the same two rows, they will occupy those two rows — one in each. No other color can be in them. Mark ✕ on the other candidates in those rows.",
      "g3.cap": "The blue and gold regions are restricted to rows A and B.",
      "g3.aria": "Two rows reserved for the blue and gold regions; candidates of other colors eliminated",
      "g3.l1": "Blue",
      "g3.l2": "Gold",
      "g3.l3": "Other colors",
      "g4.n": "04 · INTERSECTION",
      "g4.t": "Region aligned with a row",
      "g4.p": "The reasoning also works in reverse: if, within a region, all the candidates are in the same row or column, that row or column cannot hold another cat from that region outside of it.",
      "g4.cap": "Both candidates of the green region are in the row; the candidate outside it is impossible.",
      "g4.aria": "Two green candidates in the same row and one eliminated candidate outside the region",
      "g4.l1": "Aligned green region",
      "g4.l2": "Eliminated by intersection",
      "g5.n": "05 · NEIGHBORHOOD",
      "g5.t": "Use the space around a cat",
      "g5.p": "After confirming a cat, eliminate the cells in the same row, column and color. Also eliminate the neighboring cells, including diagonals. That way cats never touch.",
      "g5.cap": "A cat blocks the cells around it (including diagonals).",
      "g5.aria": "Cat in the center and blocked neighboring cells",
      "g5.l1": "Cells that cannot hold another cat",
      "g6.n": "06 · CHOICE",
      "g6.t": "If you get stuck, prioritize the most limited region",
      "g6.p": "Count the candidates still left for each color. Try to deduce the color with the fewest options first: every elimination affects rows, columns, regions and neighbors. This is a heuristic, not a guarantee that a single cell is more likely.",
      "g6.note": "<strong>Important:</strong> do not choose just by appearance or by “chance”. Candidates do not necessarily have equal probabilities; prefer a deduction that respects all the rules.",

      "legal.privacy.title": "Privacy Policy",
      "legal.terms.title": "Terms of Use",
      "legal.contact.title": "Contact",
      "legal.privacy.body": `
        <p><small>Last updated: October 18, 2026</small></p>
        <p><strong>{app}</strong> respects your privacy and is designed to collect as little as possible, in compliance with Brazil's General Data Protection Law (LGPD, Law No. 13,709/2018).</p>
        <h3>Local storage</h3>
        <p>The game uses your browser's <code>localStorage</code> only to save progress on this device: stars, points, completed levels, items (power-ups) and language, sound and vibration preferences. This data is <strong>not sent</strong> to any server of ours and can be erased at any time by clearing the site data in your browser.</p>
        <h3>Personal data</h3>
        <p>We do not require sign-up and <strong>we do not collect personal data that directly identifies you</strong>, such as name, email or phone number. We only process your email if you write to us voluntarily, and only to reply to your message.</p>
        <h3>Advertising and third-party services</h3>
        <p>The game uses third-party services, such as <strong>Google AdSense</strong>, to display ads. Google and its partners may use <strong>cookies</strong> and similar identifiers (and process data such as IP address and device information) to serve <strong>personalized ads</strong> based on your visits to this and other sites.</p>
        <ul>
          <li>Learn how Google uses data: <a href="https://policies.google.com/technologies/partner-sites" target="_blank" rel="noopener noreferrer">policies.google.com/technologies/partner-sites</a>.</li>
          <li>You can turn off ad personalization at <a href="https://adssettings.google.com" target="_blank" rel="noopener noreferrer">adssettings.google.com</a> or at <a href="https://www.aboutads.info" target="_blank" rel="noopener noreferrer">aboutads.info</a>.</li>
        </ul>
        <h3>Your rights</h3>
        <p>Under Article 18 of the LGPD, you may request information about, correction of, or deletion of any data we may process. To do so, use the channel in the <strong>Contact</strong> section.</p>
        <h3>Changes</h3>
        <p>This policy may be updated. The date of the latest revision is shown at the top of this page.</p>`,
      "legal.terms.body": `
        <p><small>Last updated: October 18, 2026</small></p>
        <p>By playing <strong>{app}</strong>, you agree to the terms below.</p>
        <h3>Free to use</h3>
        <p>The game is <strong>free</strong> and may be funded by ads. There is no charge to play or to obtain items.</p>
        <h3>Provided "as is"</h3>
        <p>The game is provided <strong>"as is"</strong> and "as available", without warranties of any kind, express or implied, including uninterrupted or error-free operation. We are not responsible for loss of progress, which is saved only in your browser.</p>
        <h3>Virtual goods</h3>
        <p>Stars, points and items (hints, reveal cat, 3 safe ✕, etc.) are <strong>virtual goods with no real monetary value</strong>: they cannot be exchanged for money, sold or transferred.</p>
        <h3>Proper use</h3>
        <p>You may not try to harm the operation of the game, nor use its content for commercial purposes without permission.</p>
        <h3>Changes</h3>
        <p>We may change or suspend the game, or update these terms, at any time. Continued use after an update means you accept it.</p>`,
      "legal.contact.body": `
        <p>Have feedback or a question, found a problem, or want to exercise your rights as a data subject? Get in touch:</p>
        <p><a href="mailto:contato@meowcolor.example">contato@meowcolor.example</a></p>
        <p><small>We reply as soon as possible.</small></p>`,
    },

    es: {
      "app.name": "MeowColor",
      "app.title": "MeowColor",

      "rules.color": "Un gato por color",
      "rules.line": "Un gato por fila y columna",
      "rules.touch": "Los gatos no pueden tocarse",

      "menu.open": "Abrir menú",
      "lang.group": "Idioma",
      "lang.pt": "Português",
      "lang.en": "English",
      "lang.es": "Español",

      "tab.game": "Jugar",
      "tab.levels": "Niveles",
      "tab.solver": "Resolver Nivel",
      "tab.help": "Guía de Ayuda",
      "pwa.install": "📲 Instalar App (Jugar sin conexión)",
      "legal.aria": "Información legal",
      "legal.privacy.link": "Política de Privacidad",
      "legal.terms.link": "Términos de Uso",
      "legal.contact.link": "Contacto",
      "legal.close": "Cerrar",

      "hud.level": "NIVEL ACTUAL",
      "hud.score": "PUNTOS",
      "item.group": "Power-ups",
      "item.hint.label": "Pista",
      "item.hint.aria": "Pista inteligente",
      "item.revealCat.label": "Revelar Gato",
      "item.revealCat.aria": "Revelar gato",
      "item.safeCross.label": "3 ✕ Seguras",
      "item.safeCross.aria": "3 X seguras",
      "item.left": "{label}: quedan {n}",
      "item.empty": "{label}: agotado. Mira un video para ganar +{n}",
      "item.recharged": "¡+{n} de {label} recargados!",

      "ctrl.size": "Tamaño:",
      "ctrl.new": "Nuevo juego",
      "ctrl.clear": "Limpiar",
      "ctrl.sound": "🔊 Sonido",
      "ctrl.haptics": "📳 Vibración",
      "toggle.state": "{label}: {state}",
      "toggle.on": "activado",
      "toggle.off": "desactivado",
      "ctrl.lives": "Vidas",
      "ctrl.timer": "Tiempo",
      "ctrl.board": "Tablero",
      "ctrl.reveal": "Revelar solución",
      "ctrl.tapHint": "Clic: marca ✕<br>Doble clic: coloca 🐱",
      "modal.aria": "Mensaje del juego",

      "status.cats": "Gatos: {n}/{total}",
      "status.won": "🎉 ¡Todos los gatos están en paz!",
      "status.over": "💀 Game over",
      "status.generating": "⏳ Generando nivel…",
      "status.genFail": "No se pudo generar el nivel",
      "status.revealed": "Solución revelada",

      "modal.levels": "Niveles",
      "modal.free.title": "¡Felicidades!",
      "modal.free.text": "¡Resolviste {app}!",
      "modal.free.btn": "Jugar de nuevo",
      "modal.win.title": "¡Nivel completado!",
      "modal.win.points": "Puntos: {n}",
      "modal.win.time": "Tiempo: {t}",
      "modal.win.record": "🏅 ¡Nuevo récord!",
      "modal.win.next": "Siguiente nivel",
      "modal.over.title": "Fin del juego",
      "modal.over.text": "Se acabaron tus vidas. ¡Inténtalo de nuevo en el mismo nivel!",
      "modal.over.retry": "Reintentar el mismo nivel",
      "modal.recharge.title": "Objetos agotados",
      "modal.recharge.text": "¡Se acabaron tus objetos de este tipo! Mira un video corto para recargar +{n} unidades",
      "modal.recharge.watch": "🎬 Ver video (+{n})",
      "modal.recharge.later": "Ahora no",
      "ads.offline": "Sin conexión: no se pudo cargar el video. Inténtalo de nuevo cuando estés en línea.",
      "ads.banner": "Publicidad",
      "ads.banner.aria": "Publicidad",
      "ads.video.aria": "Anuncio en video",
      "ads.video.title": "🎬 Anuncio (simulación)",
      "ads.video.wait": "Recompensa en {n}s…",
      "ads.video.ready": "¡Listo! Recompensa liberada.",
      "ads.video.claim": "Recibir recompensa",
      "ads.video.close": "Cerrar",

      "axis.row": "fila",
      "axis.rows": "filas",
      "axis.col": "columna",
      "axis.cols": "columnas",
      "list.and": "y",
      "unit.color": "el color {name}",
      "unit.row": "la fila {n}",
      "unit.col": "la columna {n}",
      "hint.single": "{Who} solo tiene una casilla válida: fila {r}, columna {c}. Toca dos veces para poner el gato.",
      "hint.regionLine": "El color {color} solo tiene casillas válidas en la {axis} {n}. Marca ✕ en las casillas de los demás colores de esa {axis}.",
      "hint.lineRegion": "En la {axis} {n}, solo el color {color} tiene casillas válidas. Marca ✕ en las demás casillas de ese color.",
      "hint.regionSet": "Los colores {colors} solo tienen casillas válidas en las {axes} {lines}. Ningún otro color puede tener gato en ellas: marca ✕.",
      "hint.lineSet": "Las {axes} {lines} solo tienen casillas válidas en los colores {colors}. Esos colores no pueden tener gato fuera de ellas: marca ✕.",
      "hint.contradiction": "Si hubiera un gato en la fila {r}, columna {c}, {unit} se quedaría sin ninguna casilla válida. Marca ✕ aquí.",
      "hint.none": "No hay una deducción simple por ahora. Prueba Revelar Gato.",
      "hint.noSafe": "No quedan casillas libres sin gato para marcar.",

      "color.0": "Azul hielo", "color.1": "Morado", "color.2": "Naranja", "color.3": "Amarillo",
      "color.4": "Verde", "color.5": "Azul", "color.6": "Turquesa", "color.7": "Rosa",
      "color.8": "Marrón", "color.9": "Rojo", "color.10": "Celeste", "color.11": "Magenta",
      "diff.easy": "Fácil", "diff.medium": "Medio", "diff.hard": "Difícil", "diff.expert": "Experto",

      "levels.title": "Niveles",
      "levels.total": "★ {stars} · 🏆 {score} pts",
      "levels.infinite": "∞ Infinito · 10×10",
      "levels.infiniteLast": "(últimos {n} de {total})",
      "levels.infiniteVar": "dificultad variable",
      "level.aria": "Nivel {id}",
      "level.locked": "bloqueado",
      "level.stars": "{n} de 3 estrellas",

      "solver.size": "Tamaño:",
      "solver.palette": "Paleta",
      "solver.paletteAria": "Paleta de colores",
      "solver.swatch": "Color {n}",
      "solver.paletteHint": "Toca un color para seleccionarlo; desliza para ver los demás.",
      "solver.solve": "🐱 Resolver nivel",
      "solver.draw": "Toca o arrastra para pintar el tablero con los colores de tu nivel.",
      "solver.boardAria": "Tablero para pintar",
      "solver.painted": "Pintadas {n}/{total}",
      "solver.exact": "Usa exactamente {n} colores (usados: {used})",
      "solver.complete": "¡Tablero completo!",
      "solver.none": "Este tablero no tiene solución. Revisa los colores.",
      "solver.multi": "Hay más de una solución; se muestra la primera.",
      "solver.unique": "¡Solución única encontrada!",

      "pwa.promoTitle": "📲 Lleva {app} contigo",
      "pwa.promo1": "⚡ Acceso rápido desde la pantalla de inicio",
      "pwa.promo2": "📶 Ahorro de datos",
      "pwa.promo3": "✈️ Funciona 100% sin conexión",
      "pwa.promoBtn": "Instalar gratis",
      "ios.title": "📲 Instalar en iPhone/iPad",
      "ios.intro": "Para instalar en tu iPhone/iPad:",
      "ios.step1": "Toca el botón <strong>Compartir</strong> en la parte inferior de Safari.",
      "ios.step2": "Selecciona <strong>“Añadir a pantalla de inicio”</strong>.",
      "ios.note": "Después solo abre {app} desde el icono de la pantalla de inicio, incluso sin internet.",
      "ios.ok": "Entendido",

      "guide.title": "Guía de estrategias",
      "guide.intro": "Usa las reglas para eliminar posibilidades. Marca ✕ cuando estés seguro de que una casilla no puede recibir un gato; guarda tus corazonadas para cuando la lógica no avance.",
      "guide.summary": "<strong>Orden práctico:</strong> revisa las reglas de cada gato confirmado → busca colores con una única opción → busca filas o columnas con una única opción → aplica bloqueos, pares e intersecciones → solo entonces considera un intento.",
      "g1.n": "01 · DEDUCCIÓN",
      "g1.t": "Busca un color con pocas opciones",
      "g1.p": "Una región debe recibir exactamente un gato. Si solo queda una casilla posible en ese color, es obligatoria. Si quedan dos, mantén ambas posibilidades hasta que otra regla elimine una.",
      "g1.cap": "Ejemplo: la región azul solo puede usar una de estas casillas.",
      "g1.aria": "Dos casillas candidatas en la región azul",
      "g1.l1": "Región azul: 2 candidatas",
      "g2.n": "02 · BLOQUEO",
      "g2.t": "Color atrapado en una fila o columna",
      "g2.p": "Si todas las posiciones posibles de un color están en la misma fila, esa fila ya tendrá su gato en esa región. Elimina con ✕ los otros colores en el resto de las casillas de la fila. La misma lógica vale para una columna.",
      "g2.cap": "La región azul solo cabe en la fila resaltada; las otras casillas de la fila quedan bloqueadas.",
      "g2.aria": "Candidatas de la región azul y casillas bloqueadas en la misma fila",
      "g2.l1": "Candidatas azules",
      "g2.l2": "Otros colores eliminados",
      "g3.n": "03 · PARES",
      "g3.t": "Dos colores reservan dos filas",
      "g3.p": "Si dos colores solo pueden aparecer en las mismas dos filas, ocuparán esas dos filas — uno en cada una. Ningún otro color puede estar en ellas. Marca ✕ en las demás candidatas de esas filas.",
      "g3.cap": "Las regiones azul y dorada están restringidas a las filas A y B.",
      "g3.aria": "Dos filas reservadas a las regiones azul y dorada; candidatas de otros colores eliminadas",
      "g3.l1": "Azul",
      "g3.l2": "Dorada",
      "g3.l3": "Otros colores",
      "g4.n": "04 · INTERSECCIÓN",
      "g4.t": "Región alineada con una fila",
      "g4.p": "El razonamiento también funciona al revés: si, dentro de una región, todas las candidatas están en la misma fila o columna, esa fila o columna no puede recibir otro gato de esa región fuera de ella.",
      "g4.cap": "Las dos candidatas de la región verde están en la fila; la candidata fuera de ella es imposible.",
      "g4.aria": "Dos candidatas verdes en la misma fila y una candidata eliminada fuera de la región",
      "g4.l1": "Región verde alineada",
      "g4.l2": "Eliminada por la intersección",
      "g5.n": "05 · VECINDAD",
      "g5.t": "Aprovecha el espacio alrededor de un gato",
      "g5.p": "Después de confirmar un gato, elimina las casillas de la misma fila, columna y color. También elimina las casillas vecinas, incluidas las diagonales. Así los gatos no se tocan.",
      "g5.cap": "Un gato bloquea las casillas de alrededor (incluidas las diagonales).",
      "g5.aria": "Gato en el centro y casillas vecinas bloqueadas",
      "g5.l1": "Casillas que no pueden recibir otro gato",
      "g6.n": "06 · ELECCIÓN",
      "g6.t": "Si te atascas, prioriza la región más limitada",
      "g6.p": "Cuenta las candidatas que aún quedan para cada color. Intenta deducir primero el color con menos opciones: cada exclusión afecta filas, columnas, regiones y vecindades. Esto es una heurística, no una garantía de que una casilla aislada sea más probable.",
      "g6.note": "<strong>Importante:</strong> no elijas solo por la apariencia o por “suerte”. Las candidatas no tienen necesariamente probabilidades iguales; prefiere una deducción que respete todas las reglas.",

      "legal.privacy.title": "Política de Privacidad",
      "legal.terms.title": "Términos de Uso",
      "legal.contact.title": "Contacto",
      "legal.privacy.body": `
        <p><small>Última actualización: 18/10/2026</small></p>
        <p><strong>{app}</strong> respeta tu privacidad y está hecho para recopilar lo mínimo posible, en conformidad con la Ley General de Protección de Datos de Brasil (LGPD, Ley n.º 13.709/2018).</p>
        <h3>Almacenamiento local</h3>
        <p>El juego usa el <code>localStorage</code> de tu navegador solo para guardar el progreso en este dispositivo: estrellas, puntos, niveles completados, objetos (power-ups) y preferencias de idioma, sonido y vibración. Estos datos <strong>no se envían</strong> a ningún servidor nuestro y pueden borrarse en cualquier momento limpiando los datos del sitio en el navegador.</p>
        <h3>Datos personales</h3>
        <p>No exigimos registro y <strong>no recopilamos datos personales que te identifiquen directamente</strong>, como nombre, correo electrónico o teléfono. Solo tratamos tu correo si nos escribes voluntariamente, y únicamente para responder a tu mensaje.</p>
        <h3>Publicidad y servicios de terceros</h3>
        <p>El juego utiliza servicios de terceros, como <strong>Google AdSense</strong>, para mostrar anuncios. Google y sus socios pueden usar <strong>cookies</strong> e identificadores similares (y procesar datos como la dirección IP y la información del dispositivo) para mostrar <strong>anuncios personalizados</strong> según tus visitas a este y a otros sitios.</p>
        <ul>
          <li>Conoce cómo Google usa los datos: <a href="https://policies.google.com/technologies/partner-sites" target="_blank" rel="noopener noreferrer">policies.google.com/technologies/partner-sites</a>.</li>
          <li>Puedes desactivar la personalización de anuncios en <a href="https://adssettings.google.com" target="_blank" rel="noopener noreferrer">adssettings.google.com</a> o en <a href="https://www.aboutads.info" target="_blank" rel="noopener noreferrer">aboutads.info</a>.</li>
        </ul>
        <h3>Tus derechos</h3>
        <p>Conforme al art. 18 de la LGPD, puedes solicitar información, corrección o eliminación de los datos que eventualmente tratemos. Para ello, usa el canal de la sección <strong>Contacto</strong>.</p>
        <h3>Cambios</h3>
        <p>Esta política puede actualizarse. La fecha de la última revisión se indica en la parte superior de esta página.</p>`,
      "legal.terms.body": `
        <p><small>Última actualización: 18/10/2026</small></p>
        <p>Al jugar <strong>{app}</strong>, aceptas los términos siguientes.</p>
        <h3>Uso gratuito</h3>
        <p>El juego es <strong>gratuito</strong> y puede financiarse con anuncios. No hay ningún cobro por jugar ni por obtener objetos.</p>
        <h3>Proporcionado «tal cual»</h3>
        <p>El juego se proporciona <strong>«tal cual»</strong> y «según disponibilidad», sin garantías de ningún tipo, expresas o implícitas, incluido el funcionamiento ininterrumpido o libre de errores. No nos responsabilizamos por pérdidas de progreso, que se guarda solo en tu navegador.</p>
        <h3>Bienes virtuales</h3>
        <p>Las estrellas, los puntos y los objetos (pistas, revelar gato, 3 ✕ seguras, etc.) son <strong>bienes virtuales sin valor monetario real</strong>: no pueden canjearse por dinero, venderse ni transferirse.</p>
        <h3>Uso adecuado</h3>
        <p>No está permitido intentar perjudicar el funcionamiento del juego ni usar su contenido con fines comerciales sin autorización.</p>
        <h3>Cambios</h3>
        <p>Podemos modificar o suspender el juego, o actualizar estos términos, en cualquier momento. El uso continuado tras la actualización implica aceptación.</p>`,
      "legal.contact.body": `
        <p>¿Tienes comentarios o dudas, encontraste un problema o quieres ejercer tus derechos como titular de datos? Escríbenos:</p>
        <p><a href="mailto:contato@meowcolor.example">contato@meowcolor.example</a></p>
        <p><small>Respondemos lo antes posible.</small></p>`,
    },
  };

  const DIFF_KEYS = { "Fácil": "easy", "Médio": "medium", "Difícil": "hard", "Expert": "expert" };   // rótulos gravados nos packs/cache

  /* Primeiro idioma suportado da lista do navegador ("pt-BR" -> "pt"); senão, FALLBACK */
  function detect(prefs) {
    const list = prefs || (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language]);
    for (const tag of list) {
      const base = String(tag || "").toLowerCase().split("-")[0];
      if (LANGS.includes(base)) return base;
    }
    return FALLBACK;
  }

  let lang = detect();

  function setLanguage(next) {
    if (LANGS.includes(next)) lang = next;
    return lang;
  }

  /* t("hint.single", { r: 2 }) -> texto no idioma atual; chave ausente cai em pt e, por fim, na própria chave */
  function t(key, params) {
    const raw = DICT[lang][key] ?? DICT.pt[key] ?? key;
    const vars = { app: DICT[lang]["app.name"], ...params };
    return raw.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? String(vars[name]) : m));
  }

  const colorName = id => t("color." + (((id % 12) + 12) % 12));
  const diffLabel = label => (DIFF_KEYS[label] ? t("diff." + DIFF_KEYS[label]) : label);

  /* Junta itens com o "e" do idioma: ["a","b","c"] -> "a, b e c" */
  const list = items => (items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} ${t("list.and")} ${items[items.length - 1]}`);

  /* Traduz o DOM estático sob `root` (atributos data-i18n*) */
  function apply(root = document) {
    for (const el of root.querySelectorAll("[data-i18n]")) el.textContent = t(el.dataset.i18n);
    for (const el of root.querySelectorAll("[data-i18n-html]")) el.innerHTML = t(el.dataset.i18nHtml);
    for (const el of root.querySelectorAll("[data-i18n-attr]")) {
      for (const pair of el.dataset.i18nAttr.split(";")) {
        const [attr, key] = pair.split(":").map(s => s.trim());
        if (attr && key) el.setAttribute(attr, t(key));
      }
    }
  }

  return {
    LANGS, DICT, detect, setLanguage, t, apply, colorName, diffLabel, list,
    get lang() { return lang; },
    get htmlLang() { return HTML_LANG[lang]; },
  };
})();
