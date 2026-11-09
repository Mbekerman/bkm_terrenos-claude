# Testes do banco e como mudar o banco

Este arquivo explica como os testes de SQL funcionam, como escrever um teste novo e o caminho que uma mudança de banco faz até chegar ao banco de produção. Para a estrutura do banco, ver [banco.md](banco.md); para o catálogo de funções, [funcoes.md](funcoes.md); para o deploy do site, [deploy-e-ambientes.md](deploy-e-ambientes.md).

## Resumo

- `bash supabase/tests/run.sh` sobe um Postgres 16 temporário, imita o Supabase com um "shim", aplica todas as migrations e roda `supabase/tests/regras.sql`. Depois roda a carga da BKM duas vezes e confere o resultado.
- Os testes trocam de usuário do mesmo jeito que o PostgREST: mudam o claim `request.jwt.claim.sub` e o papel para `authenticated`. Por isso as políticas de RLS e os `grant` valem nos testes como valem no navegador.
- Toda mudança de regra no banco vem com teste em `regras.sql` (regra do `CLAUDE.md`).
- Enquanto o sistema não tiver o primeiro uso de verdade, as migrations são **editadas no lugar**. A mudança chega ao banco ao vivo por um **SQL avulso que o Moisés roda no SQL Editor**; as threads de desenvolvimento só leem o banco ao vivo.

## Rodar os testes

```bash
bash supabase/tests/run.sh
```

Precisa do Postgres 16 e do PostGIS 3 instalados (no Debian/Ubuntu, pacotes `postgresql-16` e `postgresql-16-postgis-3`). Em 8/nov/2026 a rodada inteira leva cerca de 15 segundos e imprime 1.262 linhas `ok` (o `CLAUDE.md` ainda fala em 1212 testes; o número cresce a cada lote).

Duas variáveis de ambiente mudam o padrão:

| Variável | Padrão | Para quê |
| --- | --- | --- |
| `PGBIN` | `/usr/lib/postgresql/16/bin` | onde estão `initdb`, `pg_ctl` e `psql` |
| `PORT` | `54329` | porta do Postgres temporário (troque se já houver outro rodando nela) |

### O que o `run.sh` faz, passo a passo

`supabase/tests/run.sh`:

1. Cria uma pasta temporária (`mktemp -d`) e roda `initdb` com codificação UTF8 e `--locale=C`, como no Supabase (`run.sh:8-13`). Se o script roda como root, usa o usuário `postgres` (`run.sh:10`), porque o Postgres não aceita rodar como root.
2. Sobe o servidor na porta `$PORT`, com o socket em `/tmp` (`run.sh:14`). Ao sair, por bem ou por erro, o `trap` para o servidor e apaga a pasta (`run.sh:11-12`): nada fica para trás.
3. Aplica `supabase/tests/shim_supabase.sql` (`run.sh:17`), que cria o que o Supabase já traz pronto (ver a seção sobre o shim, abaixo).
4. Aplica cada arquivo de `supabase/migrations/*.sql` em ordem alfabética, que é a ordem do prefixo de data (`run.sh:18-21`). O `ON_ERROR_STOP=1` para no primeiro erro.
5. Roda `supabase/tests/regras.sql` e filtra a saída (`run.sh:22`): só aparecem as linhas que começam com `ok `, `# ` (título de seção), `FALHOU` e `TODOS`, e as linhas com `ERROR`. O resto (o eco dos `select`, os avisos) some.
6. Roda `supabase/carga/bkm.sql` **duas vezes** (`run.sh:25-26`), para provar que a carga não duplica nada se for repetida.
7. Simula o primeiro login de quatro pessoas, inserindo-as em `auth.users`, e confere que cada uma ganhou o papel, a marca de administrador e o superior combinados na carga, e que um e-mail do domínio que não estava na lista entrou como `basico` (`run.sh:27-38`). Imprime `CARGA DA BKM OK` ou falha.

### Como ler o resultado

