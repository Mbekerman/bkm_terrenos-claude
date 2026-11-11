# Ficha: Estudos de viabilidade

## Para que serve

Montar o **estudo de viabilidade estática** do terreno: quantas unidades cabem, por quanto se vendem, quanto custam o terreno, a obra e as despesas, e quanto sobra (lucro e margem). Um terreno pode ter vários estudos; um deles é o **válido**, o que vale para a negociação. É dele que saem as **Unidades** e o **VGV** do Resumo da Visão geral e o filtro "VGV estimado".

O estudo tem a lista de estudos, o Resumo da viabilidade, os indicadores, as oito seções (Tipologias, Terreno, Comercial, Obras, Gerais, Financeiras, Taxas e DRE), os modelos de estudo e o vínculo com o estudo de massa. Configurações › Viabilidade ainda não está no sistema (ver [Ainda não disponível](12-ainda-nao-disponivel.md)).

## Onde fica

Ficha do terreno › **Estudos Técnicos** › **Estudos de viabilidade** (`/terrenos/A123/viabilidade`). Um estudo aberto tem endereço próprio, pela ordem em que foi criado no terreno: `/terrenos/A123/viabilidade/2` abre o segundo estudo. O link enviado a um colega abre direto nele.

## Resumo da viabilidade

O primeiro quadro da parte.

| O que aparece | De onde vem |
|---|---|
| **Estudo válido** | Seletor com todos os estudos do terreno (nome e margem). Escolher um o marca como válido. Só funciona com a negociação ativa e para quem edita. |
| **Abrir estudo** | Abre o estudo válido. |
| **Novo estudo** | Cria um estudo e já o abre. Com algum modelo salvo, pergunta antes o nome e o modelo (ver [Modelos de estudo](#modelos-de-estudo)). |
| **Margem líquida** e **Mínima da empresa** | A margem do estudo válido e a rentabilidade mínima da empresa (quando o administrador definiu uma). |
| Tabela | VGV vendido, valor pedido, última proposta e lucro líquido, cada um em % do VGV vendido. |
| Aviso **Rentabilidade abaixo da mínima** | Quando a margem do estudo válido fica abaixo da mínima da empresa. O mesmo aviso aparece no formulário de Nova proposta (aba Comercial), como "Levar ao comitê" nas Próximas ações do painel e no cartão do terreno no Funil. |

Sem estudo, o quadro mostra "Sem estudo" e o link **Montar estudo**.

## Quadro Viabilidade

A lista dos estudos do terreno, com VGV vendido, lucro líquido, margem, a data da última alteração e a coluna **Válido** (clique no círculo para marcar o válido). O nome abre o estudo. **Novo estudo** no título cria outro.

## O estudo (janela sobre a ficha)

**Como abrir:** clique no nome do estudo na lista, em **Abrir estudo** ou em **Novo estudo**.

**Como fechar:** o **X** no canto, **Esc**, ou clique fora da janela.

**No topo:** o terreno, o selo **Válido** (quando é o válido), o **nome do estudo** (clique e digite para trocar; grava ao sair do campo) e a data da última alteração. À direita, para quem edita:

- **Marcar como válido**: só com a negociação ativa e quando o estudo ainda não é o válido.
- **Duplicar**: cria "Cópia de …" com tudo do estudo e a abre.
- **Salvar como modelo**: guarda o estudo como modelo para os próximos (ver [Modelos de estudo](#modelos-de-estudo)).
- **Apagar**: pede confirmação. O estudo válido não se apaga (marque outro como válido antes).

**Indicadores** (ficam presos no topo ao rolar): **VGV**, **VGV vendido**, **Lucro líquido** e **Margem líquida**. Eles se refazem enquanto você digita. A receita do estudo é o **VGV vendido** (o VGV sem as unidades de permuta e de comissão), e a margem líquida é o lucro líquido ÷ VGV vendido.

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
| **Dedução do VGV** | Percentual tirado do VGV vendido só para chegar ao **VGV líquido**, a base da permuta financeira. Não sai da receita nem do lucro. |
| **Mínimo garantido** | Valor mínimo da permuta financeira: vale o maior entre ele e o percentual. |
| **Deduzir da base da permuta** | Caixas para tirar da base da permuta financeira o ITBI e o registro das unidades vendidas. A despesa continua inteira em Comercial; só a permuta fica menor (o percentual da permuta sobre essas verbas). |
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

O resultado do estudo, do VGV ao lucro, com o valor e o % da receita de cada linha: receita bruta, permuta e comissão em unidades, receita (VGV vendido), terreno, obras, lucro bruto, comerciais, gerais, EBITDA, despesas financeiras, resultado e margem sem as taxas, taxas e lucro líquido. Cada grupo mostra o detalhe embaixo. Fora da diretoria, Financeiras e Taxas aparecem só pelo total. Só leitura: muda conforme as outras seções.

### Vínculo com o estudo de massa

No alto da seção Tipologias, quando o terreno tem estudo de massa entregue:

- **Vincular a um estudo de massa**: escolha um estudo de massa entregue ou **Seguir o válido** (o estudo de massa válido do terreno; trocou o válido, o estudo troca junto). As tipologias (título, área privativa e quantidade) e a área construída de Obras passam a ser as do estudo de massa e ficam travadas; preços, permuta e comissão continuam sendo digitados aqui.
- **Vinculada ao estudo de massa**: o mesmo seletor troca o estudo de massa (ou passa a seguir o válido).
- **Quebrar vínculo**: solta na hora. As tipologias e a área construída ficam como estavam e voltam a se editar aqui. Vincular de novo volta os dados aos do estudo de massa.

O estudo criado pelo botão **Criar estudo de viabilidade** da aba Estudos de massa já nasce vinculado e abre na hora.

## Modelos de estudo

Um modelo guarda os valores e as bases de cálculo de um estudo (custo de obra por m², dedução do VGV, o que se deduz do VGV e os itens de cada seção) para começar um estudo novo já preenchido. Tipologias, permuta, mínimo garantido e pagamentos do terreno não entram: são de cada terreno.

**Salvar como modelo** (no topo do estudo): dê um nome. Com o nome de um modelo seu que já existe, ele é atualizado. O administrador escolhe também **Para quem**: **Só para mim**, **Para a empresa** ou **Padrão da empresa** (o que vem marcado no estudo novo; só um por vez). Fora da diretoria, Taxas e Despesas financeiras não entram no modelo.

**Novo estudo**, quando existe algum modelo, abre a janela com o **Nome do estudo** e a lista dos modelos: os seus ("Meu modelo"), os da empresa e o padrão, cada um com o custo de obra e quantos itens têm valor, e **Sem modelo** (só a lista de itens da empresa com os valores padrão dela). O padrão vem marcado. A lixeira ao lado apaga o modelo: os seus, ou os da empresa pelo administrador. Sem nenhum modelo, Novo estudo cria o estudo direto.

Taxas e Despesas financeiras de um modelo só valem quando o modelo é da empresa ou quando quem cria é da diretoria; nos outros casos, o estudo usa os valores padrão da empresa.

## Quem pode

- **Analista, gestor e diretor**: criam, editam, duplicam, apagam e marcam o válido.
- **Leitura**: só vê (campos travados, sem botões).
- **Financeiras** e **Taxas**: só a diretoria e o administrador veem e mudam. Para os demais, o resultado já conta com elas pelo total.

## O que não é possível hoje

- Configurações › Viabilidade (lista de itens, margem mínima, modelos da empresa).
