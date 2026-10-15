# BKM Terrenos

Sistema da BKM (incorporadora MCMV) para cadastro de ofertas de terrenos e acompanhamento da negociação. Fases seguintes: aprovação de projeto, incorporação e financiamento Caixa, como novos tipos de **processo** ligados ao mesmo terreno.

Idioma do produto, do código de domínio e dos commits: português.

## Stack

- Front: React 18 + TypeScript + Vite (`apps/web`), TanStack Query, react-router, supabase-js. Sem biblioteca de UI; estilos em `apps/web/src/styles.css`, portados do protótipo (`docs/prototipo.html`).
- Banco: Supabase (Postgres + Auth + Storage). Tudo no schema `app`, que precisa estar em **Settings → API → Exposed schemas**.
- Deploy do front: Railway, via `Dockerfile` (build Vite + Caddy com fallback de SPA).
- CI: GitHub Actions (`.github/workflows/ci.yml`): typecheck, build e testes de SQL.

Modelo de dados com diagramas: [docs/modelo.md](docs/modelo.md). Mantenha-o em dia ao mudar migrations.

## Regras de arquitetura (não quebrar)

1. **Terreno ≠ oferta ≠ negociação.** Um terreno tem N ofertas e N processos ao longo do tempo; no máximo um processo aberto (ativo ou suspenso) por tipo (índice único parcial).
2. **Regra de negócio mora no banco.** Mudar etapa, encerrar, registrar proposta, enviar/validar documento: só por RPC (`supabase/migrations/*_regras.sql`). O front não tem permissão de `update` em `processos`, `propostas` ou `documentos`. Escrita direta só em tabelas sem regra (terreno e seus cadastros, ofertas, tarefas, atividades, pessoas, corretores).
3. **Checklist e etapas são configuração** (`etapas_modelo`, `checklist_modelo`, `tipos_documento`). Mudou o processo da empresa? Migration de dados, não código.
4. **Documento nunca é sobrescrito.** Cada envio é uma linha nova em `documento_versoes`; caminho no storage `{empresa_id}/{terreno_id}/{tipo}/{uuid}_{arquivo}`. A primeira pasta é o que a RLS do storage confere.
5. **Isolamento por `empresa_id`** em toda tabela, via RLS com `app.minhas_empresas()`. Views usam `security_invoker = true`.
6. **Auditoria automática** por trigger (`app.auditoria`) e histórico do funil em `processo_transicoes`.
7. **"Não informado" nunca vira zero ou "não".** Números desconhecidos são null; seleções têm `nao_informado` / `nao_verificado` / `nao_avaliada`. "Sem limite" de gabarito é um booleano explícito.
8. **O que muda com o tempo tem histórico, não sobrescrita:** valor venal e IPTU por exercício (`inscricao_valores`), análise urbanística vigente + substituídas, propostas versionadas, documentos versionados.
10. **Papéis:** `gestor` (aprova compra, força avanço), `analista` (edita), `leitura` (só consulta). Escrita usa `app.empresas_edicao()` / `app.exigir_editor()`; leitura usa `app.minhas_empresas()`.
11. **Ficha do terreno só muda por `app.salvar_terreno(id, versao, dados)`,** que recusa versão antiga (edição simultânea).
9. **Condições pedidas pertencem à oferta** (valor, forma de pagamento, aceita permuta); a ficha mostra a oferta de referência da negociação. Temperatura pertence à negociação.

## Comandos

```bash
bash supabase/tests/run.sh          # migrations + 103 testes de regra num Postgres 16 temporário
cd apps/web && npm install
npm run dev                          # precisa de apps/web/.env.local (ver .env.example)
npm run typecheck && npm run build
```

Toda mudança de regra no banco vem com teste em `supabase/tests/regras.sql`.

**Fase atual: estrutura em desenho, sem banco criado.** O front em `apps/web` foi escrito para a primeira versão do esquema e está desatualizado; será portado quando a estrutura assentar. Os fluxos são validados no protótipo (`docs/prototipo.html`). Enquanto nenhum projeto Supabase tiver recebido as migrations, altere os arquivos de `supabase/migrations/` no lugar (sem criar migrations novas de correção). O CI valida tudo do zero a cada push. Quando o primeiro banco for criado, esta regra acaba: a partir daí, toda mudança é uma migration nova.

## Decisões em aberto

- **Mesmo projeto Supabase do BKM ou separado?** Hoje o schema `app` é independente, com `empresas`/`membros` próprios. Se unificar, `app.viabilidades` deixa de ser tabela e vira view sobre as viabilidades do BKM.
- PostGIS (polígono do terreno, busca por raio, deduplicação por proximidade) ainda não entrou; hoje a deduplicação é por matrícula + cartório e por endereço.
- Alertas por e-mail e tarefas automáticas de vencimento (pg_cron) ainda não existem; o vencimento é calculado na hora pela view `v_documentos`.
- Acesso externo (corretor, advogado) fora do escopo atual.
- Os tipos TypeScript em `apps/web/src/lib/types.ts` são escritos à mão; trocar por `supabase gen types` quando o projeto estiver ligado.
