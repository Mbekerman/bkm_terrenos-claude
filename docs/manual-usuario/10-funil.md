# 10. Funil

**Disponível.** Menu lateral › **Funil** (endereço `/funil`).

## Para que serve

Ver todos os terrenos de uma vez, organizados pela fase, etapa e subetapa em que estão, e mover a negociação arrastando o card de uma coluna para outra. É o quadro do dia a dia de quem cuida de várias negociações.

## Os três níveis

O Funil abre no nível mais alto e desce:

1. **Fases** (`/funil`): uma coluna por fase. Cada terreno aparece como card na coluna de cada fase aberta (um terreno com duas fases abertas aparece nas duas). **Neste nível não se arrasta.**
2. **Etapas** de uma fase (`/funil/<fase>`): clique no **nome da coluna** da fase ("Ver etapas de …"). Uma coluna por etapa, com o **prazo (SLA)** no cabeçalho, mais a coluna **Stand By**. **Aqui se arrasta.**
3. **Subetapas** de uma etapa (`/funil/<fase>/<etapa>`): clique no nome da coluna da etapa ("Ver subetapas de …"). Uma coluna por subetapa, com o prazo. **Aqui também se arrasta.**

Para subir: a **trilha** no alto (Funil › fase › etapa) ou a **seta de voltar**. O botão **Voltar** do navegador também funciona.

## O card do terreno

Cada card mostra, quando se aplica:

- **código** e **temperatura**;
- **nome** do terreno;
- **subetapa** com os **dias** nela (vermelho quando "Passou do prazo da subetapa"), ou "Sem subetapa ativa";
- **bairro**;
- **"também em"** outra fase, quando o terreno está em duas;
- **"N partes · M compradas"**, com partes;
- **pedido** (valor pedido) ou **proposta** (a última);
- **"Tarefas atrasadas"**;
- **"Abaixo da mínima"** (rentabilidade, quando houver estudo válido);
- a próxima **reunião**;
- **"Aguardando …"** quando há pedido de aprovação aberto.

**Clicar no card** abre a ficha do terreno. Voltar da ficha volta ao mesmo nível do Funil.

## Mover arrastando

Nos níveis de etapas e de subetapas, arraste o card para outra coluna. Enquanto arrasta, as colunas que aceitam ficam tracejadas e a que está sob o card acende.

| Movimento | O que acontece |
|---|---|
| **Para a frente** | Avança **etapa por etapa** até a coluna escolhida. Se uma passagem tem pendência, o analista vê o que falta (**"Entendi"**) e gestor ou diretor podem passar com **Justificativa**. Se uma passagem pede aprovação, o movimento **para no pedido de aprovação**. |
| **Para trás** | Pergunta **"Voltar para X?"** e pede o **Motivo (vai para o histórico)**. |
| **Para Stand By** | Abre o formulário do Stand By (**Retomar em** e justificativa). |
| **De Stand By para uma etapa** | Retoma a negociação ("Retomada."). |
| **Para outra subetapa** (no nível das subetapas) | Muda a subetapa. |

**Regras:**

- Card com pedido de aprovação aberto não se move: "Há um pedido de aprovação em aberto: aguarde a decisão ou cancele o pedido."
- Terreno com partes anda pelas partes e não se move à mão.
- Mover no funil **não entra no Ctrl+Z**. Para desfazer, arraste de volta (com motivo).

## Filtros e visões

A linha do título do Funil tem **Filtros** e **Visões**, iguais aos do Mapa, mas com a seleção própria do Funil (filtrar aqui não muda o Mapa). No Funil não há filtro de fase, etapa e subetapa: descer no quadro já faz esse papel. Ver [11](11-filtros-e-visoes.md).

## O que não é possível no Funil

- Arrastar no nível das fases (cada fase só abre quando as dependências se cumprem).
- Concluir como Comprado, Perdido ou Descartado arrastando: use o quadro de avanço da ficha ([09](09-avanco-e-logs.md)).
- **Ainda não disponível:** a vista Funil da página Tarefas e a tabela Pipeline de terrenos.