- Cada teste que passa imprime `ok  <frase do teste>`. Um teste que espera erro também mostra a mensagem de erro entre parênteses, por exemplo `ok  leitura não edita (permissão negada)`.
- O primeiro teste que falha imprime `FALHOU: <frase>` e **interrompe tudo** (o arquivo usa `\set ON_ERROR_STOP on`, `regras.sql:3`). Os testes seguintes não rodam, porque dependem do estado que os anteriores montaram.
- Um erro de SQL fora de um teste (coluna que não existe, sintaxe) aparece como linha `ERROR` e também para tudo.
- A rodada que passa termina com `TODOS OS TESTES PASSARAM` e `CARGA DA BKM OK`.

O script sai com código diferente de zero em qualquer falha. Isso é o que o CI usa.

### Explorar o banco de teste à mão

O `run.sh` apaga o banco ao terminar. Para ter um banco local para consultar, repita os passos dele sem o `trap` e sem os testes:

```bash
DIR=$(mktemp -d); PORT=54331
/usr/lib/postgresql/16/bin/initdb -D "$DIR" -U postgres -A trust -E UTF8 --locale=C
/usr/lib/postgresql/16/bin/pg_ctl -D "$DIR" -o "-p $PORT -k /tmp" -l "$DIR/log" start -w
PSQL="psql -h /tmp -p $PORT -U postgres -d postgres -v ON_ERROR_STOP=1 -q"
$PSQL -f supabase/tests/shim_supabase.sql
for f in supabase/migrations/*.sql; do $PSQL -f "$f"; done
$PSQL -f supabase/tests/regras.sql        # opcional: deixa os dados dos testes no banco
# ... consultas ...
/usr/lib/postgresql/16/bin/pg_ctl -D "$DIR" -m immediate stop; rm -rf "$DIR"
```

(Como root, prefixe `initdb` e `pg_ctl` com `runuser -u postgres --` e dê a pasta ao `postgres` com `chown`, como faz o `run.sh:10`.)

Não há como rodar só uma seção de `regras.sql`: as seções dependem umas das outras (ver "O estado se acumula", abaixo). Para depurar um teste, rode o arquivo inteiro num banco como o acima e, depois, repita à mão no `psql` as linhas que interessam.

## O shim: como o teste imita o Supabase

O Supabase traz pronto um conjunto de papéis, esquemas e funções de que as migrations dependem. Num Postgres puro eles não existem, e `supabase/tests/shim_supabase.sql` cria o mínimo para as migrations rodarem e as permissões se comportarem igual.

| O que o shim cria | Por que as migrations precisam |
| --- | --- |
| Papéis `anon`, `authenticated` e `service_role` (este com `bypassrls`) | Os `grant` e as políticas de RLS falam desses papéis. `authenticated` é quem está logado; `anon` é o visitante sem login; `service_role` é o servidor (Edge Functions e o coletor), que passa por cima da RLS. |
| Papel `supabase_auth_admin` | O gancho de login `app.hook_antes_de_criar_usuario` é executado pelo Supabase Auth com esse papel, e a migration de usuários dá `grant execute` a ele. |
| Esquema `extensions`, com `usage` liberado | No Supabase o PostGIS fica no esquema `extensions`; as migrations criam a extensão lá e qualificam as funções como `extensions.st_...`. |
| Tabela `auth.users` (`id`, `email`, `raw_user_meta_data`, `last_sign_in_at`) | É a tabela de usuários do Supabase Auth. O trigger `app.tg_usuario_novo` dispara nela para criar o usuário em `app.usuarios` e o membro da empresa. |
| Função `auth.uid()` | Devolve o usuário logado. No shim: `nullif(current_setting('request.jwt.claim.sub', true), '')::uuid`. Todas as funções de acesso (`app.minhas_empresas()`, `app.exigir_editor()` etc.) partem dela. |
| Esquema `storage`, tabelas `storage.buckets` e `storage.objects` com RLS, e `storage.foldername()` | A migration de storage cria o bucket de documentos e as políticas que conferem a primeira pasta do caminho (`{empresa_id}/...`). |

