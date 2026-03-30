# TickTick Unofficial Monorepo

Unofficial TickTick tooling built as a Bun workspace monorepo.

The main deliverable is the `ticktick-unofficial` TypeScript library: a server-side client for TickTick's private web APIs, with the same API shape generally working against Dida365. The repository also includes two companion apps built on top of that library:

- `ticktick-unofficial-cli`: a Bun CLI for terminal and automation use
- `ticktick-unofficial-api`: a Bun + Elysia HTTP API server

## Repository Layout

```text
.
├─ packages/
│  └─ ticktick-unofficial/      # Core TypeScript client library
└─ apps/
   ├─ ticktick-unofficial-cli/  # CLI built on the library
   └─ ticktick-unofficial-api/  # HTTP API built on the library
```

## Why This Exists

TickTick's public API does not expose the full set of features available in the web app. This project uses the private web endpoints instead, which makes it possible to work with richer task sync payloads, countdowns and anniversaries, habits, focus statistics and controls, ranking and general statistics, and other web-only flows.

The library is intended for server-side use only:

- Node.js 18+
- Bun 1.3+
- server frameworks such as Next.js, Nuxt, Elysia, or plain server scripts

## Quick Start

Install workspace dependencies from the repo root:

```bash
bun install
```

Validate the whole monorepo:

```bash
bun run typecheck
bun run build
```

## The Main Package: `ticktick-unofficial`

`packages/ticktick-unofficial` is the core of the repo. If you only want to integrate TickTick into your own backend, this is usually the package you want.

### Library Highlights

- TypeScript-first, server-side client
- Works with TickTick and Dida365
- Supports password login plus persisted session reuse
- Handles restored-session validation and relogin flows
- Exposes both high-level modules and lower-level raw request access
- Designed to be embedded inside apps, servers, automations, and agents

### Library Quick Start

```ts
import { TickTickClient, createFileSessionStore } from "ticktick-unofficial";

const client = await TickTickClient.create({
  credentials: {
    username: process.env.TICKTICK_USERNAME!,
    password: process.env.TICKTICK_PASSWORD!,
  },
  sessionStore: createFileSessionStore(".ticktick/session.json"),
});

const profile = await client.user.getProfile();
const tasks = await client.tasks.list();

console.log(profile.username, tasks.length);
```

### Session Handling

The library supports:

- password login
- persistent cookie and session caching
- restored-session validation on first use
- transparent relogin when a stored session is invalid and credentials are available
- cookie keepalive via `client.keepAlive()`

Example:

```ts
await client.keepAlive();

if (!(await client.validateSession())) {
  await client.login();
}
```

### Dida365 Support

TickTick is the default target. To use Dida365 instead:

```ts
const client = await TickTickClient.create({
  service: "dida365",
  credentials: {
    username: "...",
    password: "...",
  },
});
```

### Library Capabilities

Current high-level capabilities include:

- User profile lookup
- Project listing and column inspection
- Full task sync access
- Countdown listing, lookup, batch write, creation, updates, and deletion
- Task listing, lookup, creation, updates, status transitions, deletion, and trash access
- Completed-task iteration and pagination support
- Habit listing, statistics, export, and check-in operations
- Focus and pomodoro state sync plus start, pause, resume, finish, and stop controls
- General statistics, task statistics, and ranking access
- Raw endpoint access through `requestJson()`, `request()`, and `requestBuffer()`

### Implemented Library Surface

- `client.user.getProfile()`
- `client.projects.list()`
- `client.projects.listColumns()`
- `client.countdowns.list()`
- `client.countdowns.getById()`
- `client.countdowns.batch()`
- `client.countdowns.create()`
- `client.countdowns.update()`
- `client.countdowns.delete()`
- `client.tasks.getAll()`
- `client.tasks.list()`
- `client.tasks.getById()`
- `client.tasks.listCompleted()`
- `client.tasks.iterateCompleted()`
- `client.tasks.listTrash()`
- `client.tasks.batch()`
- `client.tasks.create()`
- `client.tasks.update()`
- `client.tasks.setStatus()`
- `client.tasks.delete()`
- `client.habits.list()`
- `client.habits.getHabits()`
- `client.habits.getWeekCurrentStatistics()`
- `client.habits.queryCheckins()`
- `client.habits.batchCheckins()`
- `client.habits.upsertCheckin()`
- `client.habits.export()`
- `client.focus.getOverview()`
- `client.focus.getGeneralForDesktop()`
- `client.focus.getTimeline()`
- `client.focus.getDistribution()`
- `client.focus.getHeatmap()`
- `client.focus.getTimeDistribution()`
- `client.focus.getHourDistribution()`
- `client.focus.syncCurrentState()`
- `client.focus.getCurrentState()`
- `client.focus.start()`
- `client.focus.pause()`
- `client.focus.resume()`
- `client.focus.finish()`
- `client.focus.stop()`
- `client.pomodoros.*`
- `client.statistics.getRanking()`
- `client.statistics.getUserRanking()`
- `client.statistics.getGeneral()`
- `client.statistics.getGeneralStatistics()`
- `client.statistics.getTaskStatistics()`
- `client.requestJson()`
- `client.request()`
- `client.requestBuffer()`

