# AGENTS.md

## Project Overview

`ticktick-unofficial-api` is a single-user HTTP API built with Bun and Elysia on top of the `node-ticktick-unofficial` workspace package.

Key paths:

```text
src/app.ts         # Main route and OpenAPI definitions
src/index.ts       # Bun/Node entrypoint
src/cloudflare.ts  # Cloudflare worker entrypoint
src/lib/           # Config, service lifecycle, telemetry, schemas
api/[[...route]].ts# Vercel catch-all entry
```

## Setup Commands

From this workspace:

- Install from repo root: `bun install`
- Start dev server: `bun run dev`
- Start normally: `bun run start`
- Typecheck: `bun run typecheck`
- Build all targets: `bun run build`
- Build Bun target only: `bun run build:bun`
- Build Cloudflare target only: `bun run build:cloudflare`
- Register Bun cron job: `bun run cron:register`
- Unregister Bun cron job: `bun run cron:unregister`

From repo root:

- `bun run --cwd apps/ticktick-unofficial-api dev`
- `bun run --cwd apps/ticktick-unofficial-api typecheck`
- `bun run --cwd apps/ticktick-unofficial-api build`

## Environment and Configuration

- Copy `.env.example` to `.env` for local development.
- Required credentials:
  - `TICKTICK_USERNAME`
  - `TICKTICK_PASSWORD`
- Important config lives in `src/lib/config.ts`.
- Keep Vercel and Cloudflare schedule/config files in sync with runtime cron behavior when schedule semantics change.

## Development Workflow

- Edit code in `src/` and `api/`; do not edit `dist/`.
- Route definitions, docs, and response schemas are tightly coupled. If you add or change endpoints, update schema wiring in `src/app.ts` and `src/lib/schemas.ts`.
- This app depends on the shared workspace package through `workspace:*`. If shared library APIs change, re-run this workspace typecheck and build.
- Preserve the worker-safe separation between Bun/Node telemetry setup and Cloudflare-safe code paths.

## Testing Instructions

Primary validation:

- `bun run typecheck`
- `bun run build`

There is no dedicated test runner configured yet. For API changes, validate by:

- Building both Bun and Cloudflare outputs.
- Checking that OpenAPI generation still works through `src/app.ts`.
- Verifying config defaults and auth/cron behavior if relevant.

Recommended cross-checks after shared-library changes:

- `bun run --cwd packages/node-ticktick-unofficial build`
- `bun run --cwd apps/ticktick-unofficial-api typecheck`

## Code Style

- TypeScript, ESM, Bun-first runtime assumptions.
- Keep config parsing centralized in `src/lib/config.ts`.
- Keep TickTick session lifecycle behavior centralized in `src/lib/ticktick-service.ts`.
- Prefer explicit schema-backed request and response definitions over loose objects.
- Avoid introducing Node-only APIs into `src/cloudflare.ts` paths.

## Build and Deployment

- Bun build output: `dist/bun/index.js`
- Cloudflare build output: `dist/cloudflare/cloudflare.js`
- Docker build is monorepo-root aware and uses `apps/` plus `packages/`.
- Vercel config lives in `vercel.json`.
- Cloudflare worker config lives in `wrangler.toml`.

## Security Notes

- This service is intentionally single-user.
- Never commit `.env`, session caches, cron secrets, or live account data.
- Be careful with bearer auth and cron-secret changes; public API auth and internal scheduler auth are related but distinct concerns.
- Telemetry headers and exporter endpoints are sensitive configuration, not source constants.

## Additional Notes

- Public API paths and generated docs are defined in `src/app.ts`.
- If you change schedule behavior, keep docs, `vercel.json`, and `wrangler.toml` aligned.