### Trocar de usuário: o claim e o papel

O PostgREST, a cada requisição do navegador, faz duas coisas antes de chamar a função ou a tabela: põe o usuário do token (JWT) na configuração da sessão e troca o papel do banco para `authenticated`. O teste faz o mesmo com a função auxiliar `pg_temp.como` (`regras.sql:14-15`):

```sql
create function pg_temp.como(u text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', u, false), set_config('role', 'authenticated', false) $$;
```

Depois de `select pg_temp.como(:'analista');`, tudo o que vem em seguida roda como o analista: a RLS filtra pelas empresas dele, os `grant` de `authenticated` valem, e `auth.uid()` devolve o id dele. É isso que dá valor aos testes de permissão: eles passam pelas mesmas portas que o navegador.

Três detalhes que confundem:

- **`reset role` volta a superusuário, mas o claim continua.** Depois de `reset role`, a RLS não vale mais (o superusuário passa por cima), mas `auth.uid()` ainda devolve o último usuário de `como`. O arquivo usa `reset role` para montar dados que nenhum usuário poderia montar (criar a empresa, preparar um cenário) e para conferir o resultado sem o filtro da RLS.
- **`set role service_role`** simula o servidor, para as funções que só ele pode chamar (por exemplo as da Agenda, como `app.agenda_confirmar`; ver a seção da Agenda em `regras.sql`, perto da linha 3597).
- **O shim lê só `request.jwt.claim.sub`.** O `auth.uid()` de verdade do Supabase também lê o claim novo `request.jwt.claims` (o JWT inteiro em JSON). Como o código do projeto só usa `auth.uid()`, a diferença não aparece. Se alguém passar a usar `auth.jwt()` ou `auth.role()`, que o shim **não** tem, o teste quebra na migration: será preciso acrescentá-las ao shim.

### O que o shim não imita

- **pg_cron.** O shim não instala a extensão. A migration que agenda a rotina diária só agenda se a extensão existir (bloco condicional), e os testes chamam `app.rotina_diaria(data)` direto, com a data que quiserem (por exemplo `app.rotina_diaria(current_date + 23)`, `regras.sql:545`, para simular um dia no futuro).
- **Realtime.** A publicação `supabase_realtime` não existe no teste; a migration de notificações só acrescenta tabelas a ela quando ela existe.
- **Edge Functions, Vault e o envio de e-mail.** Não existem no teste. O que o servidor faria é simulado chamando a função do banco com `set role service_role`.
- **Exposed schemas** do PostgREST. No Supabase, `app` e `fluxo` precisam estar na lista de esquemas expostos; no teste não há PostgREST, então isso não é testado.

## Como o `regras.sql` está organizado

`supabase/tests/regras.sql` é um arquivo só, de cerca de 3.700 linhas, lido pelo `psql` de cima para baixo. Em 8/nov/2026 tem 66 seções.

- **Cabeçalho (`regras.sql:1-40`).** Cria os cinco usuários de teste em `auth.users` (diretor, analista, intruso de outra empresa, leitura e gestor) e as funções auxiliares, todas em `pg_temp` (somem ao fim da sessão):
  - `pg_temp.como(usuario)`: troca de usuário (acima).
  - `pg_temp.ok(condição, frase)`: se a condição não for verdadeira (inclusive nula), para com `FALHOU: frase`; senão imprime `ok  frase`.
  - `pg_temp.falha(comando, frase)`: roda o comando e **espera** um erro; se não der erro, para com `FALHOU: esperava erro em frase`.
  - `pg_temp.quadra(lon, lat, lado_m)`: um quadrado em GeoJSON centrado no ponto. Todo terreno precisa de poligonal, e terrenos em pontos diferentes não se sobrepõem.
  - `pg_temp.lista(terreno, nome)` e `pg_temp.tarefa(...)`: acham uma lista do quadro do terreno e criam uma tarefa nela.
