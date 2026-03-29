# AGENTS.md

## Project Overview

`ticktick-unofficial-cli` is a Bun CLI for TickTick, designed for both interactive terminal use and machine-readable JSON output.

Key paths:

```text
src/cli.ts        # Main CLI entrypoint
src/lib/app.ts    # Runtime/session helpers and resolvers
src/lib/output.ts # Human-readable renderers
src/lib/focus-mode.ts
scripts/          # Build and live verification helpers
dist/             # Generated artifacts
```

## Setup Commands

From this workspace:

- Install from repo root: `bun install`
- Start CLI in dev mode: `bun run dev`
- Start CLI normally: `bun run start`
- Build bundled JS: `bun run build`
- Build standalone executable: `bun run compile`
- Typecheck: `bun run typecheck`
- Run live verification: `bun run verify:live`

From repo root:

- `bun run --cwd apps/ticktick-unofficial-cli typecheck`
- `bun run --cwd apps/ticktick-unofficial-cli build`
- `bun run --cwd apps/ticktick-unofficial-cli compile`

## Development Workflow

- Edit `src/` files only; `dist/` is generated.
- Keep CLI command behavior and JSON output stable when possible.
- The CLI depends on `ticktick-unofficial` through `workspace:*`. Recheck type compatibility after shared-library API changes.
- Session and auth behavior is centralized in `src/lib/app.ts`; avoid duplicating runtime/session logic across commands.

## Testing Instructions

Primary validation:

- `bun run typecheck`
- `bun run build`

Optional higher-risk verification:

- `bun run compile`
- `bun run verify:live`

Use `verify:live` only when you explicitly intend to exercise a real TickTick account and have appropriate credentials configured.

## Code Style

- TypeScript, ESM, Bun runtime.
- Preserve command structure in `src/cli.ts` unless there is a strong reason to refactor.
- Human-readable output belongs in `src/lib/output.ts`.
- Runtime resolution, auth, and lookup helpers belong in `src/lib/app.ts`.
- When changing task state operations, align with the current shared library API instead of inventing convenience methods locally.

## Build and Packaging

- JS bundle output: `dist/ticktick-unofficial-cli.js`
- `package.json` `bin` points at the built JS artifact, not `src/`.
- Executable packaging is handled by `scripts/compile.ts`.
- If packaging behavior changes, verify both `build` and `compile`.

## Security Notes

- Never commit local session files, debug session dumps, or account credentials.
- Treat live verification as sensitive because it touches a real account.
- Avoid logging secrets or raw credential values in command errors.

## Additional Notes

- The CLI supports both human mode and `--json` machine mode; preserve both when adding commands.
- Many commands resolve projects, tasks, and habits by id, exact name, or unique partial match. Keep those ergonomics consistent.
