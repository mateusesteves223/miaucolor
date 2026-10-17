# MiauColor

Um puzzle de lógica com gatos, regiões coloridas e níveis gerados proceduralmente.

## Como jogar

O objetivo é encontrar e posicionar um gato em cada:

- linha;
- coluna;
- região colorida.

Além disso, gatos não podem se encostar, nem mesmo na diagonal.

- **Clique** em uma célula para alternar uma marcação ✕.
- **Clicar e arrastar** para marcar (ou apagar) vários ✕ de uma vez; o primeiro quadrado define se o gesto marca ou apaga.
- **Duplo clique** para tentar colocar um gato.
- Acertar fixa o gato naquela célula. Errar custa uma vida; o jogo começa com três.
- Ao perder, é possível tentar novamente o mesmo nível.
- Use **Revelar solução** para exibir a resposta e encerrar a partida.

## Executar

Não há dependências ou etapa de compilação. Clone ou baixe o repositório e abra `index.html` em um navegador moderno.

## Sobre o projeto

O tabuleiro e suas regiões são gerados em JavaScript. A interface é feita com HTML e CSS, com layout responsivo, animações, painel de vidas e guia visual de estratégias.

## Campanha

- **Níveis:** 100 níveis pré-gerados em `levels/` (5×5 até 10×10), todos com solução única e resolvíveis só com lógica. Cada nível libera o próximo.
- **Níveis infinitos:** a partir do nível 101 o jogo não tem fim: sempre 10×10, com dificuldade variável (Fácil, Médio, Difícil, Expert). O nível N sai da seed `inf:N`, então é o mesmo mapa em qualquer dispositivo. Os níveis são gerados num Web Worker, salvos em `localStorage` (últimos 300; se apagados, são regenerados idênticos) e os próximos 3 são antecipados em segundo plano.
- **Dificuldade:** vem do que um solver lógico precisa para resolver o mapa sem chutar (região de 1 célula, região presa a uma linha/coluna, 2 regiões em 2 colunas, 3 em 3, e por fim eliminação por contradição), medido em passos ponderados. Em 10×10 a distribuição natural é ≈ 35% Fácil, 25% Médio, 20% Difícil, 15% Expert.
- **Estrelas:** 3 sem erros, 2 com um erro, 1 com dois ou mais. O melhor tempo de cada nível é guardado.
- **Progresso:** salvo em `localStorage`, inclusive a partida em andamento (um slot): ao reabrir, o jogo retoma de onde parou.
- **Treino livre:** "Novo jogo" gera um tabuleiro aleatório (não conta para a campanha).
- **Modo desenvolvedor:** abra `index.html?dev` para exibir o Modo Dev (vidas infinitas, auto-✕; não conta para a campanha), a aba "Resolve Nível" e a documentação algorítmica. Para o jogador comum essas ferramentas ficam ocultas.
- **Som e vibração:** sons sintetizados (sem arquivos) e vibração no celular, com chaves "Som" e "Vibração" que ficam salvas.

Para regenerar os níveis dos packs: `python tools/gen_levels.py` (use `--verify` para só validar).

## Arquivos

- `index.html` — estrutura do jogo, documentação e guia de estratégias.
- `style.css` — estilos, layout responsivo e animações.
- `script.js` — mecânicas, interface, campanha e mapa de níveis.
- `engine.js` — motor puro: geração por seed, unicidade, solver lógico e dificuldade (roda na página e em Workers).
- `infinite.js` — níveis infinitos: geração em Worker, cache e antecipação.
- `levels.js` — carregador dos packs de níveis; `levels/` — packs e manifesto gerados.
- `audio.js` — sons sintetizados (Web Audio) e vibração, com preferências salvas.
- `progress.js` — estrelas, recordes e partida em andamento (`localStorage`).
- `tools/gen_levels.py` — gerador offline (seed fixa, solução única, dificuldade por solver lógico).
