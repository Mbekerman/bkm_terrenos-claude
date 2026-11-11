# Diretrizes de design e UX dos sistemas BKM

Este arquivo resume o jeito de desenhar e de se comportar do **BKM Terrenos**, para que outro sistema da BKM pareça e funcione
igual e, no futuro, se junte a ele sem costura. Vale para qualquer tela de trabalho (não para site nem peça de marketing).

Fontes, em ordem de quem manda quando divergem:

1. O que o Moisés decidiu (está no `CLAUDE.md` deste repositório, seção "Visual", com a data de cada decisão).
2. O código do front real: `apps/web/src` (React). Estilos em `apps/web/src/styles.css` (gerado do protótipo, não editar à
   mão) e `apps/web/src/app.css` (o que é só do React).
3. O protótipo navegável: `docs/prototipo.html`, gerado de `tools/prototipo/` (fontes `proto*.js`, `painel.css`, `proto_ui.js`).
4. O Design System BKM (artifact https://claude.ai/artifact/N76hgnKi7LrCSpCusmwFCL): marca, logo, ícones, tom de voz. Nas
   telas de trabalho, a linguagem visual é o **Material 3 do Google** sobre a marca BKM (abaixo); o Design System vale para
   marca, ícones e texto.

Quando este resumo e o código divergirem, vale o código, e este arquivo deve ser corrigido.

---

## 1. Princípios

- **Parecer Google.** Gmail, Drive e Google Maps são a referência de tudo: cores, tipografia, botões, menus, mapa. Quem usa o
  Google no dia a dia não precisa aprender a tela.
- **Nada é excesso.** Cada elemento tem função. Texto explicativo só quando necessário. Sem emoji, sem gradiente roxo-azul, sem
  card com faixa colorida na lateral (a faixa é só dos 4 indicadores do Início).
- **Editar é tão fácil quanto ler.** O valor já é o campo; grava ao sair dele. Sem botões Editar e Salvar (ver seção 6).
- **"Não informado" nunca vira zero nem "não".** Campo vazio aparece como "Não informado" em itálico cinza; listas têm a opção
  explícita "Não informado" / "Não verificado" / "Não avaliada".
- **Todo estado tem endereço.** O link copiado abre a mesma tela, aba e item (seção 12).
- **O sistema lembra a escolha da pessoa.** Largura de painéis, legenda aberta, tipo de mapa, menu recolhido: tudo guardado no
  navegador (`localStorage`, chaves com prefixo do sistema, por exemplo `bkm-terrenos-…`; o novo sistema usa o próprio prefixo).
- **Português simples.** Rótulos curtos, sem jargão, sem caixa-alta espaçada, frases diretas. Trate o usuário por "você".

## 2. Cores (tema claro, padrão)

| Uso | Cor |
|---|---|
| Fundo da página | `#f8fafd` |
| Superfície de quadro (card) | `#ffffff` |
| Superfície baixa / alta | `#f0f4f9` / `#e9eef6` |
| Texto principal | `#1f1f1f` |
| Texto secundário | `#444746` |
| Contorno de controle | `#747775` |
| Fio divisório e contorno de quadro | `#c4c7c5` |
| Primária (botão cheio, link, foco) | `#0b57d0`, texto sobre ela `#fff`; hover `#0842a0` |
| Contêiner primário | `#d3e3fd` (texto `#041e49`) |
| Contêiner secundário: item ativo do menu, segmentado, filtro ligado | `#c2e7ff` (texto `#001d35`) |
| Status ok | texto `#146c2e` sobre `#c4eed0` |
| Status atenção | texto `#7a5900` sobre `#ffdf99` |
| Status crítico | texto `#b3261e` sobre `#ffdad6` |

Tokens CSS (bloco "Tema Google" no `styles.css`): `--m-primary`, `--m-on-primary`, `--m-pc`, `--m-on-pc`, `--m-sc`, `--m-on-sc`,
`--m-surface`, `--m-sc-low`, `--m-sc-high`, `--m-card`, `--m-on-surface`, `--m-on-var`, `--m-outline`, `--m-outline-var`.
Use os tokens, não os hexadecimais soltos.

Paleta da marca BKM (só em gráficos, nos 4 indicadores e em etiquetas): azul BKM `#0094fe`, roxo `#863d8f`, terracota
`#c67355`, verde `#7d8a3e`. O azul BKM não serve para texto em fundo claro (contraste 3,15:1); para texto azul, use `#0b57d0`.

**Tema escuro** (o escuro do Gmail e do Drive): fundo `#131314` (barras na mesma cor, sem fio), quadros `#1e1f20` com contorno
`#2d2f31`, campos `#282a2c`, texto `#e3e3e3`, secundário `#c4c7c5`, contornos `#444746`/`#8e918f`, primária `#a8c7fa` com texto
`#062e6f`, item ativo `#004a77` com texto `#c2e7ff`. Ativado por `<html data-tema="escuro">`; escolha Claro, Escuro ou
Automático (segue o sistema), guardada no navegador. Logo branco no escuro.

## 3. Tipografia

- Família: **Google Sans Flex** (Google Fonts), com `"Google Sans", Roboto, system-ui` de reserva. A variável CSS chama-se
  `--font-aptos` por herança; no app ela aponta para a Google Sans Flex. A Aptos e a manuscrita do Design System **não** entram
  nas telas de trabalho.
- Títulos em peso **400** (nunca negrito pesado), rótulos e botões em **500**, números grandes de indicador em **300**.
- Corpo 14/20; título de quadro 16/500; título de página 22–28/400; rótulo pequeno 12.
- **Sem caixa-alta espaçada** em rótulos, títulos de quadro ou colunas.
- Números alinhados com `font-variant-numeric: tabular-nums` em tabelas.
- Formato brasileiro sempre: `1.234,56`, `R$ 270.000`, `12,50 m`, `1.890 m²`, datas `06/11/2026`. Códigos e datas com espaço
  não separável para não quebrar no meio.

## 4. Formas, espaçamento e alinhamento

- Múltiplos de 4 px. Separar com **fio de 1 px e espaço**, não com sombra.
- **Botões em cápsula**: raio 20, altura 40 (32 nos compactos). Primário cheio azul; secundário contornado (`1px solid
  #747775`, texto azul); botão de texto sem contorno. Hover = véu de 8% da cor do texto.
- **Botão de criar = FAB tonal**, raio 16, fundo `#c2e7ff`. No celular, o FAB "+ Novo …" vira só o + ao rolar para baixo e volta
  ao rolar para cima; o aviso (snackbar) aparece acima dele.
- **Quadros (cards) contornados**, raio 12, para listas e fichas. **Blocos tonais**, raio 16, para indicadores. Janela
  (popup) raio 28. **Chips** retangulares raio 8, sempre tonais (fundo claro da cor, texto escuro da mesma cor).
- **Cabeçalho de quadro** (`.sec-h`, `.card-h`): altura mínima 56, recuo lateral `--q-px` = 24 (16 no celular), título 16/500 e
  botões centrados verticalmente; fio embaixo. Botão de texto no fim do cabeçalho compensa o próprio recuo para alinhar com a
  margem. O título quebra em linhas em vez de ser cortado; nunca espreme letra por letra (as ações descem para a linha de baixo).
- Listas dentro do quadro com o fio no mesmo recuo do título. Em lista chave/valor, se uma linha tem lápis, todas reservam a
  coluna.
- Quadro dentro de quadro: sem moldura própria (fio no lugar). Tabela dentro de quadro não tem moldura.
- **Respiro no celular**: linha de lista ocupa o quadro de borda a borda com o texto 16 px para dentro; o destaque nunca encosta
  no texto; linha de edição (nome + seletores) quebra em vez de espremer.
- Barras de rolagem finas em todo o sistema.

## 5. Moldura: menu lateral, barra de cima, perfil

- **Menu lateral em trilho (rail)**, no estilo do Gmail: começa **recolhido**, barra de 72 px com o ícone e um rótulo de 11 px
  embaixo (rótulos curtos, ex. "Admin", "Dash"); o item ativo tem a pílula `#c2e7ff` só em volta do ícone; a página começa a
  16 px da barra. No topo, o botão de recolher/expandir (só ícone) e, abaixo dele, o botão de criar. Aberto só quando a pessoa
  abre, e a escolha fica guardada no navegador.
- **No celular**, o menu vira barra inferior com indicador em pílula.
- **Barra de cima**: logo oficial BKM (SVG, mínimo 120 px) à esquerda, busca, sino de avisos e avatar à direita. Fora da
  produção, um **selo do ambiente** ("Desenvolvimento") ao lado do logo e `[DEV]` no título da aba.
- **Avatar** com a foto do Google (sem foto, a inicial); o menu dele traz nome, @ e papel, e "Sair". O papel vem do perfil, não
  é escolha na tela.
- **Sino**: avisos ao vivo; o clique marca como lido e abre o item no lugar certo, acendendo-o.
- Ícones: linha de 24 px (traço 1,75, pontas arredondadas) nos controles; os ícones BKM (linha bicolor, grade 96) na navegação
  principal, mínimo 24 px. Uma família por tela.

## 6. Campos e edição

### Edição no lugar (sem Editar nem Salvar)

- Quem pode editar já vê o **valor como campo**: parece texto; a linha de baixo aparece ao passar o mouse (cinza) e no foco
  (azul, 2 px). Lista mantém a setinha.
- Lendo ou editando, a **mesma grade no mesmo lugar e na mesma altura**: nada pula quando o campo vira campo.
- **Grava ao sair do campo** (texto, número, data) ou **ao escolher** (lista). Aviso curto "Salvo." embaixo.
- **Esc** volta o valor de antes. **Enter** passa para o próximo campo do mesmo quadro ou janela, como o Tab; no último, grava e
  sai (formulário é enviado; fora de formulário, o popup fecha). Textarea, busca e listas com sugestão ficam de fora.
- Vazio mostra o placeholder "Não informado" em itálico cinza, 14 px.
- Quem só lê vê texto.
- Gravações em fila, uma de cada vez, cada uma com a versão que a anterior devolveu (edição simultânea: o banco recusa versão
  antiga e a tela avisa).
- Código de referência: `apps/web/src/ficha/edicao.tsx` (`useVivo`, `Vivo`, `CampoVivo`, `proximoCampo`).

### Clique seleciona tudo

Clicar ou tocar num campo de texto ou número **seleciona todo o conteúdo** (para digitar por cima); o segundo clique põe o
cursor; arrastar para marcar um pedaço continua valendo. Foco dado pelo sistema não seleciona. (`lib/mascara.ts`)

### Máscaras ao digitar

Todo campo de número se formata **enquanto se digita**, com ponto de milhar e vírgula decimal, mantendo o cursor no lugar
(`apps/web/src/lib/mascara.ts`, atributo `data-fmt`):

| `data-fmt` | O que faz |
|---|---|
| `moeda` | até 2 casas; "R$" dentro do campo, à esquerda |
| `pct` | até 2 casas; "%" dentro do campo, à direita; ao sair, completa as 2 casas ("66" → "66,00") |
| `m` | metros, até 2 casas; ao sair, completa as 2; "m" dentro do campo |
| `num` / `int` | até 3 casas / inteiro |
| `tel` | (11) 98765-4321 (ou 8 dígitos) |
| `doc` | CPF ou CNPJ, decidido pelo número de dígitos |
| `cep` | 00000-000 |
| `none` | não mexe (coordenadas, filtros) |

- Sem `data-fmt`, o tipo sai do rótulo: "R$" → moeda, "%" → pct, "(m)" → metros.
- Atalhos **"270 mil"** e **"12 mi"** passam sem máscara e são lidos como 270.000 e 12.000.000.
- A unidade fica **dentro do campo** (componente `Adorno`): R$ antes; %, m e m² depois. Nos campos editados no lugar, número e
  unidade juntos como texto ("1.890 m²"), o campo com a largura do que tem dentro.
- E-mail grava em minúsculas; CPF, CNPJ e telefone gravam só os dígitos, conferindo dígito verificador e DDD.

### Campo obrigatório em branco

Nada de balão do navegador. O campo fica em vermelho com o aviso logo abaixo (`.campo-msg`, 12 px, `#b3261e`), a seção
recolhida que o tem abre, a página rola até ele e um aviso embaixo diz qual campo falta.

### Formulário esquecido

Com algo digitado e não registrado, se a pessoa parte para outra ação (clica fora, troca de aba, fecha a janela), aparece
"Você não registrou …" com **Continuar preenchendo** e **Descartar**. O Cancelar do próprio formulário não pergunta. Sair da
página usa o aviso do navegador. (`components/Rascunho.tsx`)

### Formulários de inclusão

Formulário de incluir item (matrícula, proprietário, tarefa, motivo...) fica **atrás de um botão "Adicionar …"**, não aberto
na tela. "Adicionar …" no fim de uma lista é texto cinza.

### Pessoa por @

Todo seletor de pessoa é um campo onde se digita @ e o nome, com busca aproximada (sem acento, letras na ordem, quem começa com
o digitado primeiro); setas e Enter escolhem; sair sem escolher volta o que estava. Em textos longos, @ menciona e avisa só
quem entrou agora no texto.

### Celular

O campo que ganha o foco nunca fica atrás do teclado: quando a área visível encolhe, ele rola para o meio do que sobrou.

## 7. Ir até o campo e acender

Quando algo leva a um campo (menu "o que falta", clique num log, aviso do sino):

1. Abre a aba e o quadro que têm o campo (se fechado).
2. Rola até a **"altura dos olhos"**: o campo logo abaixo do que fica preso no alto (barra das abas + título do quadro), com
   24 px de folga (16 no celular). Se a aba acabou e não há mais o que rolar, ganha um respiro embaixo, que sai quando a pessoa
   rola de volta.
3. Põe o foco no campo, **já com o conteúdo selecionado**.
4. **Acende** o item: verde-limão de marca-texto (`#e4f77a` com anel `#8aa400`), de propósito fora da paleta: espera 0,3 s, pisca
   uma vez, fica 0,7 s e apaga em 1,2 s (animação `acende`, 2,7 s, em `app.css`).

Código: `focar`, `rolarAteOlhos`, `acender` em `apps/web/src/ficha/edicao.tsx`.

**Completude**: "Ficha N% completa" no topo, com uma bolinha vermelha com o número do que falta; o clique abre o menu dos itens,
e cada item leva direto ao campo (passos acima). Quando o topo sai da vista, o mesmo menu vira um botão de alerta na barra das
abas.

## 8. Desfazer e refazer

- **Ctrl+Z** (⌘Z) fora de um campo desfaz a última alteração da pessoa na sessão, uma por vez, com o aviso "Desfeito: …".
  **Ctrl+Y** (ou Ctrl+Shift+Z) refaz, até a pessoa fazer outra alteração. Dentro de um campo vale o desfazer do navegador.
- Entra na pilha só o que se desfaz sem efeito colateral (campos, ajustes de desenho). O que tem regra, aprovação ou aviso
  próprio fica de fora.
- Pilha de até 50. Código: `apps/web/src/components/Desfazer.tsx` (`empilhar`).
- No histórico (logs), além do Ctrl+Z, há o **olhinho** (prévia sem a alteração, só para quem clicou) e a **lixeira** (desfaz de
  verdade, com confirmação; o log original fica riscado, nunca apagado).

## 9. Janelas, gavetas, menus e avisos

### Janela (popup / diálogo)

- Sobre um véu escuro; raio 28; título à esquerda e X à direita; rodapé com as ações (primária à direita).
- Abre com o foco no primeiro campo e devolve o foco ao fechar. Fecha no **X**, no **Esc** e no clique no véu.
- No celular, vira folha de baixo (bottom sheet) ou tela cheia.
- Conteúdo longo: o topo (título, indicadores, botões das seções) fica **fixo** e só o corpo rola; uma seção de cada vez, com
  "anterior" e "próxima" no fim.

### Gaveta

- Painel que entra pela **direita** (ficha sobre o mapa ou sobre a tabela, filtros) por cima do conteúdo, encostado na barra de
  cima. A gaveta da ficha segue o side sheet do Material 3 à risca (decisão do Moises, 11/nov/2026): sem fio na lateral nem no
  alto, sombra de elevação nível 3 (`0 1px 3px rgba(0,0,0,.3), 0 4px 8px 3px rgba(0,0,0,.15)`) e canto de 16 px no alto à
  esquerda; no escuro, fundo `#1e1f20`. É a exceção à regra "fio e espaço, não sombra" da seção 4: a gaveta flutua sobre a
  página, não é um quadro dentro dela.
- **Largura arrastável** pela borda (pega de 4×48 px que só aparece com o mouse em cima, no foco ou arrastando, e fica azul; cursor `col-resize`; setas do teclado
  também mudam, Shift dá passos maiores); mínimo 480 px; nunca cobre a lista do lado; **dois cliques voltam ao padrão**;
  guardada no navegador.
- Cabeçalho: código, nome, "Abrir página" e X. Fecha no X ou Esc (Esc não fecha se houver menu ou janela aberta por cima, nem
  com o foco num campo). Clicar noutro item com a gaveta aberta **troca o conteúdo** sem fechar.
- No celular, tela cheia.
- Filtros: gaveta de 400 px, uma seção por vez, botões das seções no cabeçalho com a contagem; no celular, "Ver N resultados" no
  rodapé. Na barra da página: botão Filtros com o número, um chip por filtro com X, Limpar e as visões salvas.

### Menus flutuantes

- Fecham no clique fora e no Esc.
- Menu "⋮" (três pontinhos) para ações secundárias. No mapa, ele **abre sozinho com o mouse parado por 0,75 s** e **fecha 1 s
  depois que o mouse sai** (sem foco de teclado dentro); fechado com o mouse em cima, só reabre sozinho depois que o mouse sai.
  No toque, só pelo toque.
- Painéis que se fecham sozinhos (legenda, card) têm um **olhinho para fixar** aberto, guardado no navegador.

### Avisos (snackbar)

- Embaixo, centralizado, escuro, some em ~3 s. Erro em vermelho. Mensagens curtas: "Salvo.", "Desfeito: Nome.".
- No celular, acima do FAB e da barra inferior.

### Dicas (tooltip)

- `title` nativo em todo botão só de ícone, dizendo o que faz e o atalho: "Fechar (Esc)", "Arraste para mudar a largura (dois
  cliques voltam ao padrão)". Botão sem espaço para texto vira só ícone e mantém a dica.
