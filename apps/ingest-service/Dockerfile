FROM node:20-alpine
WORKDIR /app

COPY package.json package-lock.json ./
COPY shared/ ./shared/
COPY apps/ingest-service/ ./apps/ingest-service/

RUN npm install

RUN npm run build -w @shared/database \
 && npm run build -w @shared/http \
 && npm run build -w @shared/cache \
 && npm run build -w @shared/event-bus \
 && npm run build -w ingest-service

RUN mkdir -p /app/apps/ingest-service/storage /app/apps/ingest-service/uploads
WORKDIR /app/apps/ingest-service
CMD ["node", "dist/main"]
