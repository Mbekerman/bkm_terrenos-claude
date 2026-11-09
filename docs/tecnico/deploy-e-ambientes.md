# Ambientes e deploy

## Os dois ambientes

| | Desenvolvimento | Produção |
| --- | --- | --- |
| Branch | `develop` | `main` |
| Serviço Cloud Run | `terrenos-web-dev` | `terrenos-web` |
| Endereço | https://terrenos-web-dev-469931692112.southamerica-east1.run.app | https://terrenos-web-469931692112.southamerica-east1.run.app |
| `AMBIENTE` | `dev` (selo "Desenvolvimento" e `[DEV]` no título, com "PR #N · dia hora") | vazio |
| `SUPABASE_URL` / `SUPABASE_KEY` | o projeto BKM_Desenvolvimento_Imobiliario | **vazias** até o primeiro uso: a raiz `/` cai no protótipo |
| `GOOGLE_MAPS_KEY` | chave "BKM Terrenos Maps" do projeto GCP `bkm-terrenos` | a mesma |
| O que serve hoje (8/nov) | o sistema React em `/` e o protótipo em `/prototipo` | só o protótipo (último merge na `main`: PR #192, 4/nov) |

Os dois rodam **o mesmo código e a mesma imagem**; só as variáveis do serviço mudam.

Google Cloud: projeto `bkm-terrenos` (o mesmo do app OAuth do login), região `southamerica-east1`, acesso público, porta 8080, de 0 a 2 instâncias. Até 3/nov/2026 o sistema ficava no Railway, que bloqueou a conta; os endereços `*.up.railway.app` não existem mais.

## Como uma mudança chega ao ar

```
branch de trabalho  ->  PR para develop  ->  merge  ->  Cloud Build  ->  terrenos-web-dev
                                                             (só a imagem; o banco não muda sozinho)
conferir no dev     ->  PR develop -> main  ->  merge  ->  Cloud Build  ->  terrenos-web
```

1. Trabalhe num branch próprio. Nunca abra PR direto na `main`, salvo correção urgente, que depois volta para a `develop` (merge da `main` na `develop`).
2. **Todo PR atualiza `apps/web/versao.json`** com o número dele (`{ "pr": 242 }`). É o que aparece embaixo do selo "Desenvolvimento" e diz qual versão está no ar.
3. No merge, o gatilho do Cloud Build (configurado no console do GCP, **não** no repositório) gera a imagem pelo `Dockerfile` e publica no serviço do branch. O build leva poucos minutos.
4. **O Cloud Build não espera o CI.** Um PR com CI vermelho, se mergeado, vai ao ar do mesmo jeito. Confira o CI (ou rode os testes localmente) antes do merge.
5. Mudança no banco **não** vai junto: ver "Banco" abaixo.

## A imagem (`Dockerfile`)

Duas etapas:

1. `node:22-alpine`: instala as dependências de `apps/web`, copia os três JSON de metodologia de `tools/setores/` (o front os importa) e roda `npm run build` (typecheck + Vite). O endereço e a chave do Supabase **não** entram no build.
2. `caddy:2-alpine`: copia o `Caddyfile`, o `dist` do front para `/srv`, o protótipo para `/srv/prototipo/index.html` e `docs/dados` para `/srv/prototipo/dados`.

O `.dockerignore` exclui `docs/*` e só libera `docs/prototipo.html` e `docs/dados`. **Arquivo novo em `docs/` que precise ir para a imagem exige uma linha `!docs/<pasta>` no `.dockerignore`** (lição de 24/out, PR #67). Este manual (`docs/tecnico/`) não precisa ir para a imagem e fica de fora de propósito.

## O servidor (`Caddyfile`)

O Caddy faz quatro coisas:

| Caminho | O que faz |
| --- | --- |
| `/` | Se `SUPABASE_URL` estiver vazia, redireciona para `/prototipo/`. Senão, serve o `index.html` do React com `templates`. |
| `/prototipo*` | Serve o protótipo, também com `templates`, e cai no `index.html` para qualquer caminho (a navegação do protótipo usa o endereço). |
| `/geosampa/*` | Repassa à Prefeitura de São Paulo **só** `GET` em `/geoserver/geoportal/ows`, `/geoserver/geoportal/wms` e `/Download/File/125` (folhas do laser 2020). Tira `Origin`, `Referer` e `Cookie`. Qualquer outro caminho: 404. |
| `/geosanja/*` | Repassa à Prefeitura de São José dos Campos `GET /v1/autenticar`, `GET /v1/proxy` e `POST /v1/localizar`. O resto: 404. |
| resto | Arquivos do React; `/assets/*` com cache de um ano (os nomes têm hash); páginas com `no-cache`. |

### Como a configuração chega ao navegador

O `apps/web/index.html` tem metas preenchidas pelo Caddy no momento de servir a página:

```html
<meta name="supabase-url" content='{% env "SUPABASE_URL" %}' />
<meta name="supabase-key" content='{% env "SUPABASE_KEY" %}' />
<meta name="gmaps-key"    content='{% env "GOOGLE_MAPS_KEY" %}' />
<meta name="bkm-ambiente" content='{% env "AMBIENTE" %}' />
```

O front lê essas metas em `apps/web/src/lib/config.ts`. Assim a mesma imagem serve os dois ambientes e trocar de banco é só mudar a variável do serviço, sem novo build. No `npm run dev`, os valores vêm de `apps/web/.env.local` (ver `.env.example`).

**Armadilha conhecida:** como as páginas passam por `templates` com os delimitadores `{% %}`, qualquer `{%` dentro do HTML ou do JavaScript embutido do protótipo vira erro 500. O `tools/prototipo/build.py` recusa gerar um HTML com `{%` (lição de 22/out).

Todas essas chaves são **públicas por natureza** (a chave publicável do Supabase e a do Maps JS vão ao navegador de qualquer jeito). A proteção da chave do Google é a restrição por domínio e por API no Cloud Console; a do Supabase é a RLS.

## Variáveis e segredos: onde fica cada um

| Nome | Onde mora | Público? | Para quê |
| --- | --- | --- | --- |
| `SUPABASE_URL`, `SUPABASE_KEY` (publicável, `sb_publishable_...`) | variáveis do serviço Cloud Run | sim | o front falar com o banco |
| `GOOGLE_MAPS_KEY` | variável do serviço Cloud Run | sim, restrita a 2 domínios e 7 APIs | mapa, Places, Routes, Elevation, Geocoding |
| `AMBIENTE` | variável do serviço (só no dev) | sim | selo do ambiente |
| `SUPABASE_DB_URL` | segredo do GitHub Actions | **não** (senha do banco) | `banco.yml` aplicar o esquema |
| Segredo do cliente OAuth do Google | painel do Supabase (Auth › Google) | **não** | login |
| Chave `service_role` do Supabase | painel do Supabase; Secret Manager do projeto `bkm-monitor` (coletor) | **não** | coletor do monitor de mercado; nunca no front |
| Credenciais do Órulo | Secret Manager do projeto do monitor | **não** | coletor |
| `IPTU_CPF`, `IPTU_SENHA` (Senha Web da Prefeitura de SP, do Moises) | Secret Manager do `bkm-terrenos` (segredos `iptu-cpf` e `iptu-senha`), expostos só ao serviço `terrenos-iptu` | **não** | emitir a notificação de lançamento do IPTU |
| `IPTU_URL` | variável dos serviços `terrenos-web` e `terrenos-web-dev` | sim | o Caddy repassar `/iptu` ao serviço do IPTU |
| `SUPABASE_URL`, `SUPABASE_KEY` do `terrenos-iptu` | variáveis do serviço do IPTU | sim (chave publicável) | conferir o login e gravar com o token de quem pediu |

Nunca coloque segredo no repositório nem nas variáveis `SUPABASE_*`/`GOOGLE_*` do serviço web (elas vão para a página). Ver [seguranca.md](seguranca.md).

## Serviço do IPTU (`terrenos-iptu`)

Serviço à parte no Cloud Run (`services/iptu/Dockerfile`, imagem do Playwright com Chromium), porque o Caddy não roda navegador. Um só para dev e produção (o banco é o mesmo). Configuração sugerida: região `southamerica-east1`, 1 GiB de memória, 1 CPU, 0 a 1 instância (a fila é em memória), concorrência 8, tempo limite 300 s, acesso público (a autenticação é o login do Supabase, conferido pelo próprio serviço). Os serviços web recebem `IPTU_URL=https://terrenos-iptu-....run.app`. Comandos em `services/iptu/README.md`.

## Banco

- Projeto Supabase **BKM_Desenvolvimento_Imobiliario** (ref `mghqcsycuurjezoiiyfp`), organização BKM no plano Pro. É o projeto de **produção**, compartilhado com o monitor de mercado (tabelas `public.im_*`).
- Até o primeiro uso de verdade, o desenvolvimento acontece nele mesmo, **só** nos esquemas `app` e `fluxo`, que podem ser recriados do zero. O `public` nunca é tocado.
- Na véspera do primeiro uso: apagar `app`, `fluxo` e os usuários de teste, recriar limpos, e passar o desenvolvimento para um projeto separado numa organização Free. A partir daí acaba a regra de editar migrations no lugar: toda mudança vira migration nova.
- No painel, os esquemas `app` e `fluxo` precisam estar em **Settings › API › Exposed schemas**; o gancho "Before User Created" aponta para `app.hook_antes_de_criar_usuario`; o login por e-mail, telefone e anônimo está desligado; só Google.
- Extensões: `postgis` (no esquema `extensions`) e `pg_cron` (rotina diária).

### Como o banco foi criado e como muda hoje

- **Criação (5/nov/2026):** pelo workflow `.github/workflows/banco.yml`, disparado por um commit com `[aplicar-banco]` na mensagem (ou pelo botão "Run workflow"). Ele aplica todas as migrations e a carga `supabase/carga/bkm.sql` numa transação única e **recusa rodar se `app` ou `fluxo` já existem**.
- **Mudanças depois disso:** como o workflow só cria do zero, cada mudança de estrutura é um arquivo SQL avulso que o **Moisés roda no SQL Editor do Supabase** (https://supabase.com/dashboard/project/mghqcsycuurjezoiiyfp/sql/new). As threads de desenvolvimento só **leem** o banco ao vivo. O mesmo SQL é aplicado no lugar na migration correspondente do repositório, para o próximo "recriar do zero" sair igual.
- Os SQLs avulsos ficam em `/mnt/project-files/saida-prototipo/` (pasta compartilhada do projeto), com nome descritivo (ex. `ficha-numa-chamada.sql`, `etiquetas-soltas.sql`).

Ver o passo a passo em [testes-banco.md](testes-banco.md).

## GitHub Actions

| Workflow | Quando roda | O que faz |
| --- | --- | --- |
| `ci.yml` | todo push e PR | typecheck + build do front; migrations + testes de SQL num Postgres 16 com PostGIS; sintaxe do script do protótipo |
| `banco.yml` | `workflow_dispatch` ou push com `[aplicar-banco]` na mensagem | cria o banco de produção do zero (ver acima) |
| `vendor.yml` | manual | baixa Leaflet e JSZip e publica no branch `libs-prototipo`, para testar o protótipo sem CDN |

O GitHub Actions ficou sem crédito em alguns períodos (24/out, 28/out, 6/nov): os jobs morrem em segundos. Quando isso acontecer, rode localmente antes do merge:

```bash
bash supabase/tests/run.sh                    # precisa de postgresql-16 e postgresql-16-postgis-3
cd apps/web && npm install && npm run typecheck && npm run build
python3 tools/prototipo/build.py              # se mexeu no protótipo
```

## Voltar uma versão

- **Front:** no console do Cloud Run, serviço › Revisões › mandar 100% do tráfego para a revisão anterior. É instantâneo e não precisa de build. Depois, reverta o commit na branch (`git revert`) para o próximo build não trazer o problema de volta.
- **Banco:** não há volta automática. Antes de rodar um SQL que muda estrutura, tenha o SQL inverso pronto. O Supabase Pro faz backup diário (restaurar volta o banco inteiro, inclusive o monitor de mercado: último recurso).

## Custos conhecidos

- Cloud Run com 0 instâncias paradas: perto de zero.
- Supabase: plano Pro da organização (US$ 25/mês), compartilhado com o monitor.
- Google Maps Platform: a maior parte cabe na cota grátis; os itens caros por toque são Place Details com avaliações (cerca de US$ 25 por mil além dos mil grátis por mês) e a matriz de rotas a pé. Ver [integracoes.md](integracoes.md).