- `aria-label` em todo botão de ícone.

## 10. Abas e quadros que abrem e fecham

- **Ficha em abas**: topo com código, nome, situação e data; abaixo, a barra das abas **presa no alto ao rolar**. A barra rola de
  lado como roleta (dedo, mouse arrastado com a mãozinha, Shift + roda, deslize do trackpad, com inércia); arrastar não troca
  de aba; trocar traz a aba ativa para a vista com as vizinhas. No fim, o **⋮ com o índice de
  todas as abas**, a atual marcada (sem setas de aba anterior/próxima: a roleta já resolve, pedido do Moises de 10/nov/2026).
- **Subabas**: um item da barra pode juntar várias abas (Estudos Técnicos = Estudos de massa, Estudos de viabilidade, Entorno e
  Avaliação de infraestrutura). Aberto, mostra logo abaixo da barra uma linha de chips de filtro (raio 8, altura 32, contorno;
  o ativo no contêiner secundário `#c2e7ff`, no escuro `#004a77`), que rola de lado se não couber; no ⋮, as subabas recuadas
  sob o nome do grupo. Cada subaba tem o próprio endereço.
- Uma aba de cada vez, e ela está no endereço (`/terrenos/A123/comercial`).
- Dentro da aba, **cada quadro abre e fecha pela seta do título** e nasce fechado, menos o primeiro. A escolha vale na sessão.
  Editar, abrir formulário ou chegar a um item por link abre o quadro dele.
