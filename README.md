# TickTick Unofficial API
<p align="center">
  <img src="assets/logo.webp" alt="TickTick Unofficial Logo" width="320" />
</p>
Unofficial tooling for working with TickTick beyond the limits of the public API.

This repo is for people who want to read, update, and automate their TickTick account with the same private web endpoints the web app uses. It includes:

- a reusable client library for your own backend or automation scripts
- a CLI for day-to-day terminal use
- a single-user HTTP API if you want to expose your account through your own service

## Supported Modules

The shared `ticktick-unofficial` library currently exposes these supported modules:

| Module | What it covers | Typical use |
| --- | --- | --- |
| `client.user` | Account profile data | Identify the current account and inspect profile details |
| `client.projects` | Projects and columns | List projects, inspect structure, and work with project metadata |
| `client.tasks` | Tasks and task sync data | Read, create, update, move, complete, reopen, and delete tasks |
| `client.countdowns` | Countdowns and anniversaries | List, create, update, and remove countdown-style items |
| `client.habits` | Habits, check-ins, and exports | Read habit data, record check-ins, and export habit information |
| `client.focus` | Focus session state and history | Start, pause, resume, finish, stop, and inspect focus sessions |
| `client.pomodoros` | Alias for focus controls | Use the same focus functionality with pomodoro-oriented naming |
| `client.statistics` | General and ranking statistics | Read account-level stats, rankings, and task-related statistics |
| `client.requestJson()` / `client.request()` / `client.requestBuffer()` | Raw endpoint access | Reach lower-level private endpoints when the higher-level modules are not enough |

TickTick is the default target. Dida365 is supported with the same overall shape.

## Pick The Right Package

### `packages/ticktick-unofficial`

Use this if you want to build your own integration, backend route, cron job, or agent workflow.

Good fit for:

- custom automations
- personal dashboards
- internal tools
- server-side scripts

### `apps/ticktick-unofficial-cli`

Use this if you want to manage TickTick from a terminal with readable output or JSON for scripts.

Good fit for:

- quick daily operations
- shell scripts
- AI agents
- local automation

### `apps/ticktick-unofficial-api`

Use this if you want a simple HTTP layer on top of one TickTick account.

Good fit for:

- self-hosted personal API access
- connecting other tools over HTTP
- exposing OpenAPI docs for your own workflows

## Quick Start

Install dependencies from the repo root:

```bash
bun install
```

Validate the monorepo:

```bash
bun run typecheck
bun run build
```

## Typical Ways To Use It

Use the library in your own server code:

```ts
import { TickTickClient, createFileSessionStore } from "ticktick-unofficial";

const client = await TickTickClient.create({
  credentials: {
    username: process.env.TICKTICK_USERNAME!,
    password: process.env.TICKTICK_PASSWORD!,
  },
  sessionStore: createFileSessionStore(".ticktick/session.json"),
});

const tasks = await client.tasks.list();
console.log(tasks.length);
```

Use the CLI for everyday actions:

```bash
ticktick-unofficial-cli whoami
ticktick-unofficial-cli task list --project inbox
ticktick-unofficial-cli task add "Write release notes" --project Work
ticktick-unofficial-cli focus start --duration 25
```

Run the API locally:

```dotenv
TICKTICK_USERNAME=your-account@example.com
TICKTICK_PASSWORD=your-password
```

```bash
bun run --cwd apps/ticktick-unofficial-api dev
```

## Monorepo Layout

```text
.
├─ packages/
│  └─ ticktick-unofficial/
└─ apps/
   ├─ ticktick-unofficial-cli/
   └─ ticktick-unofficial-api/
```

## Workspace Commands

Root commands:

```bash
bun run typecheck
bun run build
```

Targeted builds:

```bash
bun run build:client
bun run build:cli
bun run build:api
```

Workspace-local validation:

```bash
bun run --cwd packages/ticktick-unofficial typecheck
bun run --cwd apps/ticktick-unofficial-cli typecheck
bun run --cwd apps/ticktick-unofficial-api typecheck
```

## Important Notes

- This project uses private web endpoints, not TickTick's official public API.
- Upstream changes can break behavior without warning.
- The library is intended for server-side use, not browser use.

## More Detail

- Library docs: `packages/ticktick-unofficial/README.md`
- CLI docs: `apps/ticktick-unofficial-cli/README.md`
- API docs: `apps/ticktick-unofficial-api/README.md`
