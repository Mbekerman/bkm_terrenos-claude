# 04. Ficha do terreno: topo, abas e Visão geral

**Disponível.** A ficha abre de três jeitos:

- na **gaveta** da página Mapa (clique no pino, na poligonal ou na lupa da linha; endereço `/mapa/A123/ficha`);
- em **página própria** (botão "Abrir página" na gaveta, ou endereço `/terrenos/A123`);
- pelo **Funil**, clicando no card do terreno.

## Para que serve

A ficha reúne tudo sobre um terreno: onde fica, de quem é, quanto pedem, o que a lei deixa construir, o que tem em volta, em que etapa está a negociação e o histórico de tudo que mudou.

## Como a ficha é organizada

De cima para baixo:

1. **Linha do tempo** das etapas (ou das fases, depois da compra), com a data de entrada em cada uma.
2. **Topo**: código, nome, **fase · etapa · subetapa**, "Cadastrado em", **temperatura**, **responsável** e **"Ficha N% completa"**.
3. **Barra das abas**, que fica presa no alto ao rolar.
4. O conteúdo da **aba** escolhida.
5. À direita, o **painel** com o quadro de avanço e Ações, Tarefas e Logs (ver [09](09-avanco-e-logs.md)).

Com mais de uma fase aberta, o topo mostra a mais adiante.

## Temperatura

A temperatura diz o quanto a negociação está promissora. São 5 barras: **Muito fria, Fria, Morna, Quente, Muito quente**. Clique na barra para escolher; clicar de novo na mesma barra apaga (volta a "Temperatura não avaliada").

**Regra:** a temperatura é da negociação. Terreno em Backlog (sem oferta) não tem negociação, e por isso não tem temperatura.

## "Ficha N% completa"

Mostra quanto dos 11 itens que importam para decidir a compra está preenchido. A bolinha vermelha diz quantos faltam. Clique para ver a lista; escolha um item e o sistema **abre a aba, abre o campo em edição e rola até ele**, que acende em verde-limão por um instante.

Os 11 itens:

| Item | Onde se preenche |
|---|---|
| Endereço completo (logradouro, número, bairro) | Terreno › Endereço e localização |
| Zona | Terreno › Endereço e localização |
| Ponto no mapa | Poligonal no mapa |
| Área adotada | Terreno › Áreas e dimensões |
| Testada | Terreno › Áreas e dimensões |
| Matrícula | Terreno › Matrículas e SQLs |
| Inscrição e IPTU | Terreno › Matrículas e SQLs |
| Proprietário | Terreno › Partes (lápis da parte) |
| Zoneamento | Terreno › Parâmetros urbanísticos › Registrar zonas (ou automático pelo GeoSampa) |
| Valor pedido | Comercial › Condições pedidas (ou registrar oferta) |
| Temperatura | Topo da ficha |

Quando você rola e o topo sai da vista, a barra das abas mostra um **botão de alerta** com a bolinha vermelha, que abre a mesma lista.

**Visita técnica** não entra na conta enquanto a aba Infraestrutura não existir no sistema real (ela só está no protótipo): antes, ela deixava toda ficha presa abaixo de 100% sem ter onde preencher. Volta para a lista quando a aba for portada.

## Barra das abas

As abas, nesta ordem: **Visão geral, Terreno, Comercial, Estudos de massa, Viabilidades, Infraestrutura, Entorno, Jornada, Documentos**.

| Aba | Situação | Seção do manual |
|---|---|---|
| Visão geral | Disponível | esta |
| Terreno | Disponível | [05](05-ficha-terreno.md) |
| Comercial | Disponível | [06](06-ficha-comercial.md) |
| Parâmetros urbanísticos | Disponível, como seção da aba Terreno | [07](07-ficha-parametros.md) |
| Entorno | Disponível | [08](08-ficha-entorno.md) |
| Estudos de massa, Viabilidades, Infraestrutura, Jornada, Documentos | **Ainda não disponível** (mostram "Esta aba entra depois da primeira versão") | [12](12-ainda-nao-disponivel.md) |

**Como andar pelas abas:**

- Clique na aba.
- A barra é uma faixa contínua, como uma roleta: as abas das pontas aparecem cortadas pela borda. Para rolar a faixa sem trocar de aba: **Shift + roda do mouse**, deslize de lado no trackpad, ou **arraste com o mouse** (com o mouse em cima, o cursor é o dedinho, como em qualquer botão; vira mão fechada enquanto você segura o botão do mouse). Solta com força, ela continua rodando e freia aos poucos.
- As **setas** no fim da barra vão para a aba anterior e a próxima.
- O **⋮ "Mais ações"** lista todas as abas, com a atual marcada.

Cada aba tem seu endereço (`/terrenos/A123/comercial`), então dá para mandar o link direto para uma aba.