- O **título do quadro aberto fica preso** logo abaixo das abas enquanto o quadro passa pela tela.
- Nomes de abas curtos ("Terreno", "Comercial", "Entorno").

## 11. Mapa

Referência: o Google Maps atual. Código: `apps/web/src/pages/Mapa.tsx` e `apps/web/src/mapa/motor.ts`.

- **Google Maps JS** com marcadores avançados; sem chave, cai no Leaflet (Esri/OSM). Tipo padrão **Satélite com rótulos**; a
  escolha (Mapa ou Satélite) fica guardada. No escuro, a visão Mapa usa o esquema escuro do Google.
- **A vista (centro e zoom) fica guardada**: o mapa abre onde a pessoa deixou.
- **Lista lateral** de itens ao lado do mapa, com a **largura arrastável** pela borda (mínimo = só as bolinhas), guardada no
  navegador; dois cliques voltam ao padrão. Cada linha: bolinha com o código na cor da etapa, nome, informação curta e lupa.
- **Cor que aparece no satélite**: pino e poligonal (preenchimento a 18%) precisam ser vistos sobre a imagem. Cinza e azul-marinho
  somem; situação "neutra" usa tom claro (Backlog amarelo-claro `#fff176`, Descartado cinza-claro `#d9d4cf`) com o ponto e o
  código em tom escuro. Nunca pino cinza: parece lugar do Google.
