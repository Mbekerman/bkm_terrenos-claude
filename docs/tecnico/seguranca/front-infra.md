# BKM Terrenos: auditoria de segurança do front, do servidor e da infraestrutura

Data: 8/nov/2026. Branch auditado: `claude/project-thread-5spxkr` (igual à `origin/develop`, PR 242 em `apps/web/versao.json`).
Escopo: front React (`apps/web`), Caddy (`Caddyfile`, `Dockerfile`), protótipo público (`docs/prototipo.html` e `tools/prototipo/`), workflows (`.github/workflows`), segredos no histórico do git, dependências, Cloud Run e login.
Fora do escopo: RLS e funções SQL (outro auditor). Quando um achado depende do banco, ele vem marcado "→ banco".
Referência de método: skill *security-and-hardening* (addyosmani), usada pelo modelo de ameaça (fronteiras, ativos, STRIDE), pelos três níveis (sempre / perguntar / nunca), pelo OWASP Top 10, pelos cabeçalhos e pela cadeia de suprimentos.

Nenhum arquivo do repositório foi alterado. Testes ao vivo feitos: `curl -sI` nas duas URLs públicas, um GET na página do dev para ler os nomes das metas (os valores não foram copiados), um GET no `mercado.json` de produção (só código e tamanho) e um único GET benigno no proxy `/geosampa` do dev. Nada mais.

---

## (a) Modelo de ameaça

### Fronteiras de confiança

```
                         Internet (qualquer pessoa, robôs)
                                      │
             ┌────────────────────────┼─────────────────────────────┐
             │ [F1] navegador do usuário (origem https://terrenos-web[-dev]-….run.app)
             │   • app React (/)            • protótipo (/prototipo) ← MESMA ORIGEM
             │   • localStorage: sessão Supabase (access + refresh token + provider_token do Google),
             │     rascunhos de formulário, preferências
             │   • chave do Google Maps (meta gmaps-key), URL + chave publicável do Supabase
             └──────┬───────────────┬────────────────────┬──────────────────────┬─────────┘
                    │ HTTPS         │ HTTPS (supabase-js) │ HTTPS (chave no navegador)
                    ▼               ▼                     ▼
  [F2] Cloud Run (Caddy, root)   [F3] Supabase (projeto mghq…,     [F4] Google APIs
   • arquivos estáticos           BKM_Desenvolvimento_Imobiliario)   Maps JS, Places (Details
   • templates: injeta env        • Auth (Google OAuth, PKCE)        com avaliações), Routes
     na página                    • PostgREST: esquemas app, fluxo,  (matriz a pé), Geocoding,
   • /geosampa/* e /geosanja/*      public (im_* do monitor)         Elevation, Static Maps,
     = proxy reverso público      • Storage (documentos)             People (foto, com o
           │                      • RLS = a barreira real            provider_token)
           ▼                              ▲
  [F5] prefeituras                        │ SUPABASE_DB_URL (senha do postgres)
   geoserver/novogeosampa (SP),           │
   geo.sjc.sp.gov.br (SJC)        [F6] GitHub (repo privado, plano Free, sem proteção de branch)
   — conteúdo de terceiros          • Actions: ci.yml, banco.yml (segredo de produção), vendor.yml
     servido na NOSSA origem        • push em develop/main → Cloud Build → Cloud Run (sem esperar CI)
                                    • quem tem escrita: o dono e as sessões de agentes (Claude)
```

### Ativos

1. Senha do banco de produção (`SUPABASE_DB_URL`, usuário `postgres`, passa por cima da RLS).
2. Sessão dos usuários no navegador (tokens Supabase e `provider_token` do Google; no futuro, escopos de Agenda e Gmail).
3. Dados de negócio: terrenos, valores pedidos e propostas, donos (CPF, telefone), estratégia de compra.
4. Dados licenciados do Órulo (monitor de mercado: 1.961 empreendimentos, tabelas de unidades e preços).
5. Faturamento do Google Cloud (APIs cobradas por chamada com a chave pública).
6. Integridade do que vai para produção (cadeia GitHub → Cloud Build → Cloud Run).
7. Papéis e acesso (diretor, gestor, administrador).

### STRIDE por fronteira (resumo)

| Fronteira | S (falsificar) | T (adulterar) | R (negar) | I (vazar) | D (derrubar) | E (elevar) |
|---|---|---|---|---|---|---|
| F1 navegador | XSS rouba a sessão do localStorage | rascunhos no localStorage | auditoria no banco cobre | conteúdo de terceiros na mesma origem (F5), protótipo na mesma origem | n/a | checagem de papel só no front (→ banco) |
| F2 Caddy | n/a | n/a | sem log de acesso próprio além do Cloud Run | `mercado.json` público, protótipo público | 2 instâncias no máximo, proxies sem limite | templates leem env |
| F3 Supabase Auth | cadastro por e-mail e senha, se ligado (A2) | n/a | n/a | RPC `im_tabela_empreendimento` aberta à chave pública | n/a | `equipe_prevista` aplicada por e-mail (A2) |
| F4 Google | chave pública reusada por terceiros | n/a | n/a | n/a | custo por abuso (M3) | n/a |
| F5 prefeituras | n/a | HTML e scripts do upstream na nossa origem (M1) | n/a | n/a | nosso servidor vira relay | n/a |
| F6 GitHub/Build | n/a | push direto em main/develop publica | commits de agentes | segredo exfiltrável de qualquer branch (A1) | n/a | qualquer escrita no repo = acesso ao banco de produção |

---

## (b) Achados por gravidade

Resumo: **0 Crítico, 2 Alto, 7 Médio, 10 Baixo, 6 Informativo.** Nenhum segredo real foi encontrado no histórico do git.

### ALTO

#### A1. O segredo do banco de produção fica ao alcance de qualquer branch (banco.yml e qualquer workflow)