## Quadros que abrem e fecham

Em todas as abas menos a Visão geral, o conteúdo fica em **quadros** que abrem e fecham pela **seta do título**. O primeiro quadro da aba nasce aberto; os outros, fechados. O sistema lembra o que você abriu durante a sessão, por aba. Editar um campo, abrir um formulário ou chegar a um item pelo log ou pelo aviso abre o quadro dele.

O título do quadro aberto fica preso logo abaixo das abas enquanto você rola o conteúdo dele.

## Editar no lugar

Quem pode editar (analista, gestor, diretor) vê cada valor como um campo com cara de texto. Não há botão Editar nem Salvar.

1. Clique no valor. O conteúdo fica todo selecionado; digite para substituir (o segundo clique põe o cursor).
2. Saia do campo (Tab, Enter, ou clique fora) ou escolha na lista: **grava na hora**.
3. **Esc** volta o valor que estava antes.

As gravações vão em fila, na ordem em que você fez. Se outra pessoa mudou a ficha ao mesmo tempo, o sistema recusa a gravação velha para não apagar o que ela fez; recarregue a página e repita.

Leitura e Básico veem os valores como texto, sem campos.

## Visão geral

Duas metades: **à esquerda o mapa, à direita o Resumo**. Em tela estreita, o mapa vem primeiro.

### Mini-mapa (Localização)

- Mostra a poligonal em azul e o pino.
- A **roda do mouse rola a página**; **Shift + roda** dá zoom.
- **Dois cliques em qualquer ponto dentro da poligonal** (não só sobre a linha) começam a edição ali mesmo: arraste os pontos; clique direito ou dois cliques num ponto abrem o menu do ponto; **clique no mini-mapa fora da poligonal, dois cliques ou Enter salvam**; clique fora do mini-mapa ou **Esc** cancelam; Ctrl+Z desfaz.
- **Dois cliques no resto do mapa** abrem a página Mapa centrada no ponto, com o terreno selecionado.
- Sem poligonal, aparece "Sem localização."

Leitura não edita a poligonal.

### Resumo

Cada linha tem uma **seta** que leva à aba onde o dado mora.

| Linha | O que mostra | Como mudar |
|---|---|---|
| **Endereço** | Logradouro, número, bairro | Lápis **"Editar no mapa"**: abre a página Mapa com a poligonal em edição (ver [05](05-ficha-terreno.md#endereço-e-localização)). |
| **Município e região** | Município · UF · Zona | O seletor de **Zona** (Norte, Sul, Leste, Oeste, Centro...) se edita ali mesmo. |
| **Zoneamento** | As zonas, separadas por barra ("ZC / ZM / ZEU") | Terreno › Parâmetros urbanísticos (a seta abre a seção em Índices urbanísticos). |
| **Área adotada** | Área e a fonte | O seletor de **fonte** troca a área adotada ali mesmo. |
| **Unidades do estudo válido** e **VGV do estudo válido** | Do estudo de viabilidade válido | **Ainda não disponível**: ficam vazias até a viabilidade chegar ao sistema real. |
| **Distância do metrô ou trem** | Estação mais próxima, minutos a pé | Automático (aba Entorno). |
| **Valor pedido na entrada** | Valor da **primeira** oferta, com a data | Aba Comercial. |
| **Perfil topográfico** | Plano, Inclinado, Acidentado... | **Ainda não disponível** no sistema real (relevo entra depois). |
| **Corretor** | Corretor principal e imobiliária | Aba Comercial. |

Linhas sem dado mostram "Não informado" ou "Falta preencher".

## Gaveta da ficha no Mapa

Igual à página, com:

- o **cabeçalho** com o código, o nome, a **temperatura** e o ícone **Abrir página** (o nome aparece ao parar o mouse), que leva à ficha em tela própria;
- o topo da ficha sem repetir o cabeçalho: no lugar da linha "fase · etapa · subetapa", o nome da fase fica em cima da linha do tempo, que já marca a etapa e a subetapa; ficam "Cadastrado em" (e a situação, quando é Stand By, Perdido ou Descartado), o responsável e "Ficha N% completa". No celular, onde a linha do tempo some, a fase · etapa · subetapa continua no topo;

- **X** ou **Esc** para fechar;
- a borda esquerda arrastável (mínimo 640 px; dois cliques voltam ao padrão);
- clicar noutro terreno no mapa troca o terreno da gaveta.

A gaveta da ficha e a gaveta de filtros não abrem juntas.

## O que não é possível na ficha hoje

- As abas Estudos de massa, Viabilidades, Infraestrutura, Jornada e Documentos.
- Digitar o endereço (CEP, rua, bairro, município) direto: ele vem do mapa.
- Ver a ficha em tema escuro.
- Imprimir ou exportar a ficha.
