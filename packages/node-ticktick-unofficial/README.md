# node-ticktick-unofficial

Server-side client for TickTick and Dida365 using the same private web endpoints the web app relies on.

This package is for people who want to build their own integration instead of clicking around in the app. It is a good fit for:

- backend services
- cron jobs
- local scripts
- AI agents
- personal dashboards and automation tools

## Why Use It

The public TickTick API does not cover everything available in the web app. This client exists so you can work with richer account data and flows, including:

- tasks and sync payloads
- projects and columns
- countdowns and anniversaries
- habits and check-ins
- focus state and focus history
- general statistics and ranking data

TickTick is the default target. Dida365 is also supported.

## Install

```bash
npm install node-ticktick-unofficial
```

## Quick Start

```ts
import { TickTickClient, createFileSessionStore } from "node-ticktick-unofficial";

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

## API Design

The recommended API is resource-oriented:

```ts
const task = await client.tasks.create({
  title: "Prepare weekly report",
  priority: "high",
});

const sameTask = await client.tasks.get(task.id); // calls GET /api/v2/task/{id}

await client.tasks.update({
  ...sameTask,
  title: "Prepare weekly report draft",
});

await client.tasks.delete(task.id); // { id, deleted: true }
```

Resource modules follow the same shape where the upstream API allows it:

- `list()` returns resource arrays.
- `tasks.get(id)` calls `GET /api/v2/task/{id}`.
- `projects.get(id)` calls `GET /api/v2/project/{id}/tasks` and returns that project's active tasks.
- `create(input)` returns the created resource.
- `update(input)` returns the updated resource input.
- `delete(id)` returns `{ id, deleted: true }`.
- `batch(payload)` is kept for advanced callers who need the raw TickTick batch response.

## Session Handling

The client is designed to be practical for long-running use:

- log in with account credentials
- save session data locally
- restore and validate a saved session later
- re-login automatically when credentials are available and a saved session is stale
- keep a valid session alive with `client.keepAlive()`

Example:

```ts
await client.session.keepAlive();

if (!(await client.session.validate())) {
  await client.session.login();
}
```

The older top-level session methods, such as `client.keepAlive()` and `client.validateSession()`, remain available for compatibility. New code should prefer `client.session`.

## Dida365

Point the client at Dida365 by setting the service:

```ts
const client = await TickTickClient.create({
  service: "dida365",
  credentials: {
    username: "...",
    password: "...",
  },
});
```

## Supported Modules

| Module | What it covers | Typical use |
| --- | --- | --- |
| `client.user` | Account profile data | Read the current user profile |
| `client.projects` | Projects and columns | List projects, inspect columns, and work with project structure |
| `client.tags` | Tags management | List, create, update, rename, merge, and delete tags |
| `client.tasks` | Tasks and task sync data | Read, create, update, move, complete, reopen, pin, and delete tasks |
| `client.countdowns` | Countdowns and anniversaries | Manage countdown-style items and anniversary reminders |
| `client.habits` | Habits, check-ins, and exports | Read habits, query check-ins, update check-ins, and export data |
| `client.focus` | Focus session state and history | Control a running focus session and inspect related history |
| `client.pomodoros` | Alias for focus controls | Use the same focus functionality with pomodoro-oriented naming |
| `client.statistics` | General and ranking statistics | Read account-wide stats, rankings, and task statistics |
| `client.raw.requestJson()` / `client.raw.request()` / `client.raw.requestBuffer()` | Raw endpoint access | Call lower-level endpoints directly when you need something not yet wrapped |

## Raw Endpoint Access

Use `client.raw` when you need an endpoint that is not wrapped yet:

```ts
const payload = await client.raw.requestJson<Record<string, unknown>>({
  path: "/api/v2/unknown-endpoint",
});
```

The older top-level `client.requestJson()`, `client.request()`, and `client.requestBuffer()` methods remain available for compatibility. New code should prefer `client.raw`.

## Notes

- This package uses private web endpoints, not the official public API.
- It is intended for server runtimes, not browser apps.
- TickTick may change upstream behavior without notice.
- Habit exports are rate-limited upstream and may return `export_too_many_times`.

## Development

From this package:

```bash
npm run typecheck
npm run build
```

From the monorepo root:

```bash
bun run --cwd packages/node-ticktick-unofficial typecheck
bun run --cwd packages/node-ticktick-unofficial build
```
