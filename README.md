# NestJS Microservices Task

Dockerized **ingest** + **audit** NestJS services with MongoDB, Redis Stack (TimeSeries + Streams), Swagger, and PDF reporting.

## Architecture

```text
                   ┌─────────────────────┐
                   │  Public JSON APIs   │
                   └──────────┬──────────┘
                              │ pull
                              ▼
┌──────────────┐     files      ┌─────────────────┐
│ ingest-service│───────────────▶│ storage/uploads │
│   :3001      │                └─────────────────┘
│ catalog Mongo│
└──────┬───────┘
       │ Redis Streams (XADD)
       │ + RedisTimeSeries (TS.ADD)
       ▼
┌──────────────┐   XREADGROUP    ┌─────────────────┐
│    Redis     │────────────────▶│  audit-service  │
│ Stack :6379  │   TS.QUERYINDEX │     :3002       │
└──────────────┘                 │ audit Mongo     │
                                 │ PDF reporting   │
                                 └─────────────────┘
```

| Service | Domain | Port |
|---------|--------|------|
| **ingest-service** | Pull / import / catalog search | 3001 |
| **audit-service** | Stream consumer, audit query, PDF HTTP | 3002 |
| MongoDB | `nest_ingest` / `nest_audit` | 27017 |
| Redis Stack | Streams + TimeSeries | 6379 |

## Layout

```text
apps/
  ingest-service/
  audit-service/
shared/
  database/             # @shared/database
  cache/                # @shared/cache (+ TimeSeries)
  event-bus/            # @shared/event-bus (Streams)
  http/                 # @shared/http (exception filter)
```

## Quick start

```bash
cp .env.example .env
docker compose up --build -d
docker compose ps
```

| URL | Purpose |
|-----|---------|
| http://localhost:3001/docs | Ingest Swagger |
| http://localhost:3002/docs | Audit Swagger |
| `GET /v1/status` | Dependency health |
| `POST /v1/ingestion/pull` | Fetch API → JSON/Excel |
| `POST /v1/ingestion/import` | Upload → parse → Mongo |
| `GET /v1/catalog/search` | Text search + pagination |
| `GET /v1/catalog/:id` | Fetch catalog record by id |
| `GET /v1/audit` | Filter audit events (`name`/`type`, dates, producer) |
| `GET /v1/reporting/timeseries.pdf` | Nest PDF (Chart.js) |

## Demo flow

```bash
# 1) Health
curl -s http://localhost:3001/v1/status | jq
curl -s http://localhost:3002/v1/status | jq

# 2) Pull a large public dataset
curl -s -X POST http://localhost:3001/v1/ingestion/pull \
  -H 'content-type: application/json' \
  -d '{"url":"https://jsonplaceholder.typicode.com/photos","format":"json","filename":"photos"}' | jq

# 3) Import into Mongo
curl -s -X POST http://localhost:3001/v1/ingestion/import \
  -F file=@apps/ingest-service/storage/photos.json | jq

# 4) Search catalog + fetch one record
curl -s 'http://localhost:3001/v1/catalog/search?q=accusamus&page=1&pageSize=5' | jq
ID=$(curl -s 'http://localhost:3001/v1/catalog/search?q=accusamus&page=1&pageSize=1' | jq -r '.items[0]._id')
curl -s "http://localhost:3001/v1/catalog/$ID" | jq

# 5) Audit trail (events from steps 2–4; type aliases name)
curl -s 'http://localhost:3002/v1/audit?limit=10' | jq
curl -s 'http://localhost:3002/v1/audit?type=ingestion.pull&limit=5' | jq

# 6) PDF report
curl -o nest-report.pdf 'http://localhost:3002/v1/reporting/timeseries.pdf'
file nest-report.pdf
```

## Local development

```bash
docker compose up -d mongo redis
npm install
npm run build:shared
npm run dev:ingest   # terminal 1
npm run dev:audit    # terminal 2
```

Use localhost URIs in `.env`:

```bash
MONGO_URI=mongodb://localhost:27017
REDIS_URL=redis://localhost:6379
```

## Design notes

- **ingest-service** owns operational data (files + catalog).
- **audit-service** owns telemetry (consumer, audit queries, report HTTP façade).
- Messaging uses **Redis Streams** with a consumer group (durable delivery).
- PDF charts use **Chart.js** (Nest path).
- Errors use a shared JSON shape via `@shared/http` (`statusCode`, `error`, `message`, `path`, `timestamp`, `correlationId`).
- Every HTTP response includes `x-correlation-id`, `x-request-id`, and `x-instance-id`; ingest activity events carry the active `correlationId`.
