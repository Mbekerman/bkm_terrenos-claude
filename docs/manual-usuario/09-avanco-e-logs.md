# 09. Quadro de avanço e painel (Ações, Tarefas, Logs)

**Disponível.** Na ficha, à direita, fica o **painel**. Em tela estreita (sem espaço para o painel), o quadro de avanço vai para a própria página e os Logs viram a aba **Histórico**, no ⋮ do topo da ficha (ver [Histórico sem o painel](#histórico-sem-o-painel)).

## O painel

- O botão **"Recolher painel"** / **"Expandir painel"** esconde e mostra o painel. O sistema lembra a escolha no navegador.
- No topo, o **quadro de avanço** de cada fase aberta.
- Embaixo, o seletor **Ações / Tarefas / Logs**.

Terreno sem oferta mostra "Terreno sem negociação. Registre uma oferta para abrir a negociação."

## Quadro de avanço

**Terreno em Backlog:** quando o terreno ainda não tem negociação (o cadastro registra a primeira oferta, mas não abre a negociação), o lugar do quadro mostra a faixa **"Backlog · Sem negociação aberta"** com o botão **"Iniciar negociação"** (só para quem edita). Ele abre a negociação com a oferta ativa, na primeira etapa de Novos Negócios, e o quadro de avanço aparece. Nada é pedido para iniciar.

**Para que serve:** mover a negociação pelas etapas e subetapas, pedir e dar aprovações e encerrar a negociação (Comprado, Perdido, Descartado) ou pausá-la (Stand By).

**O que mostra:**

- **Subetapa**: um seletor com a subetapa atual, os **dias** nela e o **prazo** (com "prazo estourado" quando passou). Trocar no seletor muda a subetapa.
- **"Próxima:"** a etapa seguinte.
- Um selo com as **pendências** (clique para ver a lista) ou **"Requisitos ok"**.
- O botão principal:
  - **"Avançar"**: vai para a próxima etapa;
  - **"Pedir aprovação"**: quando a passagem exige um nível acima do seu (gestor ou diretor);
  - **"Concluir como Comprado"**: na última etapa.
- O **⋮ "Mais ações"**: **"Colocar em Stand By"**, **"Marcar como Perdido"** e **"Descartar"**.

### Avançar com pendência

Pendência é algo que a etapa exige e ainda falta (um pré-requisito, um documento, uma tarefa que trava).

- **Analista**: o Avançar mostra **"Ainda não dá para…"** com a lista do que falta e o botão **"Entendi"**. Resolva o que falta. ("Resolva o que falta. Gestor e diretor podem passar sem os requisitos, com justificativa.")
- **Gestor e diretor**: o Avançar pergunta **"Ir para X sem os requisitos?"** com a **Justificativa (opcional)**: dá para avançar com ela em branco, e o histórico marca a passagem como feita sem os requisitos. Só quando o administrador marcou um item da Jornada como **"Avança com justificativa"** ela é obrigatória. Na última etapa, o botão é **"Comprar sem os requisitos"**.

**Como fica a etapa deixada (12/nov/2026):** a janela "Ir para X sem os requisitos?" pergunta **"Como fica [etapa atual]?"**, com duas opções:

- **Deixar com pendências** (vem marcada): a etapa que ficou para trás não aparece como concluída. Na linha do tempo do topo da ficha, no lugar do ✓ azul, ela ganha uma **bolinha laranja com "!"** e uma **bolinha azul com o número** de itens que faltam; o clique abre a lista e, para quem edita, **Considerar concluída**. Os itens também continuam em **"Falta preencher"** (menu do "Ficha N% completa"), num grupo próprio da etapa, e contam no número da bolinha vermelha, mas não no percentual da ficha. Cada item sai sozinho quando é cumprido; sem nada faltando, a etapa volta a mostrar o ✓. Voltar o terreno para essa etapa (ou para antes dela) tira a marca.
- **Considerar concluída**: como antes, a etapa fica concluída mesmo sem os itens.

Vale no Avançar do quadro de avanço e ao arrastar o cartão no Funil. Ainda não vale para "Comprar sem os requisitos" nem para trocar de subetapa. Os Logs registram "Etapa X deixada com pendências" (junto do avanço) e "Etapa X considerada concluída".

**Regra (10/nov/2026):** nenhum campo dos formulários do avanço é obrigatório (justificativa, Stand By, Perdido, Descartado, Comprado). O que ficar em branco se completa depois, na faixa do quadro de avanço (ver [Completar depois](#completar-depois-o-que-ficou-em-branco)).

### Pedido de aprovação

Algumas passagens exigem aprovação do gestor, do diretor ou dos dois (no padrão, entrar na etapa Contrato pede o gestor).

1. Quem não tem o nível clica em **"Pedir aprovação"**. O terreno fica **"Aguardando aprovação"** e não se move enquanto o pedido está aberto.
2. O quadro mostra os níveis na vez e **quem pediu**.
3. Quem pode decidir (o aprovador ou qualquer superior dele) vê **"Aprovar"** e **"Recusar"**. Recusar pede o **"Motivo da recusa"**.
4. Quem pediu pode **"Cancelar pedido"**.

**Regra:** quem já tem o nível exigido não precisa pedir: gestor dispensa a aprovação de gestor; diretor dispensa as duas.

### Colocar em Stand By

Para pausar uma negociação de propósito (o vendedor pediu um tempo, falta um documento que demora).

1. ⋮ › **"Colocar em Stand By"**.
2. **"Retomar em"**: a data para retomar (vem com 30 dias; pode apagar e deixar sem data).
3. Justificativa (opcional).

O quadro mostra a faixa de Stand By com **"Retomar"**. Ao retomar, a negociação volta para onde estava.

### Marcar como Perdido

Quando o terreno foi para outro comprador ou o vendedor não quis seguir com a BKM.

1. ⋮ › **"Marcar como Perdido"**.
2. **Motivo** e **Relato** ("O que aconteceu, com quem e quando"), os dois opcionais.

### Descartar

Quando **a BKM** decidiu não seguir.

1. ⋮ › **"Descartar"**.
2. **Motivo** e **Detalhe**, os dois opcionais.

**Regra:** Perdido e Descartado **arquivam as tarefas abertas** do terreno.

### Concluir como Comprado

Na última etapa, **"Concluir como Comprado"** pede:

- **Relato da compra**: "Como foi a negociação, condições finais, quem participou";
- **Pontos de sucesso**: "O que fez a compra dar certo e vale repetir".

Os dois são opcionais.

Os dois aceitam formatação simples (negrito, itálico, lista).

### Faixas de situação

Com a negociação parada ou encerrada, o quadro mostra uma faixa: **Stand By** (com Retomar), **Perdido**, **Descartado** ou **Comprado** (com o relato e os pontos de sucesso).

### Completar depois o que ficou em branco

A faixa mostra **"Em branco: …"** com o que não foi preenchido (por exemplo "motivo, relato") e o link **"Completar"**. O **lápis** no canto da faixa abre a mesma janela, já com o que foi preenchido, para completar ou corrigir: data para retomar e justificativa (Stand By), motivo e relato (Perdido), motivo e detalhe (Descartado), relato e pontos de sucesso (Comprado). Cada alteração fica nos **Logs**. Leitura não vê o lápis.

A justificativa de um avanço sem os requisitos e o motivo de voltar de etapa ficam só no histórico (Logs), e não se editam depois.

### Terreno com partes

Quando o terreno tem partes negociando separado, o quadro mostra **"Anda pelas partes"**: o terreno fica na etapa da parte mais atrasada e não se move à mão. "Ver partes" leva à aba Comercial.

**Ainda não disponível:** o cartão de negociação de cada parte, com o botão de avançar dela.

## Ações

Lista o que vale fazer agora no terreno ("Próximas ações"), por exemplo:

- **"Avaliar a temperatura do terreno"** (sem temperatura);
- **"Completar"** a ficha (itens que faltam);
- cobrar a resposta de uma proposta apresentada (**"Ver propostas"**);
- decidir um pedido de aprovação;
- **"Levar ao comitê: rentabilidade abaixo da mínima"**, em vermelho, quando a margem do estudo de viabilidade válido fica abaixo da mínima da empresa (**"Ver estudo"** abre os estudos de viabilidade).

Com nada a fazer: "Nada pendente."

## Tarefas

Mostra as **tarefas em aberto** do terreno. Como as tarefas ainda não foram portadas, esta lista normalmente aparece vazia ("Nenhuma tarefa aberta.").

**Ainda não disponível:** criar, mover e concluir tarefas. Ver [12](12-ainda-nao-disponivel.md).

## Logs

**Para que serve:** saber quem mudou o quê e quando.

**O que mostra:** toda alteração do terreno, do mais recente ao mais antigo, com data, hora e pessoa: campos da ficha, áreas, poligonal ("Poligonal desenhada", "Ajuste na poligonal"), matrículas, SQLs, ofertas, propostas, mudanças de etapa e de situação, aprovações.

**Filtros:**

- **Usuários**: lista com seleção múltipla ("Todos os usuários").
- **Período**: o padrão é **"Últimos 30 dias"**; há Ontem, Esta semana, Este mês, Este ano, Todo o período e **"Escolher período"** (calendário).

**Clicar num log** abre a aba e o quadro do item e acende o campo alterado.

**Só as suas ações aparecem; o que o sistema faz por consequência fica recolhido.** Quando você inclui SQLs ou muda a poligonal, o sistema consulta o GeoSampa (análise urbanística, zona fiscal, área e CIB do SQL, cartório) e mede as frentes e a testada. Essas atualizações não aparecem como linhas soltas: ficam dentro da sua ação, atrás de **"N atualizações automáticas"**; clique para abrir e veja cada uma (e clique numa delas para ir ao campo). O número da aba **Logs** e os números do filtro de usuários contam só as ações. Quando não há ação sua logo antes (por exemplo, a medição das frentes ao abrir a ficha), elas aparecem num item **"Atualização automática"**, recolhido, que não entra na contagem.

**Vários SQLs de uma vez viram uma linha só:** "SQLs adicionados (4)", com a lista. O mesmo vale para matrículas removidas juntas.

**Regras:**

- Todos da empresa veem os logs.
- Cliques seguidos no mesmo campo (mesma pessoa, menos de 7 s entre um e outro) viram um log só, do valor de antes ao final; se voltar ao valor de antes, o log some. A gravação é sempre na hora; só o registro junta.
- Ajustes na poligonal a menos de 2 minutos um do outro viram um log só.
- O histórico nunca é apagado. As atualizações automáticas continuam gravadas; só aparecem recolhidas.

**Ainda não disponível:** o **olhinho** (ver o terreno como se a alteração não tivesse acontecido) e a **lixeira** (desfazer de verdade uma alteração antiga) dos logs. Para desfazer o que você acabou de fazer, use o **Ctrl+Z** (ver [01](01-entrar-e-navegar.md#desfazer-e-refazer-ctrlz-e-ctrly)).

## Histórico sem o painel

Quando a tela não tem espaço para o painel (janela estreita, ou a ficha aberta na gaveta do Mapa ou do Pipeline), o ⋮ do topo da ficha (à direita do responsável; na gaveta, ao lado de Abrir página) ganha o item **Histórico**, antes de Excluir terreno. Ela mostra os mesmos Logs do painel, com os mesmos filtros de usuários e de período, e o clique num log leva ao item do mesmo jeito. Os filtros escolhidos valem nos dois lugares. Com o painel na tela, o item Histórico some.

## O que não é possível

- **Ainda não disponível:** "O que esta etapa pede" (as perguntas da Jornada respondidas no quadro de avanço).
- Abrir a fase seguinte antes da hora fica na aba **Jornada** (ver [16](16-ficha-jornada.md)).
- Desfazer um movimento de etapa com Ctrl+Z: faça o movimento contrário (voltar etapa pelo Funil, com motivo).
