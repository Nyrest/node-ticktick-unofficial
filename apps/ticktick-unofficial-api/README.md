# ticktick-unofficial-api

Single-user Bun + Elysia HTTP API for the local `ticktick-unofficial` client.

It wraps the current `ticktick-unofficial` modules behind documented HTTP endpoints, reads credentials from environment variables, caches the TickTick session, refreshes that session on a schedule, supports optional bearer auth, exposes OpenAPI JSON by default, can expose Swagger UI from env, and can be deployed to Bun, Vercel, Cloudflare Worker, or Docker.

## Highlights

- Bun-first TypeScript project
- Fully typed Elysia routes and request schemas
- OpenAPI JSON always available
- Swagger UI enabled with `SWAGGER_ENABLED=true`
- Optional bearer auth using `@elysiajs/bearer`
- TickTick session cache with automatic relogin on stale auth
- Scheduler support for:
  - `CRON_DRIVER=elysia` for in-process cron
  - `CRON_DRIVER=bun` for Bun OS-level cron via `Bun.cron`
  - `CRON_DRIVER=vercel` for Vercel Cron hitting an internal webhook
  - `CRON_DRIVER=cloudflare` for Worker scheduled events
- OpenTelemetry exporter support for Bun/Node runtimes when `OTEL_EXPORTER_OTLP_ENDPOINT` is set
- Cloudflare Worker build path that avoids Node-only telemetry wiring

## Project Layout

```text
apps/ticktick-unofficial-api/
├─ api/[[...route]].ts         # Vercel catch-all function entry
├─ src/app.ts                  # Elysia app and route definitions
├─ src/index.ts                # Bun/Node entrypoint
├─ src/cloudflare.ts           # Cloudflare Worker entrypoint
├─ src/bun-cron.ts             # Bun scheduled worker entrypoint
├─ src/lib/config.ts           # Environment parsing and runtime config
├─ src/lib/ticktick-service.ts # TickTick client lifecycle and session maintenance
├─ src/lib/schemas.ts          # OpenAPI request/response schemas
├─ vercel.json
├─ wrangler.toml
└─ Dockerfile
```

## Requirements

- Bun 1.3+
- A working TickTick or Dida365 account
- The workspace package `packages/ticktick-unofficial`

## Install

From the repo root:

```bash
bun install
```

Then run API-specific commands from `apps/ticktick-unofficial-api/` or with `bun run --cwd`.

## Configuration

Copy `.env.example` to `.env` and set at least:

```dotenv
TICKTICK_USERNAME=your-account@example.com
TICKTICK_PASSWORD=your-password
```

### Core Environment Variables

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `APP_RUNTIME` | No | `auto` | `auto`, `bun`, `node`, `vercel`, `cloudflare` |
| `HOST` | No | `0.0.0.0` | Bun/Node listener host |
| `PORT` | No | `3000` | Bun/Node listener port |
| `TICKTICK_SERVICE` | No | `ticktick` | `ticktick` or `dida365` |
| `TICKTICK_USERNAME` | Yes |  | TickTick login username |
| `TICKTICK_PASSWORD` | Yes |  | TickTick login password |
| `TICKTICK_TIMEZONE` | No | host timezone | Passed to TickTick headers |
| `TICKTICK_LANGUAGE` | No | service default | Passed to TickTick headers |
| `TICKTICK_SESSION_STORE` | No | `auto` | `auto`, `memory`, `file` |
| `TICKTICK_SESSION_FILE` | No | `.data/ticktick-session.json` | Used when file session store is active |
| `API_AUTH_MODE` | No | `none` | `none` or `bearer` |
| `API_AUTH_TOKEN` | If bearer auth |  | Bearer token for `/api/*` |
| `SWAGGER_ENABLED` | No | `false` | Enables Swagger UI frontend |
| `OPENAPI_PATH` | No | `/openapi` | OpenAPI JSON path |
| `SWAGGER_PATH` | No | `/swagger` | Swagger UI path |
| `SESSION_REFRESH_ENABLED` | No | `true` | Turns scheduler integrations on/off |
| `SESSION_REFRESH_CRON` | No | `*/30 * * * *` | 5-field cron, or 6-field with leading `0` seconds |
| `CRON_DRIVER` | No | `auto` | `auto`, `elysia`, `bun`, `vercel`, `cloudflare`, `disabled` |
| `CRON_SECRET` | Recommended for webhook cron | falls back to `API_AUTH_TOKEN` | Protects `/internal/cron/session-refresh` |
| `BUN_CRON_JOB_NAME` | No | `ticktick-unofficial-api-session-refresh` | Bun scheduled task name |
| `BUN_CRON_SCRIPT` | No | `./src/bun-cron.ts` | Bun cron worker file |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | No |  | Enables OTEL when set |
| `OTEL_EXPORTER_OTLP_HEADERS_JSON` | No | `{}` | JSON object of exporter headers |
| `OTEL_SERVICE_NAME` | No | `ticktick-unofficial-api` | OTEL service name |