- **Variáveis do `psql`.** Os ids dos usuários ficam em variáveis (`:'diretor'`, `:'analista'`, `:'gestor'`, `:'leitor'`, `:'intruso'`), e os ids criados pelos testes são capturados com `\gset` (por exemplo `returning id as tsq \gset` cria a variável `:'tsq'`).
- **Montagem da empresa.** Logo no início, `reset role; select app.criar_empresa('BKM Teste','Moisés',:'diretor') as emp \gset` cria a empresa de teste com o modelo padrão de fases, etapas e configurações, e a equipe é montada em seguida (gestor sob o diretor, analista sob o gestor, leitura).
- **Seções.** Cada assunto começa com `\echo '# título (data)'`, e esse título aparece na saída. Exemplos: o funil e as aprovações, o isolamento entre empresas (perto da linha 816), o papel Leitura (perto da 805), os quadros e tarefas, a Agenda, e os lotes mais recentes no fim.
- **Fim.** A última linha é `\echo 'TODOS OS TESTES PASSARAM'`.

### O estado se acumula

Nada é desfeito entre as seções. A empresa, a equipe, os terrenos e as tarefas criados no começo são usados até o fim. Isso deixa o arquivo curto, mas tem duas consequências:

- uma seção nova pode usar o que já existe (a empresa `:'emp'`, o município `:'sp'`, os usuários), mas não deve contar linhas de uma tabela inteira esperando um número fixo, porque as seções anteriores já puseram dados lá: filtre pelo que a sua seção criou;
- terrenos novos precisam de uma poligonal num lugar ainda não usado, senão a regra de sobreposição (`app.sobreposicao`, trigger `t_sobre`) recusa o cadastro. Use `pg_temp.quadra` com coordenadas que ninguém usou (procure as que já estão no arquivo).

## Escrever um teste novo

### A regra

> Toda mudança de regra no banco vem com teste em `supabase/tests/regras.sql`. (`CLAUDE.md`, seção "Comandos")

"Regra" aqui é o que o banco decide: quem pode chamar, o que é recusado, o que é calculado, o que é gravado em outro lugar (auditoria, notificação, histórico). Uma coluna nova sem comportamento não precisa de teste próprio, mas costuma aparecer num teste que já existe.

### Passo a passo

1. Ache a seção do assunto (procure o `\echo '# ...'`) ou crie uma nova **no fim do arquivo, antes da última linha** (`\echo 'TODOS OS TESTES PASSARAM'`), com a data da decisão no título.
2. Comece a seção com `select pg_temp.como(:'analista');` (ou o papel que interessa). Nunca escreva o teste como superusuário quando a pergunta é "o usuário consegue?": o superusuário passa por cima da RLS e o teste passaria à toa.
3. Monte o cenário com `insert` ou com as RPCs, capturando os ids com `\gset`.
4. Confira cada comportamento com um `pg_temp.ok(condição, 'frase')`. A frase diz a regra em português, no presente, como o usuário entenderia: ela é a documentação viva do comportamento.
5. Para o que deve ser recusado, use `pg_temp.falha('comando entre aspas', 'frase')`. Sempre que a regra for de permissão, teste os dois lados: quem pode consegue (`ok`) e quem não pode é barrado (`falha`). Lembre do papel Leitura (`:'leitor'`) e do usuário de outra empresa (`:'intruso'`).
6. Rode `bash supabase/tests/run.sh` e confira que as suas frases aparecem com `ok`.

### Um exemplo real

A seção da área cadastral pela soma dos SQLs (`regras.sql:3692-3714`, lote de 6/nov/2026) mostra o padrão inteiro: troca de usuário, cenário com `\gset`, várias conferências seguidas, e o caminho de volta (apagar o valor digitado devolve o automático):

