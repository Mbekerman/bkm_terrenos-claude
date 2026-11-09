# Histórico do projeto

Linha do tempo de 15/out a 8/nov/2026, montada pelo `git log`, pelos PRs e pela memória do projeto. O detalhe de cada decisão de tela está no `CLAUDE.md` (cada item traz a data e quem decidiu). Este arquivo serve para entender **em que ordem** as coisas aconteceram e **por quê**, o que ajuda a ler código antigo.

Todos os números de PR são do repositório `Mbekerman/bkm_terrenos-claude`.

## Fase 1: modelo e protótipo (15 a 22/out)

- **15/out:** as migrations nascem com o prefixo `20261015...` (é a data da primeira versão do esquema; como a regra é editar no lugar até haver produção, o prefixo não muda). Primeiro front React escrito para essa versão do esquema, depois abandonado como base (ver ADR 0001).
- **20 a 21/out:** protótipo navegável (`docs/prototipo.html`), tema escuro, painel de logs. PRs #1 a #5: novo funil com subetapas, status e aprovações por hierarquia (#3); ambientes de desenvolvimento e produção (#5).
- **22/out:** decisões estruturais: novo terreno começa sempre pela poligonal; PostGIS entra para sobreposição de terrenos; ainda nenhum banco criado.

## Fase 2: funcionalidades no protótipo e no banco (23/out a 2/nov)

- **23/out:** **fases acima das etapas**, cada fase é um processo do terreno (#42); **partes** para terrenos com vários donos (#43, #46); filtros em gaveta (#49); indicadores do Início e Dashboard.
- **24/out:** concorrência cadastrada à mão (#52 a #56, depois desligada); logs com olhinho e lixeira (#60); área da poligonal como quinta fonte (#62); **renda e densidade por setor censitário do IBGE** (#65 a #79).
- **25 a 26/out:** parâmetros urbanísticos por lote e zona (#82); **estudo de viabilidade estática** (#83 a #91); topográfico preliminar.
- **28/out:** **login Google** com papel básico (#119); menção com @ e e-mail (#120); ajustes da viabilidade (#109 a #117).
- **29 a 30/out:** **quadros e tarefas** no esquema `fluxo`, no estilo Trello e depois ClickUp (#126 a #135): cronograma, aprovação, SLA com pausa, visibilidade por cartão, campos, recorrência, automações.
- **31/out a 1/nov:** ligação funil × quadros (#136, #137), formulário da tarefa (#138), Jornada do terreno, tema escuro Material 3 (#140), respiro (#141).
- **2/nov:** **primeira avaliação de código e segurança do banco** (com as skills do Matt Pocock): 7 falhas graves fechadas (#145) e 13 médias e baixas (#146), inclusive uma brecha entre empresas; limpeza do CSS do protótipo (#144). Promovido para produção pelo #149.

## Fase 3: mudança de casa e ficha em abas (3 a 4/nov)

- **3/nov:** o **Railway bloqueou a conta**. Migração para o **Google Cloud Run** no mesmo dia (#150). Ficha do terreno em abas (#153, #154).
- **4/nov:** dia com 121 commits. Ficha em abas lotes 3 a 6 (#155 a #158); lotes da prefeitura no cadastro (#159, #163, #164); mercado do Órulo no mapa e na ficha (#157); topografia em 7 níveis (#160); código do terreno sem I e O (#165); página Pipeline e filtros por página (#173 a #177); pontos de interesse pelo tipo principal (#189, #191). Produção recebe tudo pelo #192, **o último merge na `main` até hoje**.
- **4/nov, sabatina de 32 decisões** sobre a saída do protótipo (#194, só documentação): reescrever o front em React tela por tela (ADR 0001); tarefas num banco próprio (ADR 0002); banco de produção usado como desenvolvimento até o primeiro uso; ordem do porte (login, mapa, novo terreno, ficha, funil); só desktop e tema claro no começo; "pronto" = uma semana com 5 a 10 terrenos reais no dev.

## Fase 4: porte para o sistema real (5 a 6/nov)

- **5/nov:** **banco aplicado** no BKM_Desenvolvimento_Imobiliario pelo `banco.yml`. Login e moldura em React (#195 a #197). Mapa (#198 a #207). Novo terreno com mapa de lotes e consulta ao GeoSampa (#199, #205, #206). Ficha em React: topo, abas, Visão geral (#208), Terreno (#209, #210), Comercial (#212), avanço e Logs (#213), celular parcial (#214), Parâmetros e Entorno (#215). Funil (#218). A partir daqui, as mudanças de estrutura do banco passam a ser SQLs avulsos rodados pelo Moisés no SQL Editor.
- **6/nov:** edição da poligonal no mapa e no mini-mapa (#221); Selecionar lotes (#222); filtros no Mapa e no Funil (#223); sino (#224); etiquetas de matrícula e SQL em várias partes com percentual (#230 a #235); selo do ambiente com o PR e a hora do build (#234); **ficha numa chamada só**, `app.ficha_dados` (#236), depois de uma lentidão causada por uma carga pesada (tabela do IPTU de SP) rodando no mesmo banco por outra conversa; matrícula como subquadro da parte e proprietários na parte (#240); rascunho dos formulários no navegador (#241); último merge: #242.
- **6/nov:** diretrizes de design e UX para outros projetos (`docs/diretrizes-design-ux.md`, PR #231). Em 8/nov o PR ainda não estava na `develop`.

## Fase 5: documentação (8/nov)

- **8/nov:** este manual técnico e a segunda avaliação de segurança ([seguranca.md](seguranca.md)), com o manual de uso feito em paralelo.

## Lições que ficaram

| Lição | Quando | Onde está a proteção |
| --- | --- | --- |
| `{%` no protótipo derruba a página (Caddy `templates`) | 22/out | `build.py` recusa |
| Arquivo novo em `docs/` precisa de `!docs/<pasta>` no `.dockerignore` | 24/out | ver deploy-e-ambientes.md |
| Build do protótipo sem o CSS do Leaflet quebra o mapa | 4/nov | `build.py` falha se não baixar (#187) |
| Provedor de hospedagem pode sumir de um dia para o outro | 3/nov | imagem Docker padrão, sem dependência do Railway |
| Carga pesada no mesmo banco deixa o sistema lento para todos | 6/nov | rodar cargas de madrugada ou em outro projeto |
| GitHub Actions sem crédito mata os jobs em segundos | 24/out, 28/out, 6/nov | rodar os testes localmente antes do merge |
| Aviso de rascunho abrindo atrás de outra janela "comia" o clique | 6/nov | aviso em portal com `z-index` acima (#239) |