- **Terreno = etiqueta com o código** (pedido do Moises, 10/nov/2026, no lugar do pino em gota): cápsula na cor do item da
  legenda com o código (A112) em negrito, borda branca de 2,5 px e contorno preto de 1,5 px, ponteiro para baixo e um ponto
  escuro com borda branca no lugar exato; fonte 13 px de perto, 15 px no zoom 14 (o máximo) e daí para longe 20% menor por nível, até 8 px (tudo em em). Nunca gota redonda:
  é o formato dos lugares do Google. Selecionado: anel azul `#0094fe` em volta da etiqueta e ponto azul. Sem balão. Clicar seleciona: a etiqueta acende e a linha se destaca na lista
  (rolando só a lista). Clique no vazio tira a seleção. No desktop, o clique abre a gaveta da ficha; no celular, um cartão sobre
  o mapa com X.
- **Barra de cima translúcida** (fundo com desfoque): busca de endereço (Google Places) **recolhida numa lupa redonda** que
  abre com o clique ou com o mouse parado 0,75 s; vazia e sem foco por 3 s, fecha sozinha; fica a 12 px da borda, a mesma
  distância do ⋮ à direita. No ⋮: tipo de mapa, camadas, filtros, régua.
- **Legenda** em árvore (grupo › subgrupo › item), começa fechada e lembra o estado; abre sozinha com o mouse parado 0,75 s,
  fecha 1 s depois que o mouse sai, e o **olhinho** a fixa. O título fica preso no alto enquanto a lista rola. Clicar na
  bolinha de um item apaga ou acende todos os itens dele (apagado fica cinza e some do mapa e da lista); o nome abre e fecha o
  ramo. "Limpar" acende tudo.
