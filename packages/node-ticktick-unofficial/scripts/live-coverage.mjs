import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { TickTickClient, createFileSessionStore } from "../dist/index.js";
import { toApiDateTime, toDateStamp } from "../dist/internal/dates.js";
import { createObjectId } from "../dist/internal/ids.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..");
const cacheDir = resolve(rootDir, ".cache");
const sessionPath = resolve(cacheDir, "integration-session.json");
const reportPath = resolve(cacheDir, "live-coverage-report.json");

mkdirSync(cacheDir, { recursive: true });

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

function toApiDate(value) {
  return new Date(value).toISOString().replace(".000Z", "+0000");
}

function summarizeError(error) {
  if (!error) return { message: "Unknown error" };
  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
    details: error.details,
  };
}

function summarizeTask(task) {
  if (!task) return null;
  return {
    id: task.id,
    projectId: task.projectId,
    title: task.title,
    content: task.content,
    priority: task.priority,
    status: task.status,
    tags: task.tags,
    startDate: task.startDate,
    dueDate: task.dueDate,
    deleted: task.deleted,
  };
}

function summarizeHabit(habit) {
  if (!habit) return null;
  return {
    id: habit.id,
    name: habit.name,
    color: habit.color,
    iconRes: habit.iconRes,
    goal: habit.goal,
    unit: habit.unit,
    sortOrder: habit.sortOrder,
  };
}

function summarizeProject(project) {
  if (!project) return null;
  return {
    id: project.id,
    name: project.name,
    color: project.color,
    viewMode: project.viewMode,
    sortOrder: project.sortOrder,
  };
}

function buildHabitBatchAddInput(name, overrides = {}) {
  const now = new Date();
  return {
    color: "",
    iconRes: "",
    createdTime: toApiDateTime(now),
    encouragement: "",
    etag: "",
    goal: 1,
    id: createObjectId(now),
    modifiedTime: toApiDateTime(now),
    name,
    recordEnable: true,
    reminders: [],
    repeatRule: "RRULE:FREQ=DAILY;INTERVAL=1",
    sortOrder: 0,
    status: 0,
    step: 1,
    totalCheckIns: 0,
    type: "number",
    unit: "times",
    sectionId: "-1",
    targetDays: 0,
    targetStartDate: toDateStamp(now),
    completedCycles: 0,
    currentStreak: 0,
    style: 1,
    exDates: [],
    archivedTime: null,
    ...overrides,
  };
}

