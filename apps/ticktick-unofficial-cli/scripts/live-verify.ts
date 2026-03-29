import { mkdir, readFile, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";

const cliDir = import.meta.dir.endsWith("\\scripts") || import.meta.dir.endsWith("/scripts")
  ? dirname(import.meta.dir)
  : import.meta.dir;
const repoDir = dirname(cliDir);
const defaultAccountFile = join(repoDir, "ticktick-test-account.txt");
const accountFile = process.env.TICKTICK_TEST_ACCOUNT_FILE ?? defaultAccountFile;
const sessionPath = join(cliDir, ".tmp-live-verify-session.json");
const exportPath = join(cliDir, "dist", "ticktick-habits-test.xlsx");
const compileRecordPath = join(cliDir, "dist", "latest-compile-path.txt");
let executablePath = "";

type JsonRecord = Record<string, unknown>;

interface CommandResult {
  exitCode: number;
  stderr: string;
  stdout: string;
}

interface Credentials {
  password: string;
  username: string;
}

const transientErrorPattern = /Unable to connect|ECONNRESET|ETIMEDOUT|fetch failed|network/i;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function readCredentials(filePath: string): Promise<Credentials> {
  const content = await readFile(filePath, "utf8");
  const username = content.match(/Email\(username\):\s*(.+)/)?.[1]?.trim();
  const password = content.match(/Password:\s*(.+)/)?.[1]?.trim();
  assert(username, `Could not read username from ${filePath}`);
  assert(password, `Could not read password from ${filePath}`);
  return { username, password };
}

async function runCommand(command: string[], options: { expectSuccess?: boolean } = {}): Promise<CommandResult> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const proc = Bun.spawn(command, {
      cwd: cliDir,
      env: {
        ...process.env,
        TICKTICK_SESSION_PATH: sessionPath,
        TICKTICK_USERNAME: credentials.username,
        TICKTICK_PASSWORD: credentials.password,
      },
      stderr: "pipe",
      stdout: "pipe",
    });

    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);

    if ((options.expectSuccess ?? true) && exitCode !== 0) {
      const combined = `${stdout}\n${stderr}`;
      if (attempt < 2 && transientErrorPattern.test(combined)) {
        await Bun.sleep(500 * (attempt + 1));
        continue;
      }

      throw new Error(`Command failed: ${command.join(" ")}\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`);
    }

    return { exitCode, stderr, stdout };
  }

  throw new Error(`Command failed after retries: ${command.join(" ")}`);
}

async function runJson(args: string[]): Promise<JsonRecord> {
  const result = await runCommand([executablePath, ...args, "--json"]);
  return JSON.parse(result.stdout) as JsonRecord;
}

async function runText(args: string[], options: { expectSuccess?: boolean } = {}): Promise<string> {
  const result = await runCommand([executablePath, ...args], options);
  return result.stdout;
}

async function waitForJson(
  label: string,
  args: string[],
  predicate: (payload: JsonRecord) => boolean,
  options: { intervalMs?: number; timeoutMs?: number } = {},
): Promise<JsonRecord> {
  const timeoutMs = options.timeoutMs ?? 8000;
  const intervalMs = options.intervalMs ?? 500;
  const startedAt = Date.now();
  let lastPayload: JsonRecord | null = null;

  for (;;) {
    lastPayload = await runJson(args);
    if (predicate(lastPayload)) {
      return lastPayload;
    }

    if (Date.now() - startedAt >= timeoutMs) {
      throw new Error(`Timed out waiting for ${label}.\nLast payload:\n${JSON.stringify(lastPayload, null, 2)}`);
    }

    await Bun.sleep(intervalMs);
  }
}

function parseJsonOutput(value: string, label: string): JsonRecord {
  try {
    return JSON.parse(value) as JsonRecord;
  } catch (error) {
    throw new Error(`Failed to parse ${label} JSON.\n${value}\n${String(error)}`);
  }
}

function expectIncludes(value: string, needle: string, label: string): void {
  assert(value.includes(needle), `${label} is missing "${needle}"`);
}

function expectOk(payload: JsonRecord, label: string): void {
  assert(payload.ok === true, `${label} did not return ok=true`);
}

