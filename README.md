# TickTick API Monorepo

Unofficial TickTick tooling, organized as a Bun workspace monorepo.

## Workspace Layout

```text
.
├─ packages/
│  └─ ticktick-unofficial/      # TypeScript client library
└─ apps/
   ├─ ticktick-unofficial-api/  # Bun + Elysia HTTP API
   └─ ticktick-unofficial-cli/  # Bun CLI
```

## Getting Started

```bash
bun install
bun run typecheck
bun run build
```

## Packages

- `packages/ticktick-unofficial`: server-side TypeScript client for TickTick and Dida365 private web APIs
- `apps/ticktick-unofficial-api`: single-user HTTP API wrapper with OpenAPI, cron support, and deployment targets
- `apps/ticktick-unofficial-cli`: interactive and JSON-friendly CLI for automation and terminal use

Each workspace keeps its own README with package-specific usage and deployment details.
