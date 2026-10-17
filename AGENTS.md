# MiauColor - Guia para Agentes de IA (AGENTS.md)

## Visão Geral do Projeto

**MiauColor** (ou *Meowdoku*) é um jogo PWA de quebra-cabeça de lógica para navegadores e dispositivos móveis, construído em **JavaScript Vanilla (ES6+)**, HTML5 e CSS3, sem o uso de frameworks pesados, bundlers ou dependências externas. O objetivo é posicionar um gato por linha, coluna e região de cor sem que eles se toquem.

---

## Estrutura de Arquivos e Módulos

* `engine.js`: Motor matemático puro sem DOM. Contém PRNG (`mulberry32`), FNV-1a hash (`hashSeed`), solver por backtracking (`countSolutions`), gerador determinístico (`generateUnique`) e classificador de dificuldade (`gradeLevel`).
* `script.js`: Controlador principal da UI, manipulação do DOM, eventos de toque/arrasto (*drag* &amp; *double tap*), cronômetro, modais e gerenciamento de abas.
* `audio.js`: Módulo `Sound` para síntese de efeitos sonoros em tempo real via **Web Audio API** (`AudioContext`) e feedback háptico (`navigator.vibrate`).
* `progress.js`: Persistência de estado e progresso do jogador em `localStorage` sob a chave `"miaucolor:v1"`.
* `infinite.js`: Gerador determinístico de níveis infinitos 10x10 baseados em seed (`"inf:N"`).
* `levels.js`: Carregador dos pacotes de níveis pré-gerados (`levels/pack-01.js` a `pack-05.js`).
* `sw.js` &amp; `manifest.webmanifest`: Service Worker (Cache-First offline) e manifesto de aplicativo PWA.
* `tools/gen_levels.py` &amp; `tools/gen_icons.py`: Scripts utilitários Python para geração offline de níveis e ícones PNG.

---

## Regras Obrigatórias de Código para Agentes de IA

1. **Stack e Filosofia:**

  * Mantenha o código em JavaScript Vanilla puro (ES6+).
  * **Não instale** nem adicione bibliotecas ou frameworks JS/CSS sem autorização explícita.
2. **Performance e Manipulação de DOM:**

  * Evite reescrever a interface usando `innerHTML` em loops de atualização do jogo.
  * Realize modificações cirúrgicas nos elementos do DOM usando `classList` e seletores diretos para evitar reflows desnecessários.
3. **Gestão de Web Workers e Áudio:**

  * Sempre chame `worker.terminate()` ao cancelar ou reutilizar tarefas de geração assíncrona de níveis para evitar vazamentos em segundo plano.
  * Não revogue `URL.revokeObjectURL(url)` de forma síncrona imediata ao instanciar Workers a partir de Blobs.
  * Sempre verifique e reative o `AudioContext` (`ctx.resume()`) após gestos do usuário para contornar restrições de áudio no iOS e Android.
4. **Escopo e Limpeza de Código:**

  * Evite adicionar novas variáveis no escopo global (`window`). Prefira módulos encapsulados ou objetos de estado.
  * Mantenha as mensagens de commit e retornos de código focados unicamente nas funções ou diffs solicitadas pelo ticket.

---

## Padrão de Comunicação por Micro-Tickets

* **Entrada:** Ao receber um ticket, solicite/leia apenas os arquivos diretamente envolvidos no ajuste.
* **Saída:** Forneça apenas as funções alteradas ou o bloco de diff necessário, economizando tokens e evitando reescritas desnecessárias de arquivos inteiros.