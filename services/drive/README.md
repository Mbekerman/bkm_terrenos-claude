# Serviço das pastas do Drive (`terrenos-drive`)

Cria, para cada terreno, uma pasta dentro de cada pasta da pasta-mãe do Drive compartilhado da BKM
(hoje "DI › 01) Novos Negócios", id na variável `DRIVE_PASTA_RAIZ`) e renomeia essas pastas quando
mudam cidade, zona, bairro ou rua. Nunca apaga nem move pasta. Pedido do Moises, 12/nov/2026.

Nome (`src/nome.js`): `CIDADE_ZONA_BAIRRO_AA MM_CÓDIGO_Rua`, por exemplo
`SP_ZL_VILA JACUÍ_26 11_A001_Av. São Miguel`. Cidade pela sigla de `app.cidade_siglas` (SP e SJC
de fábrica), senão o nome inteiro; zona ZN, ZS, ZL, ZO, ZC, ZSE, ZSO, ZNE, ZNO, ou NA; bairro em
caixa alta com acento; ano e mês do cadastro no horário de São Paulo; tipo da rua abreviado (Av.,
Al., Tv., Pç., Estr., Rod., Lg., Vd.; Rua fica Rua). O `_` só separa: dentro das partes vira `-`.

- `GET /drive/saude` → `{ ok, raiz, banco }`
- `POST /drive/sincronizar` `{ terreno_id }` com `Authorization: Bearer <token do Supabase>` →
  `{ nome, criadas, renomeadas }`

O front chama `/drive/sincronizar` 15 s depois do cadastro no máximo (antes, se a zona chegar do
GeoSampa ou do GeoSanja) e, na ficha, ao abrir e quando mudam cidade, zona, bairro ou rua (só quem
edita). O serviço lê o terreno e grava o id das pastas com o login de quem pediu
(`app.drive_terreno`, `app.registrar_pasta_drive`; só quem edita). Cada pasta criada leva a marca
`appProperties.bkm_terreno`, para nunca ser criada duas vezes, mesmo se o banco perder o id. Depois
de cada pedido, de 10 em 10 minutos no máximo, cria em segundo plano as pastas que faltam nos
outros terrenos que a pessoa edita (terreno antigo ou pasta-modelo nova).

O Google é usado com a **conta de serviço do próprio Cloud Run** (`terrenos-drive@...`): o token vem
do servidor de metadados, sem chave guardada em lugar nenhum. A conta só alcança o que for
compartilhado com ela no Drive.

## Testes

```sh
npm test   # nome da pasta e o caminho todo com o Drive e o banco simulados; não fala com o Google
```

## Implantar (uma vez, no Cloud Shell do projeto `bkm-terrenos`)

Antes: o PR mergeado na `develop` e o SQL `supabase/migrations/20261015002800_drive_pastas.sql`
rodado no banco.

1. Abra o Cloud Shell: https://shell.cloud.google.com/?project=bkm-terrenos (entre com
   moises@bkm.com.br). Cole cada bloco abaixo e espere terminar antes do próximo.

```sh
gcloud config set project bkm-terrenos
gcloud services enable drive.googleapis.com
gcloud iam service-accounts create terrenos-drive --display-name="BKM Terrenos - pastas no Drive"
```

```sh
rm -rf ~/bkm_terrenos-claude && git clone -b develop https://github.com/Mbekerman/bkm_terrenos-claude ~/bkm_terrenos-claude && cd ~/bkm_terrenos-claude
ENVS=$(gcloud run services describe terrenos-web-dev --region southamerica-east1 --format=json | python3 -c "import json,sys;e={x['name']:x.get('value','') for x in json.load(sys.stdin)['spec']['template']['spec']['containers'][0].get('env',[])};print('SUPABASE_URL=%s,SUPABASE_KEY=%s'%(e['SUPABASE_URL'],e['SUPABASE_KEY']))")
gcloud run deploy terrenos-drive --source services/drive --region southamerica-east1 \
  --service-account terrenos-drive@bkm-terrenos.iam.gserviceaccount.com \
  --memory 256Mi --cpu 1 --no-cpu-throttling --min-instances 0 --max-instances 1 --concurrency 20 --timeout 120 \
  --allow-unauthenticated --set-env-vars "$ENVS,DRIVE_PASTA_RAIZ=11s0EVZZPq5smVJyIqzBy92PfWiFwbcSi"
gcloud run services update terrenos-drive --region southamerica-east1 --no-invoker-iam-check
```

```sh
URL=$(gcloud run services describe terrenos-drive --region southamerica-east1 --format='value(status.url)')
gcloud run services update terrenos-web-dev --region southamerica-east1 --update-env-vars DRIVE_URL=$URL
curl -s $URL/drive/saude   # {"ok":true,"raiz":true,"banco":true}
```

2. No Drive, abra o DI, clique com o botão direito em **01) Novos Negócios** › Compartilhar, cole
   `terrenos-drive@bkm-terrenos.iam.gserviceaccount.com`, escolha **Gerente de conteúdo**, desmarque
   "Notificar pessoas" e Compartilhar.
3. Abra a ficha de um terreno no ambiente de desenvolvimento: em alguns segundos as pastas dele
   aparecem nas 7 pastas, e as dos outros terrenos logo depois.
4. Produção, depois do merge na `main`: o mesmo `--update-env-vars DRIVE_URL=$URL` no `terrenos-web`.

Por que cada opção: `--max-instances 1` porque a trava que impede pasta dobrada é em memória;
`--no-cpu-throttling` porque a criação das pastas dos outros terrenos continua depois da resposta;
`--no-invoker-iam-check` porque a organização recusa `allUsers` (o login do Supabase continua
exigido em `/drive/sincronizar`). Atualizar o código: repetir o `gcloud run deploy` (as variáveis
ficam). Trocar a pasta-mãe: `gcloud run services update terrenos-drive --region southamerica-east1
--update-env-vars DRIVE_PASTA_RAIZ=<id da pasta nova>` e compartilhar a pasta nova com a conta.
