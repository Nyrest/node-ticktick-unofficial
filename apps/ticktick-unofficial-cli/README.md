# ticktick-unofficial-cli

Command-line access to TickTick for both people and scripts.

This CLI is meant to feel comfortable in normal terminal use while still being reliable for automation. You can browse your account, update tasks, start focus sessions, and switch to JSON output when another tool needs to consume the result.

## What It Is Good For

- quick daily task management from the terminal
- shell scripts and local automation
- AI agent workflows that need structured output
- working with TickTick without opening the web app

## Quick Start

Install dependencies from the repo root:

```bash
bun install
```

Run the CLI in development:

```bash
bun run --cwd apps/ticktick-unofficial-cli start -- help
```

If you change the shared library, rebuild it first:

```bash
bun run --cwd packages/node-ticktick-unofficial build
```

## Signing In

You can authenticate interactively:

```bash
bun run src/cli.ts -- login
```

Or use environment variables:

```bash
export TICKTICK_USERNAME="you@example.com"
export TICKTICK_PASSWORD="your-password"
```

Optional auth-related settings:

- `TICKTICK_SERVICE` to switch between `ticktick` and `dida365`
- `TICKTICK_SESSION_PATH` to override the default persisted session location

By default, CLI config is stored with `@crustjs/store` under the platform config directory, and the saved TickTick session is stored with `@crustjs/store` under the platform state directory. If you set `TICKTICK_SESSION_PATH` or pass `--session`, the CLI uses that explicit file path instead.

Useful account commands:

```bash
ticktick-unofficial-cli login
ticktick-unofficial-cli logout
ticktick-unofficial-cli whoami
```

## Everyday Examples

Projects:

```bash
ticktick-unofficial-cli project list
ticktick-unofficial-cli project show inbox
ticktick-unofficial-cli project add "Reading List"
```

Tasks:

```bash
ticktick-unofficial-cli task list --project inbox
ticktick-unofficial-cli task add "Write release notes" --project Work
ticktick-unofficial-cli task pin "Write release notes"
ticktick-unofficial-cli task complete "Write release notes"
```

Tags:

```bash
ticktick-unofficial-cli tag list
ticktick-unofficial-cli tag add Important
ticktick-unofficial-cli tag rename Important Critical
```

Countdowns:

```bash
ticktick-unofficial-cli countdown list
ticktick-unofficial-cli countdown add "Exam" --date 2026-03-30 --type countdown
```

Calendars:

```bash
ticktick-unofficial-cli calendar accounts
ticktick-unofficial-cli calendar events --json
ticktick-unofficial-cli calendar archived-events
```

Focus:

```bash
ticktick-unofficial-cli focus status
ticktick-unofficial-cli focus start --duration 25
ticktick-unofficial-cli focus finish
```

Habits and stats:

```bash
ticktick-unofficial-cli habit list
ticktick-unofficial-cli habit export habits.xlsx
ticktick-unofficial-cli statistics --from 2026-03-01 --to 2026-03-31
```

## JSON Output

Add `--json` when you want stable machine-readable output:

```bash
ticktick-unofficial-cli task list --json
ticktick-unofficial-cli project add "Agent Project" --json
ticktick-unofficial-cli focus status --json
```

This is especially useful for:

- scripts
- CI jobs
- local automations
- AI agents

## Agent Skill

The CLI can install an agent skill generated from its Crust command definitions:

```bash
ticktick-unofficial-cli skill
```

Update already-installed skills without changing selection:

```bash
ticktick-unofficial-cli skill update
```

The generated skill documents the current command tree for AI coding assistants. Use `--json` in agent workflows when another tool needs stable structured output.

## How It Behaves

- normal mode prints readable tables and summaries
- `--json` prints structured output
- many commands accept an ID, exact name, or unique partial match
- mistyped subcommands get "Did you mean?" suggestions
- destructive operations ask for confirmation unless you pass `-y`

When `focus start` runs in an interactive terminal without `--detach`, it opens a live focus view. The main keys are:

- `space` or `p` to pause or resume
- `f` to finish
- `s` or `x` to stop
- `q` to leave the live view without stopping the session

## Development

Typecheck:

```bash
bun run --cwd apps/ticktick-unofficial-cli typecheck
```

Build:

```bash
bun run --cwd apps/ticktick-unofficial-cli build
```

Compile a standalone executable:

```bash
bun run --cwd apps/ticktick-unofficial-cli compile
```

There is also a live verifier for real-account testing:

```bash
bun run --cwd apps/ticktick-unofficial-cli verify:live
```

Use that only when you explicitly want to exercise a real TickTick account.

## Notes

- This CLI depends on the local `node-ticktick-unofficial` workspace package.
- It uses private TickTick web endpoints through that shared library.
- Do not commit local session files, debug dumps, or credentials.
