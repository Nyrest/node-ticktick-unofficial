# ticktick-unofficial

TypeScript client for TickTick's private web API, with the same API shape generally working against Dida365.

Designed for server runtimes only:
- Node 18+
- Bun 1.1+
- Next.js / Nuxt / Elysia / plain server processes

It uses the underlying web endpoints instead of TickTick's public API, so it can reach tasks sync data, habits, focus statistics and operations, private rankings/statistics, and other web-only flows.

## Install

```bash
npm install ticktick-unofficial
```

## Quick Start

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

## Session Handling

The client supports:
- password login
- persistent cookie/session caching
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

## Service Selection

TickTick is the default target. To point the client at Dida365 instead:

```ts
const client = await TickTickClient.create({
  service: "dida365",
  credentials: {
    username: "...",
    password: "...",
  },
});
```

## API Surface

Implemented modules:
- `client.user.getProfile()`
- `client.projects.list()`
- `client.projects.listColumns()`
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
- `client.habits.export()` (server-side rate limited by TickTick)
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
- `client.pomodoros.*` (alias of `client.focus.*`)
- `client.statistics.getRanking()`
- `client.statistics.getUserRanking()`
- `client.statistics.getGeneral()`
- `client.statistics.getGeneralStatistics()`
- `client.statistics.getTaskStatistics()`
- `client.requestJson()` / `client.request()` / `client.requestBuffer()` for raw endpoint access

Note:
- TickTick currently rate limits `/api/v2/data/export/habits` and may return `export_too_many_times`. That affects `client.habits.export()` and raw `client.requestBuffer()` calls made against the same endpoint.

## Development

```bash
npm run build
npm run typecheck
```
