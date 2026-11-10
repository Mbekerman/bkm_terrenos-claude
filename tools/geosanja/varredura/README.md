# Varredura dos lotes de São José dos Campos

Job noturno que monta as quadras da cidade no GeoSanja e grava em `app.lotes_prefeitura` / `app.quadras_prefeitura`, com a mesma regra do mapa (90 dias; lote que sumiu do cadastro é apagado). O mapa passa a ler o que já estiver na base.

Não usa navegador. Fala direto com `https://geo.sjc.sp.gov.br/v1` (o repasse do Caddy existe por causa do CORS do site; daqui não precisa).

## Como varre

1. A cidade urbana sai dos setores do Censo 2022 (`docs/dados/setores-3549904-2022.json`): densidade de pelo menos 800 hab/km², 30 moradores e setor de até 2 km². O resto (serra, São Francisco Xavier) fica de fora.
2. Isso vira quadrados de 200 m. A ordem é a distância em metros à Praça Afonso Pena (−23,1794; −45,8869), menos a densidade ÷ 50: o centro denso vem primeiro.
3. Em cada célula, a mesma montagem da ficha (`apps/web/src/novo/lotesSjcPuro.ts`): grade de 4 a 15 m e vizinhos a 1,5 m até a rua. Uma requisição por vez, 2 a 3 s entre elas.
4. Quadra montada há menos de 90 dias não é varrida de novo. Ponto que cai num lote já conferido não gera pedido.
5. O estado fica em `app.varredura_sjc_celulas`. Se o job cair, a próxima noite retoma a célula que ficou em andamento.

Freio: 5xx, 429 e tempo esgotado esperam (15 s, 30 s, … até 5 min). Na quinta falha seguida, a noite para. 403 ou 401 depois de renovar o token de visitante para na hora. O User-Agent é fixo (`BKMTerrenosVarredura/1.0`). Não há proxy, troca de IP nem troca de agente.

## Onde roda

A varredura roda numa VPS da Hetzner, com cron às 19:00 `America/Sao_Paulo`. O Cloud Run Job `varredura-sjc` e o Scheduler `varredura-sjc-noite` ficam pausados.

## Horário

Padrão das 19:00 às 09:00 `America/Sao_Paulo`. O processo olha o relógio e para às 08:55 (margem de 5 min, `VARREDURA_MARGEM_MIN`). As horas são `VARREDURA_INICIO_HORA` (19) e `VARREDURA_FIM_HORA` (9), inteiras de 0 a 23 e diferentes entre si. Janela que começa numa hora maior do que a de fim atravessa a meia-noite.

Disparo manual dentro da janela obedece o mesmo limite. Fora dela o processo não faz nada, a menos que `VARREDURA_FORA_DA_JANELA=1` (aí vai até a próxima hora de fim).

## Pausar e retomar

No cron da VPS, comente a linha das 19:00. O que já foi gravado fica. A célula pela metade volta a pendente na próxima execução.

O Scheduler do Cloud Run, se precisar mexer nele (ele está pausado):

```sh
gcloud scheduler jobs pause varredura-sjc-noite --location=southamerica-east1
gcloud scheduler jobs resume varredura-sjc-noite --location=southamerica-east1
```

## Progresso

No SQL Editor do Supabase, com o uuid da empresa:

```sql
select * from app.varredura_sjc_relatorio('<uuid>');
```

Cada linha é uma noite (motivo `horario`, `concluida`, `bloqueio`, `erros` ou `queda`), com consultas, lotes novos, atualizados e apagados, quadras montadas e células concluídas naquela noite. `pct_celulas` e `celulas_feitas` / `celulas_total` são o progresso da grade. `lotes_na_base` é o total guardado. Membro da empresa também pode chamar; outra empresa não vê.

As células em si: `select situacao, count(*) from app.varredura_sjc_celulas where empresa_id = '<uuid>' group by 1`.

## Quanto tempo

Uma noite (19h–8h55, cerca de 14 h) cabe cerca de 20 mil requisições a 2,5 s. A grade urbana fica na casa de alguns milhares de células de 200 m. No miolo, uma célula nova custa dezenas de pedidos (inscrição + desenho + a rua em volta); célula já coberta por lote conhecido quase não pede nada.

A grade tem **2.974 células** (cerca de 119 km²). Conta grossa, com 100 a 150 mil lotes urbanos e 3 a 5 pedidos por lote: **da ordem de 20 a 35 noites**. As primeiras noites, no centro, são as mais lentas. O `consultas` do relatório serve para recalibrar: noites × 20 mil ÷ consultas médias.

## Segredos

Criar na tela do Secret Manager do projeto `bkm-terrenos`, nunca pelo terminal:

| Segredo | Conteúdo |
| --- | --- |
| `varredura-supabase-url` | URL do projeto (`https://….supabase.co`) |
| `varredura-supabase-service-role` | chave `service_role` |

Variável do job, não é segredo: `VARREDURA_EMPRESA_ID` (uuid da BKM).

Opcionais: `VARREDURA_INICIO_HORA` (19), `VARREDURA_FIM_HORA` (9), `VARREDURA_INTERVALO_MIN_MS` (padrão 2000, mínimo 1000), `VARREDURA_INTERVALO_MAX_MS` (3000), `VARREDURA_MARGEM_MIN` (5), `VARREDURA_ERROS_SEGUIDOS` (5), `GEOSANJA_BASE`.

## Deploy

Não aplica migration e não fala com o banco. Quem roda é uma pessoa logada no gcloud:

```sh
VARREDURA_EMPRESA_ID=<uuid> bash tools/geosanja/varredura/deploy.sh
```

Antes, no SQL Editor (o Moises aprova): a migration `supabase/migrations/20261015001900_varredura_sjc.sql`. Ela depende das tabelas do PR **#290** (`20261015001800_lotes_prefeitura.sql`). Sem elas o job recusa começar.

## Testes

```sh
cd tools/geosanja/varredura && npm ci && npm test
```

As respostas gravadas estão em `tools/prototipo/testes/geosanja/` (`autenticar.json`, `localizar_41002400110000.json`). O teste não chama a prefeitura.
