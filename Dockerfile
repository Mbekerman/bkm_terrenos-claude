# Front em React servido por Caddy. Cloud Run: o Cloud Build usa este Dockerfile.
# O endereço e a chave publicável do Supabase não entram no build: o Caddy os põe na
# página a partir das variáveis SUPABASE_URL e SUPABASE_KEY do serviço (e AMBIENTE).
FROM node:22-alpine AS build
# mesma árvore do repositório: o front lê a metodologia das camadas em tools/setores
WORKDIR /repo/apps/web
COPY apps/web/package*.json ./
RUN npm install --no-audit --no-fund
COPY tools/setores/metodologia_renda.json tools/setores/metodologia_densidade.json tools/setores/demografia.json /repo/tools/setores/
COPY tools/viabilidade/despesas.json /repo/tools/viabilidade/
COPY apps/web/ ./
RUN npm run build

FROM caddy:2-alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /repo/apps/web/dist /srv
COPY docs/prototipo.html /srv/prototipo/index.html
# setores do IBGE para as camadas de renda e densidade (tools/setores/gerar.py), no protótipo e no sistema
COPY docs/dados /srv/prototipo/dados
