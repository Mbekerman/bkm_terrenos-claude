# 18. Pipeline (tabela de terrenos)

## Para que serve

Ver todos os terrenos numa tabela, lado a lado, para comparar área, projeto, preço, corretor e temperatura, e abrir a ficha de qualquer um sem sair da lista.

## Onde abrir

No menu lateral, **Terrenos** (o primeiro item). A página se chama **Pipeline**. Endereço: `/terrenos`.

## As colunas

| Coluna | O que mostra | Ordena por |
|---|---|---|
| **Terreno** | Nome em cima; código e endereço embaixo; o olhinho à esquerda | nome |
| **Cidade** | Município | cidade |
| **Região** | Zona Norte, Zona Sul, Centro... | região |
| **Imóvel** | Área adotada, zoneamento ("ZM / ZC") e perfil topográfico | área |
| **Projeto** | VGV e unidades do estudo de viabilidade válido; "Sem estudo válido" quando não há | VGV |
| **Negociação** | Pedida (valor pedido da oferta de referência) e Proposta (a proposta ativa) | valor pedido |
| **Corretor** | O corretor principal e a imobiliária; com mais de um, "+N corretores" (o mouse em cima mostra os nomes) | primeiro corretor |
| **Temperatura** | As barrinhas de 1 a 5 | temperatura |
| **Responsável** | A foto (ou as iniciais) de quem cuida do terreno; o mouse em cima mostra o nome | nome |

O que ainda não foi preenchido aparece em cinza: "Sem área", "Zoneamento não consultado", "Topografia não medida", "Sem corretor".

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

- **Olhinho** (coluna Terreno): abre a ficha completa e editável numa gaveta à direita, que cobre a tabela a partir da primeira coluna. A linha do terreno fica acesa. O endereço vira `/terrenos/A123/gaveta`, e o link abre direto assim.
- Com a gaveta aberta, **clicar noutra linha** troca o terreno da gaveta. O olhinho do mesmo terreno, o **X** ou o **Esc** fecham.
- A largura da gaveta se arrasta pela borda esquerda (dois cliques voltam ao padrão), como a gaveta do Mapa.
- O botão de tela, no alto da gaveta, abre a ficha na página dela.
- Sem gaveta, **clicar na linha** abre a ficha na página dela; o botão de voltar da ficha volta para **Terrenos**.

## Tela cheia

**Tela cheia** (no alto, à direita) faz a tabela cobrir a página e, onde o navegador deixa, esconde as barras dele. **Esc** ou **Sair da tela cheia** voltam.

## O que não é possível

- Editar valores direto na tabela: a edição é na ficha (na gaveta ou na página).
- Escolher quais colunas aparecem.