async function main() {
  const credentials = loadCredentials();
  if (!credentials) {
    throw new Error("Missing TickTick credentials. Set TICKTICK_USERNAME and TICKTICK_PASSWORD.");
  }

  const prefix = `codex-live-${Date.now()}`;
  const report = {
    runStartedAt: new Date().toISOString(),
    prefix,
    coverage: [],
    fixtures: {
      tasks: {},
      projects: {},
      habits: {},
      focus: {},
    },
  };

  const client = await TickTickClient.create({
    credentials,
    sessionStore: createFileSessionStore(sessionPath),
  });

  async function record(name, fn, options = {}) {
    try {
      const value = await fn();
      report.coverage.push({
        name,
        ok: true,
        ...options,
        result:
          typeof options.summarize === "function"
            ? options.summarize(value)
            : value,
      });
      return value;
    } catch (error) {
      report.coverage.push({
        name,
        ok: false,
        ...options,
        error: summarizeError(error),
      });
      if (options.required) {
        throw error;
      }
      return undefined;
    }
  }

  const validateSession = await record("client.validateSession", () => client.validateSession(), { required: true });
  if (!validateSession) {
    await record("client.login", () => client.login(), {
      required: true,
      summarize: (session) => ({
        username: session.username,
        userId: session.login?.userId,
      }),
    });
  }

  await record("client.keepAlive", () => client.keepAlive(), {
    summarize: () => ({ keptAlive: true }),
  });

  const profile = await record("user.getProfile", () => client.user.getProfile(), {
    mode: "read",
    required: true,
    summarize: (value) => ({
      username: value.username,
      userId: value.userId,
      inboxId: value.inboxId,
    }),
  });

  const projects = await record("projects.list", () => client.projects.list(), {
    mode: "read",
    required: true,
    summarize: (value) => ({ count: value.length }),
  });

  const defaultProjectId = profile.inboxId ?? projects[0]?.id;
  if (!defaultProjectId) {
    throw new Error("Could not determine a writable project.");
  }

  await record("projects.listColumns", () => client.projects.listColumns(defaultProjectId), {
    mode: "read",
    summarize: (value) => ({ count: value.length }),
  });

  await record("projects.getById", () => client.projects.getById(defaultProjectId), {
    mode: "read",
    summarize: summarizeProject,
  });

  const projectSingleName = `${prefix} project single`;
  const projectSingleUpdatedName = `${prefix} project single updated`;
  const projectSingleCreate = await record(
    "projects.create",
    () =>
      client.projects.create({
        name: projectSingleName,
        color: "#4772FA",
        viewMode: "kanban",
        sortOrder: 0,
      }),
    { mode: "write", variant: "single", required: true },
  );
  const projectSingleId = Object.keys(projectSingleCreate.id2etag ?? {})[0];
  const projectSingleAfterCreate = await record(
    "projects.getById(single-created)",
    () => client.projects.getById(projectSingleId),
    { mode: "read", summarize: summarizeProject },
  );
  await record(
    "projects.update",
    () =>
      client.projects.update({
        id: projectSingleId,
        name: projectSingleUpdatedName,
        color: "#13A66A",
        viewMode: "timeline",
      }),
    { mode: "write", variant: "single" },
  );
  const projectSingleAfterUpdate = await record(
    "projects.getById(single-updated)",
    () => client.projects.getById(projectSingleId),
    { mode: "read", summarize: summarizeProject },
  );

  const batchProjectAName = `${prefix} project batch A`;
  const batchProjectBName = `${prefix} project batch B`;
  const batchProjectCreate = await record(
    "projects.batch(add)",
    () =>
      client.projects.batch({
        add: [
          { name: batchProjectAName, color: "#D35400", viewMode: "list" },
          { name: batchProjectBName, color: "#8E44AD", viewMode: "kanban" },
        ],
      }),
    { mode: "write", variant: "batch", required: true },
  );
  const batchProjectIds = Object.keys(batchProjectCreate.id2etag ?? {});
  await record(
    "projects.batch(update)",
    () =>
      client.projects.batch({
        update: batchProjectIds.map((id, index) => ({
          id,
          name: `${prefix} project batch ${index + 1} updated`,
          color: index === 0 ? "#D4AC0D" : "#117A65",
          viewMode: index === 0 ? "timeline" : "list",
        })),
      }),
    { mode: "write", variant: "batch" },
  );
  const batchProjectsAfterUpdate = await Promise.all(batchProjectIds.map((id) => client.projects.getById(id)));
  report.fixtures.projects = {
    single: {
      id: projectSingleId,
      createExpected: {
        name: projectSingleName,
        color: "#4772FA",
        viewMode: "kanban",
      },
      updateExpected: {
        name: projectSingleUpdatedName,
        color: "#13A66A",
        viewMode: "timeline",
      },
      actual: {
        afterCreate: summarizeProject(projectSingleAfterCreate),
        afterUpdate: summarizeProject(projectSingleAfterUpdate),
      },
    },
    batch: batchProjectIds.map((id, index) => ({
      id,
      createExpected: {
        name: index === 0 ? batchProjectAName : batchProjectBName,
      },
      updateExpected: {
        name: `${prefix} project batch ${index + 1} updated`,
      },
      actual: summarizeProject(batchProjectsAfterUpdate[index]),
    })),
  };

  const sync = await record("tasks.getAll", () => client.tasks.getAll(), {
    mode: "read",
    summarize: (value) => ({
      checkpoint: value.checkPoint,
      taskCount: value.syncTaskBean?.update?.length ?? 0,
    }),
  });
  await record("tasks.list", () => client.tasks.list(), {
    mode: "read",
    summarize: (value) => ({ count: value.length }),
  });
  await record("tasks.listCompleted", () => client.tasks.listCompleted(), {
    mode: "read",
    summarize: (value) => ({ count: value.length }),
  });
  await record("tasks.iterateCompleted", async () => {
    const iterator = client.tasks.iterateCompleted();
    const first = await iterator.next();
    return {
      yielded: !first.done,
      firstPageCount: first.value?.length ?? 0,
    };
  }, { mode: "read" });
  await record("tasks.listTrash", () => client.tasks.listTrash(), {
    mode: "read",
    summarize: (value) => ({ count: value.tasks.length, next: value.next }),
  });

  const taskSingleDraft = {
    projectId: defaultProjectId,
    title: `${prefix} task single`,
    content: "single create content",
    priority: "high",
    tags: [`${prefix}-alpha`],
    startDate: toApiDate(Date.now() + 60 * 60 * 1000),
    dueDate: toApiDate(Date.now() + 2 * 60 * 60 * 1000),
  };
  const taskSingleCreated = await record("tasks.create", () => client.tasks.create(taskSingleDraft), {
    mode: "write",
    variant: "single",
    required: true,
    summarize: summarizeTask,
  });
  await record("tasks.getById(single)", () => client.tasks.getById(taskSingleCreated.id), {
    mode: "read",
    summarize: summarizeTask,
  });
  const taskSingleUpdatedPayload = {
    ...taskSingleCreated,
    title: `${prefix} task single updated`,
    content: "single updated content",
    priority: 1,
    tags: [`${prefix}-beta`, `${prefix}-gamma`],
  };
  const taskSingleUpdated = await record("tasks.update", () => client.tasks.update(taskSingleUpdatedPayload), {
    mode: "write",
    variant: "single",
    summarize: summarizeTask,
  });
  const taskSingleCompleted = await record(
    "tasks.setStatus(single)",
    () => client.tasks.setStatus({ id: taskSingleCreated.id, status: "completed" }),
    { mode: "write", variant: "single", summarize: summarizeTask },
  );
  const taskSingleReopened = await record(
    "tasks.setStatus(single reopen)",
    () => client.tasks.setStatus({ id: taskSingleCreated.id, status: "open" }),
    { mode: "write", variant: "single", summarize: summarizeTask },
  );

  const taskBatchDrafts = [
    {
      projectId: defaultProjectId,
      title: `${prefix} task batch 1`,
      content: "batch task 1",
      priority: "low",
      tags: [`${prefix}-batch-1`],
    },
    {
      projectId: defaultProjectId,
      title: `${prefix} task batch 2`,
      content: "batch task 2",
      priority: "medium",
      tags: [`${prefix}-batch-2`],
    },
  ];
  const taskBatchCreated = await record("tasks.create(batch)", () => client.tasks.create(taskBatchDrafts), {
    mode: "write",
    variant: "batch",
    required: true,
    summarize: (value) => value.map(summarizeTask),
  });
  const taskBatchUpdatedPayload = taskBatchCreated.map((task, index) => ({
    ...task,
    title: `${prefix} task batch ${index + 1} updated`,
    content: `batch task ${index + 1} updated content`,
    priority: index === 0 ? 5 : 1,
    tags: [`${prefix}-batch-updated-${index + 1}`],
  }));
  const taskBatchUpdated = await record("tasks.update(batch)", () => client.tasks.update(taskBatchUpdatedPayload), {
    mode: "write",
    variant: "batch",
    summarize: (value) => value.map(summarizeTask),
  });
  const taskBatchCompleted = await record(
    "tasks.setStatus(batch)",
    () =>
      client.tasks.setStatus(
        taskBatchCreated.map((task) => ({
          id: task.id,
          status: "completed",
        })),
      ),
    {
      mode: "write",
      variant: "batch",
      summarize: (value) => value.map(summarizeTask),
    },
  );
  await record(
    "tasks.setStatus(batch reopen)",
    () =>
      client.tasks.setStatus(
        taskBatchCreated.map((task) => ({
          id: task.id,
          status: "open",
        })),
      ),
    {
      mode: "write",
      variant: "batch",
      summarize: (value) => value.map(summarizeTask),
    },
  );

  const taskMoveTargetProjectId = batchProjectIds[0];
  const taskMoved = await record(
    "tasks.move",
    () => client.tasks.move(taskSingleCreated.id, taskMoveTargetProjectId),
    { mode: "write", variant: "single", summarize: summarizeTask },
  );
  const taskMoveBack = await record(
    "tasks.moveBetweenProjects",
    () =>
      client.tasks.moveBetweenProjects({
        taskId: taskSingleCreated.id,
        fromProjectId: taskMoved.projectId,
        toProjectId: defaultProjectId,
      }),
    { mode: "write", variant: "batch" },
  );
  await record("tasks.getById(after-move-back)", () => client.tasks.getById(taskSingleCreated.id), {
    mode: "read",
    summarize: summarizeTask,
  });

  const taskBatchDirect = await record(
    "tasks.batch(add/update)",
    async () => {
      const source = sync.inboxId ?? defaultProjectId;
      const created = await client.tasks.create({
        projectId: source,
        title: `${prefix} task direct batch seed`,
        content: "seed",
      });
      await client.tasks.batch({
        update: [
          {
            ...created,
            title: `${prefix} task direct batch updated`,
            content: "updated via direct batch",
            tags: [`${prefix}-direct-batch`],
          },
        ],
      });
      return client.tasks.getById(created.id);
    },
    { mode: "write", variant: "batch", summarize: summarizeTask },
  );

  report.fixtures.tasks = {
    single: {
      id: taskSingleCreated.id,
      createExpected: taskSingleDraft,
      updateExpected: {
        title: taskSingleUpdatedPayload.title,
        content: taskSingleUpdatedPayload.content,
        priority: taskSingleUpdatedPayload.priority,
        tags: taskSingleUpdatedPayload.tags,
      },
      actual: {
        afterCreate: summarizeTask(taskSingleCreated),
        afterUpdate: summarizeTask(taskSingleUpdated),
        afterComplete: summarizeTask(taskSingleCompleted),
        afterReopen: summarizeTask(taskSingleReopened),
      },
    },
    batch: taskBatchUpdated.map((task, index) => ({
      id: task.id,
      updateExpected: {
        title: task.title,
        content: task.content,
        priority: task.priority,
        tags: task.tags,
      },
      actual: summarizeTask(task),
      completedActual: summarizeTask(taskBatchCompleted[index]),
    })),
    directBatch: {
      id: taskBatchDirect?.id,
      expected: summarizeTask(taskBatchDirect),
    },
    move: {
      id: taskSingleCreated.id,
      movedProjectId: taskMoveTargetProjectId,
      moveBackResponse: taskMoveBack,
    },
  };

  const habits = await record("habits.list", () => client.habits.list(), {
    mode: "read",
    summarize: (value) => ({ count: value.length }),
  });
  await record("habits.getHabits", () => client.habits.getHabits(), {
    mode: "read",
    summarize: (value) => ({ count: value.length }),
  });
  await record("habits.getWeekCurrentStatistics", () => client.habits.getWeekCurrentStatistics(), {
    mode: "read",
    summarize: (value) => ({ days: Object.keys(value).length }),
  });
  await record("habits.export", () => client.habits.export(), {
    mode: "read",
    summarize: (value) => ({ bytes: value.byteLength }),
  });
  await record("habits.exportHabits", () => client.habits.exportHabits(), {
    mode: "read",
    summarize: (value) => ({ bytes: value.byteLength }),
  });

  const habitSingleName = `${prefix} habit single`;
  const habitSingleCreate = await record(
    "habits.create",
    () =>
      client.habits.create({
        name: habitSingleName,
        color: "#E74C3C",
        iconRes: "goal",
        goal: 3,
        unit: "cups",
        sortOrder: 0,
      }),
    { mode: "write", variant: "single", required: true },
  );
  const habitSingleId = Object.keys(habitSingleCreate.id2etag ?? {})[0];
  const habitSingleAfterCreate = (await client.habits.list()).find((habit) => habit.id === habitSingleId);
  const habitSingleUpdatedPayload = {
    ...habitSingleAfterCreate,
    name: `${prefix} habit single updated`,
    color: "#1ABC9C",
    goal: 5,
    unit: "glasses",
  };
  await record("habits.update(single)", () => client.habits.update(habitSingleUpdatedPayload), {
    mode: "write",
    variant: "single",
  });
  const habitSingleAfterUpdate = (await client.habits.list()).find((habit) => habit.id === habitSingleId);

  const habitBatchAddResponse = await record(
    "habits.batch(add)",
    () =>
      client.habits.batch({
        add: [
          buildHabitBatchAddInput(`${prefix} habit batch 1`, {
            color: "#3498DB",
            goal: 2,
            unit: "reps",
          }),
          buildHabitBatchAddInput(`${prefix} habit batch 2`, {
            color: "#9B59B6",
            goal: 4,
            unit: "pages",
          }),
        ],
      }),
    { mode: "write", variant: "batch", required: true },
  );
  const habitBatchIds = Object.keys(habitBatchAddResponse.id2etag ?? {});
  const habitListAfterBatchAdd = await client.habits.list();
  const habitBatchEntities = habitBatchIds.map((id) => habitListAfterBatchAdd.find((habit) => habit.id === id));
  await record(
    "habits.update(batch)",
    () =>
      client.habits.update(
        habitBatchEntities.map((habit, index) => ({
          ...habit,
          name: `${prefix} habit batch ${index + 1} updated`,
          color: index === 0 ? "#F1C40F" : "#2ECC71",
          goal: index === 0 ? 6 : 8,
          unit: index === 0 ? "sets" : "minutes",
        })),
      ),
    { mode: "write", variant: "batch" },
  );
  const habitBatchAfterUpdate = await client.habits.list();

  const todayStamp = Number(toApiDay(new Date()));
  await record(
    "habits.queryCheckins",
    () =>
      client.habits.queryCheckins({
        habitIds: [habitSingleId],
        afterStamp: todayStamp - 1,
      }),
    { mode: "read" },
  );
  await record(
    "habits.upsertCheckin",
    () =>
      client.habits.upsertCheckin({
        habitId: habitSingleId,
        goal: habitSingleUpdatedPayload.goal,
        value: habitSingleUpdatedPayload.goal,
      }),
    { mode: "write", variant: "single" },
  );
  const habitCheckinQueryAfterUpsert = await record(
    "habits.queryCheckins(after-upsert)",
    () =>
      client.habits.queryCheckins({
        habitIds: [habitSingleId],
        afterStamp: todayStamp - 1,
      }),
    { mode: "read" },
  );
  const existingCheckin = habitCheckinQueryAfterUpsert.checkins[habitSingleId]?.find(
    (entry) => entry.checkinStamp === todayStamp,
  );
  await record(
    "habits.batchCheckins(update)",
    () =>
      client.habits.batchCheckins({
        add: [],
        update: existingCheckin
          ? [
              {
                ...existingCheckin,
                value: Math.max(1, (existingCheckin.value ?? 1) - 1),
              },
            ]
          : [],
        delete: [],
      }),
    { mode: "write", variant: "batch" },
  );

  report.fixtures.habits = {
    single: {
      id: habitSingleId,
      createExpected: {
        name: habitSingleName,
        color: "#E74C3C",
        goal: 3,
        unit: "cups",
      },
      updateExpected: {
        name: habitSingleUpdatedPayload.name,
        color: habitSingleUpdatedPayload.color,
        goal: habitSingleUpdatedPayload.goal,
        unit: habitSingleUpdatedPayload.unit,
      },
      actual: {
        afterCreate: summarizeHabit(habitSingleAfterCreate),
        afterUpdate: summarizeHabit(habitSingleAfterUpdate),
        checkins: habitCheckinQueryAfterUpsert.checkins[habitSingleId] ?? [],
      },
    },
    batch: habitBatchIds.map((id, index) => ({
      id,
      actual: summarizeHabit(habitBatchAfterUpdate.find((habit) => habit.id === id)),
      updateExpected: {
        name: `${prefix} habit batch ${index + 1} updated`,
      },
    })),
  };

  const startDate = toApiDay(Date.now() - 6 * 24 * 60 * 60 * 1000);
  const endDate = toApiDay(Date.now());
  await record("focus.getOverview", () => client.focus.getOverview(), { mode: "read" });
  await record("focus.getGeneralForDesktop", () => client.focus.getGeneralForDesktop(), { mode: "read" });
  await record("focus.getTimeline", () => client.focus.getTimeline(), {
    mode: "read",
    summarize: (value) => ({ count: value.length }),
  });
  await record("focus.getDistribution", () => client.focus.getDistribution(startDate, endDate), { mode: "read" });
  await record("focus.getHeatmap", () => client.focus.getHeatmap(startDate, endDate), {
    mode: "read",
    summarize: (value) => ({ count: value.length }),
  });
  await record("focus.getTimeDistribution", () => client.focus.getTimeDistribution(startDate, endDate), {
    mode: "read",
    summarize: (value) => ({ count: value.length }),
  });
  await record("focus.getHourDistribution", () => client.focus.getHourDistribution(startDate, endDate), {
    mode: "read",
    summarize: (value) => ({ count: value.length }),
  });
  await record("focus.getState", () => client.focus.getState(), { mode: "read" });
  await record("focus.setLastPoint", async () => {
    client.focus.setLastPoint(0);
    return client.focus.getState();
  }, { mode: "read" });
  await record("focus.resetState", async () => {
    client.focus.resetState();
    return client.focus.getState();
  }, { mode: "read" });
  await record("focus.syncCurrentState", () => client.focus.syncCurrentState(), { mode: "read" });
  await record("focus.getCurrentState", () => client.focus.getCurrentState(), { mode: "read" });
  const focusStarted = await record(
    "focus.start",
    () =>
      client.focus.start({
        duration: 25,
        autoPomoLeft: 5,
        pomoCount: 1,
        manual: true,
        note: `${prefix} focus note`,
        focusOnTitle: `${prefix} focus title`,
      }),
    { mode: "write", variant: "single", required: true },
  );
  const focusPaused = await record("focus.pause", () => client.focus.pause(), {
    mode: "write",
    variant: "single",
    required: true,
  });
  const focusResumed = await record("focus.resume", () => client.focus.resume(), {
    mode: "write",
    variant: "single",
    required: true,
  });
  const focusFinished = await record("focus.finish", () => client.focus.finish(), {
    mode: "write",
    variant: "single",
    required: true,
  });
  const focusRestarted = await record(
    "pomodoros.start(alias)",
    () =>
      client.pomodoros.start({
        duration: 20,
        autoPomoLeft: 0,
        pomoCount: 1,
        manual: true,
        note: `${prefix} alias focus`,
      }),
    { mode: "write", variant: "single", required: true },
  );
  const focusStopped = await record("focus.stop", () => client.focus.stop(), {
    mode: "write",
    variant: "single",
    required: true,
  });
  await record("focus.batch(sync)", () => client.focus.batch({ lastPoint: 0, opList: [] }), {
    mode: "write",
    variant: "batch",
  });

  report.fixtures.focus = {
    expected: {
      note: `${prefix} focus note`,
      title: `${prefix} focus title`,
    },
    actual: {
      started: {
        point: focusStarted.point,
        current: focusStarted.current,
      },
      paused: {
        point: focusPaused.point,
        current: focusPaused.current,
      },
      resumed: {
        point: focusResumed.point,
        current: focusResumed.current,
      },
      finished: {
        point: focusFinished.point,
        current: focusFinished.current,
      },
      aliasStarted: {
        point: focusRestarted.point,
        current: focusRestarted.current,
      },
      stopped: {
        point: focusStopped.point,
        current: focusStopped.current,
      },
    },
  };

  await record("statistics.getRanking", () => client.statistics.getRanking(), { mode: "read" });
  await record("statistics.getUserRanking", () => client.statistics.getUserRanking(), { mode: "read" });
  await record("statistics.getGeneral", () => client.statistics.getGeneral(), { mode: "read" });
  await record("statistics.getGeneralStatistics", () => client.statistics.getGeneralStatistics(), { mode: "read" });
  await record("statistics.getTaskStatistics", () => client.statistics.getTaskStatistics(startDate, endDate), {
    mode: "read",
    summarize: (value) => ({ count: value.length }),
  });

  await record("client.request", () => client.request({ path: "/api/v2/user/profile" }), {
    mode: "read",
    summarize: (response) => ({ status: response.status }),
  });
  await record("client.requestJson", () => client.requestJson({ path: "/api/v2/user/profile" }), {
    mode: "read",
    summarize: (value) => ({ username: value.username, userId: value.userId }),
  });
  await record("client.requestBuffer", () => client.requestBuffer({ path: "/api/v2/data/export/habits" }), {
    mode: "read",
    summarize: (value) => ({ bytes: value.byteLength }),
  });

  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ reportPath, prefix, coverageCount: report.coverage.length }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
