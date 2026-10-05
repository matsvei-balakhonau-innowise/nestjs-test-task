# NestJS Microservices Test Task

Two NestJS microservices (**Service A** & **Service B**), dockerized with MongoDB and Redis Stack (RedisTimeSeries), Swagger docs, and Redis-based inter-service messaging.

## Architecture

| Component | Role |
|-----------|------|
| **Service A** (`:3001`) | Data fetch/upload/search (next), publishes actions to Redis messaging + RedisTimeSeries |
| **Service B** (`:3002`) | Subscribes to A events, stores logs in MongoDB, log query API, PDF reports (next) |
| **libs/shared** | Typed config, official MongoDB & Redis clients, RedisTimeSeries helper, messaging constants |
| **MongoDB 7** | Document storage |
| **Redis Stack** | Messaging transporter + RedisTimeSeries |

```
Service A  --emit(service_a.action)-->  Redis  -->  Service B (subscriber)
    |                                      |
    +-- TS.ADD (RedisTimeSeries)           +-- MongoDB event_logs
```

## Prerequisites

- Node.js 22+
- Docker & Docker Compose

## Quick start (Docker)

```bash
cp .env.example .env
docker compose up --build -d
```

- Service A Swagger: http://localhost:3001/docs
- Service B Swagger: http://localhost:3002/docs
- Health: `GET /health` on both services

Smoke-test messaging + TimeSeries:

```bash
curl -X POST http://localhost:3001/events/ping
curl http://localhost:3002/logs
```

## Local development

```bash
cp .env.example .env
# point Mongo/Redis at localhost if infra runs in Docker only:
# MONGODB_URI=mongodb://localhost:27017
# REDIS_URL=redis://localhost:6379
# REDIS_HOST=localhost
# REDIS_MESSAGING_HOST=localhost

docker compose up -d mongodb redis
npm install
npm run start:a:dev   # terminal 1
npm run start:b:dev   # terminal 2
```

## Project layout

```
apps/
  service-a/          # HTTP API + event publisher
  service-b/          # HTTP API + Redis microservice subscriber
libs/
  shared/             # Mongo, Redis, config, messaging types
docker-compose.yml
```

## Roadmap (task features)

**Service A**
- [x] Shared Mongo/Redis (official drivers), Swagger, health
- [x] Publish API actions → Redis transporter + RedisTimeSeries
- [ ] Fetch large public API dataset → save JSON/Excel (in code)
- [ ] Upload & parse file → robust Mongo insert
- [ ] Search API with indexes & efficient pagination

**Service B**
- [x] Subscribe to A events, store logs, filter query API
- [ ] PDF report with charts from time series data
- [ ] Bonus: Go gRPC report service

## Scripts

| Script | Description |
|--------|-------------|
| `npm run start:a:dev` | Service A watch mode |
| `npm run start:b:dev` | Service B watch mode |
| `npm run build:a` / `build:b` | Build individual apps |
| `npm run docker:up` | Build & start full stack |
| `npm run docker:down` | Stop stack |
