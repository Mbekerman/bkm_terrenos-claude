# Job da varredura (Cloud Run Job varredura-sjc). Contexto da imagem: a raiz do repositório.
FROM node:22-bookworm-slim AS build
WORKDIR /repo
COPY tools/geosanja/varredura/package.json tools/geosanja/varredura/package-lock.json tools/geosanja/varredura/
WORKDIR /repo/tools/geosanja/varredura
RUN npm ci
WORKDIR /repo
COPY apps/web/src/novo/lotesSjcPuro.ts apps/web/src/novo/lotesSjcPuro.ts
COPY tools/geosanja/varredura/src tools/geosanja/varredura/src
COPY tools/geosanja/varredura/tsconfig.json tools/geosanja/varredura/tsconfig.json
WORKDIR /repo/tools/geosanja/varredura
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
ENV VARREDURA_SETORES=/app/setores-3549904-2022.json
COPY --from=build /repo/tools/geosanja/varredura/dist ./dist
COPY --from=build /repo/tools/geosanja/varredura/node_modules ./node_modules
COPY --from=build /repo/tools/geosanja/varredura/package.json ./package.json
COPY docs/dados/setores-3549904-2022.json ./setores-3549904-2022.json
USER node
CMD ["node", "dist/main.js"]
