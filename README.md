# BKM Terrenos

Cadastro de ofertas de terrenos e acompanhamento da negociação, do recebimento da oferta até a compra. Arquitetura e decisões: [CLAUDE.md](CLAUDE.md). Protótipo navegável original: [docs/prototipo.html](docs/prototipo.html).

## Estrutura

```
apps/web/              front (React + Vite)
supabase/migrations/   esquema, RLS, regras de negócio (RPCs), storage, dados de exemplo
supabase/tests/        testes das regras num Postgres local
Dockerfile, Caddyfile  imagem do front para o Railway
```

## Colocar no ar

### 1. Supabase
1. Crie o projeto (ou use o do BKM; ver decisões em aberto no CLAUDE.md).
2. Aplique as migrations, em ordem: com a CLI (`supabase link` e `supabase db push`) ou colando cada arquivo de `supabase/migrations/` no SQL Editor.
3. **Settings → API → Exposed schemas:** adicione `app`.
4. **Authentication → Providers → Email:** habilitado. Para testar sem confirmação de e-mail, desligue "Confirm email".

### 2. Rodar local
```bash
cd apps/web
cp .env.example .env.local   # preencha URL e anon key
npm install
npm run dev
```
Crie a conta, crie a empresa (você vira gestor) e use **Carregar dados de exemplo** na tela inicial para ter 12 terrenos de teste.

### 3. Railway (dois ambientes)
Mesmo código, dois serviços no projeto "BKM Terrenos": `terrenos-web` (produção) e `terrenos-web-dev` (desenvolvimento).

| Ambiente | Branch | Variáveis próprias |
| --- | --- | --- |
| produção | `main` | `GOOGLE_MAPS_KEY`, `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` do banco de produção |
| desenvolvimento | `develop` | `AMBIENTE=dev` (selo "Desenvolvimento" na barra superior e `[DEV]` no título), `GOOGLE_MAPS_KEY`, `VITE_SUPABASE_*` do banco de desenvolvimento |

1. Serviço a partir deste repositório; o Railway usa o `Dockerfile` (ver `railway.json`). Em **Settings → Networking**, gere o domínio.
2. Em **Settings → Source**, ligue **Wait for CI** nos dois serviços.
3. As `VITE_*` entram no bundle no build: mudar uma delas exige novo deploy.
4. A chave do Google é restrita por domínio no Cloud Console: inclua o domínio de cada ambiente.
5. No Supabase, em **Authentication → URL Configuration**, adicione o domínio do ambiente que usa aquele banco.

## Adicionar pessoas da equipe
Por enquanto, sem tela de convite: a pessoa cria a conta e um gestor insere a linha em `app.membros` (empresa, user_id, papel `gestor` ou `analista`, nome) pelo Table Editor.
