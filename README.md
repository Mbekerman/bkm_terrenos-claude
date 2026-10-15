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

### 3. Railway
1. New Project → Deploy from GitHub repo → este repositório.
2. Em **Variables**: `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.
3. O Railway usa o `Dockerfile` (ver `railway.json`). Em **Settings → Networking**, gere o domínio.
4. No Supabase, em **Authentication → URL Configuration**, adicione o domínio do Railway em Site URL / Redirect URLs.

## Adicionar pessoas da equipe
Por enquanto, sem tela de convite: a pessoa cria a conta e um gestor insere a linha em `app.membros` (empresa, user_id, papel `gestor` ou `analista`, nome) pelo Table Editor.
