# Ficha: Jornada

## Para que serve

Ver por onde o terreno já passou e o que falta para cada fase abrir: a **linha do tempo** da negociação, com os dias em cada etapa e subetapa, e a lista das **fases do terreno** (Novos Negócios, Aprovação de Projetos, Registro de Incorporação, Funding, Contratação Caixa, Lançamento, Obras, Entregue), com o botão para abrir uma fase à mão.

## Onde fica

Ficha do terreno › **⋮ do topo da ficha** (à direita do responsável; na gaveta, ao lado de Abrir página) › **Jornada** (`/terrenos/A123/jornada`; o link antigo `/terrenos/A123/fases` cai aqui).

## Linha do tempo

Aparece quando o terreno tem negociação. Uma linha por etapa por onde a negociação passou, na ordem do funil:

- a data em que entrou na etapa, os **dias somados** nela e o **SLA** da etapa ("12 d de 15"); passou do SLA, o selo **acima do prazo**;
- embaixo, cada subetapa por onde passou, com as datas de entrada e de saída, os dias e quem fez a passagem. Quem volta a uma etapa aparece de novo nela, e os dias se somam.

Com a negociação encerrada, a última linha diz como terminou (Comprado, Perdido ou Descartado) e quando. O Stand By para a contagem: os dias parados não entram.

## Fases do terreno

Uma linha por fase, com:

- a **situação**: "Não aberta", a etapa e a subetapa em que está, ou Stand By, Concluída (com o nome da fase, como Comprado, Aprovado, Obra entregue), Descartada;
- o código do processo e as datas de abertura e de encerramento;
- para a fase que ainda não abriu, **o que ela pede** (com ✓ no que já se cumpriu e "Falta:" no que falta), ou "Sem dependência: abre à mão".

A fase abre **sozinha** quando o que ela pede se cumpre (por exemplo, Aprovação de Projetos abre quando a negociação termina como Comprado).

### Abrir à mão

Quem edita vê o botão:

- **Abrir**, na fase sem dependência (como Funding) e na próxima fase com tudo cumprido;
- **Abrir antes da hora**, na próxima fase com algo faltando. **Gestor e diretor** abrem com uma **justificativa**, obrigatória, que vai para o histórico. Para o analista, o botão mostra o que falta e diz que gestor e diretor podem abrir;
- **Reabrir**, na fase descartada.

A Novos Negócios não tem botão: a negociação abre ao registrar uma oferta (aba Comercial).

## O que não dá hoje

- "O que esta etapa pede" (as perguntas da Jornada respondidas no quadro de avanço) e a configuração da Jornada (Configurações) continuam só no protótipo (ver [Ainda não disponível](12-ainda-nao-disponivel.md)).
