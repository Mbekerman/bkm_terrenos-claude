# Ficha: Estudos de viabilidade

## Para que serve

Montar o **estudo de viabilidade estática** do terreno: quantas unidades cabem, por quanto se vendem, quanto custam o terreno, a obra e as despesas, e quanto sobra (lucro e margem). Um terreno pode ter vários estudos; um deles é o **válido**, o que vale para a negociação. É dele que saem as **Unidades** e o **VGV** do Resumo da Visão geral e o filtro "VGV estimado".

O estudo está chegando ao sistema em partes. **Hoje:** a lista de estudos, o Resumo da viabilidade e, no estudo, os indicadores e todas as seções (Tipologias, Terreno, Comercial, Obras, Gerais, Financeiras, Taxas e DRE). Os modelos de estudo e o vínculo com o estudo de massa chegam nas próximas entregas (ver [Ainda não disponível](12-ainda-nao-disponivel.md)).

## Onde fica

Ficha do terreno › **Estudos Técnicos** › **Estudos de viabilidade** (`/terrenos/A123/viabilidade`). Um estudo aberto tem endereço próprio, pela ordem em que foi criado no terreno: `/terrenos/A123/viabilidade/2` abre o segundo estudo. O link enviado a um colega abre direto nele.

## Resumo da viabilidade

O primeiro quadro da parte.

| O que aparece | De onde vem |
|---|---|
| **Estudo válido** | Seletor com todos os estudos do terreno (nome e margem). Escolher um o marca como válido. Só funciona com a negociação ativa e para quem edita. |
| **Abrir estudo** | Abre o estudo válido. |
| **Novo estudo** | Cria um estudo e já o abre. |
| **Margem líquida** e **Mínima da empresa** | A margem do estudo válido e a rentabilidade mínima da empresa (quando o administrador definiu uma). |
| Tabela | VGV líquido, valor pedido, última proposta e lucro líquido, cada um em % do VGV líquido. |
| Aviso **Rentabilidade abaixo da mínima** | Quando a margem do estudo válido fica abaixo da mínima da empresa. O mesmo aviso aparece no formulário de Nova proposta (aba Comercial), como "Levar ao comitê" nas Próximas ações do painel e no cartão do terreno no Funil. |

Sem estudo, o quadro mostra "Sem estudo" e o link **Montar estudo**.

## Quadro Viabilidade

A lista dos estudos do terreno, com VGV líquido, lucro líquido, margem, a data da última alteração e a coluna **Válido** (clique no círculo para marcar o válido). O nome abre o estudo. **Novo estudo** no título cria outro.

## O estudo (janela sobre a ficha)

**Como abrir:** clique no nome do estudo na lista, em **Abrir estudo** ou em **Novo estudo**.

**Como fechar:** o **X** no canto, **Esc**, ou clique fora da janela.

**No topo:** o terreno, o selo **Válido** (quando é o válido), o **nome do estudo** (clique e digite para trocar; grava ao sair do campo) e a data da última alteração. À direita, para quem edita:

- **Marcar como válido**: só com a negociação ativa e quando o estudo ainda não é o válido.
- **Duplicar**: cria "Cópia de …" com tudo do estudo e a abre.
- **Apagar**: pede confirmação. O estudo válido não se apaga (marque outro como válido antes).

**Indicadores** (ficam presos no topo ao rolar): **VGV**, **VGV líquido**, **Lucro líquido** e **Margem líquida**. Eles se refazem enquanto você digita.

**Botões das seções** (logo abaixo, também presos): Tipologias, Terreno, Comercial, Obras, Gerais, Financeiras, Taxas e DRE, cada um com o total e o % do VGV. Financeiras e Taxas só aparecem para a diretoria e o administrador. No fim de cada seção, os botões levam à anterior e à próxima.

### Tipologias

Uma linha por tipo de unidade:

| Campo | Observação |
|---|---|
| **Tipologia** | O nome (ex.: "2 dormitórios"). |
| **Área privativa** | Em m². |
| **Quantidade** | Unidades dessa tipologia. |
| **Em permuta** | Unidades que vão para o dono do terreno (permuta física). |
| **Comissão** | Unidades dadas na comissão do terreno. |
| **Preço unitário** e **Preço por m²** | Ligados: com a área preenchida, mudar um refaz o outro. Mudar a área refaz o preço por m². |
| **VGV** | Quantidade × preço unitário (só leitura). |