```sql
\echo '# área cadastral do terreno pela soma dos SQLs (6/nov/2026)'
select pg_temp.como(:'analista');
insert into app.terrenos (empresa_id, nome, responsavel_id, municipio_id, poligono_geojson)
  values (:'emp', 'Soma dos SQLs', :'analista', :'sp', pg_temp.quadra(-47.33, -23.33)) returning id as tsq \gset
insert into app.inscricoes_municipais (empresa_id, terreno_id, inscricao, area_cadastral_m2)
  values (:'emp', :'tsq', '501.001.0001-1', 400) returning id as sq1 \gset
select pg_temp.ok((select area_cadastral_m2 = 400 and area_cadastral_origem = 'sqls' from app.terrenos where id = :'tsq'),
  'o primeiro SQL com área vira a cadastral do terreno');
insert into app.inscricoes_municipais (empresa_id, terreno_id, inscricao)
  values (:'emp', :'tsq', '501.001.0002-1') returning id as sq2 \gset
select pg_temp.ok((select area_cadastral_m2 is null from app.terrenos where id = :'tsq'),
  'SQL sem área deixa a soma em branco (não soma pela metade)');
-- ...
select app.salvar_terreno(:'tsq', (select versao from app.terrenos where id = :'tsq'), '{"area_cadastral_m2":420}') \gset
select pg_temp.ok((select area_cadastral_m2 = 420 and area_cadastral_origem = 'digitada' and area_adotada_m2 = 420
  from app.terrenos where id = :'tsq'), 'valor digitado passa a valer');
```

Repare em três coisas:

- O terreno ganha um quadrado em `(-47.33, -23.33)`, um ponto que nenhuma seção anterior usou.
- O teste "SQL sem área deixa a soma em branco" é a regra 7 do `CLAUDE.md` ("não informado nunca vira zero") escrita como teste.
- A ficha é alterada por `app.salvar_terreno(id, versao, dados)` com a versão atual, como o front faz (regra 11).

A seção seguinte (`regras.sql:3716-3721`) é o exemplo mais curto possível, para uma função de leitura: confere o formato da resposta e o caso de código que não existe.

```sql
\echo '# ficha numa chamada só (6/nov/2026)'
select pg_temp.como(:'analista');
select pg_temp.ok((select (d->'v'->>'id') = :'tsq' and (d->'t'->>'nome') = 'Soma dos SQLs' and jsonb_typeof(d->'fases') = 'array'
    and (d->>'q_insc')::int = 0 and jsonb_typeof(d->'procs') = 'array'
  from (select app.ficha_dados(:'emp', (select codigo from app.terrenos where id = :'tsq')) d) x), 'a ficha vem inteira numa chamada');
select pg_temp.ok(app.ficha_dados(:'emp', 'Z999') is null, 'código que não existe devolve nulo');
```

Faltam nessa seção os testes de que o leitor de outra empresa recebe nulo e de que o papel Leitura consegue ler. Ao escrever uma função nova de leitura, acrescente os dois.

### Cuidados

- **Função nova precisa de permissão explícita.** As migrations antigas tiram o `execute` de `public` de todas as funções num bloco do `regras.sql` de migrations (por volta de `20261015000500_regras.sql:2970`), mas as funções criadas **depois** desse bloco, em migrations posteriores, continuam executáveis por `public` se a própria migration não tirar. Ao criar função, escreva o `revoke execute ... from public` e o `grant execute ... to authenticated` (ou a `service_role`) na mesma migration, e teste com `pg_temp.falha` que quem não deve não consegue. Para conferir: `select has_function_privilege('anon', 'app.minha_funcao(uuid)', 'execute');`.
- **Mensagens de erro.** `pg_temp.falha` aceita qualquer erro. Se o teste quer um erro específico (por exemplo, permissão negada e não uma coluna errada), confira na saída o texto entre parênteses na primeira vez que rodar.
- **Datas.** Use `current_date + N` em vez de datas fixas, para o teste não envelhecer.
- **Atualize o `funcoes.md`** quando criar, renomear ou mudar o papel exigido de uma função (o arquivo explica a consulta a `pg_proc` que gera a lista).

## O CI

