# ticktick-unofficial-api

Single-user HTTP API for your TickTick account.

This app is useful when you want to put a simple web layer in front of TickTick so other tools can talk to it over HTTP instead of embedding the library directly.

Typical use cases:

- self-hosting a personal TickTick API
- exposing tasks and projects to other local tools
- giving automation systems a stable HTTP interface
- working from generated OpenAPI docs

> Warning: Do not expose this service to the public internet without a secure reverse proxy and HTTPS. It handles your TickTick credentials and session data, so treat it like you would any sensitive service.  
> You can either use the built-in bearer token auth or put it behind a reverse proxy like traefik or NGINX that handles authentication for you.

## What It Provides

The API can expose:

- account profile information
- projects and columns
- tasks and task sync data
- countdowns
- habits and habit exports
- focus state and focus history
- general and ranking statistics

It also manages login and session reuse for you, so the server can stay authenticated across requests.

## Quick Start

Install dependencies from the repo root:

```bash
bun install
```

Create a local `.env` with at least:

```dotenv
TICKTICK_USERNAME=your-account@example.com
TICKTICK_PASSWORD=your-password
```

Run locally:

```bash
bun run --cwd apps/ticktick-unofficial-api dev
```

Useful local URLs:

- `http://localhost:3000/`
- `http://localhost:3000/health`
- `http://localhost:3000/openapi`

If Swagger is enabled:

- `http://localhost:3000/swagger`

## Common Configuration

These are the settings most people will care about first:

| Variable | Default | Purpose |
| --- | --- | --- |
| `TICKTICK_USERNAME` |  | TickTick or Dida365 login |
| `TICKTICK_PASSWORD` |  | TickTick or Dida365 password |
| `TICKTICK_SERVICE` | `ticktick` | Switch to `dida365` when needed |
| `PORT` | `3000` | Local server port |
| `API_AUTH_MODE` | `none` | Set to `bearer` to require a token |
| `API_AUTH_TOKEN` |  | Bearer token for `/api/*` routes |
| `SWAGGER_ENABLED` | `false` | Enables the Swagger UI |
| `SESSION_REFRESH_ENABLED` | `true` | Keeps scheduled refresh active |
| `SESSION_REFRESH_CRON` | `*/30 * * * *` | Refresh cadence |
| `CRON_DRIVER` | `auto` | Scheduler mode for your deployment |

Session storage defaults to file-backed storage on Bun or Node and memory-backed storage on serverless targets.

## Everyday Endpoints

System:

- `GET /`
- `GET /health`
- `GET /api/session`
- `POST /api/session/refresh`

Common data:

- `GET /api/user/profile`
- `GET /api/projects`
- `GET /api/tasks`
- `GET /api/countdowns`
- `GET /api/habits`
- `GET /api/focus/state`
- `GET /api/statistics/general`

The OpenAPI document is the source of truth for the full route set and request shapes.

## Auth And Session Behavior

This service is intentionally single-user:

- there is no user-facing login endpoint
- credentials come from environment variables
- the server signs into TickTick on your behalf
- cached sessions are restored when possible
- stale sessions are refreshed automatically when the app has credentials available

If you set `API_AUTH_MODE=bearer`, all `/api/*` routes require `Authorization: Bearer <API_AUTH_TOKEN>`.

## Running And Building

Local development:

```bash
bun run --cwd apps/ticktick-unofficial-api dev
```

Verification:

```bash
bun run --cwd apps/ticktick-unofficial-api typecheck
bun run --cwd apps/ticktick-unofficial-api build
```

## Deployment Notes

This app can be deployed in several ways, but the practical guidance is simple:

- use Bun or Docker if you want file-backed session storage and a long-running process
- use Vercel or Cloudflare if you prefer managed deployment and can tolerate memory-backed sessions on cold starts
- keep your cron schedule aligned with platform-specific config if you change refresh cadence

The repo already includes deployment files for Docker, Vercel, and Cloudflare Worker targets.

## Notes

- This app depends on the local `ticktick-unofficial` workspace package.
- It uses private TickTick web endpoints, not the official public API.
- Upstream behavior may change without notice.
- Do not commit `.env`, session files, secrets, or account data.
