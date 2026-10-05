# NestJS Microservices Task

Dockerized NestJS services **A** and **B** with MongoDB, Redis Stack (TimeSeries), Swagger, and a Redis Streams event bus.

## Layout

```
apps/
  service-a/          # ingestion / search (port 3001)
  service-b/          # audit logs / reports (port 3002)
shared/
  database/           # @shared/database — official mongodb driver
  cache/              # @shared/cache — official redis + TimeSeries
  event-bus/          # @shared/event-bus — Redis Streams transport
```

npm workspaces at the root. Each app has its own Nest CLI / prettier config.

## Run

```bash
cp .env.example .env
docker compose up --build -d
```

| URL | Purpose |
|-----|---------|
| http://localhost:3001/docs | Service A Swagger |
| http://localhost:3002/docs | Service B Swagger |
| `GET /v1/status` | Health of deps |
| `POST /v1/activity/smoke` | A → Streams + TimeSeries |
| `GET /v1/audit` | B query stored events |

## Local dev

```bash
docker compose up -d mongo redis
npm install
npm run build:shared
npm run dev:a
npm run dev:b
```

Use `MONGO_URI=mongodb://localhost:27017` and `REDIS_URL=redis://localhost:6379` in `.env`.

## Design notes

- Messaging uses **Redis Streams** (`XADD` / `XREADGROUP`) with a consumer group on Service B — durable delivery, not fire-and-forget pub/sub.
- API surface is versioned under `/v1`; OpenAPI lives at `/docs`.
- Shared packages expose `register()` factories and Symbol injection tokens.

## Still to implement

**Service A:** public API fetch → file, upload/parse → Mongo, indexed search + pagination  
**Service B:** PDF report from TimeSeries; optional Go gRPC report service