- **Botões do canto inferior direito** no jeito do Google Maps atual: pequenos (32 px), escuros (`rgba(32,33,36,.9)`), raio 8:
  Régua, Minha localização (ponto azul com círculo de precisão), Tela cheia. Sem o controle de câmera do Google. Sobem quando
  algo ocupa o canto.
- **Régua**: botão no canto (azul enquanto ligada). Cada clique marca um ponto e mostra a distância de cada trecho e o total;
  clicar no primeiro ponto (com 3 ou mais) fecha a forma e mede a área. Backspace apaga o último ponto; Del ou Esc apagam o
  desenho (sem desenho, desligam). Com ela ligada, o cursor do mapa é a seta.
- **Clique fora fecha** o que está aberto sobre o mapa (legenda não fixada, busca, quadro de um lugar, card não fixado). Card
  aberto também fecha quando o mapa se move, menos se fixado.
- **Criar no mapa**: clique direito (no celular, segurar no vazio; a tela só muda quando o dedo sai) abre um menu curto com
  "Novo … aqui". No desktop, dois cliques no vazio fazem o mesmo.
- **Desenhar e editar polígono**: no desktop, **sem barra** de instruções, só um aviso passageiro ao começar. Enter ou dois
  cliques salvam; Esc ou clique fora do mapa cancelam; Ctrl+Z desfaz o último ponto. Editando, todos os pontos aparecem e se
  arrastam direto; clique direito ou dois cliques num ponto abrem o menu dele (Excluir ponto, Adicionar ponto depois, Desfazer,
  Cancelar). Clique no mapa fora do polígono conclui. No celular, só os botões Cancelar e Concluir, sem texto. Ao salvar, o
  pino vai para o centro do polígono.