function asArray<T>(value: unknown, label: string): T[] {
  assert(Array.isArray(value), `${label} is not an array`);
  return value as T[];
}

function asString(value: unknown, label: string): string {
  assert(typeof value === "string" && value.length > 0, `${label} is missing`);
  return value;
}

async function cleanupTask(taskId: string | null): Promise<void> {
  if (!taskId) return;
  await runCommand([executablePath, "task", "rm", "-y", taskId], { expectSuccess: false });
}

async function cleanupProject(projectId: string | null): Promise<void> {
  if (!projectId) return;
  await runCommand([executablePath, "project", "rm", "-y", projectId], { expectSuccess: false });
}

async function cleanupHabit(habitId: string | null): Promise<void> {
  if (!habitId) return;
  await runCommand([executablePath, "habit", "rm", "-y", habitId], { expectSuccess: false });
}

const credentials = await readCredentials(accountFile);

let projectIdPrimary: string | null = null;
let projectIdSecondary: string | null = null;
let taskIdPrimary: string | null = null;
let taskIdSecondary: string | null = null;
let habitIdPrimary: string | null = null;

try {
  await mkdir(join(cliDir, "dist"), { recursive: true });

  await runCommand(["bun", "run", "build"], { expectSuccess: true });
  await runCommand(["bun", "run", "compile"], { expectSuccess: true });
  executablePath = (await readFile(compileRecordPath, "utf8")).trim();
  assert(executablePath.length > 0, "Compiled executable path is missing");

  const rootHelp = await runText(["help"]);
  expectIncludes(rootHelp, "project", "root help");
  expectIncludes(rootHelp, "focus", "root help");

  const taskHelp = await runText(["help", "task"]);
  expectIncludes(taskHelp, "abandon", "task help");
  expectIncludes(taskHelp, "complete", "task help");
  expectIncludes(taskHelp, "reopen", "task help");

  const versionText = await runText(["--version"]);
  expectIncludes(versionText, "0.1.0", "version output");

  const login = await runJson(["login"]);
  expectOk(login, "login");

  const whoami = await runJson(["whoami"]);
  expectOk(whoami, "whoami");
  expectIncludes(asString(whoami.service, "whoami.service"), "ticktick", "whoami service");

  const projectList = await runJson(["project", "list"]);
  expectOk(projectList, "project list");
  asArray(projectList.projects, "project list projects");

  const stamp = `${Date.now()}`;
  const projectNamePrimary = `codex-live-project-${stamp}`;
  const projectNameSecondary = `${projectNamePrimary}-move`;
  const projectNameRenamed = `${projectNamePrimary}-renamed`;
  const taskTitlePrimary = `codex-live-task-${stamp}`;
  const taskTitleSecondary = `${taskTitlePrimary}-remove`;

  const projectAddPrimary = await runJson(["project", "add", projectNamePrimary, "--color", "#4F86F7"]);
  expectOk(projectAddPrimary, "project add primary");
  projectIdPrimary = asString((projectAddPrimary.project as JsonRecord | null)?.id, "project add primary id");

  const projectShow = await runJson(["project", "show", projectIdPrimary]);
  expectOk(projectShow, "project show");

  const projectColumns = await runJson(["project", "columns", projectIdPrimary]);
  expectOk(projectColumns, "project columns");
  asArray(projectColumns.columns, "project columns");

  const projectRename = await runJson(["project", "rename", projectIdPrimary, projectNameRenamed]);
  expectOk(projectRename, "project rename");

  const projectEditColor = await runJson(["project", "edit", "color", projectIdPrimary, "#123456"]);
  expectOk(projectEditColor, "project edit color");

  const projectEditView = await runJson(["project", "edit", "view", projectIdPrimary, "kanban"]);
  expectOk(projectEditView, "project edit view");

  const projectEditClosed = await runJson(["project", "edit", "closed", projectIdPrimary, "true"]);
  expectOk(projectEditClosed, "project edit closed true");

  const projectEditReopen = await runJson(["project", "edit", "closed", projectIdPrimary, "false"]);
  expectOk(projectEditReopen, "project edit closed false");

  const projectAddSecondary = await runJson(["project", "add", projectNameSecondary]);
  expectOk(projectAddSecondary, "project add secondary");
  projectIdSecondary = asString((projectAddSecondary.project as JsonRecord | null)?.id, "project add secondary id");

  const taskListBefore = await runJson(["task", "list", "--limit", "5"]);
  expectOk(taskListBefore, "task list");

  const taskAddPrimary = await runJson([
    "task",
    "add",
    taskTitlePrimary,
    "--project",
    projectIdPrimary,
    "--priority",
    "high",
    "--due",
    "2026-03-31 18:00",
    "--start",
    "2026-03-31 09:00",
    "--tag",
    "codex",
    "--tag",
    "live",
    "--content",
    "CLI live verification body",
    "--desc",
    "CLI live verification description",
  ]);
  expectOk(taskAddPrimary, "task add primary");
  taskIdPrimary = asString((taskAddPrimary.task as JsonRecord | null)?.id, "task add primary id");
  assert(
    ((taskAddPrimary.task as JsonRecord | undefined)?.priority as number | undefined) === 5,
    "task add primary did not map high priority to 5",
  );

  const taskShow = await runJson(["task", "show", taskIdPrimary]);
  expectOk(taskShow, "task show");

  const taskEditContent = await runJson(["task", "edit", "content", taskIdPrimary, "Updated content"]);
  expectOk(taskEditContent, "task edit content");

  const taskEditPriority = await runJson(["task", "edit", "priority", taskIdPrimary, "medium"]);
  expectOk(taskEditPriority, "task edit priority");
  assert(
    ((taskEditPriority.task as JsonRecord | undefined)?.priority as number | undefined) === 3,
    "task edit priority did not map medium priority to 3",
  );

  const taskEditStatusWontDo = await runJson(["task", "edit", "status", taskIdPrimary, "won't do"]);
  expectOk(taskEditStatusWontDo, "task edit status won't do");
  assert(
    ((taskEditStatusWontDo.task as JsonRecord | undefined)?.status as number | undefined) === -1,
    "task edit status won't do did not return status -1",
  );

  const taskListAbandoned = await waitForJson(
    "task list abandoned to include won't-do task",
    ["task", "list", "--completed", "--status", "abandoned", "--limit", "20"],
    (payload) =>
      asArray<JsonRecord>(payload.tasks, "task list abandoned tasks").some((task) => task.id === taskIdPrimary),
  );
  expectOk(taskListAbandoned, "task list abandoned");

  const taskEditStatusCompleted = await runJson(["task", "edit", "status", taskIdPrimary, "completed"]);
  expectOk(taskEditStatusCompleted, "task edit status completed");
  assert(
    ((taskEditStatusCompleted.task as JsonRecord | undefined)?.status as number | undefined) === 2,
    "task edit status completed did not return status 2",
  );

  const taskEditStatusOpen = await runJson(["task", "edit", "status", taskIdPrimary, "open"]);
  expectOk(taskEditStatusOpen, "task edit status open");
  assert(
    ((taskEditStatusOpen.task as JsonRecord | undefined)?.status as number | undefined) === 0,
    "task edit status open did not return status 0",
  );

  const taskEditStatusAbandoned = await runJson(["task", "edit", "status", taskIdPrimary, "abandoned"]);
  expectOk(taskEditStatusAbandoned, "task edit status abandoned");
  assert(
    ((taskEditStatusAbandoned.task as JsonRecord | undefined)?.status as number | undefined) === -1,
    "task edit status abandoned did not return status -1",
  );

  const taskListAbandonedDirect = await waitForJson(
    "task list abandoned to include abandoned task",
    ["task", "list", "--status", "abandoned", "--limit", "20"],
    (payload) =>
      asArray<JsonRecord>(payload.tasks, "task abandoned tasks").some((task) => task.id === taskIdPrimary),
  );
  expectOk(taskListAbandonedDirect, "task list abandoned direct");

  const taskReopenFromAbandoned = await runJson(["task", "reopen", taskIdPrimary]);
  expectOk(taskReopenFromAbandoned, "task reopen from abandoned");

  const taskMove = await runJson(["task", "move", taskIdPrimary, "--project", projectIdSecondary]);
  expectOk(taskMove, "task move");

  const taskLs = await waitForJson(
    "task ls to include moved task",
    ["task", "ls", "--project", projectIdSecondary, "--all", "--limit", "20"],
    (payload) =>
      asArray<JsonRecord>(payload.tasks, "task ls tasks").some((task) => task.id === taskIdPrimary),
  );
  expectOk(taskLs, "task ls");

  const taskAbandon = await runJson(["task", "abandon", taskIdPrimary]);
  expectOk(taskAbandon, "task abandon");

  const taskReopenAfterAbandon = await runJson(["task", "reopen", taskIdPrimary]);
  expectOk(taskReopenAfterAbandon, "task reopen after abandon");

  const taskComplete = await runJson(["task", "complete", taskIdPrimary]);
  expectOk(taskComplete, "task complete");

  const taskListCompleted = await waitForJson(
    "task list completed to include completed task",
    ["task", "list", "--completed", "--limit", "20"],
    (payload) =>
      asArray<JsonRecord>(payload.tasks, "task completed tasks").some((task) => task.id === taskIdPrimary),
  );
  expectOk(taskListCompleted, "task list completed");

  const taskReopen = await runJson(["task", "reopen", taskIdPrimary]);
  expectOk(taskReopen, "task reopen");

  const taskEditProject = await runJson(["task", "edit", "project", taskIdPrimary, projectIdPrimary]);
  expectOk(taskEditProject, "task edit project");

  const taskListPrimary = await waitForJson(
    "task list to include task after task edit project",
    ["task", "list", "--project", projectIdPrimary, "--all", "--limit", "20"],
    (payload) =>
      asArray<JsonRecord>(payload.tasks, "task list primary tasks").some((task) => task.id === taskIdPrimary),
  );
  expectOk(taskListPrimary, "task list primary after edit project");

  const taskAddSecondary = await runJson(["task", "add", taskTitleSecondary, "--project", projectIdSecondary]);
  expectOk(taskAddSecondary, "task add secondary");
  taskIdSecondary = asString((taskAddSecondary.task as JsonRecord | null)?.id, "task add secondary id");

  const taskRemove = await runJson(["task", "remove", "-y", taskIdPrimary]);
  expectOk(taskRemove, "task remove");
  taskIdPrimary = null;

  const taskRm = await runJson(["task", "rm", "-y", taskIdSecondary]);
  expectOk(taskRm, "task rm");
  taskIdSecondary = null;

  const rejectRemove = await runCommand([executablePath, "project", "remove", projectIdSecondary], {
    expectSuccess: false,
  });
  assert(rejectRemove.exitCode !== 0, "project remove without -y should fail in non-interactive mode");
  expectIncludes(rejectRemove.stderr || rejectRemove.stdout, "requires -y", "project remove rejection");

  const focusStatusBefore = await runJson(["focus", "status"]);
  if (focusStatusBefore.status === "running" || focusStatusBefore.status === "paused") {
    await runJson(["focus", "stop"]);
  }

  const focusStartPauseResumeFinishTask = await runJson([
    "task",
    "add",
    `codex-focus-task-${stamp}`,
    "--project",
    projectIdSecondary,
  ]);
  expectOk(focusStartPauseResumeFinishTask, "focus helper task");
  taskIdPrimary = asString((focusStartPauseResumeFinishTask.task as JsonRecord | null)?.id, "focus helper task id");

  const focusStart = await runJson(["focus", "start", "--task", taskIdPrimary, "--duration", "5", "--detach"]);
  expectOk(focusStart, "focus start");

  const focusStatusRunning = await runJson(["focus", "status"]);
  expectIncludes(asString(focusStatusRunning.status, "focus status running"), "running", "focus running status");

  const focusPause = await runJson(["focus", "pause"]);
  expectOk(focusPause, "focus pause");

  const focusResume = await runJson(["focus", "resume"]);
  expectOk(focusResume, "focus resume");

  const focusStop = await runJson(["focus", "stop"]);
  expectOk(focusStop, "focus stop");

  const focusStartSecond = await runJson(["focus", "start", "--task", taskIdPrimary, "--duration", "1", "--detach"]);
  expectOk(focusStartSecond, "focus second start");

  const focusFinish = await runJson(["focus", "finish"]);
  expectOk(focusFinish, "focus finish");

  const focusTimeline = await runJson(["focus", "timeline", "--limit", "5"]);
  expectOk(focusTimeline, "focus timeline");
  asArray(focusTimeline.entries, "focus timeline entries");

  const statistics = await runJson(["statistics"]);
  expectOk(statistics, "statistics");

  const statisticsRange = await runJson(["statistics", "--from", "2026-03-01", "--to", "2026-03-31"]);
  expectOk(statisticsRange, "statistics range");

  const habits = await runJson(["habit", "list"]);
  expectOk(habits, "habit list");
  asArray(habits.habits, "habit list habits");

  const habitSearch = await runJson(["habit", "list", "--search", "exercise"]);
  expectOk(habitSearch, "habit list search");

  const habitNamePrimary = `codex-live-habit-${stamp}`;
  const habitAdd = await runJson(["habit", "add", habitNamePrimary, "--goal", "1", "--unit", "times"]);
  expectOk(habitAdd, "habit add");
  habitIdPrimary = asString((habitAdd.habit as JsonRecord | null)?.id, "habit add id");

  const habitCheckinUnlabeled = await runJson(["habit", "checkin", habitIdPrimary, "--status", "unlabeled"]);
  expectOk(habitCheckinUnlabeled, "habit checkin unlabeled");
  assert(
    ((habitCheckinUnlabeled.checkin as JsonRecord | undefined)?.status as number | undefined) === 0,
    "habit unlabeled checkin did not return status 0",
  );

  const habitCheckinUndone = await runJson(["habit", "checkin", habitIdPrimary, "--status", "undone"]);
  expectOk(habitCheckinUndone, "habit checkin undone");
  assert(
    ((habitCheckinUndone.checkin as JsonRecord | undefined)?.status as number | undefined) === 1,
    "habit undone checkin did not return status 1",
  );

  const habitCheckinDone = await runJson(["habit", "checkin", habitIdPrimary, "--status", "done"]);
  expectOk(habitCheckinDone, "habit checkin done");
  assert(
    ((habitCheckinDone.checkin as JsonRecord | undefined)?.status as number | undefined) === 2,
    "habit done checkin did not return status 2",
  );

  const habitExportResult = await runCommand([executablePath, "habit", "export", exportPath, "--json"], {
    expectSuccess: false,
  });
  if (habitExportResult.exitCode === 0) {
    const habitExport = parseJsonOutput(habitExportResult.stdout, "habit export success");
    expectOk(habitExport, "habit export");
    await stat(exportPath);
  } else {
    const failurePayload = parseJsonOutput(habitExportResult.stderr, "habit export failure");
    const failureMessage =
      typeof (failurePayload.error as JsonRecord | undefined)?.message === "string"
        ? ((failurePayload.error as JsonRecord).message as string)
        : "";
    assert(
      failureMessage.includes("export_too_many_times"),
      `habit export failed unexpectedly: ${habitExportResult.stderr}`,
    );
  }

  const habitRemove = await runJson(["habit", "rm", "-y", habitIdPrimary]);
  expectOk(habitRemove, "habit rm");
  habitIdPrimary = null;

  const projectRemove = await runJson(["project", "remove", "-y", projectIdSecondary]);
  expectOk(projectRemove, "project remove");
  projectIdSecondary = null;

  const projectRm = await runJson(["project", "rm", "-y", projectIdPrimary]);
  expectOk(projectRm, "project rm");
  projectIdPrimary = null;

  const logout = await runJson(["logout"]);
  expectOk(logout, "logout");

  console.log("Live verification passed.");
} finally {
  await cleanupTask(taskIdPrimary);
  await cleanupTask(taskIdSecondary);
  await cleanupHabit(habitIdPrimary);
  await cleanupProject(projectIdSecondary);
  await cleanupProject(projectIdPrimary);
  await rm(exportPath, { force: true }).catch(() => undefined);
  await rm(sessionPath, { force: true }).catch(() => undefined);
}
