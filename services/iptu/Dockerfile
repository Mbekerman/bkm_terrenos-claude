# Serviço do IPTU (Cloud Run, serviço terrenos-iptu). Imagem oficial do Playwright, que já
# traz o Chromium e as bibliotecas dele, na mesma versão do pacote playwright do package.json.
FROM mcr.microsoft.com/playwright:v1.49.1-noble
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY src ./src
USER pwuser
CMD ["node", "src/servidor.js"]
