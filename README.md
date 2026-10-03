# Miaudoku

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

## Arquivos

- `index.html` — estrutura do jogo, documentação e guia de estratégias.
- `style.css` — estilos, layout responsivo e animações.
- `script.js` — geração de níveis e mecânicas do jogo.
