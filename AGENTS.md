# AGENTS.md

## Project Overview

This repository is a Bun workspace monorepo for unofficial TickTick tooling.

Workspace layout:

```text
.
├─ packages/node-ticktick-unofficial # TypeScript client library
├─ apps/ticktick-unofficial-api      # Bun + Elysia HTTP API
└─ apps/ticktick-unofficial-cli      # Bun CLI
```

The root package is only a workspace coordinator. Production code lives in the workspace packages.

## Setup Commands

- Install dependencies: `bun install`
- Typecheck all workspaces: `bun run typecheck`
- Build all workspaces: `bun run build`
- Build only the client library: `bun run build:client`
- Build only the API app: `bun run build:api`
- Build only the CLI app: `bun run build:cli`

## Development Workflow

- Work from the repo root when installing or doing cross-workspace validation.
- Use `bun run --cwd <workspace> <script>` for workspace-local commands.
- The library should usually be built before validating downstream packaging behavior in the API or CLI.
- The closest `AGENTS.md` file takes precedence. Use the workspace-local file when editing inside `packages/node-ticktick-unofficial`, `apps/ticktick-unofficial-api`, or `apps/ticktick-unofficial-cli`.

## Testing Instructions

Current repo-level verification is:

- `bun run typecheck`
- `bun run build`

There is no unified automated test suite at the root yet. Do not invent test commands that do not exist.

Workspace-specific validation:

- Library: `bun run --cwd packages/node-ticktick-unofficial typecheck`
- API: `bun run --cwd apps/ticktick-unofficial-api typecheck`
- CLI: `bun run --cwd apps/ticktick-unofficial-cli typecheck`

## Code Style

- Language: TypeScript with ESM modules.
- Package manager: Bun.
- Prefer precise edits over broad rewrites.
- Keep import paths workspace-correct; internal paths changed during monorepo conversion.
- Do not commit generated runtime state, secrets, logs, or local session files.
- Treat `dist/` as generated output. Edit source files under `src/` and rebuild.

## Build and Release Notes

- Root build composes workspace builds and should stay green before public release work is considered complete.
- The monorepo now uses workspace dependencies such as `workspace:*`; preserve that unless there is a deliberate publishing change.
- The API Docker build expects the monorepo layout and copies `package.json`, `packages/`, and `apps/` from repo root.

## Security and Secrets

- Never commit `.env`, session caches, account dumps, or debug session JSON files.
- TickTick credentials are environment-driven in the API and may also be used by the CLI.
- Session files and debug artifacts should remain ignored and local-only.

## Pull Request Guidelines

- Run `bun run typecheck` and `bun run build` before finishing substantial changes.
- Keep changes scoped to the relevant workspace when possible.
- If a change affects shared library APIs, verify both downstream apps still build.

## Additional Notes

- Human-oriented usage docs live in each workspace `README.md`.
- Agent-oriented workspace instructions live in each workspace `AGENTS.md`.
- When in doubt, prefer the minimal command set that proves correctness: install, typecheck, build.
