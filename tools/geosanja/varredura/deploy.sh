#!/usr/bin/env bash
# Sobe o Cloud Run Job da varredura de São José e o Scheduler.
# A varredura que está no ar roda na VPS da Hetzner (cron às 19:00 America/Sao_Paulo).
# Este job e o Scheduler ficam pausados; não retome o Scheduler sem combinar.
# Rodar na máquina de quem está logado no gcloud como usuário (a org não entrega chave de service account).
# Não cola segredo em argumento: os dois segredos se criam na tela do Secret Manager.
# Uso, na raiz do repositório:
#   VARREDURA_EMPRESA_ID=<uuid da BKM> bash tools/geosanja/varredura/deploy.sh
set -euo pipefail
cd "$(dirname "$0")/../../.."

PROJ=bkm-terrenos
REG=southamerica-east1
JOB=varredura-sjc
SCHED=varredura-sjc-noite
REPO=varredura
ATUAL="$(gcloud config get-value project 2>/dev/null || true)"
if [ "$ATUAL" != "$PROJ" ]; then
  echo "O gcloud está no projeto '${ATUAL:-nenhum}'. Rode: gcloud config set project $PROJ" >&2
  exit 1
fi
if [ -z "${VARREDURA_EMPRESA_ID:-}" ]; then
  echo "Defina VARREDURA_EMPRESA_ID (select id from app.empresas where nome = 'BKM')." >&2
  exit 1
fi

gcloud services enable run.googleapis.com cloudscheduler.googleapis.com secretmanager.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com

for s in varredura-supabase-url varredura-supabase-service-role; do
  if ! gcloud secrets describe "$s" >/dev/null 2>&1; then
    echo "Crie o segredo '$s' na tela, sem passar o valor por este script:" >&2
    echo "  https://console.cloud.google.com/security/secret-manager/create?project=$PROJ" >&2
    echo "  varredura-supabase-url            = https://<ref>.supabase.co" >&2
    echo "  varredura-supabase-service-role   = chave service_role (sb_secret_… ou o JWT). Nunca a chave publicável." >&2
    exit 1
  fi
done

SA="$(gcloud projects describe "$PROJ" --format='value(projectNumber)')-compute@developer.gserviceaccount.com"
gcloud projects add-iam-policy-binding "$PROJ" --member="serviceAccount:$SA" --role=roles/run.builder --condition=None >/dev/null
for s in varredura-supabase-url varredura-supabase-service-role; do
  gcloud secrets add-iam-policy-binding "$s" --member="serviceAccount:$SA" --role=roles/secretmanager.secretAccessor >/dev/null
done
if ! gcloud artifacts repositories describe "$REPO" --location="$REG" >/dev/null 2>&1; then
  gcloud artifacts repositories create "$REPO" --repository-format=docker --location="$REG" --description="Jobs da varredura do GeoSanja"
fi

gcloud builds submit --config=tools/geosanja/varredura/cloudbuild.yaml .
IMG="southamerica-east1-docker.pkg.dev/$PROJ/$REPO/$JOB:latest"

gcloud run jobs deploy "$JOB" --image="$IMG" --region="$REG" \
  --tasks=1 --parallelism=1 --max-retries=0 --task-timeout=51000 \
  --memory=512Mi --cpu=1 --service-account="$SA" \
  --set-secrets="SUPABASE_URL=varredura-supabase-url:latest,SUPABASE_SERVICE_ROLE_KEY=varredura-supabase-service-role:latest" \
  --set-env-vars="VARREDURA_EMPRESA_ID=${VARREDURA_EMPRESA_ID},VARREDURA_SETORES=/app/setores-3549904-2022.json,GEOSANJA_BASE=https://geo.sjc.sp.gov.br/v1/,VARREDURA_INICIO_HORA=19,VARREDURA_FIM_HORA=9"

gcloud run jobs add-iam-policy-binding "$JOB" --region="$REG" --member="serviceAccount:$SA" --role=roles/run.invoker >/dev/null

URI="https://run.googleapis.com/v2/projects/$PROJ/locations/$REG/jobs/$JOB:run"
SCHED_ARGS=(
  --location="$REG" --schedule="0 19 * * *" --time-zone="America/Sao_Paulo"
  --uri="$URI" --http-method=POST
  --oauth-service-account-email="$SA"
  --oauth-token-scope="https://www.googleapis.com/auth/cloud-platform"
)
if gcloud scheduler jobs describe "$SCHED" --location="$REG" >/dev/null 2>&1; then
  gcloud scheduler jobs update http "$SCHED" "${SCHED_ARGS[@]}"
else
  gcloud scheduler jobs create http "$SCHED" "${SCHED_ARGS[@]}"
fi

echo
echo "Job: $JOB ($REG), pausado. A varredura no ar é o cron das 19:00 na VPS."
echo "Timeout 14h10, para sozinho às 08:55 (America/Sao_Paulo). Agenda do Scheduler, se religar: 19:00."
echo "Pausar:  gcloud scheduler jobs pause $SCHED --location=$REG"
echo "Não retome o Scheduler enquanto a VPS estiver no cron."
echo "Progresso: select * from app.varredura_sjc_relatorio('$VARREDURA_EMPRESA_ID');"