O workflow `.github/workflows/ci.yml` roda em todo push e PR. O job do banco instala `postgresql-16` e `postgresql-16-postgis-3` na máquina do GitHub e roda `bash supabase/tests/run.sh`. O mesmo workflow faz o typecheck e o build do front e confere a sintaxe do script do protótipo.

O Cloud Build **não espera o CI**: um PR com o job do banco vermelho, se for mergeado, vai ao ar do mesmo jeito (ver [deploy-e-ambientes.md](deploy-e-ambientes.md)). E o GitHub Actions já ficou sem crédito em alguns dias (os jobs morrem em segundos). Nesses dias, rode `run.sh` localmente antes do merge.

O CI testa as migrations **do zero**, num banco vazio. Ele não sabe nada do banco ao vivo: um teste verde quer dizer que as migrations estão coerentes, não que o SQL avulso aplicado no Supabase está igual a elas (ver "Conferir no banco ao vivo", abaixo).

## Editar migrations no lugar, e quando isso acaba

Hoje (8/nov/2026) **não se cria migration nova de correção**: muda-se o arquivo de `supabase/migrations/` que define a tabela ou a função. O motivo é que o banco ainda pode ser recriado do zero a qualquer momento, e uma pilha de migrations de correção só tornaria a leitura mais difícil. O CI aplica tudo do zero a cada push, então o conjunto de arquivos é sempre a descrição completa do banco.

O banco foi criado no Supabase em 5/nov/2026 (projeto BKM_Desenvolvimento_Imobiliario, ref `mghqcsycuurjezoiiyfp`), mas a regra continua valendo até o **primeiro uso de verdade** (decisão registrada em [deploy-e-ambientes.md](deploy-e-ambientes.md), seção "Banco"). Na véspera do primeiro uso:

1. os esquemas `app` e `fluxo` e os usuários de teste são apagados e recriados limpos pelo `banco.yml`;
2. o desenvolvimento passa para um projeto Supabase separado, numa organização Free;
3. a regra de editar no lugar acaba: **toda mudança vira migration nova**, com prefixo de data posterior à última, e as migrations já aplicadas não se mexem mais. Este arquivo e o `deploy-e-ambientes.md` precisam ser atualizados nesse dia (ver [como-manter.md](como-manter.md)).

Atenção: o `CLAUDE.md` ainda diz "Fase atual: estrutura em desenho, sem banco criado" e "Enquanto nenhum banco de produção tiver recebido as migrations, altere os arquivos no lugar". O banco de produção **já recebeu** as migrations em 5/nov; o que mantém a regra é a decisão de recriar tudo antes do primeiro uso, não a ausência de banco.

## Como o `banco.yml` cria o banco de produção

O workflow `.github/workflows/banco.yml` cria o banco do Supabase **do zero**. Ele não aplica mudanças num banco que já existe.

- **Quando roda:** pelo botão "Run workflow" no GitHub (`workflow_dispatch`) ou num push cujo commit tenha `[aplicar-banco]` na mensagem.
- **De onde vem a senha:** do segredo `SUPABASE_DB_URL` do GitHub Actions (o endereço de conexão do Postgres do Supabase, com a senha). O workflow limpa espaços e confere o formato antes de usar. A senha nunca vai para o repositório.
- **A trava:** antes de aplicar, consulta se o esquema `app` ou o `fluxo` já existe. Se existir, para com a mensagem "O esquema app ou fluxo já existe; para recriar, apague antes (só com o ok do Moisés)." Assim, um commit com `[aplicar-banco]` por engano não apaga nem duplica nada.
- **A aplicação:** roda `psql --single-transaction` com todas as migrations em ordem e, por último, a carga `supabase/carga/bkm.sql` (empresa BKM, domínio `bkm.com.br` e a equipe prevista). Tudo numa transação: se qualquer arquivo falhar, nada fica aplicado.
- **A conferência:** depois, conta o que foi criado (tabelas de `app` e de `fluxo`, linhas de `app.equipe_prevista`, domínios de `app.empresa_dominios` e rotinas em `cron.job`) e mostra no log do workflow.

