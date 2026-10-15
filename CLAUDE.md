# BKM Terrenos

Sistema da BKM (incorporadora MCMV) para cadastro de ofertas de terrenos e acompanhamento da negociação. Fases seguintes: aprovação de projeto, incorporação e financiamento Caixa, como novos tipos de **processo** ligados ao mesmo terreno.

Idioma do produto, do código de domínio e dos commits: português.

## Stack

- Front: React 18 + TypeScript + Vite (`apps/web`), TanStack Query, react-router, supabase-js. Sem biblioteca de UI; estilos em `apps/web/src/styles.css` (Design System BKM, ver "Visual").
- Banco: Supabase (Postgres + Auth + Storage). Tudo no schema `app`, que precisa estar em **Settings → API → Exposed schemas**.
- Deploy: Railway, projeto "BKM Terrenos", serviço `terrenos-web` (https://terrenos-web-production.up.railway.app), via `Dockerfile` (build Vite + Caddy). Push na `main` dispara o deploy automaticamente; com "Wait for CI" ligado no serviço, o deploy espera o workflow CI passar. O protótipo é servido em `/prototipo` (a raiz redireciona para lá enquanto o banco não existe) e o app React no resto. A chave do Google Maps é a variável `GOOGLE_MAPS_KEY` do serviço e fica só no servidor: nunca vai para o repositório nem para o navegador (decisão do Moisés). Ver "Decisões em aberto" sobre como o mapa usa o Google sem expor a chave. O serviço `bkm-app` do mesmo projeto é outro sistema: não mexer.
- CI: GitHub Actions (`.github/workflows/ci.yml`): typecheck, build e testes de SQL.

## Visual

Segue o Design System BKM (artifact "Design System BKM", tema Claro). Tokens e componentes em `apps/web/src/styles.css`, idênticos aos do protótipo. Regras que valem em toda tela:

- Fundo branco, texto marinho `#1d2e5c`, azul `#0094fe` só em detalhes (traço, marcador, ícone). Botão primário marinho, raio 12, altura mínima 48. Cards em azul-gelo `#e4ebf8`, raio 20, sem borda nem sombra.
- Tipografia Aptos (fallback Segoe UI/system-ui), pesos 300/400/600/700. Manuscrita não entra em tela de trabalho.
- Logo oficial (`public/marca/bkm-logo.svg`) com no mínimo 120 px. Ícones de linha BKM (`public/marca/icone-*.svg`) com no mínimo 32 px, para navegação e cabeçalhos; glifos de controle pequenos são desenhados no mesmo traço (linha, sem preenchimento).
- O DS não define cores de status: ok = verde-sálvia/oliva, atenção = pêssego, crítico = terracota `#c67355`, info = azul-gelo. Vermelho e verde puros não entram.
- Uma forma suave (casa em verde-claro) por tela, no máximo.

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
bash supabase/tests/run.sh          # migrations + 151 testes de regra num Postgres 16 temporário
cd apps/web && npm install
npm run dev                          # precisa de apps/web/.env.local (ver .env.example)
npm run typecheck && npm run build
```

Toda mudança de regra no banco vem com teste em `supabase/tests/regras.sql`.

**Fase atual: estrutura em desenho, sem banco criado.** O front em `apps/web` foi escrito para a primeira versão do esquema e está desatualizado; será portado quando a estrutura assentar. Os fluxos são validados no protótipo (`docs/prototipo.html`). Para testá-lo localmente sem acesso a CDN, o workflow "Bibliotecas do protótipo" publica Leaflet e JSZip no branch `libs-prototipo`. Enquanto nenhum projeto Supabase tiver recebido as migrations, altere os arquivos de `supabase/migrations/` no lugar (sem criar migrations novas de correção). O CI valida tudo do zero a cada push. Quando o primeiro banco for criado, esta regra acaba: a partir daí, toda mudança é uma migration nova.

## Decisões em aberto

- **Mesmo projeto Supabase do BKM ou separado?** Hoje o schema `app` é independente, com `empresas`/`membros` próprios. Se unificar, `app.viabilidades` deixa de ser tabela e vira view sobre as viabilidades do BKM.
- PostGIS (polígono do terreno, busca por raio, deduplicação por proximidade) ainda não entrou; hoje a deduplicação é por matrícula + cartório e por endereço, e a distância a pontos de interesse é haversine (`app.distancia_km`).
- Mapa: Leaflet com fundos Esri (mapa cinza-claro e satélite) e OSM (ruas); CARTO passou a exigir chave fora de localhost. Google Maps entra só como link de rota; rota e distância calculadas pela API do Google exigem chave paga (Directions / Distance Matrix) e não estão ligadas. O link publicado do protótipo bloqueia imagens externas, então lá o fundo não aparece.
- Alertas por e-mail e tarefas automáticas de vencimento (pg_cron) ainda não existem; o vencimento é calculado na hora pela view `v_documentos`.
- Acesso externo (corretor, advogado) fora do escopo atual.
- IA sobre atas: `documento_versoes.texto_extraido` já existe; faltam a extração (OCR/PDF) e o resumo/perguntas sobre a negociação (provável pgvector + função no servidor).
- Os tipos TypeScript em `apps/web/src/lib/types.ts` são escritos à mão; trocar por `supabase gen types` quando o projeto estiver ligado.