- **Camadas coloridas** (renda, densidade): faixas fixas (nunca quantis), legenda das cores no canto de cima, fechada como uma
  escala numa linha e aberta como lista; setor sem dado fica sem cor, nunca zero. Ao ligar uma camada, o mapa passa para a
  visão Mapa.
- **Camadas de pontos de terceiros** (concorrência): cores pastel, mais claras e menos saturadas que as dos nossos itens, para
  os terrenos da BKM continuarem sendo o que mais se destaca sobre o satélite; o desenho dentro do quadrado diz a situação.
  De longe (até o zoom 13), só se juntam pontos com a mesma categoria (situação e faixa), numa bolha redonda do tamanho do
  volume (unidades), sem número escrito: o número fica na dica; o clique aproxima até separar.
- Quadro de um lugar do Google: nome, nota e até 3 avaliações, com "Ver todas no Google Maps"; fecha no X, no clique no mapa ou
  no Esc; com o mouse, fecha 1 s depois que o mouse sai.
- **Tela cheia** do mapa cobre a página e, onde o navegador deixa, esconde as barras dele; Esc sai.
- Mini-mapa dentro de uma página: a roda do mouse rola a página e **Shift + roda dá zoom**.

## 12. Endereço, histórico do navegador e memória

- Toda navegação fica no endereço e o link abre direto a tela: `/terrenos/A123/comercial`, `/mapa/A123/ficha`,
  `/funil/fase/etapa`. Filtros em `#f=`. Troca de tela entra no histórico do navegador (voltar e avançar funcionam); abrir um
  quadro ou selecionar no mapa só atualiza o endereço.
