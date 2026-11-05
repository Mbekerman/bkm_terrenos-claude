# Front em React servido por Caddy. Cloud Run: o Cloud Build usa este Dockerfile.
# O endereço e a chave publicável do Supabase não entram no build: o Caddy os põe na
# página a partir das variáveis SUPABASE_URL e SUPABASE_KEY do serviço (e AMBIENTE).
FROM node:22-alpine AS build
WORKDIR /app
COPY apps/web/package*.json ./
RUN npm install --no-audit --no-fund
COPY apps/web/ ./
RUN npm run build

FROM caddy:2-alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
COPY docs/prototipo.html /srv/prototipo/index.html
# setores do IBGE para a camada de renda (tools/setores/gerar.py)
COPY docs/dados /srv/prototipo/dados
