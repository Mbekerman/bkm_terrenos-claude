# Arquitetura

## O que o sistema faz

O BKM Terrenos acompanha cada terreno que a BKM pode comprar, desde a primeira oferta até a entrega da obra. Ele junta num lugar só o que hoje está em planilhas: onde o terreno fica (poligonal no mapa), quem vende (partes, matrículas, SQLs), o que a lei deixa construir (parâmetros urbanísticos vindos da prefeitura), o entorno (renda, população, concorrência, pontos de interesse), a negociação (ofertas, propostas, temperatura) e o avanço pelas fases (funil), com histórico de tudo.

Usuários: a equipe da BKM, com login Google do Workspace `@bkm.com.br`. Quatro pessoas previstas no primeiro uso (dois diretores-administradores, uma gestora e um analista; ver `supabase/carga/bkm.sql`). Não há acesso externo (corretor, advogado) por ora.

## As peças

```
                 Navegador (Chrome no desktop; celular depois)
                 React 18 + Vite + TanStack Query + supabase-js
                 Google Maps JS (chave pública restrita por domínio)
                       |                         |
          HTTPS (página e arquivos)       HTTPS (dados, login)
                       |                         |
     Google Cloud Run (projeto bkm-terrenos)     |
     Caddy 2 servindo:                           |
       /            app React (index.html        |
                    recebe a configuração        |
                    pelas variáveis do serviço)  |
       /prototipo   protótipo HTML (estático) e  |
                    /prototipo/dados (JSON do    |
                    IBGE, mercado; o React também|
                    lê daqui)                    |
       /geosampa/*  proxy só-GET p/ Prefeitura SP|
       /geosanja/*  proxy p/ Prefeitura SJC      |
                                                 v
                              Supabase (projeto BKM_Desenvolvimento_Imobiliario)
                                Auth: só Google (app OAuth Interno bkm.com.br)
                                PostgREST: esquemas app e fluxo expostos
                                Postgres com PostGIS e pg_cron
                                  app.*   domínio do Terrenos (RLS por empresa)
                                  fluxo.* quadros e tarefas
                                  public.im_* monitor de mercado (OUTRO sistema)
                                Storage: documentos (pasta = empresa_id)
```

Fora do desenho, mas parte do ecossistema:

- **Monitor de mercado** (repo `Mbekerman/bkm-monitor-mercado`): coletor Python que roda em jobs do Cloud Run (projeto GCP `bkm-monitor`) e grava os empreendimentos do Órulo nas tabelas `public.im_*` do mesmo banco. O Terrenos só lê essas tabelas, por uma função de leitura (`public.im_tabela_empreendimento`) e por um retrato em `docs/dados/mercado.json`.
- **GitHub**: repositório `Mbekerman/bkm_terrenos-claude`. GitHub Actions roda o CI e, quando pedido, aplica o banco (`.github/workflows/banco.yml`).
- **Cloud Build**: a cada push em `develop` ou `main`, gera a imagem do `Dockerfile` e publica no Cloud Run. Não espera o CI.

## Por que cada escolha

