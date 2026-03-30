# ticktick-unofficial-cli

Human-friendly and automation-friendly TickTick CLI built with [Bun](https://bun.com), [Crust](https://crustjs.com/docs/quick-start), and the local `ticktick-unofficial` client.

It uses `src/` as the source root and supports both interactive terminal use and clean JSON output for scripts and AI agents.

## Install

From the repo root:

```bash
bun install
```

If you changed the local `ticktick-unofficial` package, rebuild it first:

```bash
bun run --cwd packages/ticktick-unofficial build
```

## Run

Development:

```bash
bun run --cwd apps/ticktick-unofficial-cli src/cli.ts -- help
```

Via package script:

```bash
bun run --cwd apps/ticktick-unofficial-cli start -- help
```

If you install/link the package as a CLI binary:

```bash
ticktick-unofficial-cli help
```

## Authentication

You can authenticate in two ways.

Interactive login:

```bash
bun run src/cli.ts -- login
```

Environment variables:

```bash
export TICKTICK_USERNAME="you@example.com"
export TICKTICK_PASSWORD="your-password"
```

Supported auth-related environment variables:

- `TICKTICK_USERNAME`
- `TICKTICK_PASSWORD`
- `TICKTICK_SERVICE` with `ticktick` or `dida365`
- `TICKTICK_SESSION_PATH` to override the saved session file

Useful account commands:

```bash
ticktick-unofficial-cli login
ticktick-unofficial-cli logout
ticktick-unofficial-cli whoami
```

## Design Notes

- Human mode prints formatted tables and readable summaries.
- Agent mode uses `--json` for stable machine-readable output.
- Most commands accept either a full ID, an exact name/title, or a unique partial match.
- Destructive commands require confirmation unless you pass `-y`.

## Global Flags

These flags work across the CLI:

- `-j`, `--json`
- `--color`, `--no-color`
- `--service <ticktick|dida365>`
- `--session <path>`
- `--timezone <iana-tz>`
- `-V`, `--verbose`
- `-v`, `--version`

## Commands

### Account

```bash
ticktick-unofficial-cli login
ticktick-unofficial-cli logout
ticktick-unofficial-cli whoami
ticktick-unofficial-cli help
ticktick-unofficial-cli help task
```

### Projects

```bash
ticktick-unofficial-cli project list
ticktick-unofficial-cli project list --search work
ticktick-unofficial-cli project show inbox
ticktick-unofficial-cli project columns inbox
ticktick-unofficial-cli project add "Reading List" --color "#4F86F7"
ticktick-unofficial-cli project rename "Reading List" "Books"
ticktick-unofficial-cli project edit color Books "#2E7D32"
ticktick-unofficial-cli project edit view Books kanban
ticktick-unofficial-cli project remove -y Books
ticktick-unofficial-cli project rm -y 69c804078f0823c509d537b4
```

### Tasks

```bash
ticktick-unofficial-cli task list
ticktick-unofficial-cli task ls --project inbox --limit 20
ticktick-unofficial-cli task list --all --search report
ticktick-unofficial-cli task show "Weekly review"
ticktick-unofficial-cli task add "Write release notes" --project Work --priority high --due "2026-03-31 18:00"
ticktick-unofficial-cli task edit due "Write release notes" "2026-04-01 09:00"
ticktick-unofficial-cli task edit priority "Write release notes" medium
ticktick-unofficial-cli task move "Write release notes" --project Inbox
ticktick-unofficial-cli task complete "Write release notes"
ticktick-unofficial-cli task reopen 69c804788c81d3c48d928dff
ticktick-unofficial-cli task remove -y "Write release notes"
ticktick-unofficial-cli task rm -y 69c804788c81d3c48d928dff
```

### Countdowns

```bash
ticktick-unofficial-cli countdown list
ticktick-unofficial-cli countdown show "Weekend"
ticktick-unofficial-cli countdown add "Exam" --date 2026-03-30 --type countdown
ticktick-unofficial-cli countdown update "Exam" --style fullscreen_image --remark "Bring pens"
ticktick-unofficial-cli countdown delete -y "Exam"
```

### Focus

```bash
ticktick-unofficial-cli focus status
ticktick-unofficial-cli focus timeline --limit 10
ticktick-unofficial-cli focus start --task "Deep work" --duration 50
ticktick-unofficial-cli focus start --duration 25 --detach
ticktick-unofficial-cli focus pause
ticktick-unofficial-cli focus resume
ticktick-unofficial-cli focus finish
ticktick-unofficial-cli focus stop
```

When `focus start` runs in a real terminal without `--detach`, it enters a live focus view with these keys:

- `space` or `p`: pause/resume
- `f`: finish
- `s` or `x`: stop
- `q`: leave the live view without stopping the session

### Statistics

```bash
ticktick-unofficial-cli statistics
ticktick-unofficial-cli statistics --from 2026-03-01 --to 2026-03-31
```

### Habits

```bash
ticktick-unofficial-cli habit list
ticktick-unofficial-cli habit list --search exercise
ticktick-unofficial-cli habit export
ticktick-unofficial-cli habit export habits.xlsx
```

## JSON Output for Agents

All major commands can return structured JSON:

```bash
ticktick-unofficial-cli task list --json
ticktick-unofficial-cli project add "Agent Project" --json
ticktick-unofficial-cli focus status --json
```

This is intended for:

- shell scripts
- CI jobs
- AI agents
- automation tools that need stable structured output

## Development

Typecheck:

```bash
bun run --cwd apps/ticktick-unofficial-cli typecheck
```

Bundle a Bun-targeted JS artifact:

```bash
bun run --cwd apps/ticktick-unofficial-cli build
```

Compile a standalone executable:

```bash
bun run --cwd apps/ticktick-unofficial-cli compile
```

Run the live end-to-end verifier against a real TickTick account:

```bash
bun run --cwd apps/ticktick-unofficial-cli verify:live
```

The CLI entrypoint is:

```text
src/cli.ts
```

Core helpers live in:

```text
src/lib/app.ts
src/lib/output.ts
src/lib/focus-mode.ts
```