- **Arquivo:** `.github/workflows/banco.yml:10-20` (`on: push:` sem filtro de branch; `DB: ${{ secrets.SUPABASE_DB_URL }}`).
- **Cenário:** o segredo do repositório vale para todo workflow disparado por `push` em **qualquer** branch, e o workflow que roda é o arquivo **daquele branch**. Quem tiver escrita no repositório, incluindo uma sessão de agente induzida por *prompt injection* em algum dado lido (página web, resposta do GeoSampa, texto do Órulo), pode subir um branch com um `ci.yml` alterado (`echo "$X" | base64`, ou `curl` para fora) e ler a cadeia de conexão inteira. O `if: contains(head_commit.message, '[aplicar-banco]')` não protege nada: a condição é escrita no próprio arquivo do branch. A trava "recusa se o esquema app já existe" (linha 38) impede uma segunda aplicação, mas não impede o vazamento.
- **Impacto:** a senha do `postgres` dá leitura e escrita em tudo, por cima da RLS, inclusive no `public.im_*` do monitor e no `auth.users`. Comprometimento total dos dados.
- **Agravante:** o repositório é privado no plano Free, e a API de proteção de branch respondeu `Upgrade to GitHub Pro or make this repository public to enable this feature`. Assim não há proteção de branch nem *environment* com revisores ou restrição de branch, que também é recurso pago em repositório privado.
- **Evidência:**
  ```
  $ gh api repos/Mbekerman/bkm_terrenos-claude --jq '{private,visibility}'
  {"private":true,"visibility":"private"}
  $ gh api repos/Mbekerman/bkm_terrenos-claude/branches/main/protection
  {"message":"Upgrade to GitHub Pro or make this repository public to enable this feature.", "status":"403"}
  $ grep -n "push:\|DB:" .github/workflows/banco.yml
  12:  push:
  20:      DB: ${{ secrets.SUPABASE_DB_URL }}
  ```
  Não consegui listar os segredos existentes, porque o proxy desta sessão bloqueia `actions/secrets`. Confirme em Settings › Secrets se `SUPABASE_DB_URL` existe hoje.
- **Correção proposta (do mais barato ao mais robusto):**
  1. O banco.yml só serve uma vez, porque recusa rodar com o esquema existente. Depois da aplicação, **apague o segredo `SUPABASE_DB_URL`** e **troque a senha do banco** no Supabase (Settings › Database › Reset password). Para uma nova aplicação, recrie o segredo na hora, rode e apague de novo.
  2. Tire o gatilho `push` e deixe só o manual:
     ```yaml
     on:
       workflow_dispatch:
     permissions:
       contents: read
     ```
     Isso não fecha o vazamento (outro workflow de outro branch ainda lê o segredo), mas tira o disparo acidental.
  3. Com GitHub Pro ou Team: crie o environment `producao` com "Deployment branches: main" e revisor obrigatório, mova o segredo para ele (`environment: producao` no job) e ligue a proteção da `main`.
  4. A melhor opção: aplicar o banco de fora do GitHub (máquina do dono, ou o Cloud Build com segredo no Secret Manager e gatilho manual).
- **Como verificar:** Settings › Secrets and variables › Actions não deve ter `SUPABASE_DB_URL` (ou ele deve estar só no environment protegido); `git grep -n "secrets\." .github/` só deve achar o segredo dentro de um job com `environment:`.

#### A2. Cadastro por e-mail e senha, se estiver ligado, abre o sistema e os papéis combinados (condicional à configuração do Auth)

- **Arquivos:** `README.md:20` ("Providers → Email: habilitado. Para testar sem confirmação de e-mail, desligue 'Confirm email'"), `supabase/migrations/20261015001100_usuarios.sql:131-158` (`app.tg_usuario_novo`) e `:180-192` (`app.hook_antes_de_criar_usuario`). → banco (parcial).
- **Cenário:** o hook e o trigger conferem só o **domínio** do e-mail, não o provedor nem a verificação. O `docs/modelo.md` diz que e-mail e senha "ficam desligados", mas o README manda ligar e ainda tirar a confirmação. Se alguém seguir o README:
  - qualquer pessoa faz `supabase.auth.signUp({email:'qualquer@bkm.com.br', password})` com a chave publicável (que está no protótipo público) e vira membro `basico`, que consulta como `leitura`, ou seja, enxerga todos os terrenos;
  - pior: o trigger roda `app._aplicar_equipe_prevista` pelo e-mail. Quem se cadastrar primeiro com o e-mail de um diretor ou administrador que **ainda não entrou** herda o papel dele (`diretor`, `administrador = true`) e marca a linha como aplicada.
  - Mesmo com "Confirm email" ligado, a linha de `auth.users` nasce no `signUp`, antes da confirmação, e o trigger já cria o membro e aplica a equipe prevista à conta não confirmada. O atacante não entra, mas consome a linha da equipe prevista do dono legítimo.
- **Impacto:** leitura de todos os dados, ou elevação a diretor/administrador. Gravidade real: Crítico se o provedor Email estiver ligado sem confirmação; Médio se estiver ligado com confirmação; nenhuma se estiver desligado.
- **Evidência:** `sed -n 131,192p supabase/migrations/20261015001100_usuarios.sql`. O hook só faz `exists (select 1 from app.empresa_dominios where dominio = v_dominio)`; o trigger não lê `raw_app_meta_data->>'provider'` nem `email_confirmed_at`.
- **Correção proposta:**
  1. No Supabase: Authentication › Providers › **Email desligado** (e "Anonymous sign-ins" desligado). Conferir que o hook "Before User Created" está **registrado** para `app.hook_antes_de_criar_usuario`.
  2. Defesa em profundidade no hook (→ banco):
     ```sql
     if coalesce(event->'user'->'app_metadata'->>'provider','') <> 'google' then
       return jsonb_build_object('error', jsonb_build_object('http_code',403,'message','Entre com o Google da empresa.'));
     end if;
     ```
     No trigger, só aplicar `equipe_prevista` quando `new.raw_app_meta_data->>'provider' = 'google'` e `new.email_confirmed_at is not null`. O Google preenche os dois; se não preencher na inserção, aplicar no `t_usuario_login`.
  3. Corrigir o `README.md` (seções 1.4 e "Adicionar pessoas da equipe", que também estão desatualizadas).
