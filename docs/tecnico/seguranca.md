# Segurança

Avaliação de **8 de novembro de 2026**, feita sobre a `develop` (PR #242). Método: o da skill *security-and-hardening* de Addy Osmani (pedida pelo Moisés como referência): modelo de ameaça primeiro (fronteiras de confiança, ativos, STRIDE), casos de abuso, os três níveis "sempre / perguntar antes / nunca", OWASP Top 10, cabeçalhos, dependências e cadeia de suprimentos. Duas frentes em paralelo, cada uma com relatório próprio e detalhado:

- [seguranca/banco.md](seguranca/banco.md): RLS, grants, funções `security definer`, isolamento entre empresas, login, storage, rotinas. Com provas executáveis em [seguranca/provas/](seguranca/provas/).
- [seguranca/front-infra.md](seguranca/front-infra.md): front React, Caddy e proxies, protótipo público, segredos no git, GitHub Actions, dependências, Cloud Run, chave do Google.

Esta página é o **resumo para decidir**: o que foi achado, quão grave é de verdade e o que fazer primeiro. Nenhum achado foi corrigido nesta rodada (regra combinada: achado grave não se corrige sem o ok do Moisés).

A avaliação anterior, de 2/nov/2026, fechou 7 falhas graves e 13 médias do banco (PRs #145 e #146). Elas continuam fechadas nos pontos conferidos.

## Resultado em uma frase

**Nenhuma falha crítica confirmada; o banco está bem protegido; os dois riscos altos estão fora do código, no GitHub e na configuração do login, e se resolvem em minutos no painel.**

| Gravidade | Banco | Front e infra |
| --- | --- | --- |
| Crítico | 0 | 0 |
| Alto | 0 | 1 (mais 1 condicional à configuração) |
| Médio | 7 | 6 |
| Baixo | 6 | 10 |
| Informativo | 6 | 6 |

## Modelo de ameaça em uma página

**Ativos:** valores de ofertas e propostas (sigilo comercial), documentos (matrículas, contratos, CPF e CNPJ), estudos de viabilidade (Taxas e Financeiras só da diretoria), cartões de tarefa restritos, equipe e papéis, histórico de alterações (não repúdio), dados do Órulo (licenciados), contas Google dos usuários (Agenda e Gmail, no futuro), orçamento das APIs do Google.

**Fronteiras de confiança:**

1. **Navegador → Supabase.** A mais importante. O navegador fala direto com o banco pela API do PostgREST; tudo que tem `grant` pode ser chamado sem passar pela tela. Por isso a regra 2 (regra no banco) **é** a segurança do sistema.
2. **Google → Supabase Auth → gatilhos do banco.** Quem entra e com que papel.
3. **Navegador → Caddy → prefeituras.** Os proxies `/geosampa` e `/geosanja` trazem conteúdo de terceiros para a origem do app.
4. **Dados de fora gravados pelo navegador** (GeoSampa, Google Places, laser): o banco recebe como se o analista tivesse digitado.
5. **GitHub → Cloud Build → Cloud Run** e **GitHub Actions → banco de produção**: quem consegue pôr código no ar ou ler o segredo do banco.
6. **Mesmo projeto Supabase do monitor de mercado** (`public.im_*`): outro sistema, outro dono de dados, mesmo `auth.users`.
7. **Servidor (`service_role`) e `pg_cron`**: rodam com privilégio alto sobre dados que os usuários escreveram.

**Quem pode atacar, realisticamente:** um usuário logado com papel baixo (`basico`, `leitura`) que abre o console do navegador; alguém de fora com a chave pública (que está na página); um robô gastando a chave do Google; e, indiretamente, um agente de IA com permissão de push induzido por texto malicioso lido de uma página ou de um dado. Hoje a BKM é a única empresa no banco, então os riscos "entre empresas" são teóricos até existir uma segunda.

## O que fazer primeiro

Ordem recomendada, do mais barato e mais urgente ao estrutural. As que dependem só do painel podem ser feitas hoje pelo Moisés.

| # | O quê | Achado | Quem faz | Esforço |
| --- | --- | --- | --- | --- |
| 1 | **Apagar o segredo `SUPABASE_DB_URL` do GitHub** (Settings › Secrets › Actions) e **trocar a senha do banco** (Supabase › Settings › Database). O `banco.yml` só serve para criar do zero, e a senha já foi colada num chat em 5/nov. | FI-A1 | Moisés, no painel | 5 min |
| 2 | **Conferir no Supabase › Authentication › Providers** que Email, Telefone e Anônimo estão desligados e que o gancho "Before User Created" aponta para `app.hook_antes_de_criar_usuario`; e em URL Configuration que as Redirect URLs são só os dois `run.app` e o `localhost:5173`, sem curinga. | FI-A2, BD-M5 | Moisés, no painel | 5 min |
| 3 | **Chave do Google:** restringir por API, pôr teto diário por API (Place Details, Route Matrix) e alerta de orçamento no faturamento. | FI-M3 | Moisés, no Cloud Console | 15 min |
| 4 | **Decidir sobre o protótipo público em produção**, que hoje entrega a qualquer pessoa sem login o `mercado.json` (1.961 empreendimentos do Órulo) e a chave do Google, e a função `public.im_tabela_empreendimento` aberta à chave pública. Opções: tirar o protótipo e os dados do Órulo da imagem de produção, ou pôr senha. (Em 4/nov a decisão foi "sem senha no /prototipo"; os dados do Órulo entraram depois.) | FI-M4 | decisão do Moisés | 30 min |
| 5 | Defesa em profundidade no login: o gancho e o gatilho recusam provedor que não seja Google e e-mail não confirmado. Corrigir o `README.md`, que manda ligar o login por e-mail. | FI-A2, BD-M5 | thread de desenvolvimento | 1 h |
| 6 | Cabeçalhos de segurança no Caddy (CSP em modo relatório primeiro, `frame-ancestors`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`) e bloquear HTML vindo dos proxies das prefeituras. | FI-M1, FI-M2 | thread de desenvolvimento | 2 h |
| 7 | Os médios do banco (log que mostra o que a tela esconde, oráculo de cartão restrito, nome e foto editáveis pelo usuário, convite da Agenda, data de conclusão, quadro de outra empresa), cada um com teste. | BD-M1 a BD-M7 | thread de desenvolvimento | 1 dia |
| 8 | Build reprodutível (`npm ci`, imagens e actions com versão fixa, `npm audit` no CI, Dependabot). | FI-M6 | thread de desenvolvimento | 1 h |
| 9 | Antes do primeiro uso: banco de desenvolvimento separado (já previsto) e aprovação manual no gatilho de produção do Cloud Build. | FI-M5 | Moisés + thread | já planejado |
| 10 | Decidir se o papel `basico` deve nascer sem ver nada até ser promovido (hoje lê tudo, como Leitura). | BD-I1 | decisão do Moisés | — |

## Achados

Os códigos remetem aos relatórios detalhados: **FI-** = [front-infra.md](seguranca/front-infra.md), **BD-** = [banco.md](seguranca/banco.md). Cada achado lá tem arquivo e linha, cenário de ataque, impacto, evidência ou prova, correção proposta e como verificar ou testar.

A coluna "Situação" é a que se atualiza quando algo for resolvido (com o número do PR).

### Alto

| Código | Achado | Por que essa gravidade | Situação |
| --- | --- | --- | --- |
| FI-A1 | O segredo `SUPABASE_DB_URL` (senha do `postgres` de produção, que passa por cima de toda a RLS e alcança também o monitor de mercado) pode ser lido por qualquer workflow de qualquer branch. A condição `[aplicar-banco]` está no próprio arquivo, e o repositório privado no plano Free não tem proteção de branch nem *environments*. | Impacto total; exige permissão de push (hoje o Moisés e as sessões de agente), mas um agente induzido por texto malicioso é um caminho plausível. | aberto |
| FI-A2 / BD-M5 | O login só confere o **domínio** do e-mail, não o provedor nem a confirmação. Se o login por e-mail e senha estiver ligado (o `README.md` manda ligar), qualquer pessoa se cadastra como `alguem@bkm.com.br` e lê tudo; quem se cadastrar primeiro com o e-mail de um diretor previsto que ainda não entrou herda o papel dele. | **Condicional.** Pela configuração registrada em 28/out o login por e-mail está desligado, o que torna isto Médio (defesa em profundidade). Vira Crítico se alguém ligar o e-mail sem confirmação. Conferir no painel (item 2). | a conferir no painel |

### Médio

| Código | Achado | Situação |
| --- | --- | --- |
| BD-M1 | O histórico (`app.auditoria`) mostra a qualquer membro, inclusive `basico`, linhas que a própria tabela esconde: equipe prevista, automações e lembretes de cartões restritos, modelos de tarefas pessoais. Prova `p04`. | aberto |
| BD-M2 | A função interna `fluxo._condicoes_ok` está exposta e responde sobre etiquetas e campos de cartões restritos; o id do cartão aparece em `app.mencoes`, que a empresa toda lê. Prova `p02`. | aberto |
| BD-M3 | O usuário troca o próprio nome e a foto pelo `updateUser` do supabase-js, contornando `app.salvar_minha_foto` (dá para se passar por outra pessoa e pôr uma imagem de rastreio). Prova `p05`. | aberto |
| BD-M4 | Um editor que não é o organizador muda pauta e convidados de uma reunião já no Google Agenda; quando a integração existir, o convite sairia pela conta do organizador. Prova `p03`. | aberto (antes da integração da Agenda) |
| BD-M6 | A data de conclusão da tarefa vem do cliente: dá para "concluir no prazo" uma tarefa atrasada. O log guarda quem fez. Prova `p01`. | aberto |
| BD-M7 | Um membro de outra empresa, com o UUID de um terreno da BKM, cria na empresa dele um quadro que aponta para o terreno; o avanço do terreno para uma etapa com modelo de tarefas passa a falhar. Teórico enquanto a BKM for a única empresa. Provas `p06*`. | aberto |
| FI-M1 | O proxy `/geosampa` aceita qualquer formato e devolve HTML do GeoServer na mesma origem do app (onde fica a sessão). Hoje só o CSP mandado pelo próprio GeoServer segura. | aberto |
| FI-M2 | O app não manda cabeçalhos de segurança (CSP, `frame-ancestors`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`). HSTS está coberto pelo domínio `.app`. | aberto |
| FI-M3 | A chave do Google é pública (inclusive no protótipo de produção, sem login) e várias APIs cobram por chamada; a restrição por domínio não segura robôs. Faltam cota e alerta. | aberto |
| FI-M4 | O protótipo de produção, público e na mesma origem do app, publica os dados do Órulo; a função do monitor está aberta à chave pública. Risco de licença e de inteligência de mercado. | decisão do Moisés |
| FI-M5 | O ambiente de desenvolvimento usa o banco de produção e publica a cada push, sem CI nem revisão. | risco aceito até o primeiro uso (decisão de 4/nov) |
| FI-M6 | Build não reprodutível: `npm install` em vez de `npm ci`, imagens `node`/`caddy` e actions sem versão fixa. | aberto |
| FI-M7 | Escritas diretas do front em tabelas cuja barreira é só a RLS (`ofertas`, `oferta_partes`, `terreno_corretores`, `reunioes`, `reuniao_participantes`, `analise_zoneamentos`). O auditor do banco conferiu a RLS; falta teste explícito para `leitura` e `basico` em cada uma. | aberto (só testes) |

### Baixo e informativo

Listados com correção nos relatórios: oráculos que aceitam outro usuário por parâmetro (BD-B1); cerca de 40 funções executáveis por `anon` se alguém liberar o esquema para ele (BD-B2); procedência "do GeoSampa" e "do laser" definida pelo navegador (BD-B3); autoria aceita do cliente no insert (BD-B4); geometria sem limite de tamanho (BD-B5); storage sem tipos de arquivo permitidos (BD-B6); proxies como relay público sem limite de corpo (FI-B1); no máximo 2 instâncias e sem limite de taxa (FI-B2); rascunhos com CPF e telefone no navegador sem validade e sem limpeza no logout (FI-B3); sessão e token do Google no `localStorage` (FI-B4); `href` vindo de dados sem conferir o esquema (FI-B5); alertas do `npm audit`, nenhum explorável no uso atual (FI-B6); CDN do protótipo sem SRI (FI-B7); `vendor.yml` sem conferir hash (FI-B8); `templates` do Caddy capazes de ler qualquer variável (FI-B9, risco futuro); front que aceitaria uma chave secreta por engano (FI-B10).

Logs automáticos (9/nov/2026, #253): a marca `auditoria.automatico` vem de um cabeçalho que o próprio navegador manda (`x-bkm-automatico`), então quem edita pode marcar uma ação sua como automática. Efeito só na tela: o log continua gravado, com o usuário, e aparece recolhido dentro da ação anterior ou no grupo "Atualização automática" (BD-I6, aceito).

Informativos que merecem atenção: o papel `basico` lê tudo (BD-I1); o projeto Supabase é dividido com o monitor (BD-I4: rodar o Security Advisor do Supabase e conferir a RLS de `public.im_*` no repositório do monitor); texto do usuário vai para notificações e futuros e-mails, que precisarão escapar HTML (BD-I5); **nenhum segredo real no histórico do git** (FI-I1, 627 commits varridos; só a chave publicável, que é pública por desenho).

## O que está bem feito (não reavaliar à toa)

- **Banco:** todas as funções `security definer` com `search_path` fixo; todas as tabelas expostas com RLS; todas as views com `security_invoker`; nenhuma escrita entre empresas passou num teste que chamou **todas** as funções expostas como diretor e como administrador de outra empresa; `processos`, `propostas`, `documentos` e afins só com leitura direta; `terrenos` só muda por `salvar_terreno`; funções do servidor só para `service_role`; storage privado, sem update nem delete, com a pasta da empresa conferida.
- **Login:** só Google, com PKCE, app OAuth "Interno" do Workspace (barra contas pessoais), gancho no servidor, papel mínimo por padrão.
- **Front:** regras chamadas por RPC; escape consistente no HTML montado à mão; sanitizador de texto rico por lista branca, sem atributos.
- **Servidor:** proxies com destino fixo (sem SSRF), só os métodos e caminhos usados, sem cookie nem origem; sem listagem de diretório.
- **Segredos:** fora do repositório; configuração entra pelas variáveis do serviço; `banco.yml` mascara a senha e recusa sobrescrever o banco.

## Checklists para quem mexe no sistema

Os dois relatórios terminam com checklists completos ("sempre / perguntar antes / nunca"). O essencial:

**Sempre**
- Toda regra que importa existe **no banco**. Esconder botão por papel não é segurança.
- Função nova: `security invoker` por padrão; se `definer`, `set search_path = ''`, nomes qualificados e checagem da empresa **da linha lida** (não da que veio no parâmetro); depois, `revoke ... from public, anon` e `grant` só ao que a tela usa. Interna (`_x`) nunca tem `grant`.
- Tabela nova: RLS, policies com `app.minhas_empresas()` / `app.empresas_edicao()`, gatilhos de empresa e de auditoria; se a leitura for mais estreita que a empresa, a leitura do histórico acompanha.
- Colunas de controle (autor, datas de sistema, situação) fixadas por gatilho no insert **e** no update.
- Todo caso de abuso vira teste em `supabase/tests/regras.sql`, inclusive "membro de outra empresa" e "`basico`".
- Texto de fora (banco, Google, prefeituras, Órulo) renderizado como texto; `href` só `https://`.
- `npm ci` e `npm audit --omit=dev` antes de promover para a `main`.

**Perguntar antes (ok do Moisés)**
- Novo proxy ou ampliar um existente; nova API do Google no navegador; mudança de CORS, CSP ou `templates`.
- Novo escopo OAuth, mudança no login, no gancho ou na equipe prevista.
- Novo workflow ou segredo; dados de terceiros servidos estaticamente.

**Nunca**
- Segredo (`service_role`, senha do banco, chave de servidor, credenciais do Órulo) no repositório, em variável do serviço web ou no protótipo.
- Autorização baseada em `raw_user_meta_data` (o usuário edita).
- `auth.uid() is null` como atalho para pular regra.
- Proxy que aceite o destino como parâmetro.
- Ligar login por e-mail e senha ou anônimo no Supabase.

## Como manter esta página

- Ao corrigir um achado: troque a Situação para "resolvido em #N", transforme a prova em teste no `regras.sql` e registre no [CHANGELOG](CHANGELOG.md).
- Ao mexer em permissão, login, RLS, função `security definer`, Caddy, segredo, workflow ou integração externa: confira o checklist acima e, se abrir risco novo, anote aqui.
- Refazer a avaliação inteira antes do primeiro uso de verdade e depois de cada integração nova com o Google (Agenda, Gmail, Drive), porque elas passam a agir na conta de uma pessoa.