- **Adicionar tipologia** no título da seção cria uma linha nova; o **X** no fim da linha a tira.
- Cada campo grava sozinho ao sair dele.
- Permuta e comissão juntas não passam da quantidade: o sistema avisa e ajusta.
- O estudo novo já vem com a "Tipologia 1" para preencher.
- A linha **Total** soma a área privativa, as unidades, a permuta e a comissão, e mostra o preço médio, o preço médio por m² e o VGV.

### Terreno

O custo do terreno no estudo.

| Campo | Observação |
|---|---|
| **Permuta física** e **Comissão em unidades** | Só leitura: vêm das unidades em permuta e em comissão das Tipologias, pelo preço delas. |
| **Permuta financeira** | Percentual do VGV líquido que vai ao dono do terreno. |
| **Dedução do VGV** | Percentual tirado do VGV antes de calcular a permuta financeira. |
| **Mínimo garantido** | Valor mínimo da permuta financeira: vale o maior entre ele e o percentual. |
| **Deduzir do VGV** | Caixas para tirar ITBI, registro e Produto Caixa da base da permuta financeira. |
| **Valor da permuta financeira** | Só leitura, já com o mínimo garantido quando ele vale. |
| **Pagamento em dinheiro** e **Comissão em dinheiro** | O que se paga pelo terreno e a comissão, em reais. |

### Comercial

Despesas de venda (corretagem, marketing, stand...). Cada linha tem a **base**: % do VGV, verba total, verba por unidade (pelas unidades vendidas, sem permuta e comissão) ou verba mensal, com a coluna **Meses**. "% do VGV" é sempre sobre o VGV vendido.

### Obras

Em quadros, todos fechados ao abrir a seção (a seta do título abre cada um; o título mostra o total e o % do VGV):

- **Custo de obra incidente**, com **Custo de obra típico** (a linha "Custo de obra raso", R$/m² × área; a área pode ser a privativa das Tipologias ou a construída, que aí se digita) e **Custo de obra atípico** (itens fora do padrão).
- **Não incidente**, **Projetos** e **Pós-obra**.

Cada linha escolhe o item na lista da empresa (digite para buscar), a base (% do VGV, % de uma camada de cima ou verba) e o valor. **Adicionar …** no fim do quadro cria a linha; o **X** a tira.

### Gerais

Despesas gerais em quatro quadros, como em Obras: **Terreno**, **Incorporação**, **CEF** e **Administrativo e financeiro**, com as bases % do VGV, % da obra total, % do lucro líquido ou verba.

### Financeiras (só diretoria e administrador)

**Despesas financeiras**, que entram depois do EBITDA: Custo de alavancagem, Custo de juros PJ (% do custo de obra total), Custo financeiro e Impostos, com as mesmas bases das outras seções, e Custo de capital da permuta financeira e do pagamento do terreno, em % sobre o **aporte** (o dinheiro da permuta financeira, com o mínimo garantido quando ele vale, e o pagamento em dinheiro do terreno). Os itens são fixos e nascem com o valor padrão da empresa.

### Taxas (só diretoria e administrador)

Itens fixos com % do VGV, % da obra total, % do lucro líquido ou verba, nascidos com o valor padrão da empresa. Saem por último, depois do resultado sem as taxas.

### DRE

O resultado do estudo, do VGV ao lucro, com o valor e o % da receita líquida de cada linha: receita bruta, permuta e comissão em unidades, deduções, receita líquida, terreno, obras, lucro bruto, comerciais, gerais, EBITDA, despesas financeiras, resultado e margem sem as taxas, taxas e lucro líquido. Cada grupo mostra o detalhe embaixo. Fora da diretoria, Financeiras e Taxas aparecem só pelo total. Só leitura: muda conforme as outras seções.

## Quem pode

- **Analista, gestor e diretor**: criam, editam, duplicam, apagam e marcam o válido.
- **Leitura**: só vê (campos travados, sem botões).
- **Financeiras** e **Taxas**: só a diretoria e o administrador veem e mudam. Para os demais, o resultado já conta com elas pelo total.

## O que não é possível hoje

- Escolher um modelo ao criar o estudo e "Salvar como modelo". Sem escolha, o estudo nasce com o modelo padrão da empresa, se houver.
- Ligar o estudo a um estudo de massa.
- Configurações › Viabilidade (lista de itens, margem mínima, modelos da empresa).
