# NestJS Microservices Task

Dockerized NestJS microservices with MongoDB, Redis Stack (TimeSeries), Swagger, and a Redis Streams event bus.

## Layout

```
apps/
  ingest-service/     # pull / import / catalog search (port 3001)
  audit-service/      # activity audit log / reports (port 3002)
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
| http://localhost:3001/docs | Ingest service Swagger |
| http://localhost:3002/docs | Audit service Swagger |
| `GET /v1/status` | Health of deps |
| `POST /v1/activity/smoke` | Ingest → Streams + TimeSeries |
| `POST /v1/ingestion/pull` | Fetch public API → JSON/Excel file |
| `POST /v1/ingestion/import` | Upload JSON/Excel → parse → Mongo bulk insert |
| `GET /v1/catalog/search` | Indexed search + pagination |
| `GET /v1/audit` | Query stored audit events |

## Local dev

```bash
docker compose up -d mongo redis
npm install
npm run build:shared
npm run dev:ingest
npm run dev:audit
```

Use `MONGO_URI=mongodb://localhost:27017` and `REDIS_URL=redis://localhost:6379` in `.env`.

## Design notes

- **ingest-service** owns operational data (files + catalog).
- **audit-service** owns telemetry (stream consumer, audit queries, PDF reports).
- Messaging uses **Redis Streams** (`XADD` / `XREADGROUP`) with a consumer group on audit-service.
- API surface is versioned under `/v1`; OpenAPI lives at `/docs`.

## Still to implement

**audit-service:** PDF report from TimeSeries; optional Go gRPC report service
