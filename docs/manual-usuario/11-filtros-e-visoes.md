# 11. Filtros e visões salvas

**Disponível** no **Mapa** e no **Funil**.

## Para que serve

Mostrar só os terrenos que interessam agora (por exemplo, "os quentes em São Paulo acima de 5.000 m² com proposta ativa") e guardar esse recorte com um nome para voltar a ele depois.

## Onde abrir

- **Mapa**: botão **Filtros** na barra do alto da lista, ou ⋮ › **"Filtro dos terrenos"**.
- **Funil**: botão **Filtros** na linha do título.

Abre uma **gaveta à direita**. Fecha no X ou no **Esc**. A gaveta de filtros, a do filtro da concorrência e a da ficha não ficam abertas juntas.

## Seções

Os botões no cabeçalho da gaveta trocam a seção e mostram quantos filtros cada uma tem ligados.

| Seção | Filtros |
|---|---|
| **Funil** | Fase; Etapa (da fase marcada); Subetapa (da etapa marcada). Só no Mapa. |
| **Comercial** | Temperatura (inclui "Não avaliada"); Preço pedido; Preço pedido por m²; Preço pedido em % do VGV; Proposta ativa (sim/não); Proposta ativa: valor, valor por m² e valor em % do VGV; VGV estimado (do estudo válido); Corretor (do terreno ou de qualquer parte); Forma de pagamento aceita; Origem do cadastro. |
| **Localização** | Estado; Cidade; Região (Norte, Sul, Leste, Oeste, Centro...); Bairro. |
| **Terreno** | Zoneamento; Área (adotada). |
| **Gestão** | Meus terrenos; Por analista; Cadastrado entre (datas); Ficha incompleta: menos de N% preenchida. |

## Como os filtros se combinam

- **Opções dentro do mesmo filtro somam** ("ou"): marcar Quente e Muito quente mostra os dois.
- **Filtros diferentes valem juntos** ("e"): Quente **e** São Paulo.
- Ao lado de cada opção, **quantos terrenos ficam** se você marcá-la.
- Faixa com **Mínimo** e **Máximo**: quem não tem o dado fica de fora, a menos que você marque **"Incluir sem informação (N)"**.
- Valores aceitam "12 mi" e "270 mil".

**Ainda não disponível:** os filtros por VGV e % do VGV dependem do estudo de viabilidade, que ainda não está no sistema real; hoje quase nenhum terreno tem esse dado.

## Na barra, depois de filtrar

- O botão **Filtros** mostra o número de filtros ligados.
- Um **chip** por filtro, com **X** para tirar só aquele.
- **"Limpar"** tira todos (na gaveta, **"Limpar tudo"**).
- No celular, o rodapé da gaveta tem **"Ver N terrenos"**.

## Cada página tem a sua seleção

O filtro do Mapa não muda o Funil, e vice-versa. A seleção fica guardada durante a sessão do navegador, por página, e também no **endereço** (depois de `#f=`): copiar o link manda o recorte junto para um colega.

No **Funil**, não há filtro de fase, etapa e subetapa: "No quadro, a fase e a etapa vêm da navegação (Funil › fase › etapa)."

No **Mapa**, a legenda continua ligando e desligando camadas e conta só os terrenos que passaram pelo filtro.

## Visões salvas

**Para que serve:** guardar uma combinação de filtros com um nome ("Quentes em São Paulo") e voltar a ela com um clique.

**Salvar:**

1. Ligue os filtros.
2. Clique em **"Salvar visão"**.
3. Dê um **Nome**. O nome não pode repetir.
4. Administrador: marque **"Para toda a empresa (todos veem; só o administrador muda)"** se for uma visão de todos.
5. Clique em **Salvar**.

**Usar:** o seletor **Visão** (ou "Visões salvas") lista **Da empresa** e **Minhas**. Escolha uma para aplicar. Se você mexer nos filtros depois, a visão aparece como **"(alterada)"**.

**Regras:** cada pessoa vê e muda só as suas visões; as da empresa todos veem e só o administrador muda.

## O que não é possível

- Filtrar por situação (Stand By, Perdido), prazo estourado, aguardando aprovação, dias na etapa, rentabilidade, eixo, vários donos, prioridade, pendências ou arquivados: esses filtros **saíram** por decisão. Um filtro antigo guardado é descartado sozinho.
- Filtrar por testada, topografia, posição, ocupação, demolição, CA ou restrições do lote: **ficaram de fora** por decisão.
- **Ainda não disponível:** filtros na tabela Pipeline e no Dashboard (essas telas ainda não estão no sistema real).