| Escolha | Por quê | Custo da escolha |
| --- | --- | --- |
| **Supabase** (Postgres gerenciado com login, API e storage) | Um serviço só dá banco, login Google, API automática e arquivos, sem servidor próprio para manter. | Toda a segurança depende das regras do banco (RLS e permissões), porque o navegador fala direto com ele. |
| **Regra de negócio no banco** (funções RPC em SQL) | O navegador não é confiável; se a regra estiver no front, qualquer um a contorna. Um lugar só para cada regra, testado por SQL. | SQL longo (22 mil linhas) e testes em SQL; exige disciplina para manter o modelo de permissões coerente. |
| **Sem servidor de aplicação** (só Caddy servindo arquivos) | Menos peças, custo perto de zero no Cloud Run com 0 instâncias paradas. | O que precisa de segredo de servidor (Google Agenda, Drive, e-mail) ainda não tem onde rodar; está planejado como funções do servidor (Edge Functions do Supabase). |
| **Caddy como proxy das prefeituras** | O GeoSampa só aceita chamada de navegador vinda do próprio site dele, e o GeoSanja não tem CORS; o proxy tira Origin, Referer e Cookie. | O proxy é uma porta para terceiros; está limitado a métodos e caminhos (ver [seguranca.md](seguranca.md)). |
| **React reescrito, protótipo como especificação** (ADR 0001) | As regras do protótipo estão em JavaScript e duplicariam as do banco. | Mais trabalho no começo; durante o porte convivem duas versões da mesma tela. |
| **Tarefas num banco próprio** (ADR 0002, decidido, ainda não feito) | O sistema de tarefas vai servir outros apps da BKM. | Ligações entre os dois bancos sem transação única. Hoje o esquema `fluxo` ainda mora no mesmo banco. |
| **Google Maps** (no protótipo, com reserva Leaflet) | Satélite, Street View e lugares do Google são o que a equipe usa. No protótipo, sem chave, o Leaflet (Esri/OSM) mantém o mapa de pé; o React **não** tem essa reserva e mostra uma mensagem de erro. | Custo por uso de algumas APIs (Places Details, Routes). Ver [integracoes.md](integracoes.md). |

## As 11 regras que não se quebram

Estão no `CLAUDE.md` ("Regras de arquitetura"). Em resumo, com o motivo:

1. **Terreno, oferta e negociação são coisas diferentes; cada fase é um processo.** Um terreno recebe várias ofertas ao longo dos anos e passa por várias fases; misturar os três apagaria o histórico.
2. **Regra de negócio mora no banco.** Mudar etapa, aprovar, registrar proposta, enviar documento: só por função RPC. O front não tem permissão de `update` em `processos`, `propostas` e `documentos`.
3. **Configuração é dado.** Fases, etapas, pré-requisitos e notificações são tabelas por empresa, editadas pelo administrador; nenhuma regra de funil escrita no código pelo nome da etapa.
4. **Documento nunca é sobrescrito.** Cada envio é uma versão nova; a primeira pasta do caminho no storage é o `empresa_id`, que a regra do storage confere.
5. **Isolamento por empresa** em toda tabela, por RLS com `app.minhas_empresas()`; views com `security_invoker = true`.
6. **Auditoria automática** por gatilho em `app.auditoria` e histórico do funil em `processo_transicoes`.
7. **"Não informado" nunca vira zero.** Número desconhecido é nulo; seleção tem `nao_informado`.
8. **O que muda com o tempo tem histórico** (valores venais, análise urbanística, propostas, documentos).
9. **Condições pedidas pertencem à oferta**; temperatura pertence ao terreno (desde 9/nov/2026; antes, à negociação).
10. **Papéis**: diretor, gestor, analista, leitura, básico, com hierarquia por `membros.superior_id`; administrador é uma marca à parte.
11. **A ficha só muda por `app.salvar_terreno(id, versao, dados)`**, que recusa versão antiga (duas pessoas editando ao mesmo tempo).

Quem for mudar algo que pareça exigir quebrar uma dessas regras deve parar e falar com o Moisés.

## Como os dados andam (fluxos principais)

### Login

1. A pessoa clica em "Entrar com Google". O supabase-js faz o fluxo OAuth com PKCE (`apps/web/src/lib/supabase.ts`).
2. O Google só aceita contas do Workspace da BKM (app OAuth "Interno").
3. Antes de criar o usuário, o gancho `app.hook_antes_de_criar_usuario` confere se o domínio do e-mail está em `app.empresa_dominios`. Se não estiver, recusa.
4. No primeiro login, a pessoa vira membro da empresa: com o papel combinado se estiver em `app.equipe_prevista`, senão `basico` (só consulta).
5. A sessão fica no `localStorage` do navegador (padrão do supabase-js) e se renova sozinha.

### Abrir a ficha de um terreno

1. O endereço é `/terrenos/A123/<aba>`. O código vai na URL, não o id.
2. O front chama uma função só, `app.ficha_dados`, que devolve a ficha inteira numa chamada (decisão de 6/nov, para a gaveta do mapa abrir rápido).
3. O banco aplica a RLS: se o terreno não for da empresa da pessoa, volta vazio.

