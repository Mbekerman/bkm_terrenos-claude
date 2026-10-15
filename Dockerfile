# Front em React servido por Caddy. Railway: o build usa este Dockerfile.
# As variáveis VITE_* entram no bundle no momento do build; defina-as em
# Railway → Variables antes de fazer o deploy.
FROM node:22-alpine AS build
WORKDIR /app
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
COPY apps/web/package*.json ./
RUN npm install --no-audit --no-fund
COPY apps/web/ ./
RUN npm run build

FROM caddy:2-alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
COPY docs/prototipo.html /srv/prototipo/index.html