- Código inexistente cai na lista com aviso.
- O login aparece no próprio endereço do link e, entrando, a tela abre.
- O que fica guardado no navegador: menu recolhido, tema, largura da lista e da gaveta, vista do mapa, tipo de mapa, legenda
  aberta/fixada, itens apagados. Camadas e filtros temporários se apagam depois de 30 min fora da página. Toda leitura e
  escrita de `localStorage` dentro de `try/catch` (navegador sem armazenamento não pode quebrar a tela).

## 13. Listas, tabelas e kanban

- Tabela: cada coluna ordena pelo primeiro dado dela; o clique no título passa por crescente, decrescente e sem ordem; várias
  colunas valem juntas na ordem dos cliques. Colunas compostas (nome em cima, código e endereço embaixo).
- Botões da página (Filtros, Visões, Tela cheia) na mesma linha do título.
- Tabela que não cabe vira **linha de lista** no celular.
- Kanban: arrastando um card, as colunas que aceitam ficam tracejadas e a que está sob o card acende; a de origem não; coluna
  que não aceita fica apagada e, soltando ali, o card volta com o aviso do que falta.
- Indicadores (Início, Dashboard): 4 iguais, sóbrios, fundo branco, contorno `#dde3ea`, faixa de 3 px na lateral (uma cor da
  paleta BKM por posição), número grande em peso 300 que encolhe com o quadro, rótulo `#5f6368`.

