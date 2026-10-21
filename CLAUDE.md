# BKM Terrenos

Sistema da BKM (incorporadora MCMV) para cadastro de ofertas de terrenos e acompanhamento da negociação. Fases seguintes: aprovação de projeto, incorporação e financiamento Caixa, como novos tipos de **processo** ligados ao mesmo terreno.

Idioma do produto, do código de domínio e dos commits: português.

## Stack

- Front: React 18 + TypeScript + Vite (`apps/web`), TanStack Query, react-router, supabase-js. Sem biblioteca de UI; estilos em `apps/web/src/styles.css` (Design System BKM, ver "Visual").
- Banco: Supabase (Postgres + Auth + Storage). Tudo no schema `app`, que precisa estar em **Settings → API → Exposed schemas**.
- Deploy: Railway, projeto "BKM Terrenos", serviço `terrenos-web` (https://terrenos-web-production.up.railway.app), via `Dockerfile` (build Vite + Caddy). Push na `main` dispara o deploy automaticamente; com "Wait for CI" ligado no serviço, o deploy espera o workflow CI passar. O protótipo é servido em `/prototipo` (a raiz redireciona para lá enquanto o banco não existe) e o app React no resto. Chave única do Google (decisão do dono, a rever): variável `GOOGLE_MAPS_KEY` do serviço, injetada pelo Caddy na meta `gmaps-key` da página; nunca vai para o repositório. Como o Maps JS exige a chave no navegador, a proteção é a restrição por domínio e por API no Cloud Console. O serviço `bkm-app` do mesmo projeto é outro sistema: não mexer.
- CI: GitHub Actions (`.github/workflows/ci.yml`): typecheck, build e testes de SQL.

## Visual

Linguagem visual **Google Material 3** sobre a marca BKM (decisão do Moisés, out/2026, substituindo o visual do Design System BKM nas telas de trabalho). Tokens e componentes em `apps/web/src/styles.css`, idênticos aos do protótipo: o tema Material 3 é o bloco "Tema Google" no fim do arquivo e sobrepõe o tema anterior (no porte do front, reescrever os tokens com esses valores e tirar os `!important`). Regras que valem em toda tela:

- Fundo `#f8fafd`, texto `#1f1f1f`, secundário `#444746`, contornos `#c4c7c5`. Primária `#0b57d0` (botão cheio, links); contêiner secundário `#c2e7ff` marca item ativo do menu, do segmentado e dos filtros.
- Tipografia Google Sans Flex (Google Fonts), títulos em peso 400, rótulos 500. Sem caixa-alta espaçada.
- Botões em cápsula (raio 20, altura 40): primário cheio, secundário contornado. Botão de criar = FAB tonal (raio 16). Menu lateral em gaveta com item ativo em pílula e botão de recolher/expandir (só ícone) no topo, acima do botão de criar; no celular, barra inferior com indicador em pílula.
- Cards contornados (raio 12) para listas e fichas; blocos tonais (raio 16) para indicadores. Chips retangulares raio 8.
- Status no padrão Material: ok verde `#146c2e`/`#c4eed0`, atenção `#7a5900`/`#ffdf99`, crítico `#b3261e`/`#ffdad6`. Fases da negociação: azul, roxo, verde.
- Marca BKM continua: logo oficial (`public/marca/bkm-logo.svg`, mínimo 120 px) e ícones de linha BKM (`public/marca/icone-*.svg`). A forma de casa decorativa saiu.
- Ficha do terreno: página única com as seções (Visão geral, Cadastro, Comercial, Negociação, Tarefas, Urbanismo, Documentos) em sequência; ao abrir o terreno só a Visão geral vem aberta, com seta no título e "Recolher" no fim. Linha do tempo das etapas no topo (some no celular). A Visão geral fica em duas colunas; quando não cabe e vira uma coluna, o mapa de Localização vem primeiro. Ela edita no lugar os campos que se repetem nas seções, gravando no mesmo registro. Painel lateral à direita em coluna própria (280 a 360 px, some quando não cabe sem cobrir a página), recolhível, com o quadro de avanço no topo (compacto: próxima etapa, selo de pendências que abre a lista, um só botão Avançar e menu ⋮ com Stand by e Perdida; com pendência, Avançar abre a justificativa para o gestor ou a lista do que falta para os demais) e o seletor **Logs / Ações**. Logs: toda alteração com data, hora e usuário, do mais recente ao mais antigo pelo instante com milissegundos (no banco, `em` usa `clock_timestamp()` e o desempate é pelo `id`); filtros de usuários (lista com seleção múltipla) e de período (padrão últimos 30 dias, com calendário personalizado); clicar num log abre a seção e acende o campo ou item alterado. Ações: próximas ações da negociação e tarefas em aberto. Sem painel (celular ou tela estreita), o quadro de avanço volta para a página e o Histórico vira a última seção. No banco, os logs vêm de `app.auditoria` e `processo_transicoes`.
- Pontos de interesse do terreno: ao localizar o terreno (ou quando ele muda de lugar), o front busca no Google as categorias de `entorno_categorias` (hoje estações de metrô ou trem, shopping centers e hospitais) a até 1,5 km **a pé**, pela rota a pé (Routes `computeRouteMatrix`; reserva Distance Matrix; sem rota, linha reta avisada). O quadro mostra distância e minutos a pé, o link de rota a pé e "Sem … a até 1,5 km a pé" na categoria vazia. Abaixo, "Cadastrados pela empresa": **todos** os pontos de `pontos_interesse`, a pé quando estão a até 1,5 km a pé e de carro quando mais longe (sem rota medida, linha reta), com "Adicionar ponto" que abre o mapa no modo de marcar e volta para a ficha.
- Endereço: busca do Google (Places) com só a lupa e "Pesquisar" no campo; logo abaixo, Complemento e Zona (mesma lista para qualquer cidade); o que o Google preenche (CEP, logradouro, número, bairro, município, coordenadas) aparece em linhas simples, com "Corrigir à mão".
- Poligonal no mapa: para editar, tocar e segurar sobre a poligonal (celular) ou dar dois cliques (desktop); também "Editar poligonal" no balão. Editando, todos os pontos aparecem e são arrastados direto; tocar e segurar (celular) ou dois cliques (desktop) num ponto abre Excluir ponto / Adicionar ponto depois (mínimo de 3 pontos). Toque ou clique fora da poligonal conclui e salva; Cancelar descarta; Desfazer volta qualquer alteração. O toque longo só redesenha o mapa quando o dedo sai da tela (senão o arraste do mapa fica preso). Aviso do modo em barra escura (snackbar), embaixo no celular, e a poligonal é enquadrada deixando essa faixa livre.
- Temas: Claro (padrão), Escuro e Automático (segue o sistema). Escuro (aprovado out/2026): fundo azul-noite liso `#081028` (barras lateral, superior e inferior na mesma cor, separadas por fio `#1a2240`), quadros um tom abaixo do fundo `#060c20` com contorno fino; indicadores com contorno neon (azul `#3b82f6`, índigo `#6366f1`, violeta `#a855f7`, rosa `#ec4899`); gráficos e linha do tempo em azul/ciano. **Botões de ação e todo seletor ativo (menu, barra inferior, Gestor/Analista/Leitura, filtros) seguem um só padrão tonal:** véu `rgba(99,112,255,.10)`, contorno `rgba(124,140,255,.5)`, texto `#c9d6ff`, sem degradê nem brilho; o botão flutuante do celular leva desfoque atrás. Logo branco. Ativado por `html[data-tema]`; escolha no menu de tema da barra superior, guardada no navegador (`bkm-terrenos-tema`). O seletor existe no protótipo; o front React ainda não tem o botão (entra no porte).

Modelo de dados com diagramas: [docs/modelo.md](docs/modelo.md). Mantenha-o em dia ao mudar migrations.

## Regras de arquitetura (não quebrar)

1. **Terreno ≠ oferta ≠ negociação.** Um terreno tem N ofertas e N processos ao longo do tempo; no máximo um processo aberto (ativo ou em stand by) por tipo (índice único parcial).
2. **Regra de negócio mora no banco.** Mudar etapa, encerrar, registrar proposta, enviar/validar documento: só por RPC (`supabase/migrations/*_regras.sql`). O front não tem permissão de `update` em `processos`, `propostas` ou `documentos`. Escrita direta só em tabelas sem regra (terreno e seus cadastros, ofertas, tarefas, atividades, reuniões e participantes, pessoas, corretores).
3. **Checklist e etapas são configuração** (`etapas_modelo`, `checklist_modelo`, `tipos_documento`). Mudou o processo da empresa? Migration de dados, não código.
4. **Documento nunca é sobrescrito.** Cada envio é uma linha nova em `documento_versoes`; caminho no storage `{empresa_id}/{terreno_id}/{tipo}/{uuid}_{arquivo}`. A primeira pasta é o que a RLS do storage confere.
5. **Isolamento por `empresa_id`** em toda tabela, via RLS com `app.minhas_empresas()`. Views usam `security_invoker = true`.
6. **Auditoria automática** por trigger (`app.auditoria`) e histórico do funil em `processo_transicoes`.
7. **"Não informado" nunca vira zero ou "não".** Números desconhecidos são null; seleções têm `nao_informado` / `nao_verificado` / `nao_avaliada`. "Sem limite" de gabarito é um booleano explícito.
8. **O que muda com o tempo tem histórico, não sobrescrita:** valor venal e IPTU por exercício (`inscricao_valores`), análise urbanística vigente + substituídas, propostas versionadas, documentos versionados.
9. **Condições pedidas pertencem à oferta** (valor, forma de pagamento, aceita permuta); a ficha mostra a oferta de referência da negociação. Temperatura pertence à negociação.
10. **Papéis:** `gestor` (aprova compra, força avanço), `analista` (edita), `leitura` (só consulta). Escrita usa `app.empresas_edicao()` / `app.exigir_editor()`; leitura usa `app.minhas_empresas()`.
11. **Ficha do terreno só muda por `app.salvar_terreno(id, versao, dados)`,** que recusa versão antiga (edição simultânea).

## Comandos

```bash
bash supabase/tests/run.sh          # migrations + 178 testes de regra num Postgres 16 temporário
cd apps/web && npm install
npm run dev                          # precisa de apps/web/.env.local (ver .env.example)
npm run typecheck && npm run build
```

Toda mudança de regra no banco vem com teste em `supabase/tests/regras.sql`.

**Fase atual: estrutura em desenho, sem banco criado.** O front em `apps/web` foi escrito para a primeira versão do esquema e está desatualizado; será portado quando a estrutura assentar. Os fluxos são validados no protótipo (`docs/prototipo.html`), **gerado** a partir de `tools/prototipo/` (fontes, `build.py` e roteiros Playwright; ver o README de lá): edite as fontes e rode `python3 tools/prototipo/build.py`, nunca o HTML gerado. Testes: só o que a mudança toca; a varredura completa (`tvaza`, `tscroll`) ao fechar um lote. Para testá-lo localmente sem acesso a CDN, o workflow "Bibliotecas do protótipo" publica Leaflet e JSZip no branch `libs-prototipo`. Enquanto nenhum projeto Supabase tiver recebido as migrations, altere os arquivos de `supabase/migrations/` no lugar (sem criar migrations novas de correção). O CI valida tudo do zero a cada push. Quando o primeiro banco for criado, esta regra acaba: a partir daí, toda mudança é uma migration nova.

## Decisões em aberto

- **Mesmo projeto Supabase do BKM ou separado?** Hoje o schema `app` é independente, com `empresas`/`membros` próprios. Se unificar, `app.viabilidades` deixa de ser tabela e vira view sobre as viabilidades do BKM.
- Municípios: `app.municipios` tem os 5.571 do IBGE e o front resolve o `municipio_id` pela cidade/UF da busca do Google (`app.municipio_por_nome`). O catálogo de `zoneamentos` só tem São Paulo; para outras cidades falta definir (zona digitada ou catálogo por cidade).
- PostGIS (polígono do terreno, busca por raio, deduplicação por proximidade) ainda não entrou; hoje a deduplicação é por matrícula + cartório e por endereço, e a distância a pontos de interesse é haversine (`app.distancia_km`).
- Mapa: Google Maps JS (mapa, relevo, satélite, Street View, AdvancedMarker com `DEMO_MAP_ID`; criar um Map ID próprio), Routes API (rota no mapa, Directions como reserva), Places API New (autocompletar no cadastro, "o que tem perto" e entorno do terreno), Routes API também na matriz de distâncias a pé, Geocoding (localizar pelo endereço) e Elevation (relevo da poligonal). Sem chave ou com a chave recusada, cai no Leaflet (Esri/OSM). Address Validation ainda não usada. Separar em chave de navegador + chave de servidor fica para depois.
- Alertas por e-mail e tarefas automáticas de vencimento (pg_cron) ainda não existem; o vencimento é calculado na hora pela view `v_documentos`.
- Acesso externo (corretor, advogado) fora do escopo atual.
- IA sobre atas: `documento_versoes.texto_extraido` já existe; faltam a extração (OCR/PDF) e o resumo/perguntas sobre a negociação (provável pgvector + função no servidor).
- Os tipos TypeScript em `apps/web/src/lib/types.ts` são escritos à mão; trocar por `supabase gen types` quando o projeto estiver ligado.