O shim **não** entra no `banco.yml`: no Supabase, papéis, `auth`, `storage` e `extensions` já existem.

Para recriar o banco (o que só acontece com o ok do Moisés), alguém apaga antes os esquemas `app` e `fluxo` no SQL Editor e então dispara o workflow. Lembre que o esquema `public` é do monitor de mercado e **nunca** é apagado nem alterado por este repositório.

## Passo a passo para mudar o banco (hoje)

Este é o caminho de uma mudança de estrutura ou de regra, de 6/nov/2026 até o primeiro uso.

1. **Edite a migration no lugar.** Ache o arquivo que define a tabela ou a função (`grep -n "create or replace function app.nome" supabase/migrations/*.sql`) e altere lá. Função nova vai no arquivo do assunto, com `revoke ... from public` e `grant ... to authenticated` (ver "Cuidados").
2. **Escreva o teste** em `supabase/tests/regras.sql` (ver "Escrever um teste novo").
3. **Rode `bash supabase/tests/run.sh`** até sair `TODOS OS TESTES PASSARAM` e `CARGA DA BKM OK`.
4. **Atualize a documentação:** `docs/modelo.md` (tabelas e diagramas), [banco.md](banco.md), [funcoes.md](funcoes.md) quando mexer em função, [seguranca.md](seguranca.md) quando mexer em permissão, RLS ou `security definer`, e a entrada no `CHANGELOG.md`. A tabela de [como-manter.md](como-manter.md) diz qual arquivo acompanha cada tipo de mudança.
5. **Escreva o SQL avulso** que leva o banco ao vivo do estado atual ao novo, em `/mnt/project-files/saida-prototipo/`, com nome descritivo (ex.: `ficha-numa-chamada.sql`, `etiquetas-soltas.sql`). Ele precisa:
   - ficar entre `begin;` e `commit;`, para não deixar o banco pela metade;
   - poder rodar duas vezes sem estrago (`create or replace function`, `add column if not exists`, `create index if not exists`, `drop policy if exists` antes de `create policy`);
   - repetir os `revoke`/`grant` das funções que cria ou recria;
   - trazer, comentado no fim, o **SQL inverso** (como voltar), porque o banco não tem volta automática;
   - ser **igual** ao que ficou na migration: o próximo "recriar do zero" tem que sair idêntico ao banco ao vivo.
6. **O Moisés roda o SQL avulso** no SQL Editor do Supabase (https://supabase.com/dashboard/project/mghqcsycuurjezoiiyfp/sql/new). As threads de desenvolvimento **não** escrevem no banco ao vivo: só leem. Diga a ele qual arquivo rodar e o que conferir depois.
7. **Confira no banco ao vivo, só lendo:** que a função existe com a assinatura nova (`select pg_get_function_identity_arguments(oid) from pg_proc where proname = '...'`), que a coluna existe, que os grants estão certos (`has_function_privilege`). Não há registro no repositório de quais SQLs avulsos já foram rodados (a conferir com o Moisés); por isso essa conferência é a única garantia.
8. **Abra o PR para `develop`**, com o número do PR em `apps/web/versao.json`, como em toda mudança (ver [deploy-e-ambientes.md](deploy-e-ambientes.md)). A ordem importa: se o front novo for ao ar antes do SQL avulso, ele chama funções que ainda não existem no banco.

Se algo der errado no banco ao vivo: rode o SQL inverso. O Supabase Pro tem backup diário, mas restaurar volta o banco inteiro, **inclusive o monitor de mercado** (`public.im_*`); é o último recurso.

### Depois do primeiro uso

Os passos 2, 3, 4, 6 e 8 continuam. Mudam o 1 e o 5: em vez de editar a migration antiga e escrever um SQL avulso à parte, cria-se **uma migration nova**, que é ela mesma o que se aplica no banco. Como o `banco.yml` só cria do zero, a forma de aplicar migrations novas no banco de produção ainda está por decidir (SQL Editor, um workflow novo ou a CLI do Supabase; a conferir).
