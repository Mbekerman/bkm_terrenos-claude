# 18. Pipeline (tabela de terrenos)

## Para que serve

Ver todos os terrenos numa tabela, lado a lado, para comparar área, projeto, preço, corretor e temperatura, e abrir a ficha de qualquer um sem sair da lista.

## Onde abrir

No menu lateral, **Terrenos** (o primeiro item). A página se chama **Pipeline**. Endereço: `/terrenos`.

## As colunas

Os terrenos ficam sempre **agrupados por cidade**, com um título para cada cidade e quantos terrenos ela tem (veja "Cidades", abaixo).

| Coluna | O que mostra | Ordena por |
|---|---|---|
| **Terreno** | Nome em cima; código e endereço embaixo (o endereço longo termina em "…"; o mouse em cima mostra inteiro) | nome |
| **Região** | Zona Norte, Zona Sul, Centro... | região |
| **Imóvel** | Área adotada, zoneamento ("ZM / ZC") e perfil topográfico | área |
| **Estudo de massa** | Unidades e área privativa total do estudo de massa válido, com o **olho** à direita, que abre o estudo numa janela | unidades |
| **Viabilidade** | VGV e **L.L.** (margem líquida: lucro líquido ÷ VGV líquido, o mesmo número de "Margem líquida" no popup do estudo) do estudo de viabilidade válido, com o **olho** à direita, que abre o estudo no popup | VGV |
| **Pedida** | O que a oferta de referência pede, em três linhas: dinheiro, permuta financeira ("6% VGVL") e permuta física ("8 Unid." ou "12% física"); a linha do que não foi pedido fica com o traço | dinheiro pedido |
| **Proposta** | O que a proposta ativa oferece, nas mesmas três linhas e na mesma ordem, com o mínimo garantido entre parênteses quando houver ("6% VGVL (mín. R$ 2 mi)", "15% física (mín. 6 Unid.)"); dividido em partes, a soma das propostas ativas das partes | dinheiro da proposta |
| **Corretor** | O corretor principal e a imobiliária; com mais de um, "+N corretores" (o mouse em cima mostra os nomes) | primeiro corretor |
| **Temperatura** | As barrinhas de 1 a 5 e o número | temperatura |
| **Responsável** | A foto (ou as iniciais) de quem cuida do terreno; o mouse em cima mostra o nome | nome |

As células de **Estudo de massa**, **Viabilidade**, **Empreendimento**, **Pedida** e **Proposta** mostram só os valores, um por linha, sem rótulo. O **ⓘ** depois do título dessas colunas abre um balão com o que é cada linha, de cima para baixo (fecha no clique fora, no Esc ou no ⓘ). O mouse parado sobre um valor também diz o que ele é. Em **Estudo de massa** e **Viabilidade**, a coluna tem a largura do que mostra, e o olho fica na mesma reta do ⓘ do título: logo depois do título ou, quando os valores são mais largos que ele, logo depois dos valores. Cada cidade tem uma linha cinza em cima e embaixo da sua faixa.

O que não foi preenchido aparece como um traço cinza (—); o mouse em cima diz o que falta ("Sem corretor", "Sem estudo de massa válido"...).

Os olhos não abrem a ficha: a janela do estudo abre sobre a tabela. Na janela do estudo de massa, quem edita pode mudar o estudo, ver o pedido e criar o estudo de viabilidade, como na aba Estudos Técnicos da ficha.

## Tela menor

Quando a tabela não cabe na largura, as colunas saem nesta ordem: **Responsável**, **Temperatura**, **Corretor**; depois **Estudo de massa** e **Viabilidade** viram uma coluna só, **Empreendimento** (VGV, unidades e L.L., com um olho para cada estudo); depois saem **Região**, **Proposta**, **Pedida** e **Empreendimento**. Terreno e Imóvel ficam sempre. No celular, cada linha mostra só o terreno e o imóvel.

## Cidades

- O título de cada cidade fica **preso no alto da tabela** enquanto passam os terrenos dela, logo abaixo dos títulos das colunas.
- Clicar no título (ou na seta) **recolhe** os terrenos daquela cidade; clicar de novo mostra.
- Para **mudar a ordem das cidades**, arraste o título pela alça de seis pontos, à esquerda. Uma linha azul mostra onde a cidade vai cair. Pelo teclado, com o foco no título, **Alt + ↑** e **Alt + ↓**. No celular, as setas ↑ e ↓ no título sobem e descem a cidade.
- A ordem das cidades e as recolhidas ficam guardadas no seu navegador. Cidade que você ainda não arrumou entra em ordem alfabética, depois das arrumadas; "Sem cidade" fica por último.
- A ordenação pelo título das colunas vale dentro de cada cidade.

## Ordenar

- Clique no **título** da coluna: o primeiro clique ordena crescente (↑), o segundo decrescente (↓) e o terceiro tira a ordem daquela coluna.
- Várias colunas valem juntas, na ordem em que foram clicadas: a primeira manda e as seguintes desempatam. Com mais de uma, cada título mostra o número da sua posição.
- Quem não tem o dado fica sempre no fim.
- **Tirar ordenação**, no alto, volta à ordem padrão: temperatura (mais quente primeiro) e código.
- A ordenação é a mesma da aba **Ordenação** da gaveta de Filtros desta página e fica guardada no seu navegador: o Pipeline abre com a última que você escolheu. Ela também vai no endereço da página.

## Filtrar e buscar

- **Filtros** e **Visões salvas** funcionam como no Mapa e no Funil, com a seleção própria do Pipeline (filtrar aqui não muda as outras páginas). Ver [11. Filtros e visões](11-filtros-e-visoes.md).
- A **busca da barra de cima** filtra a tabela na hora: nome, código, endereço, bairro, cidade, corretor, matrícula ou SQL.
- Embaixo do título, "N de M terrenos" diz quantos passaram pelos filtros.

## Abrir a ficha

- **Clicar em qualquer lugar da linha** abre a ficha completa e editável numa gaveta à direita, que cobre a tabela a partir da primeira coluna. A linha do terreno fica acesa. O endereço vira `/terrenos/A123/gaveta`, e o link abre direto assim.
- Com a gaveta aberta, **clicar noutra linha** troca o terreno da gaveta. Clicar de novo na mesma linha, o **X**, o **Esc** ou um **clique fora da tabela e da gaveta** (no título da página, no espaço abaixo das linhas, na barra de cima) fecham. Se houver um menu, um balão, uma janela ou um campo sendo editado, o Esc ou o clique fecham primeiro isso, e só o seguinte fecha a gaveta.
- A largura da gaveta se arrasta pela borda esquerda (dois cliques voltam ao padrão), como a gaveta do Mapa.
- O botão de tela, no alto da gaveta, abre a ficha na página dela.
- Aberta a ficha na página, o botão de voltar dela volta para **Terrenos**.

## Tela cheia

**Tela cheia** (no alto, à direita) faz a tabela cobrir a página e, onde o navegador deixa, esconde as barras dele. **Esc** ou **Sair da tela cheia** voltam.

## O que não é possível

- Editar valores direto na tabela: a edição é na ficha (na gaveta ou na página).
- Escolher quais colunas aparecem.
- Mudar a ordem das cidades no celular arrastando (use as setas).