### Session Store Behavior

- `auto` resolves to `file` on Bun/Node and `memory` on Vercel/Cloudflare
- `file` gives the best auth cache behavior for long-running Bun or Docker deployments
- `memory` works for serverless/edge runtimes, but cold starts can force a fresh TickTick login

## Run Locally

```bash
bun run --cwd apps/ticktick-unofficial-api dev
```

or:

```bash
bun run --cwd apps/ticktick-unofficial-api start
```

Default local URLs:

- API root: `http://localhost:3000/`
- Health: `http://localhost:3000/health`
- OpenAPI JSON: `http://localhost:3000/openapi`
- Swagger UI: `http://localhost:3000/swagger` when enabled

## Verification

```bash
bun run --cwd apps/ticktick-unofficial-api typecheck
bun run --cwd apps/ticktick-unofficial-api build
```

Current build outputs:

- `dist/bun/index.js`
- `dist/cloudflare/cloudflare.js`

## Auth Model

This service is intentionally single-user.

- There is no login endpoint
- TickTick credentials come only from environment variables
- The server logs into TickTick itself and manages the cached session
- If `API_AUTH_MODE=bearer`, all `/api/*` routes require `Authorization: Bearer <API_AUTH_TOKEN>`
- The internal cron webhook uses `CRON_SECRET` if set, otherwise it falls back to `API_AUTH_TOKEN`

## Session Maintenance

The service does three things for session maintenance:

1. Restore cached TickTick session data on startup or first use.
2. Validate cached auth before scheduled maintenance runs.
3. Perform `keepAlive()` when the cached session is valid, otherwise call `login()` and refresh the cache.

Manual maintenance endpoints:

- `GET /api/session`
- `POST /api/session/refresh`

Scheduler webhook endpoint:

- `POST /internal/cron/session-refresh`

## Cron Drivers

### `CRON_DRIVER=elysia`

Use Elysia's in-process cron integration. Best for a long-running Bun/Node server or Docker container.

### `CRON_DRIVER=bun`

Use Bun's OS-level scheduler integration.

Register:

```bash
bun run cron:register
```

Unregister:

```bash
bun run cron:unregister
```

This driver is useful when you want refresh jobs managed outside the main process lifecycle.

### `CRON_DRIVER=vercel`

Use Vercel Cron to call:

```text
/api/internal/cron/session-refresh
```

Important:

- The included `vercel.json` schedules the default `*/30 * * * *` cadence
- If you change `SESSION_REFRESH_CRON`, also update `vercel.json`
- Because Vercel functions are file-routed, all public paths are prefixed with `/api` in Vercel

### `CRON_DRIVER=cloudflare`

Use Worker scheduled events. The included `wrangler.toml` config uses the same default 30-minute schedule.

Important:

- If you change `SESSION_REFRESH_CRON`, also update `wrangler.toml`
- Cloudflare Worker deployments should keep `TICKTICK_SESSION_STORE=memory`

## OpenTelemetry

OpenTelemetry is enabled only when `OTEL_EXPORTER_OTLP_ENDPOINT` is configured.

What happens:

- Bun/Node entrypoints install the Elysia OpenTelemetry plugin
- OTLP traces are exported with the configured endpoint and optional headers
- Service name defaults to `ticktick-unofficial-api`

