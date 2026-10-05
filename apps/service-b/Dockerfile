FROM node:20-alpine
WORKDIR /app

COPY package.json ./
COPY shared/ ./shared/
COPY apps/service-b/ ./apps/service-b/

RUN npm install

RUN npm run build -w @shared/database \
 && npm run build -w @shared/cache \
 && npm run build -w @shared/event-bus \
 && npm run build -w service-b

WORKDIR /app/apps/service-b
CMD ["node", "dist/main"]
