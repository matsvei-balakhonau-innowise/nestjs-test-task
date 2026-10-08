FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ pkg-config \
    libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
COPY shared/ ./shared/
COPY apps/audit-service/ ./apps/audit-service/

RUN npm install

RUN npm run build -w @shared/database \
 && npm run build -w @shared/http \
 && npm run build -w @shared/cache \
 && npm run build -w @shared/event-bus \
 && npm run build -w audit-service

WORKDIR /app/apps/audit-service
CMD ["node", "dist/main"]