### Editar um campo

1. A ficha edita no lugar (sem botão Editar/Salvar). Ao sair do campo, o front chama `app.salvar_terreno(id, versao, dados)`.
2. O banco confere o papel (`app.exigir_editor()`), a versão (se outra pessoa salvou antes, recusa) e grava; o gatilho de auditoria registra quem, quando, antes e depois.
3. Ctrl+Z desfaz pela mesma função; a lixeira dos logs desfaz pelo `app.desfazer_alteracao`, que deixa rastro.

### Avançar a etapa

1. O botão Avançar chama `app.checar_passagem` (o que falta) e depois `app.mover_etapa` / `app.mover_subetapa`.
2. O banco decide: pendências da jornada, aprovação de gestor ou diretor, justificativa. O front só mostra.

### Consultar a prefeitura (GeoSampa)

1. O front chama `/geosampa/geoserver/geoportal/ows?...` no próprio domínio do sistema.
2. O Caddy repassa só GET em dois caminhos para o servidor da prefeitura, sem cookie nem origem.
3. O front interpreta a resposta e grava pelo banco (`app.registrar_consulta_lote`, `app.registrar_zonas_lote`, `app.registrar_consulta_area`).

## Estado atual (8/nov/2026)

- **Banco:** aplicado no projeto Supabase BKM_Desenvolvimento_Imobiliario em 5/nov/2026, pelo workflow `banco.yml`. Esse projeto é o de produção, mas está sendo usado como desenvolvimento até o primeiro uso de verdade; na véspera, os esquemas `app` e `fluxo` serão apagados e recriados limpos. Enquanto isso, as migrations são editadas no lugar.
- **Front React:** portados login, mapa, novo terreno (com lotes da prefeitura), ficha (Visão geral, Terreno, Comercial, Parâmetros, Entorno, Estudos de massa, quadro de avanço, painel de Logs), funil, edição da poligonal, filtros e sino. Só no ambiente de desenvolvimento.
- **Produção (`main`):** recebeu a `develop` em 10/nov (até o #300), mas continua servindo o protótipo, porque o serviço não tem `SUPABASE_URL`. Ligar o sistema real é um passo à parte ([deploy-e-ambientes.md](deploy-e-ambientes.md)).
- **Ainda no protótipo, sem porte:** tarefas e quadros, viabilidade, reuniões, documentos, Configurações, Dashboard, Início, topografia, tema escuro e celular.
- **Planejado e não feito:** funções de servidor para Google Agenda, Gmail e Drive; envio de e-mail; banco próprio das tarefas.

Para a lista detalhada do que foi portado e quando, ver [historico.md](historico.md) e [front.md](front.md).

## Onde fica cada coisa no repositório

```
CLAUDE.md                 especificação viva (telas, decisões, regras)
README.md                 apresentação curta (parte dele está desatualizada; ver como-manter.md)
apps/web/                 front React (ver front.md)
supabase/migrations/      esquema, RLS, funções de regra, storage, rotinas (ver banco.md)
supabase/tests/           testes de SQL num Postgres temporário (ver testes-banco.md)
supabase/carga/bkm.sql    empresa BKM, domínio do login e equipe prevista
tools/prototipo/          fontes do protótipo e build.py (ver prototipo.md)
tools/setores/            gera os dados de renda e população do IBGE
tools/parametros/         catálogo de parâmetros urbanísticos e Quota Ambiental
tools/mercado/            retrato do monitor de mercado para o protótipo
tools/topografia/medir.py medição de declividade usada para calibrar a topografia
tools/viabilidade/        lista padrão de despesas do estudo de viabilidade
docs/modelo.md            modelo de dados com diagramas
docs/adr/                 decisões de arquitetura
docs/dados/               dados públicos servidos (setores, demografia, quota ambiental, mercado)
docs/prototipo.html       protótipo GERADO (não editar à mão)
docs/tecnico/             este manual
Dockerfile, Caddyfile     imagem e servidor do Cloud Run
.github/workflows/        CI, aplicação do banco, bibliotecas do protótipo
```