### Notes and Constraints

- This project depends on private web endpoints, not TickTick's official public API.
- The habits export endpoint is upstream rate-limited by TickTick and may return `export_too_many_times`.
- The package is server-oriented and should not be treated as a browser SDK.

## Companion App: `ticktick-unofficial-cli`

`apps/ticktick-unofficial-cli` is a human-friendly and automation-friendly Bun CLI built on the library.

### CLI Highlights

- interactive terminal workflows
- stable JSON output for scripts and agents
- project, task, countdown, habit, focus, and statistics commands
- account login/logout helpers
- fuzzy resolution of projects, tasks, and habits by id, exact name, or unique partial match

### CLI Capabilities

The CLI can:

- authenticate with TickTick or Dida365
- persist and reuse local sessions
- inspect account identity with `whoami`
- list, show, create, rename, edit, and remove projects
- list, show, create, update, and remove countdowns
- list, show, create, edit, move, complete, abandon, reopen, and remove tasks
- inspect and control focus sessions
- read general and ranking statistics
- list, create, export, check in, and remove habits
- emit machine-readable JSON with `--json`

### Example CLI Commands

```bash
ticktick-unofficial-cli login
ticktick-unofficial-cli whoami
ticktick-unofficial-cli countdown list
ticktick-unofficial-cli countdown add "Exam" --date 2026-03-30 --type countdown
ticktick-unofficial-cli project list
ticktick-unofficial-cli task list --project inbox --limit 20
ticktick-unofficial-cli task add "Write release notes" --project Work --priority high
ticktick-unofficial-cli focus start --duration 25
ticktick-unofficial-cli statistics --from 2026-03-01 --to 2026-03-31
ticktick-unofficial-cli habit export habits.xlsx
```

### CLI Development Commands

```bash
bun run --cwd apps/ticktick-unofficial-cli typecheck
bun run --cwd apps/ticktick-unofficial-cli build
bun run --cwd apps/ticktick-unofficial-cli compile
```

## Companion App: `ticktick-unofficial-api`

`apps/ticktick-unofficial-api` is a single-user HTTP API built with Bun and Elysia on top of the same library.

### API Highlights

- typed Elysia routes
- OpenAPI JSON output by default
- optional Swagger UI
- optional bearer auth for `/api/*`
- session caching and scheduled keepalive or relogin
- deployment targets for Bun, Docker, Vercel, and Cloudflare Worker

### API Capabilities

The API server can:

- log into TickTick from environment credentials
- expose health, metadata, and session-maintenance endpoints
- expose project, task, countdown, habit, focus, and statistics endpoints over HTTP
- refresh sessions on demand or on a schedule
- serve OpenAPI docs for the implemented HTTP surface
- run with file-backed or memory-backed session storage depending on runtime

### Example API Endpoints

System:

- `GET /`
- `GET /health`
- `GET /api/session`
- `POST /api/session/refresh`
- `POST /internal/cron/session-refresh`

Domain endpoints:

- `GET /api/user/profile`
- `GET /api/projects`
- `GET /api/countdowns`
- `GET /api/tasks`
- `GET /api/habits`
- `GET /api/focus/state`
- `GET /api/statistics/general`

### API Development Commands

```bash
bun run --cwd apps/ticktick-unofficial-api dev
bun run --cwd apps/ticktick-unofficial-api typecheck
bun run --cwd apps/ticktick-unofficial-api build
```

### Environment Basics

Minimum local configuration:

```dotenv
TICKTICK_USERNAME=your-account@example.com
TICKTICK_PASSWORD=your-password
```

Optional features include:

- `API_AUTH_MODE=bearer`
- `API_AUTH_TOKEN=...`
- `SWAGGER_ENABLED=true`
- `CRON_DRIVER=elysia|bun|vercel|cloudflare`

## Monorepo Workflow

The repo uses Bun workspaces.

Root commands:

```bash
bun install
bun run typecheck
bun run build
```

Selective builds:

```bash
bun run build:client
bun run build:cli
bun run build:api
```

You can also run workspace-local scripts with `bun run --cwd`.

## Development Notes

- Edit source files under `src/`; do not edit generated `dist/` output.
- The library is the shared contract between the CLI and API. If library APIs change, revalidate both apps.
- The root repo is the canonical git boundary for the monorepo.
- Agent instructions are documented in root and workspace-local `AGENTS.md` files.

## Security Notes

- Do not commit `.env`, session caches, debug session files, or account exports.
- The API is intentionally single-user and expects credentials from environment variables.
- The CLI live verification flow touches a real account and should be used carefully.
- Because this project uses private web endpoints, upstream behavior can change without notice.

## More Documentation

- Library docs: `packages/ticktick-unofficial/README.md`
- CLI docs: `apps/ticktick-unofficial-cli/README.md`
- API docs: `apps/ticktick-unofficial-api/README.md`