- **Como verificar:** com a chave publicável, `curl -X POST "$SUPABASE_URL/auth/v1/signup" -H "apikey: $KEY" -d '{"email":"teste+x@bkm.com.br","password":"..."}'` deve responder `Signups not allowed` / 4xx. Fazer isso só no projeto de desenvolvimento, ou com o ok do dono.

### MÉDIO

#### M1. O proxy `/geosampa` serve HTML de terceiro na mesma origem do app (onde estão os tokens)

- **Arquivo:** `Caddyfile:33-67` (o `@camadas` só filtra método e caminho; a *query string* é livre).
- **Cenário:** `GET /geosampa/geoserver/geoportal/wms?...&format=application/openlayers` devolve uma página HTML do GeoServer **na origem `terrenos-web…run.app`**. Qualquer HTML ou JS servido ali roda com acesso ao `localStorage` do app, onde o supabase-js guarda a sessão (access token, refresh token e `provider_token` do Google). Hoje quem segura é o cabeçalho CSP que o próprio GeoServer manda (`script-src 'self'`), que não controlamos. Uma mudança de versão do GeoServer, uma falha conhecida de XSS (o GeoServer já teve várias nos formatos de pré-visualização) ou JSONP ligado (`outputFormat=text/javascript`) basta para um link enviado a um usuário logado roubar a sessão. Também passam os formatos de WFS e WMS que não usamos (KML, HTML de `GetFeatureInfo` etc.).
- **Impacto:** tomada de conta (A03/A05 do OWASP). A probabilidade hoje é baixa porque o CSP do upstream segura.
- **Evidência (um GET benigno no dev):**
  ```
  $ curl -s -D - ".../geosampa/geoserver/geoportal/wms?service=WMS&version=1.1.1&request=GetMap&layers=geoportal:lote_cidadao&...&format=application/openlayers"
  HTTP/2 200
  content-security-policy: base-uri 'self'; ... script-src 'self';, frame-ancestors 'self';
  content-type: text/html; subtype=openlayers3; charset=ISO-8859-1
  → corpo: <!doctype html> ... 2 <script>
  ```
- **Correção proposta:**
  1. Barrar respostas que não sejam dado ou imagem e isolar o conteúdo:
     ```caddy
     reverse_proxy https://geoserver.geosampa.prefeitura.sp.gov.br {
         header_up Host {upstream_hostport}
         header_up -Origin
         header_up -Referer
         header_up -Cookie
         header_down -Set-Cookie
         header_down -Access-Control-Allow-Origin
         header_down Content-Security-Policy "default-src 'none'; sandbox"
         header_down X-Content-Type-Options nosniff
         @html header Content-Type *html*
         handle_response @html {
             respond "Formato não permitido" 415
         }
     }
     ```
  2. Restringir também a *query* ao que a ficha usa (`outputFormat=application/json`, `format=image/png|image/jpeg`, `info_format=application/json`). Por exemplo, um matcher `expression` que recusa `{query.format}`/`{query.outputFormat}` fora da lista (atenção: o GeoServer aceita os parâmetros em qualquer caixa).
  3. A solução estrutural: servir os proxies num **host separado** (outro serviço do Cloud Run, como `geo-…run.app`), para que nada servido por eles divida a origem com a sessão. Aplicar o mesmo ao `/geosanja` (`/v1/proxy` repassa WMS com `FORMAT` livre).
- **Como verificar:** repetir o GET acima; o resultado esperado é 415, ou um `Content-Security-Policy: sandbox` na resposta.

#### M2. O app não manda cabeçalhos de segurança (CSP, frame-ancestors, nosniff, Referrer-Policy, Permissions-Policy)

- **Arquivo:** `Caddyfile:13-117` (nenhuma diretiva `header` além de `Cache-Control`).
- **Cenário:** sem CSP, qualquer XSS (no app, no protótipo da mesma origem ou via M1) roda sem freio e lê o `localStorage`. Sem `frame-ancestors`/`X-Frame-Options`, o app logado pode ser embutido num iframe de outro site (*clickjacking* de Avançar, Aprovar, arrastar cartão). Sem `Referrer-Policy`, a URL completa (`/terrenos/A123/comercial#f=...`) vai no Referer para terceiros (Google Fonts, Maps, links do Órulo).
- **HSTS:** não aparece no cabeçalho, mas o TLD `.app` inteiro está na lista de pré-carga de HSTS dos navegadores, então hoje está coberto. Só passa a faltar com um domínio próprio (ex.: `terrenos.bkm.com.br`).
- **Evidência:**
  ```
  $ curl -sI https://terrenos-web-dev-469931692112.southamerica-east1.run.app/
  HTTP/2 200
  cache-control: no-cache
  content-type: text/html; charset=utf-8
  vary: Accept-Encoding
  server: Google Frontend
  ```
  (Produção dá 302 para `/prototipo/`, também sem cabeçalhos.)
