# Serviço do IPTU (`terrenos-iptu`)

Emite a 2ª via da **Notificação de Lançamento do IPTU** de São Paulo no portal da Prefeitura,
com a Senha Web guardada no Secret Manager, lê o PDF e grava o valor venal e o IPTU em
`app.inscricao_valores` com o login de quem pediu. O front chama por `/iptu/...` no próprio
endereço do sistema (o Caddy repassa para cá pela variável `IPTU_URL`).

- `GET /iptu/saude` → `{ ok, credencial }`
- `POST /iptu/consultar` `{ inscricao_id, exercicio? }` com `Authorization: Bearer <token do Supabase>` → grava e devolve `{ valor, novo }`
- `POST /iptu/notificacao` `{ inscricao_id, exercicio }` → o PDF (não grava)

Só quem edita, só SQL de São Paulo de um terreno da empresa (a RLS decide), 40 consultas por
pessoa por hora, uma emissão por vez. Captcha não é resolvido. Ver `docs/tecnico/integracoes.md` §10b.

## Testes

```sh
npm ci && npm test   # leitura do PDF com uma notificação fictícia; não fala com a Prefeitura
```

## Implantar (uma vez, no Cloud Shell do projeto `bkm-terrenos`)

A senha é digitada só no Cloud Shell, sem aparecer na tela nem no histórico. Nunca cole a
senha em chat, e-mail, repositório ou no banco.

```sh
gcloud config set project bkm-terrenos
gcloud services enable secretmanager.googleapis.com run.googleapis.com cloudbuild.googleapis.com

# 1. Segredos (digite o CPF e depois a senha; Enter em cada um)
read -rs V && printf '%s' "$V" | gcloud secrets create iptu-cpf --data-file=- ; unset V
read -rs V && printf '%s' "$V" | gcloud secrets create iptu-senha --data-file=- ; unset V
SA="$(gcloud projects describe bkm-terrenos --format='value(projectNumber)')-compute@developer.gserviceaccount.com"
# projeto novo: a conta padrão também monta o código enviado (sem isso, o deploy dá 403 em storage.objects.get)
gcloud projects add-iam-policy-binding bkm-terrenos --member="serviceAccount:$SA" --role=roles/run.builder --condition=None
for s in iptu-cpf iptu-senha; do gcloud secrets add-iam-policy-binding $s --member="serviceAccount:$SA" --role=roles/secretmanager.secretAccessor; done

# 2. Serviço (copia o endereço e a chave publicável do Supabase do terrenos-web-dev)
git clone -b develop https://github.com/Mbekerman/bkm_terrenos-claude && cd bkm_terrenos-claude
ENVS=$(gcloud run services describe terrenos-web-dev --region southamerica-east1 --format=json | python3 -c "import json,sys;e={x['name']:x.get('value','') for x in json.load(sys.stdin)['spec']['template']['spec']['containers'][0].get('env',[])};print('SUPABASE_URL=%s,SUPABASE_KEY=%s'%(e['SUPABASE_URL'],e['SUPABASE_KEY']))")
gcloud run deploy terrenos-iptu --source services/iptu --region southamerica-east1 \
  --memory 1Gi --cpu 1 --min-instances 0 --max-instances 1 --concurrency 8 --timeout 300 \
  --allow-unauthenticated --set-env-vars "$ENVS" \
  --set-secrets IPTU_CPF=iptu-cpf:latest,IPTU_SENHA=iptu-senha:latest

# 3. Ligar o sistema ao serviço (dev primeiro; produção depois do merge na main)
URL=$(gcloud run services describe terrenos-iptu --region southamerica-east1 --format='value(status.url)')
gcloud run services update terrenos-web-dev --region southamerica-east1 --update-env-vars IPTU_URL=$URL
curl -s $URL/iptu/saude   # {"ok":true,"credencial":true}
```

`--max-instances 1`: a fila é em memória e a Prefeitura recebe um pedido por vez.
Atualizar o código depois: repetir o `gcloud run deploy` (os segredos e variáveis ficam).
Trocar a senha: `read -rs V && printf '%s' "$V" | gcloud secrets versions add iptu-senha --data-file=- ; unset V` e um novo deploy.
