import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { TickTickClient, createFileSessionStore } from "../dist/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..");
const sessionPath = resolve(rootDir, ".cache", "integration-session.json");

function loadCredentials() {
  if (process.env.TICKTICK_USERNAME && process.env.TICKTICK_PASSWORD) {
    return {
      username: process.env.TICKTICK_USERNAME,
      password: process.env.TICKTICK_PASSWORD,
    };
  }

  const candidate = resolve(rootDir, "..", "ticktick-test-account.txt");
  if (!existsSync(candidate)) {
    return null;
  }

  const raw = readFileSync(candidate, "utf8");
  const username = raw.match(/Email\(username\):\s*(.+)/)?.[1]?.trim();
  const password = raw.match(/Password:\s*(.+)/)?.[1]?.trim();

  if (!username || !password) {
    return null;
  }

  return { username, password };
}

function toApiDay(value) {
  const date = value instanceof Date ? value : new Date(value);
  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${date.getUTCDate()}`.padStart(2, "0");
  return `${year}${month}${day}`;
}

async function main() {
  const credentials = loadCredentials();
  if (!credentials) {
    throw new Error("Missing TickTick credentials. Set TICKTICK_USERNAME and TICKTICK_PASSWORD.");
  }

  const client = await TickTickClient.create({
    credentials,
    sessionStore: createFileSessionStore(sessionPath),
  });

  if (!(await client.validateSession())) {
    await client.login();
  }

  await client.keepAlive();

  const profile = await client.user.getProfile();
  const projects = await client.projects.list();
  const columns = await client.projects.listColumns(projects[0]?.id);
  const taskSync = await client.tasks.getAll();
  const completed = await client.tasks.listCompleted();
  const trash = await client.tasks.listTrash();
  const habits = await client.habits.list();
  const habitStats = await client.habits.getWeekCurrentStatistics();
  const habitsExport = await client.habits.export();
  const focusOverview = await client.focus.getOverview();
  const focusTimeline = await client.focus.getTimeline();
  const focusCurrent = await client.focus.syncCurrentState();
  const ranking = await client.statistics.getRanking();
  const generalStats = await client.statistics.getGeneral();
  const endDate = toApiDay(new Date());
  const startDate = toApiDay(Date.now() - 6 * 24 * 60 * 60 * 1000);
  const taskStatistics = await client.statistics.getTaskStatistics(startDate, endDate);
  const focusDistribution = await client.pomodoros.getDistribution(startDate, endDate);
  const focusHeatmap = await client.pomodoros.getHeatmap(startDate, endDate);
  const focusTimeDistribution = await client.pomodoros.getTimeDistribution(startDate, endDate);
  const focusHourDistribution = await client.pomodoros.getHourDistribution(startDate, endDate);
  const habitCheckins =
    habits.length > 0
      ? await client.habits.queryCheckins({
          habitIds: [habits[0].id],
          afterStamp: Number(startDate),
        })
      : null;

  const projectId = profile.inboxId ?? projects[0]?.id;
  if (!projectId) {
    throw new Error("Could not infer a writable project id for mutation checks.");
  }

  const createdTask = await client.tasks.create({
    projectId,
    title: "ticktick-unofficial integration task",
    content: "Created by the integration smoke test",
    kind: "TEXT",
  });

  const createdTaskId = createdTask.id;
  if (!createdTaskId) {
    throw new Error(`Task creation failed: ${JSON.stringify(createdTask)}`);
  }

  const updatedTask = await client.tasks.update({
    ...createdTask,
    title: "ticktick-unofficial integration task updated",
    content: "Updated by the integration smoke test",
  });
  const completedTask = await client.tasks.setStatus({
    id: createdTaskId,
    status: "completed",
  });
  const reopenedTask = await client.tasks.setStatus({
    id: createdTaskId,
    status: "open",
  });
  const deletedTask = await client.tasks.delete(createdTaskId);

  const startedFocus = await client.focus.start({
    duration: 25,
    autoPomoLeft: 5,
    pomoCount: 1,
  });
  const stoppedFocus = await client.focus.stop();

  console.log(
    JSON.stringify(
      {
        profile: {
          username: profile.username,
          userId: profile.userId,
        },
        projects: projects.length,
        columns: columns.length,
        tasks: taskSync.syncTaskBean?.update?.length ?? 0,
        completed: completed.length,
        trash: trash.tasks.length,
        habits: habits.length,
        habitStatsDays: Object.keys(habitStats).length,
        habitsExportBytes: habitsExport.byteLength,
        habitCheckinValidation: habitCheckins
          ? {
              habitIds: Object.keys(habitCheckins.checkins),
              firstHabitCheckins: Object.values(habitCheckins.checkins)[0]?.length ?? 0,
            }
          : {
              skipped: true,
              reason: "No habits exist on the test account, so habit checkin query/mutation was not exercised.",
            },
        focusOverview,
        focusTimeline: focusTimeline.length,
        focusCurrent: {
          point: focusCurrent.point,
          hasCurrent: Boolean(focusCurrent.current),
          updates: Array.isArray(focusCurrent.updates) ? focusCurrent.updates.length : null,
        },
        focusStatisticsValidation: {
          distributionKeys: Object.keys(focusDistribution),
          heatmapDays: focusHeatmap.length,
          timeDistributionBuckets: focusTimeDistribution.length,
          hourDistribution: Array.isArray(focusHourDistribution)
            ? {
                kind: "array",
                buckets: focusHourDistribution.length,
              }
            : {
                kind: typeof focusHourDistribution,
                keys: Object.keys(focusHourDistribution),
              },
        },
        ranking,
        generalStats,
        taskStatisticsDays: taskStatistics.length,
        taskMutation: {
          createdTaskId,
          updatedTitle: updatedTask.title,
          completedStatus: completedTask.status,
          reopenedStatus: reopenedTask.status,
          deletedFlag: deletedTask.deleted,
        },
        focusMutation: {
          startedPoint: startedFocus.point,
          startedCurrentId: startedFocus.current?.id,
          stoppedPoint: stoppedFocus.point,
          stoppedStatus: stoppedFocus.current?.status,
          stoppedExited: stoppedFocus.current?.exited,
        },
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