- **Correção proposta** (no bloco do site; começar com `Content-Security-Policy-Report-Only` e ajustar):
  ```caddy
  header {
      X-Content-Type-Options nosniff
      Referrer-Policy strict-origin-when-cross-origin
      X-Frame-Options DENY
      Permissions-Policy "camera=(), microphone=(), payment=(), usb=(), geolocation=(self)"
      Strict-Transport-Security "max-age=31536000; includeSubDomains"
      Content-Security-Policy-Report-Only "default-src 'self'; script-src 'self' https://maps.googleapis.com https://maps.gstatic.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob: https://*.googleapis.com https://*.gstatic.com https://*.googleusercontent.com https://*.arcgisonline.com https://*.tile.openstreetmap.org; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.googleapis.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'"
  }
  ```
  `geolocation=(self)` porque o mapa tem "Minha localização". O protótipo usa scripts inline, então precisa de CSP própria (com `'unsafe-inline'`) ou, melhor, sair da origem (ver M4). A lista de hosts do Maps tem de ser conferida com o [guia de CSP do Maps JS](https://developers.google.com/maps/documentation/javascript/content-security-policy).
- **Como verificar:** `curl -sI <url> | grep -iE "content-security|x-frame|nosniff|referrer|permissions"`; no navegador, o console sem violações de CSP com o mapa, o Street View e o login funcionando.

#### M3. A chave do Google é pública e cobrada por chamada, e a restrição por Referer não segura robôs

- **Arquivos:** `apps/web/index.html:13`, `docs/prototipo.html` (meta `gmaps-key` preenchida pelo Caddy), chamadas REST com a chave no navegador: `routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix`, `directions/v2:computeRoutes`, `maps/api/staticmap`, mais Place Details com avaliações (SKU Enterprise + Atmosphere, cerca de US$ 25 por mil, segundo o CLAUDE.md).
- **Cenário:** a chave aparece para qualquer visitante anônimo de `https://terrenos-web-…run.app/prototipo/` (produção, sem login). A restrição por domínio (HTTP referrer) só vale dentro do navegador: um script com `curl -H "Referer: https://terrenos-web-…run.app/"` usa a chave à vontade nas APIs REST (Routes, Places, Geocoding, Static Maps). A mesma chave serve dev, produção e protótipo.
- **Impacto:** custo (STRIDE D, financeiro). Não há vazamento de dados.
- **Evidência:** `curl -s https://terrenos-web-dev-…/ | grep -o '<meta name="gmaps-key" content=.AIza'` mostra a chave preenchida. O valor não foi copiado para cá.
- **Correção proposta:**
  1. No Cloud Console › Credentials, restringir a chave **por API** (só Maps JS, Places New, Routes, Geocoding, Elevation e Static Maps; a People API não precisa estar na chave, porque usa o token OAuth).
  2. Em APIs › Quotas, pôr um **teto diário por API** (ex.: Place Details 300/dia, Route Matrix 2.000 elementos/dia) e um **alerta de orçamento** no faturamento.
  3. Separar as chaves de dev, produção e protótipo, e tirar a chave do protótipo de produção (ver M4).
  4. A médio prazo, levar as chamadas caras (Place Details com avaliações, Route Matrix) para uma função do servidor (Supabase Edge Function, com JWT do usuário e limite por usuário) e manter no navegador só a chave do Maps JS.
- **Como verificar:** `curl "https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix" -H "X-Goog-Api-Key: $K" -H "Referer: https://terrenos-web-…/"` deve ser recusado (API não permitida para a chave) ou parar na cota.

#### M4. O protótipo é público na URL de produção, na mesma origem do app, e publica dados do Órulo

- **Arquivos:** `Caddyfile:18-28`, `Dockerfile:16-18`, `docs/dados/mercado.json` (3,18 MB), `tools/prototipo/proto_mercado.js:307-312`.
- **Cenário:**
  - `https://terrenos-web-…run.app/prototipo/` é aberto a qualquer um, sem login, e a raiz de produção redireciona para ele. Ele traz o desenho completo das regras de negócio (funil, aprovações, papéis), a chave do Google (M3) e a URL e a chave publicável do projeto Supabase de produção.
  - `GET /prototipo/dados/mercado.json` entrega a qualquer um o retrato do monitor: 1.961 empreendimentos com incorporadora, coordenadas, preço, estoque, vendas e grupos de unidades.
  - O protótipo chama `public.im_tabela_empreendimento` com a chave publicável, que segundo o CLAUDE.md está "aberta à chave publicável". Assim qualquer pessoa baixa a tabela unidade a unidade de cada empreendimento, iterando os ids do `mercado.json`.
  - Os dados do Órulo vêm de uma conta paga; a redistribuição pública provavelmente fere o contrato e entrega inteligência de mercado a concorrentes.
  - Por estar na mesma origem do app real, qualquer XSS nos 2,2 MB de HTML montado à mão do protótipo (91 `innerHTML` nas fontes; as que olhei escapam com `esc`) leria a sessão do app.
- **Impacto:** vazamento de dados licenciados e da estratégia, e uma superfície de XSS na origem da sessão.
- **Evidência:**
  ```
  $ curl -s -o /dev/null -w "%{http_code} %{size_download}\n" https://terrenos-web-469931692112.southamerica-east1.run.app/prototipo/dados/mercado.json
  200 3183909
  $ python3 -c "import json;print(len(json.load(open('docs/dados/mercado.json'))['emps']))"
  1961
  ```
- **Correção proposta:**
  1. Tirar o protótipo do serviço de produção (no `Dockerfile`, copiar `docs/prototipo.html` e `docs/dados/mercado.json` só na imagem de dev, com um `ARG AMBIENTE`), ou pôr o protótipo atrás de autenticação (Cloud Run com IAP, ou `basic_auth` no Caddy com hash bcrypt numa variável do serviço).
  2. Servir o protótipo noutro serviço ou host (origem separada da sessão real).
  3. No app real, `mercado.json` não deveria ser estático: virar uma view ou RPC que exige `authenticated` e membro da empresa. Trocar o `grant execute` de `public.im_tabela_empreendimento` de `anon` para `authenticated` com checagem de membro (→ banco / repositório do monitor).
- **Como verificar:** sem login, `curl -sI …/prototipo/` e `…/prototipo/dados/mercado.json` devem dar 401/404 em produção; a chamada RPC com a chave publicável e sem JWT deve dar 401/permission denied.

#### M5. O ambiente de dev usa o projeto Supabase de produção e publica a cada push, sem revisão nem CI

- **Arquivos:** `CLAUDE.md` (Ambientes, Stack: "o build não espera o CI"), `README.md:43-44`.
- **Cenário:** a página do `terrenos-web-dev` traz `supabase-url` = `https://mghq…supabase.co`, o mesmo projeto que o CLAUDE.md chama de produção (BKM_Desenvolvimento_Imobiliario, do monitor). Todo merge na `develop`, frequentemente feito por agentes, vai para o ar em minutos com o login e os dados reais, sem esperar o CI e sem proteção de branch (plano Free). Um bug ou um front malicioso na `develop` age com a sessão de usuários reais. Push direto na `main` também vai direto para produção.
- **Impacto:** integridade e confidencialidade dos dados reais a partir de código não revisado. Não é falha do código, é do processo.
- **Evidência:** `curl -s https://terrenos-web-dev-…/ | grep -oE '<meta name="supabase-url" content=.https://mghq'`. O ref do projeto bate com o `MK_API.url` de `proto_mercado.js:307`.
- **Correção proposta:** um projeto Supabase de desenvolvimento separado (plano Free basta, como o próprio CLAUDE.md prevê), com o dev apontando para ele; no Cloud Build, o gatilho da `main` só por tag ou com aprovação manual ("Require approval" no gatilho); com Pro, proteção da `main` e da `develop` exigindo o CI verde.
- **Como verificar:** as metas `supabase-url` de dev e de produção diferentes; o gatilho de produção no Cloud Build com "Approval required".

#### M6. Build não reprodutível: `npm install` em vez de `npm ci`, imagens e actions sem pin

- **Arquivos:** `Dockerfile:4,8,13`; `.github/workflows/ci.yml:13-14,27,35-36`; `banco.yml:22`.
- **Atualização (#243, 9/nov/2026):** o `ci.yml` passou a usar `npm ci` (front e serviço do IPTU) e ganhou `permissions: contents: read, pull-requests: read`; só roda no PR. Continuam abertos o `npm install` do `Dockerfile` e as actions em tag (`@v4`), não em SHA.
- **Cenário:** `npm install` com `^` no `package.json` pode instalar versões diferentes das do `package-lock.json` e grava o lock no build. Um pacote comprometido publicado como versão menor (o caso dos *worms* do npm em 2025) entra no bundle de produção sem passar pelo CI. `node:22-alpine` e `caddy:2-alpine` mudam por baixo a cada build. As actions estão em tag (`@v4`), não em SHA.
- **Impacto:** cadeia de suprimentos (OWASP A06/A08).
- **Evidência:** `grep -n "npm install\|FROM" Dockerfile` → `4:FROM node:22-alpine`, `8:RUN npm install --no-audit --no-fund`, `13:FROM caddy:2-alpine`.
- **Correção proposta:**
  ```dockerfile
  FROM node:22.11.0-alpine3.20@sha256:<digest> AS build
  RUN npm ci --no-audit --no-fund --ignore-scripts
  ...
  FROM caddy:2.8.4-alpine@sha256:<digest>
  ```
  No CI, `npm ci`, `npm audit --omit=dev --audit-level=high` como passo, actions por SHA (`actions/checkout@<sha> # v4.2.2`) e o Dependabot (`.github/dependabot.yml`) para npm, actions e docker.
- **Como verificar:** dois builds seguidos geram o mesmo `dist/` (mesmo hash dos assets); o CI falha se o lock estiver fora de sincronia.

#### M7. Checagens de papel só no front: o que precisa estar garantido no banco (→ banco)

- **Arquivos:** `apps/web/src/lib/sessao.tsx:88-89` (`eGestor` e `edita` calculados do `membros.papel`); escritas diretas em tabelas:
  - `ficha/Parametros.tsx:253` `analise_zoneamentos.update`
  - `ficha/Comercial.tsx:165,267` `ofertas.update`; `:268-269` `oferta_partes.delete/upsert`; `:169,339-340` `terreno_corretores.upsert/update`; `:470,479,489` `reunioes.insert/update(status)` e `reuniao_participantes.insert`
  - leituras amplas: `ficha/Painel.tsx:213` (`auditoria` por empresa), `Entorno.tsx:41`, `Parametros.tsx:59` (`usuarios` sem filtro).
- **Cenário:** um usuário `leitura` ou `basico` abre o console e chama `supabase.from('ofertas').update({valor_pedido: 1})`. Os botões somem pelo `edita`, mas só a RLS barra a chamada. Isso não é falha confirmada no front: é a lista do que o auditor do banco precisa testar.
- **O que conferir no banco:** `update`/`insert`/`delete` dessas 6 tabelas só com `empresa_id in (select app.empresas_edicao())`; `analise_zoneamentos` sem permitir trocar `analise_id`/`empresa_id` nem editar análise substituída; `reunioes.status` (a regra "feita" só pelo editor); `auditoria` sem expor o `antes`/`depois` de tabelas restritas (Taxas e Despesas financeiras são só da diretoria: a auditoria das linhas de viabilidade vaza esses valores para quem não é diretoria?); `usuarios` restrito às empresas do usuário (o `modelo.md` diz que é).
- **Gravidade:** Médio enquanto não houver teste no `regras.sql` cobrindo cada uma; cai para Informativo se houver.

### BAIXO

#### B1. Os proxies das prefeituras são relays públicos sem limite
`Caddyfile:33-89`. Qualquer pessoa na internet usa o nosso servidor para consultar GeoSampa e GeoSanja contornando a checagem de Origin deles: WFS `GetFeature` sem `count` na cidade inteira gera respostas de dezenas de MB pagas na saída do Cloud Run, e o abuso aparece nos logs da prefeitura com o IP do Google ligado ao nosso serviço (risco de bloqueio, que derruba a ficha). O `POST /v1/localizar` não tem limite de corpo. **Correção:** `request_body { max_size 16KB }` no `@busca`; exigir `count`/`maxFeatures` na query do WFS; um cabeçalho próprio (`X-BKM: 1`) que o front manda e o Caddy exige (barra *hotlink*, não atacante); a médio prazo, autenticar o proxy pelo JWT do Supabase numa função do servidor. **Verificar:** `curl -X POST -d @grande.json …/geosanja/v1/localizar` → 413.

#### B2. 2 instâncias no máximo e sem limite de taxa
Cloud Run com 0 a 2 instâncias. Uma enxurrada simples (ou as consultas pesadas do B1) satura as duas e derruba o app para todos. **Correção:** concorrência e `max-instances` dimensionadas, e Cloud Armor (exige *load balancer*) ou o limite no próprio proxy (o módulo `rate_limit` do Caddy exige build próprio com xcaddy).

#### B3. Rascunhos com dados pessoais ficam no navegador para sempre e não saem no logout
`apps/web/src/components/Rascunho.tsx:111-131` (chave `bkm-terrenos-rasc:<terreno>:<form>`, "não expira"), usado em pessoa (CPF, telefone), proposta, IPTU e oferta. `supabase.auth.signOut()` (`Moldura.tsx:96`) não limpa. Num computador compartilhado, o próximo usuário, ou alguém sem acesso ao terreno, vê o rascunho. Questão de LGPD. **Correção:** prefixar a chave com o `user_id`, apagar `bkm-terrenos-rasc:*` no `signOut` e dar validade (ex.: 7 dias).

#### B4. Sessão e `provider_token` do Google no localStorage
`lib/supabase.ts:10` (padrão do supabase-js, `persistSession: true`). É o comportamento normal de uma SPA com Supabase, mas transforma qualquer XSS (M1, M2, M4) em roubo de conta, incluindo o token do Google usado na API People (`sessao.tsx:57-75`). Quando entrarem a Agenda e o Gmail, **não** peça esses escopos no login do navegador (o plano de guardar o refresh token no Vault por função do servidor está certo; manter). Alternativa futura: `@supabase/ssr` com cookies httpOnly via backend.

#### B5. `href` vindo de dados sem checar o esquema
`ficha/Parametros.tsx:137` (`p.fonte_url`, editável pelo administrador, sem `check` no banco, `20261015000260_parametros_urbanisticos.sql:48`), `mapa/Concorrencia.tsx:295` (`E.link`, do Órulo via coletor). O React 18 só avisa no console com `javascript:` em `href`, não bloqueia. Para explorar é preciso ser administrador ou adulterar o retrato do monitor. **Correção:** `const seguro = (u?: string) => (u && /^https?:\/\//i.test(u) ? u : undefined);` e `check (fonte_url ~ '^https?://')` (→ banco).

#### B6. Dependências com alertas (npm audit)
Em `apps/web`:
```
$ npm audit --omit=dev
react-router 6.0.0 - 7.17.0  moderate  (GHSA-wrjc-x8rr-h8h6 open redirect com "\" em <Link>/useNavigate; GHSA-337j-9hxr-rhxg só SSR)
2 moderate severity vulnerabilities
$ npm audit
... + vite <=6.4.3 high, esbuild <=0.24.2 moderate (servidor de desenvolvimento)
4 vulnerabilities (3 moderate, 1 high)
```
Análise: a falha do react-router só vale com `navigate()`/`<Link>` para destino controlado pelo usuário. Os `navegar(...)` do código usam caminhos montados (`/mapa/${codigo}`); o único dinâmico é `location.state.volta` (`pages/FichaPagina.tsx:26`), que um link de fora não controla. O app não usa SSR. vite e esbuild só afetam o `npm run dev` (não vão para a imagem). **Correção:** subir `react-router-dom` para a correção da linha 6 se houver (ou planejar a 7.x) e o `vite` para ≥ 6.4.4 (ou 7.x), com `npm audit` no CI.

#### B7. O protótipo carrega Leaflet e JSZip do cdnjs sem SRI
`docs/prototipo.html` (`<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js">`, `jszip/3.10.1`). Um CDN comprometido roda código na origem da sessão (M4). **Correção:** `integrity="sha512-…" crossorigin="anonymous"` (o cdnjs publica os hashes) ou empacotar as bibliotecas no build.

#### B8. `vendor.yml` publica com `push -f` arquivos baixados sem conferir o hash
`.github/workflows/vendor.yml:12-19`. O branch `libs-prototipo` serve só para testes locais, então o impacto é baixo, mas um download adulterado entra sem aviso. **Correção:** `echo "<sha256>  leaflet.js" | sha256sum -c` antes do commit; `runs-on: ubuntu-24.04` fixo.

#### B9. `templates` do Caddy leem qualquer variável de ambiente
`Caddyfile:22-25,95-98,110-113`. Toda resposta `text/html` de `/srv` passa pelo motor de templates com `{% %}`, e ele tem `env`, `readFile`, `include` e `httpInclude`. Hoje só arquivos do repositório são servidos (nenhum caminho com conteúdo de usuário: os JSON de dados não são `text/html`, o Storage é do Supabase), então **não há injeção explorável**. O risco é futuro: se alguém puser uma variável secreta no serviço (ex.: a chave de servidor do Google, `SUPABASE_SERVICE_ROLE_KEY` para uma rotina) e um texto com `{% env "X" %}` entrar num HTML do protótipo (gerado por agentes a partir de dados), o segredo vai para a página. **Correção:** nunca pôr segredo em variável do serviço web (usar Secret Manager num serviço separado); limitar `templates` só a `/index.html` com um matcher (`@pagina path /index.html`); no `build.py`, falhar se o HTML gerado tiver `{%` fora das duas metas.

#### B10. O front aceitaria uma chave secreta posta por engano em `SUPABASE_KEY`
`apps/web/src/lib/config.ts:13-14`. Se alguém puser a `sb_secret_…`/`service_role` na variável do serviço, ela vai para todos os navegadores e a RLS deixa de valer. **Correção** (nível "sempre"):
```ts
const papelJwt = (k: string) => { try { return JSON.parse(atob(k.split('.')[1] ?? '')).role as string; } catch { return ''; } };
if (SUPABASE_KEY && (SUPABASE_KEY.startsWith('sb_secret_') || papelJwt(SUPABASE_KEY) === 'service_role'))
  throw new Error('Chave secreta do Supabase na página: troque pela publicável.');
```
Documentar também no README que `SUPABASE_KEY` é sempre a publicável.

### INFORMATIVO

- **I1. Nenhum segredo real no histórico do git.** A varredura de 627 commits (`git log -p --all`) com padrões `AIza…{35}`, `sb_secret_`, JWT `eyJ…`, `postgres://usuario:senha@`, `ghp_`, `github_pat_`, chave privada PEM, `senha|password|token = "…"` só achou `AIzaTEST…` (fixture), `senha="nao-e-segredo"`, `token-de-teste`, o texto "service_role" em comentários e documentação, e a **chave publicável** `sb_publishable_nGsg…` do projeto `mghq…` em `tools/prototipo/proto_mercado.js:307`. A chave publicável é pública por desenho (a proteção é a RLS); deixá-la no repositório não é falha, mas por ela se chega à RPC do M4. O coletor do Órulo (que já esteve em `tools/coletar`) lê as credenciais de variáveis de ambiente (`ORULO_EMAIL`, `ORULO_PASSWORD`, `ORULO_CLIENT_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`); nenhuma está no código. `.gitignore` cobre `.env`, `.env.local` e `*.local`; só `apps/web/.env.example` está versionado, com valores de exemplo.
  Comando: `git log -p --all | grep -oE "AIza[0-9A-Za-z_-]{35}|sb_secret_[A-Za-z0-9_-]+|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}|postgres(ql)?://[^ \"']+|ghp_[A-Za-z0-9]{30,}|github_pat_\w+|-----BEGIN [A-Z ]*PRIVATE KEY" | sort | uniq -c`.
- **I2. O sanitizador `limpaHtml` (`ficha/Avanco.tsx:90-107`) está correto para o uso atual.** Ele faz o parse num `<template>` inerte, deixa só `B, STRONG, I, EM, U, UL, OL, LI, BR, P, DIV`, tira **todos** os atributos, desembrulha o resto e tira comentários. Não achei bypass. Para durar, trocar por DOMPurify (`ALLOWED_TAGS` iguais, `ALLOWED_ATTR: []`), que trata mXSS.
- **I3. O balão de lugar do Google (`mapa/motor.ts:53-62`) escapa tudo com `esc`,** inclusive o texto das avaliações e os `href`. Os `innerHTML` dos marcadores (`motor.ts:121,267,278,311,328`) só levam cores da paleta interna e glifos fixos, nunca texto de usuário. Os `dangerouslySetInnerHTML` de `Moldura.tsx:37,152` e `Concorrencia.tsx:14` só levam SVG constante. Os chips de filtro do protótipo vindos do `#f=` do endereço passam por `esc` (`proto_filtros.js:152`), e o `#f=` do app passa por `soValidos` (`filtros/Filtros.tsx:21`).
- **I4. Login bem feito:** OAuth com **PKCE** (`flowType: 'pkce'`), app OAuth "Interno" no Workspace (barra conta Google pessoal, inclusive conta pessoal criada com e-mail `@bkm.com.br`), hook "Before User Created" no servidor (o `hd` é só dica, como o código diz), papel `basico` só como leitura, `salvar_minha_foto` validando o host. `redirectTo: window.location.href` (`Login.tsx:28`) é seguro **se** a lista de Redirect URLs do Supabase tiver só as URLs exatas (`https://terrenos-web-…run.app/**`), sem curinga de domínio (`https://*.run.app/**` permitiria a outro serviço do Cloud Run receber o código; o PKCE ainda segura, porque o verificador fica na origem legítima). Conferir no painel (Authentication › URL Configuration).
- **I5. Sem listagem de diretório** (`file_server` sem `browse`); `try_files … /index.html` devolve a SPA para qualquer caminho (`/assets/` dá 200 com o index, não uma listagem). O `.dockerignore` deixa fora da imagem `supabase/` (incluindo `carga/bkm.sql`, com a equipe e os e-mails) e `docs/*`, menos o protótipo e `docs/dados`.
- **I6. Achados de documentação:** o `README.md` está desatualizado (manda ligar o provedor Email e cita `VITE_SUPABASE_*` como argumento de build, quando hoje vem do Caddy) e é perigoso (A2).

---

## (c) O que está bem feito

- A regra de negócio mora no banco, por RPC; o front não tem `update` em `processos`, `propostas` e `documentos` (`salvar_terreno` com versão, `mover_etapa`, `decidir_aprovacao` etc.). O front segue: os `rpc(...)` cobrem avanço, aprovação, proposta e oferta.
- A chave do Google e a configuração do Supabase entram pelo ambiente, nunca pelo repositório; o regex `^AIza[\w-]{20,}$` em `config.ts` evita injetar lixo.
- Proxies das prefeituras com upstream **fixo** (sem SSRF: nenhum parâmetro escolhe o host), só os métodos e caminhos usados, tirando `Cookie`, `Origin` e `Referer` na ida e `Set-Cookie` e `Access-Control-Allow-Origin` na volta, e `respond 404` para o resto.
- Escape consistente (`esc`) no HTML montado à mão, tanto no app (`motor.ts`) quanto no protótipo; sanitizador por lista branca sem atributos no texto rico.
- Login só Google Workspace com PKCE, app interno, hook no servidor e papel mínimo por padrão; empresa nova só pela carga (correção de 4/nov).
- `banco.yml` não mostra a senha (`::add-mask::`), confere o formato e se recusa a sobrescrever um esquema existente; a aplicação é numa transação só.
- `localStorage` sempre em `try/catch` e só para preferências, fora os rascunhos (B3).
- Imagem final sem código-fonte nem `node_modules` (estágio de build separado); assets imutáveis com `Cache-Control` longo e a página com `no-cache`.
- Os tokens do Google para Agenda e Gmail estão planejados para o Vault, fora do navegador.

---

## (d) Checklist para quem mexer no front, no Caddy ou nos workflows

**Sempre**
- [ ] Texto vindo do banco, do Google, das prefeituras ou do Órulo: renderizar como texto do React. Se precisar montar HTML, `esc()` em todo valor e nada de `innerHTML` com dado cru.
- [ ] `href` de dado: só `https?://` (helper `seguro()`), com `target="_blank" rel="noopener noreferrer"`.
- [ ] Toda escrita nova direto em tabela pelo front: conferir se a tabela está na lista "sem regra" do CLAUDE.md (regra 2) e se há teste de RLS em `supabase/tests/regras.sql` para `leitura`/`basico`.
- [ ] Esconder um botão por papel (`edita`, `eGestor`, administrador) não é segurança; a mesma regra tem de existir no banco.
- [ ] Nada sensível no `localStorage` sem prefixo do usuário e limpeza no `signOut`.
- [ ] `npm ci` (não `npm install`) e `npm audit --omit=dev` antes de promover para a `main`.
- [ ] Ao mexer no `Caddyfile`, conferir com `curl -sI` que os cabeçalhos de segurança continuam saindo.
- [ ] Ao gerar o protótipo, garantir que não sobra `{%` fora das metas (templates do Caddy).

**Perguntar antes (ok do Moisés)**
- [ ] Novo proxy no Caddy, ou ampliar caminhos, métodos ou formatos de um existente.
- [ ] Nova API do Google chamada do navegador (custo por chamada; atualizar a restrição por API e as cotas da chave).
- [ ] Mudar CORS, CSP, `templates` ou o que vai para `/prototipo`.
- [ ] Novo escopo OAuth do Google, ou mudança no login, no hook ou na equipe prevista.
- [ ] Novo workflow que use segredo, ou novo segredo no repositório.
- [ ] Novos dados de terceiros servidos estaticamente (`docs/dados`).

**Nunca**
- [ ] Segredo (`sb_secret_`, `service_role`, senha do banco, chave de servidor do Google, credenciais do Órulo) em variável do serviço web, no repositório, no protótipo ou em log do Actions.
- [ ] Gatilho `push` em workflow que usa segredo de produção; `pull_request_target` com checkout do código do PR.
- [ ] `dangerouslySetInnerHTML`/`innerHTML` com dado não sanitizado; `eval`/`new Function` com dado.
- [ ] Proxy que aceite o host ou a URL do destino como parâmetro.
- [ ] Ligar o provedor Email/senha ou o login anônimo no Supabase Auth.
- [ ] Apontar o dev para o banco de produção (a corrigir hoje: M5).

---

## Resumo (10 linhas)

1. Nenhum segredo real no histórico do git (627 commits); só a chave publicável do Supabase, pública por desenho.
2. Alto: qualquer branch pode ler o segredo `SUPABASE_DB_URL` (senha do postgres de produção) por um workflow alterado; sem proteção de branch no plano Free. Apagar o segredo depois do uso e trocar a senha.
3. Alto (condicional): o hook e o trigger de login só conferem o domínio; se o provedor Email estiver ligado (o README manda), qualquer um vira membro, e quem se cadastrar primeiro com o e-mail de um diretor previsto herda o papel.
4. Médio: `/geosampa` serve HTML do GeoServer na origem do app (confirmado), onde ficam os tokens; hoje só o CSP do upstream segura.
5. Médio: o app não manda CSP, frame-ancestors, nosniff, Referrer-Policy nem Permissions-Policy (HSTS coberto pelo `.app`).
6. Médio: a chave do Google é pública (protótipo de produção sem login) e cobrada por chamada; a restrição por Referer não para robôs. Faltam cotas e restrição por API.
7. Médio: o protótipo de produção publica `mercado.json` (1.961 empreendimentos do Órulo), e a RPC do monitor está aberta à chave pública.
8. Médio: o dev aponta para o projeto Supabase de produção e publica a cada push, sem CI nem revisão.
9. Médio: build com `npm install` e imagens e actions sem pin; o npm audit tem 2 moderados em produção (react-router, não exploráveis no uso atual) e vite high só no dev.
10. Bem feito: regras no banco por RPC, PKCE com app interno do Workspace, proxies com host fixo (sem SSRF), escape consistente e sanitizador por lista branca.

### Achados Crítico e Alto

- **Crítico:** nenhum confirmado. O A2 vira Crítico se o provedor Email estiver ligado sem confirmação (conferir no painel do Supabase).
- **A1 (Alto):** `.github/workflows/banco.yml:10-20`: o segredo de produção é exfiltrável por qualquer branch; sem proteção de branch nem environment no plano Free.
- **A2 (Alto, condicional):** `supabase/migrations/20261015001100_usuarios.sql:131-192` + `README.md:20`: o login confere só o domínio, não o provedor nem a verificação; abre leitura e a herança de papéis da `equipe_prevista`.