## 14. Celular

- Ponto de quebra principal: **900 px**. Abaixo disso: menu na barra inferior, gavetas e janelas em tela cheia, painel lateral
  vira seção da página, recuo de quadro 16 px.
- Toque longo faz o que o clique direito faz; a tela só muda quando o dedo sai.
- Botões só de ícone de 40 px quando o texto não cabe (classe `.oc-m` esconde o texto no celular; `.so-m` mostra só no celular).
- Áreas seguras (`env(safe-area-inset-*)`) respeitadas no topo e embaixo.

## 15. Texto na interface

- Verbos no botão: "Adicionar matrícula", "Abrir página", "Usar 3 lotes", "Agora não".
- Confirmação só para o que não se desfaz (excluir, cancelar). O resto grava direto e pode ser desfeito.
- Erro diz o que fazer: "O nome de referência é obrigatório."
- Valores calculados dizem que são estimados ("renda estimada") e linkam a metodologia.

---

## 16. Como reaproveitar no novo sistema

- Copie `apps/web/src/styles.css` (tokens e componentes) e `apps/web/src/app.css` como ponto de partida, ou extraia deles só os
  blocos "Tema Google", "Alinhamento", "Respiro" e "Tema escuro".
- Reuse direto: `lib/mascara.ts` (máscaras, seleção ao clicar, campo visível no celular), `components/Desfazer.tsx`
  (Ctrl+Z/Ctrl+Y), `components/Rascunho.tsx` (formulário esquecido), `useVivo`/`focar`/`acender` de `ficha/edicao.tsx`,
  `Dialogo` e `ToastProvider` de `components/ui.tsx`, a moldura de `components/Moldura.tsx`, a gaveta de `ficha/Gaveta.tsx`.
- Logo e ícones: `apps/web/public/marca/`.
- Mesma stack: React 18 + TypeScript + Vite, TanStack Query, react-router, Supabase; sem biblioteca de UI.
- Quando o novo sistema se juntar ao BKM Terrenos, o ideal é que esses pedaços virem um pacote compartilhado (como já previsto
  para as telas de tarefas).

---

## 17. Texto para as instruções do novo projeto

Para colar nas instruções do projeto novo no Claude Code (ajuste o nome do sistema e do repositório novo):

```text
Idioma: português, nas respostas, no produto, no código de domínio e nos commits.
Seja direto, sem bajulação, e não concorde por concordar: questione o que for afirmado e diga quando algo estiver errado.
Evite jargão nas respostas ao Moises (o nome dele é sem acento).

Este sistema é da BKM e vai se juntar, no visual e no código, ao BKM Terrenos (repositório Mbekerman/bkm_terrenos-claude).
Antes de desenhar qualquer tela, leia no repositório do BKM Terrenos:
- docs/diretrizes-design-ux.md (as diretrizes de design e UX; siga todas);
- CLAUDE.md, seção "Visual" (as decisões do Moises com data);
- apps/web/src (o front React: styles.css, app.css, components/, lib/mascara.ts, ficha/edicao.tsx, pages/Mapa.tsx).
Siga o Design System BKM (https://claude.ai/artifact/N76hgnKi7LrCSpCusmwFCL) para marca, logo, ícones e tom de voz; nas telas
de trabalho, a linguagem é o Material 3 do Google sobre a marca BKM, como no BKM Terrenos.
Mesma stack do BKM Terrenos: React 18 + TypeScript + Vite, TanStack Query, react-router, Supabase; sem biblioteca de UI.
Reaproveite os componentes do BKM Terrenos em vez de reinventar (copie e cite de onde veio).

Fluxo de branches: develop é o ambiente de desenvolvimento e main é produção. Todo trabalho vai num branch próprio, com PR para
develop; produção só por PR develop → main, quando o Moises pedir. Nada de PR direto na main, salvo correção urgente.
Regra de negócio mora no banco (funções no Postgres), com teste.
Mudanças visuais vêm com imagens (desktop e celular) para o Moises conferir.
```
