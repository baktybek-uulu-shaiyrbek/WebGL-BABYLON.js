# Образ только для сборки: локальный Node не нужен, всё живёт в контейнере.
FROM node:22-alpine
RUN npm install --global typescript@5.9.3
WORKDIR /app
ENTRYPOINT ["tsc"]
