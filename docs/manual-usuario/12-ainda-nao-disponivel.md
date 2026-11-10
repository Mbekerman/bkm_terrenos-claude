# 12. Ainda não disponível

Esta seção lista o que **ainda não existe no sistema real** (em 8/nov/2026). Parte já existe no **protótipo** (a maquete navegável em `/prototipo`, com dados de exemplo, que não grava nada de verdade). Parte está só no plano.

**Para quem usa o manual com um assistente de IA:** não ensine estes recursos como se existissem. Diga que ainda não estão disponíveis e, se for o caso, como fazer hoje.

Quando um item chegar ao sistema real, ele sai daqui e entra na seção correspondente (ver [Como manter](README.md#como-manter-este-manual-para-quem-desenvolve)).

## Telas e menus

| Recurso | Situação | Como fazer hoje |
|---|---|---|
| **Início** (página com os 4 indicadores e a lista do dia) | Só no protótipo | Use o Funil e o sino. |
| **Terrenos** (tabela **Pipeline** com colunas ordenáveis e a ficha em gaveta) | Só no protótipo | Use a lista do Mapa com filtros. |
| **Dashboard** | Só no protótipo; será refeito mais para a frente | — |
| **Configurações** (fases, etapas, Jornada, campos, parâmetros urbanísticos, topografia, viabilidade, tarefas, notificações, equipe) | Só no protótipo | Ajustes urgentes são feitos direto no banco, a pedido do Moises. |
| **Tarefas** (quadros no estilo Trello, cartões, checklists, cronograma, calendário, automações, aprovações, recorrência) | Só no protótipo; vai virar um sistema próprio (BKM Tarefas) | Combine por fora; o painel da ficha só lista tarefas abertas, se houver. |

## Abas da ficha

| Aba | Situação |
|---|---|
| **Estudos de massa** (pedido ao arquiteto, tipologias, CA, eficiência, estudo válido) | Só no protótipo |
| **Viabilidades** (estudo de viabilidade estática, DRE, modelos, "Rentabilidade abaixo da mínima") | Só no protótipo. Por isso Unidades e VGV do Resumo ficam vazios. |
| **Jornada** (as fases do terreno, "Abrir antes da hora") | Só no protótipo |
| **Documentos** (envio com versão, pastas no Google Drive, planta e desenho do GeoSampa) | Só no protótipo; pastas no Drive no plano |

## Recursos dentro das telas já disponíveis

| Recurso | Situação |
|---|---|
| Reunião criada no **Google Agenda**, com convite, link do Meet, respostas dos convidados, gravação e resumo do Gemini | Simulado no protótipo; integração real a fazer |
| **"O que esta etapa pede"** no quadro de avanço (perguntas da Jornada) | Só no protótipo |
| **Olhinho e lixeira** nos Logs (prévia sem a alteração e desfazer uma alteração antiga) | Só no protótipo. Hoje, use o Ctrl+Z para o que acabou de fazer. |
| Quadro de **negociação por parte** (cada parte com sua etapa e botão de avançar) | Só no protótipo |
| **Topográfico preliminar em São Paulo** (cotas do laser da prefeitura, quadra inteira sem SQL) e guardar o PDF e o DXF em Documentos | Só no protótipo. Fora de São Paulo já está na aba Infraestrutura. |
| **Busca de cima por matrícula e SQL** | O texto do campo promete, mas hoje não busca. A fazer. |
| **Aviso por e-mail** e preferências de e-mail no menu do avatar | Planejado (envio pela conta bkm@) |
| **WhatsApp** | Planejado, depois do e-mail |
| **Tema escuro** e seletor de tema | Só no protótipo; a primeira versão é só no tema claro |
| **Celular** revisado (toque longo para editar a poligonal e criar terreno, lista de lotes no lugar do mapa, etiquetas pelo toque) | A fazer depois do computador |
| Menção com **@** em textos | Nas **reuniões** já funciona (participantes e textos; ver [aba Comercial](06-ficha-comercial.md#reuniões)); nas tarefas, só no protótipo |
| Camada de **lotes vagos** no mapa (prospecção pelo GeoSampa) | Ideia em estudo, sem decisão |
| **Assistente de IA** para perguntas sobre os terrenos | Em discussão, depois do porte |
| Acesso de **corretor ou advogado** de fora | Fora do escopo atual |

## Decisões tomadas que tiram recursos (não voltam sem nova decisão)

- Concorrência cadastrada à mão: desligada; só Órulo.
- Pontos de interesse da empresa no mapa: saíram; ficam só na ficha.
- Características físicas e confrontações na ficha: saíram.
- Link da origem, Precisão da localização e Eixo comercial na ficha: saíram.
- Tipo de empreendimento escolhido no terreno: saiu; a ficha mostra Mercado, HIS e HMP lado a lado.
- Botão "Buscar de novo" nos pontos de interesse: não existe; a busca refaz quando o terreno muda de lugar.
