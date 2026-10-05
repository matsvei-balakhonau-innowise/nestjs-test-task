FROM node:20-alpine
WORKDIR /app

COPY package.json ./
COPY shared/ ./shared/
COPY apps/audit-service/ ./apps/audit-service/

RUN npm install

RUN npm run build -w @shared/database \
 && npm run build -w @shared/cache \
 && npm run build -w @shared/event-bus \
 && npm run build -w audit-service

WORKDIR /app/apps/audit-service
CMD ["node", "dist/main"]
