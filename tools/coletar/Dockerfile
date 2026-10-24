# Imagem do coletor. Não substitui o Dockerfile da raiz, que é o front.
# O Railway usa este arquivo num serviço à parte. Não faz deploy sozinho.
FROM python:3.12-slim
WORKDIR /app
COPY tools/coletar /app
RUN pip install --no-cache-dir . && chmod +x /app/entrypoint.sh
ENV PYTHONUNBUFFERED=1
ENTRYPOINT ["/app/entrypoint.sh"]
