FROM node:20-alpine
WORKDIR /app

COPY package.json ./
COPY shared/ ./shared/
COPY apps/service-a/ ./apps/service-a/

RUN npm install

RUN npm run build -w @shared/database \
 && npm run build -w @shared/cache \
 && npm run build -w @shared/event-bus \
 && npm run build -w service-a

RUN mkdir -p /app/apps/service-a/storage /app/apps/service-a/uploads
WORKDIR /app/apps/service-a
CMD ["node", "dist/main"]
