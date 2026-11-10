# Manual do usuário do BKM Terrenos

Situação: **8/nov/2026**, versão de desenvolvimento até o PR #242 (manual no PR #244).

Este manual explica, tela por tela, o que o BKM Terrenos faz, para que serve cada parte, como fazer cada coisa e o que ainda não dá para fazer. Foi escrito para duas leituras:

- **Pessoas da BKM** que vão usar o sistema no dia a dia (analistas, gestores, diretores).
- **Um assistente de IA** que vai ensinar as pessoas a usar o sistema. Por isso o texto é descritivo, repete o nome exato dos botões entre aspas ou em negrito e diz sempre onde cada coisa fica.

## Como ler as marcações

| Marcação | O que quer dizer |
|---|---|
| **Disponível** | Existe no sistema real (o que a equipe usa). |
| **Ainda não disponível** | Existe só no protótipo (a maquete navegável em `/prototipo`, com dados de exemplo) ou só no plano. Não prometa ao usuário. |
| **Regra** | Comportamento que o sistema impõe e que o usuário não muda. |
| **Dica** | Atalho ou jeito mais rápido de fazer. |

Quando o texto fala de "clicar", no celular vale "tocar". A primeira versão do sistema é feita para **computador**; o celular funciona em parte e só será revisado depois (ver [Ainda não disponível](12-ainda-nao-disponivel.md)).

## Índice

| Nº | Seção | Assunto |
|---|---|---|
| 00 | [Conceitos do sistema](00-conceitos.md) | Terreno, oferta, negociação, fase, etapa, subetapa, partes, papéis. Glossário. Leia primeiro. |
| 01 | [Entrar e se localizar](01-entrar-e-navegar.md) | Login, menu, busca, sino, perfil, atalhos, desfazer, rascunhos, campos com máscara. |
| 02 | [Mapa](02-mapa.md) | Lista de terrenos, legenda, busca de endereço, camadas de renda e densidade, concorrência, régua, edição da poligonal. |
| 03 | [Novo terreno](03-novo-terreno.md) | Cadastro pela poligonal, KMZ ou SQL, lotes da prefeitura, sobreposição, nome de referência. |
| 04 | [Ficha do terreno: topo, abas e Visão geral](04-ficha-visao-geral.md) | Como a ficha é organizada, completude, gaveta, Visão geral, mini-mapa. |
| 05 | [Ficha: aba Terreno](05-ficha-terreno.md) | Identificação, endereço, partes, matrículas e SQLs (etiquetas), áreas. |
| 06 | [Ficha: aba Comercial](06-ficha-comercial.md) | Negociação, condições pedidas, partes, ofertas, corretores, propostas, reuniões, temperatura. |
| 07 | [Ficha: Parâmetros urbanísticos (aba Terreno)](07-ficha-parametros.md) | Zonas por lote, potencial construtivo, restrições, histórico de uso. |
| 08 | [Ficha: aba Entorno](08-ficha-entorno.md) | Pontos de interesse, renda e perfil da população, concorrência no entorno. |
| 09 | [Quadro de avanço e painel (Ações, Tarefas, Logs)](09-avanco-e-logs.md) | Avançar etapa, aprovações, Stand By, Perdido, Descartado, Comprado, histórico. |
| 10 | [Funil](10-funil.md) | Quadro de fases, etapas e subetapas; arrastar para mover. |
| 11 | [Filtros e visões salvas](11-filtros-e-visoes.md) | Filtrar terrenos no Mapa e no Funil, salvar visões. |
| 12 | [Ainda não disponível](12-ainda-nao-disponivel.md) | O que existe só no protótipo e o que está planejado. |
| 13 | [Perguntas frequentes e problemas](13-perguntas-frequentes.md) | Respostas curtas para as dúvidas mais comuns e o que fazer quando algo não funciona. |
| 14 | [Ficha: aba Estudos de massa](14-ficha-estudos-de-massa.md) | Pedir o estudo ao arquiteto, tipologias, áreas, índices, estudo válido, criar a viabilidade. |
| — | [Registro de mudanças](CHANGELOG.md) | O que mudou para o usuário, por data. |
| — | [Roteiros de vídeo de onboarding](onboarding/README.md) | Três roteiros para novos usuários. |

## Endereços

- Desenvolvimento (onde tudo entra primeiro): https://terrenos-web-dev-469931692112.southamerica-east1.run.app
- Produção: https://terrenos-web-469931692112.southamerica-east1.run.app (na data deste manual, o sistema novo ainda roda só no ambiente de desenvolvimento; a produção abre o protótipo).
- Protótipo (maquete com dados de exemplo): o mesmo endereço seguido de `/prototipo`.

Todo link do sistema abre direto na tela: `/mapa/A123` abre o mapa com o terreno A123 selecionado, `/terrenos/A123/comercial` abre a aba Comercial da ficha. Pode copiar o endereço do navegador e mandar para um colega.

## Como manter este manual (para quem desenvolve)

O manual só tem valor se acompanhar o sistema. A regra, também escrita no `CLAUDE.md`, é:

1. **Toda mudança que o usuário vê** (botão novo, campo que sai, regra que muda, texto de aviso, atalho) atualiza, **no mesmo PR**, o arquivo da seção correspondente deste manual.
2. A mesma mudança ganha uma linha no [CHANGELOG.md](CHANGELOG.md), na data do merge, em linguagem de usuário (o que mudou e onde), com o número do PR.
3. Quando algo do protótipo chega ao sistema real, tire a marcação **Ainda não disponível** da seção e do arquivo [12](12-ainda-nao-disponivel.md).
4. Se a mudança afeta um dos [roteiros de vídeo](onboarding/README.md), marque no topo do roteiro "Precisa regravar a partir do passo N" até o vídeo ser refeito.
5. Mantenha o estilo: português simples, sem nomes de tabela ou função, botões com o nome exato que aparece na tela, sempre "o quê, por quê, como e o que não dá".
6. Atualize a data e o número do PR no topo deste arquivo.

Os nomes técnicos (tabelas, funções do banco) ficam na documentação técnica, não aqui.

## Limites deste manual

- Foi escrito a partir do código do sistema, das decisões registradas no `CLAUDE.md` e no histórico dos PRs. Não foi conferido tela a tela com um usuário logado (o login exige conta Google da BKM). Se algum texto de botão divergir da tela, vale a tela: corrija aqui.
- Ainda sem imagens. Capturas de tela podem entrar depois em `docs/manual-usuario/imagens/`.
