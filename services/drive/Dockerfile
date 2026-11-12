# Serviço das pastas do Drive (Cloud Run, serviço terrenos-drive). Sem dependências: só o Node.
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
COPY src ./src
USER node
CMD ["node", "src/servidor.js"]