Cloudflare Worker note:

- The Cloudflare Worker entrypoint intentionally disables the Node-based OTEL bootstrap path
- This keeps the Worker bundle valid
- If you need Worker-native OTEL later, add a Worker-specific exporter path instead of reusing the Bun/Node stack

## API Surface

### System

- `GET /`
- `GET /health`
- `GET /api/session`
- `POST /api/session/refresh`
- `POST /internal/cron/session-refresh`

### User

- `GET /api/user/profile`

### Projects

- `GET /api/projects`
- `GET /api/projects/:projectId`
- `GET /api/projects/:projectId/columns`
- `POST /api/projects`
- `PATCH /api/projects/:projectId`
- `POST /api/projects/batch`
- `DELETE /api/projects/:projectId`

### Tasks

- `GET /api/tasks/sync`
- `GET /api/tasks`
- `GET /api/tasks/:taskId`
- `GET /api/tasks/completed`
- `GET /api/tasks/trash`
- `POST /api/tasks`
- `POST /api/tasks/batch`
- `PATCH /api/tasks`
- `POST /api/tasks/status`
- `POST /api/tasks/move`
- `DELETE /api/tasks/:taskId`
- `POST /api/tasks/delete`

### Habits

- `GET /api/habits`
- `GET /api/habits/statistics/week/current`
- `GET /api/habits/export`
- `POST /api/habits`
- `POST /api/habits/batch`
- `DELETE /api/habits/:habitId`
- `POST /api/habits/checkins/query`
- `POST /api/habits/checkins/upsert`
- `POST /api/habits/checkins/batch`

### Focus

- `GET /api/focus/state`
- `GET /api/focus/overview`
- `GET /api/focus/timeline`
- `GET /api/focus/distribution/:startDate/:endDate`
- `GET /api/focus/heatmap/:startDate/:endDate`
- `GET /api/focus/time-distribution/:startDate/:endDate`
- `GET /api/focus/hour-distribution/:startDate/:endDate`
- `POST /api/focus/sync`
- `POST /api/focus/start`
- `POST /api/focus/pause`
- `POST /api/focus/resume`
- `POST /api/focus/finish`
- `POST /api/focus/stop`

### Statistics

- `GET /api/statistics/general`
- `GET /api/statistics/ranking`
- `GET /api/statistics/tasks/:startDate/:endDate`

The authoritative schema is the generated OpenAPI document.

## Deployment

### Docker

Build from the repo root because the API depends on the sibling `ticktick-unofficial` package:

```bash
docker build -f apps/ticktick-unofficial-api/Dockerfile -t ticktick-unofficial-api .
docker run --rm -p 3000:3000 --env-file apps/ticktick-unofficial-api/.env ticktick-unofficial-api
```

### Vercel

Recommended shape:

1. Deploy from the repo root so `apps/ticktick-unofficial-api/` and `packages/ticktick-unofficial/` are both available.
2. Keep the included `api/[[...route]].ts` catch-all function.
3. Set environment variables in the Vercel dashboard.
4. If bearer auth is enabled, keep `CRON_SECRET` distinct from the public API token when possible.

Public Vercel paths are prefixed with `/api`, for example:

- `/api/health`
- `/api/openapi`
- `/api/swagger`
- `/api/internal/cron/session-refresh`

### Cloudflare Worker

Deploy from the repo checkout after installing workspace dependencies:

```bash
bun run --cwd apps/ticktick-unofficial-api build
wrangler deploy
```

Set secrets with Wrangler, for example:

```bash
wrangler secret put TICKTICK_USERNAME
wrangler secret put TICKTICK_PASSWORD
wrangler secret put API_AUTH_TOKEN
wrangler secret put CRON_SECRET
```

## Notes

- `ticktick-unofficial-api` depends on the current local `ticktick-unofficial` package
- The API project uses the worker-safe `ticktick-unofficial/core` entrypoint
- The Bun/Node runtime can still use file-backed session storage through `ticktick-unofficial/node`
- TickTick's own upstream behavior still applies, including rate limits such as the habits export endpoint
