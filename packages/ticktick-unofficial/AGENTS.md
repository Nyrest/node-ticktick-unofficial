# AGENTS.md

## Project Overview

`ticktick-unofficial` is the server-side TypeScript client library for TickTick and Dida365 private web APIs.

Key directories:

```text
src/        # Source of truth
scripts/    # Integration and live coverage helpers
dist/       # Generated build output
```

This package is consumed by both workspace apps, so API changes here can break the HTTP API and CLI.

## Setup Commands

- Install dependencies from repo root: `bun install`
- Typecheck this package: `bun run typecheck`
- Build this package: `bun run build`
- Run integration helper: `bun run integration`

If running from the monorepo root:

- `bun run --cwd packages/ticktick-unofficial typecheck`
- `bun run --cwd packages/ticktick-unofficial build`

## Development Workflow

- Edit files in `src/`, not `dist/`.
- Rebuild after source changes so downstream apps consume current output.
- Keep public exports in `package.json` and source entrypoints aligned.
- This package targets server runtimes only; avoid browser-only assumptions unless the `core` entrypoint explicitly supports them.

## Testing Instructions

Primary validation for this package:

- `bun run typecheck`
- `bun run build`

There is no formal unit test suite configured in `package.json` yet.

When changing exported types or task/focus/habit APIs:

- Rebuild this package.
- Then verify downstream workspaces still pass:
  - `bun run --cwd apps/ticktick-unofficial-api typecheck`
  - `bun run --cwd apps/ticktick-unofficial-cli typecheck`

## Code Style

- TypeScript, strict mode, ESM.
- Preserve the existing module split under `src/modules`, `src/internal`, and top-level entrypoints.
- Keep transport details and API normalization inside the library rather than leaking them into consuming apps.
- Prefer additive, backward-compatible API evolution where practical.
- If adding a new exported API, update both source exports and package export metadata if needed.

## Build and Publishing

- Build output is produced by `tsc -p tsconfig.build.json`.
- Published files are limited to `dist/` and `README.md`.
- `prepublishOnly` runs `npm run build`; do not break that workflow.
- `publishConfig.access` is public, so treat package metadata and release polish as user-facing.

## Security Notes

- Do not hardcode account credentials or session material.
- Avoid checking in any temporary session files produced by manual integration work.
- Be careful when touching low-level request or cookie handling under `src/internal/`.

## Additional Notes

- The API app uses the worker-safe `ticktick-unofficial/core` path where needed.
- The CLI depends on the package API directly and will surface typing drift quickly.
