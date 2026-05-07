import { mkdir, readFile, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";

const cliDir = import.meta.dir.endsWith("\\scripts") || import.meta.dir.endsWith("/scripts")
  ? dirname(import.meta.dir)
  : import.meta.dir;
const repoDir = dirname(dirname(cliDir));
const distDir = join(cliDir, "dist");
const defaultAccountFile = join(repoDir, "ticktick-test-account.txt");
const accountFile = process.env.TICKTICK_TEST_ACCOUNT_FILE ?? defaultAccountFile;
const sessionPath = join(cliDir, ".tmp-live-verify-session.json");
const namedSessionStore = "live-verify-session";
const explicitSessionPath = join(cliDir, ".tmp-live-verify-explicit-session.json");
const exportPath = join(distDir, "ticktick-habits-test.xlsx");
const compileRecordPath = join(distDir, "latest-compile-path.txt");

let executablePath = "";

type JsonRecord = Record<string, unknown>;

interface CommandResult {
  exitCode: number;
  stderr: string;
  stdout: string;
}

interface CommandOptions {
  cwd?: string;
  env?: Record<string, string | undefined>;
  expectSuccess?: boolean;
}

interface Credentials {
  password: string;
  username: string;
}

const transientErrorPattern = /Unable to connect|ECONNRESET|ETIMEDOUT|fetch failed|network/i;
const allowedLiveErrorCodes = new Set(["need_pro", "export_too_many_times"]);

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function readCredentials(filePath: string): Promise<Credentials> {
  const envUsername = process.env.TICKTICK_TEST_USERNAME?.trim();
  const envPassword = process.env.TICKTICK_TEST_PASSWORD?.trim();
  if (envUsername && envPassword) {
    return {
      username: envUsername,
      password: envPassword,
    };
  }

  const content = await readFile(filePath, "utf8");
  const username = content.match(/Email\(username\):\s*(.+)/)?.[1]?.trim();
  const password = content.match(/Password:\s*(.+)/)?.[1]?.trim();
  assert(username, `Could not read username from ${filePath}`);
  assert(password, `Could not read password from ${filePath}`);
  return { username, password };
}

const credentials = await readCredentials(accountFile);

async function runCommand(command: string[], options: CommandOptions = {}): Promise<CommandResult> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const proc = Bun.spawn(command, {
      cwd: options.cwd ?? cliDir,
      env: {
        ...process.env,
        TICKTICK_SESSION_PATH: sessionPath,
        TICKTICK_USERNAME: credentials.username,
        TICKTICK_PASSWORD: credentials.password,
        ...(options.env ?? {}),
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
        await Bun.sleep(600 * (attempt + 1));
        continue;
      }

      throw new Error(`Command failed: ${command.join(" ")}\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`);
    }

    return { exitCode, stderr, stdout };
  }

  throw new Error(`Command failed after retries: ${command.join(" ")}`);
}

async function runJson(args: string[], options: CommandOptions = {}): Promise<JsonRecord> {
  const result = await runCommand([executablePath, ...args, "--json"], options);
  return parseJsonOutput(result.stdout, `JSON output for ${args.join(" ")}`);
}

async function runText(args: string[], options: CommandOptions = {}): Promise<string> {
  const result = await runCommand([executablePath, ...args], options);
  return result.stdout;
}

async function runJsonExpectFailure(args: string[], options: CommandOptions = {}): Promise<{ payload: JsonRecord; result: CommandResult }> {
  const result = await runCommand([executablePath, ...args, "--json"], {
    ...options,
    expectSuccess: false,
  });
  const text = result.stderr.trim() || result.stdout.trim();
  return {
    payload: parseJsonOutput(text, `failure JSON for ${args.join(" ")}`),
    result,
  };
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
    throw new Error(`Failed to parse ${label}.\n${value}\n${String(error)}`);
  }
}

function asArray<T>(value: unknown, label: string): T[] {
  assert(Array.isArray(value), `${label} is not an array`);
  return value as T[];
}

function asString(value: unknown, label: string): string {
  assert(typeof value === "string" && value.length > 0, `${label} is missing`);
  return value;
}

function asNumber(value: unknown, label: string): number {
  assert(typeof value === "number" && Number.isFinite(value), `${label} is not a number`);
  return value;
}

function expectOk(payload: JsonRecord, label: string): void {
  assert(payload.ok === true, `${label} did not return ok=true`);
}

function expectIncludes(value: string, needle: string, label: string): void {
  assert(value.includes(needle), `${label} is missing "${needle}"`);
}

function readErrorCode(payload: JsonRecord): string | null {
  const direct = payload.errorCode;
  if (typeof direct === "string" && direct.length > 0) {
    return direct;
  }

  const error = payload.error;
  if (error && typeof error === "object") {
    const nested = (error as JsonRecord).code;
    if (typeof nested === "string" && nested.length > 0) {
      return nested;
    }
    const nestedErrorCode = (error as JsonRecord).errorCode;
    if (typeof nestedErrorCode === "string" && nestedErrorCode.length > 0) {
      return nestedErrorCode;
    }
    const responseBody = (error as JsonRecord).responseBody;
    if (responseBody && typeof responseBody === "object") {
      const bodyErrorCode = (responseBody as JsonRecord).errorCode;
      if (typeof bodyErrorCode === "string" && bodyErrorCode.length > 0) {
        return bodyErrorCode;
      }
    }
  }

  return null;
}

function readErrorMessage(payload: JsonRecord): string {
  const error = payload.error;
  if (error && typeof error === "object") {
    const message = (error as JsonRecord).message;
    if (typeof message === "string") {
      const responseBody = (error as JsonRecord).responseBody;
      if (responseBody && typeof responseBody === "object") {
        const bodyMessage = (responseBody as JsonRecord).errorMessage;
        if (typeof bodyMessage === "string" && bodyMessage.length > 0) {
          return `${message} (${bodyMessage})`;
        }
      }

      return message;
    }
  }

  if (typeof payload.errorMessage === "string") {
    return payload.errorMessage;
  }

  return JSON.stringify(payload);
}

function assertAllowedFailure(payload: JsonRecord, label: string): void {
  const code = readErrorCode(payload);
  assert(code !== null && allowedLiveErrorCodes.has(code), `${label} failed unexpectedly: ${readErrorMessage(payload)}`);
}

async function waitForProjectIdByName(name: string): Promise<string> {
  const payload = await waitForJson(
    `project ${name} to appear`,
    ["project", "list", "--search", name],
    (body) => asArray<JsonRecord>(body.projects, "project wait list").some((project) => project.name === name),
    { timeoutMs: 12000 },
  );
  const project = asArray<JsonRecord>(payload.projects, "project wait list").find((entry) => entry.name === name) ?? null;
  return asString(project?.id, `project id for ${name}`);
}

async function waitForHabitIdByName(name: string): Promise<string> {
  const payload = await waitForJson(
    `habit ${name} to appear`,
    ["habit", "list", "--search", name],
    (body) => asArray<JsonRecord>(body.habits, "habit wait list").some((habit) => habit.name === name),
    { timeoutMs: 12000 },
  );
  const habit = asArray<JsonRecord>(payload.habits, "habit wait list").find((entry) => entry.name === name) ?? null;
  return asString(habit?.id, `habit id for ${name}`);
}

async function waitForCountdownIdByName(name: string): Promise<string> {
  const payload = await waitForJson(
    `countdown ${name} to appear`,
    ["countdown", "list", "--search", name],
    (body) => asArray<JsonRecord>(body.countdowns, "countdown wait list").some((countdown) => countdown.name === name),
    { timeoutMs: 12000 },
  );
  const countdown = asArray<JsonRecord>(payload.countdowns, "countdown wait list").find((entry) => entry.name === name) ?? null;
  return asString(countdown?.id, `countdown id for ${name}`);
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

async function cleanupTag(tagName: string | null): Promise<void> {
  if (!tagName) return;
  await runCommand([executablePath, "tag", "delete", "--y", tagName], { expectSuccess: false });
}

async function cleanupCountdown(countdownId: string | null): Promise<void> {
  if (!countdownId) return;
  await runCommand([executablePath, "countdown", "rm", "--y", countdownId], { expectSuccess: false });
}

let projectIdPrimary: string | null = null;
let projectIdSecondary: string | null = null;
let taskIdPrimary: string | null = null;
let taskIdSecondary: string | null = null;
let taskIdTertiary: string | null = null;
let habitIdPrimary: string | null = null;
let habitIdSecondary: string | null = null;
let countdownIdPrimary: string | null = null;
let countdownIdSecondary: string | null = null;
let tagNameParent: string | null = null;
let tagNameChild: string | null = null;
let tagNameTarget: string | null = null;
let tagNameMergedSource: string | null = null;

try {
  await mkdir(distDir, { recursive: true });

  await runCommand(["bun", "run", "build"]);
  await runCommand(["bun", "run", "compile"]);
  executablePath = (await readFile(compileRecordPath, "utf8")).trim();
  assert(executablePath.length > 0, "Compiled executable path is missing");

  const rootHelp = await runText(["help"]);
  expectIncludes(rootHelp, "project", "root help");
  expectIncludes(rootHelp, "focus", "root help");

  const taskHelp = await runText(["help", "task"]);
  expectIncludes(taskHelp, "abandon", "task help");
  expectIncludes(taskHelp, "pin", "task help");

  const typoHelp = await runText(["tas", "help"], { expectSuccess: false });
  expectIncludes(typoHelp, 'Did you mean "task"', "autocomplete typo help");

  const versionText = await runText(["--version"]);
  expectIncludes(versionText, "0.1.0", "version output");

  const login = await runJson(["login"]);
  expectOk(login, "login");

  const loginNamedStore = await runJson(["login", "--save-as", namedSessionStore]);
  expectOk(loginNamedStore, "login save-as store");

  const whoamiNamedStore = await runJson(["whoami", "--session", namedSessionStore]);
  expectOk(whoamiNamedStore, "whoami named store");

  const loginExplicitSession = await runJson(["login", "--session", explicitSessionPath]);
  expectOk(loginExplicitSession, "login explicit session file");

  const whoamiExplicitSession = await runJson(["whoami", "--session", explicitSessionPath]);
  expectOk(whoamiExplicitSession, "whoami explicit session file");

  const whoami = await runJson(["whoami", "--timezone", "Asia/Shanghai"]);
  expectOk(whoami, "whoami");
  expectIncludes(asString(whoami.service, "whoami.service"), "ticktick", "whoami service");

  const calendarAccounts = await runJson(["calendar", "accounts"]);
  expectOk(calendarAccounts, "calendar accounts");

  const calendarArchived = await runJson(["calendar", "archived-events"]);
  expectOk(calendarArchived, "calendar archived events");
  asArray(calendarArchived.archivedEvents, "calendar archived events list");

  const calendarEventsResult = await runCommand([executablePath, "calendar", "events", "--json"], { expectSuccess: false });
  if (calendarEventsResult.exitCode === 0) {
    const calendarEvents = parseJsonOutput(calendarEventsResult.stdout, "calendar events");
    expectOk(calendarEvents, "calendar events");
  } else {
    assertAllowedFailure(parseJsonOutput(calendarEventsResult.stderr, "calendar events failure"), "calendar events");
  }

  const projectList = await runJson(["project", "list"]);
  expectOk(projectList, "project list");
  asArray(projectList.projects, "project list projects");

  const stamp = `${Date.now()}`;
  const projectNamePrimary = `codex-live-project-${stamp}`;
  const projectNameSecondary = `${projectNamePrimary}-move`;
  const projectNameRenamed = `${projectNamePrimary}-renamed`;
  const projectNameEdited = `${projectNamePrimary}-edited`;
  const taskTitlePrimary = `codex-live-task-${stamp}`;
  const taskTitleSecondary = `${taskTitlePrimary}-remove`;
  const taskTitleTertiary = `${taskTitlePrimary}-alias`;
  const tagParent = `codex-parent-${stamp}`;
  const tagChild = `codex-child-${stamp}`;
  const tagTarget = `codex-target-${stamp}`;
  const tagMergeSource = `codex-merge-source-${stamp}`;
  const countdownNamePrimary = `codex-live-countdown-${stamp}`;
  const countdownNameSecondary = `${countdownNamePrimary}-rm`;

  const tagAddParent = await runJson(["tag", "add", tagParent, "--color", "#4F86F7"]);
  expectOk(tagAddParent, "tag add parent");
  tagNameParent = tagParent;

  const tagAddChild = await runJson(["tag", "add", tagChild, "--parent", tagParent, "--color", "#123456"]);
  expectOk(tagAddChild, "tag add child");
  tagNameChild = tagChild;

  const tagAddTarget = await runJson(["tag", "add", tagTarget]);
  expectOk(tagAddTarget, "tag add target");
  tagNameTarget = tagTarget;

  const tagAddMergeSource = await runJson(["tag", "add", tagMergeSource]);
  expectOk(tagAddMergeSource, "tag add merge source");
  tagNameMergedSource = tagMergeSource;

  const tagList = await runJson(["tag", "list", "--search", "codex-"]);
  expectOk(tagList, "tag list search");
  assert(asArray<JsonRecord>(tagList.tags, "tag list tags").some((tag) => tag.name === tagParent), "tag list search missing parent");

  const tagShow = await runJson(["tag", "show", tagParent]);
  expectOk(tagShow, "tag show");

  const tagEdit = await runJson(["tag", "edit", tagChild, "--label", `${tagChild}-edited`, "--color", "#654321", "--parent", tagParent]);
  expectOk(tagEdit, "tag edit");
  tagNameChild = `${tagChild}-edited`;

  const tagRename = await runJson(["tag", "rename", tagNameChild, `${tagChild}-renamed`]);
  expectOk(tagRename, "tag rename");
  tagNameChild = `${tagChild}-renamed`;

  await waitForJson(
    "tag rename to appear in list",
    ["tag", "list", "--search", tagChild],
    (payload) => asArray<JsonRecord>(payload.tags, "tag list after rename").some((tag) => tag.name === tagNameChild),
  );

  const tagPin = await runJson(["tag", "pin", tagNameChild]);
  expectOk(tagPin, "tag pin");

  const tagUnpin = await runJson(["tag", "unpin", tagNameChild]);
  expectOk(tagUnpin, "tag unpin");

  const tagMerge = await runJson(["tag", "merge", tagMergeSource, tagTarget]);
  expectOk(tagMerge, "tag merge");
  tagNameMergedSource = null;

  const tagDelete = await runJson(["tag", "delete", "--y", tagNameChild]);
  expectOk(tagDelete, "tag delete");
  tagNameChild = null;

  const projectAddPrimary = await runJson(["project", "add", projectNamePrimary, "--color", "#4F86F7", "--kind", "TASK", "--view", "list"]);
  expectOk(projectAddPrimary, "project add primary");
  projectIdPrimary = (projectAddPrimary.project as JsonRecord | null)?.id as string | null;
  if (!projectIdPrimary) {
    projectIdPrimary = await waitForProjectIdByName(projectNamePrimary);
  }

  const projectShow = await runJson(["project", "show", projectIdPrimary]);
  expectOk(projectShow, "project show");

  const projectSearch = await runJson(["project", "list", "--search", projectNamePrimary]);
  expectOk(projectSearch, "project list search");
  assert(asArray<JsonRecord>(projectSearch.projects, "project search projects").some((project) => project.id === projectIdPrimary), "project list search missing project");

  const projectColumns = await runJson(["project", "columns", projectIdPrimary]);
  expectOk(projectColumns, "project columns");
  asArray(projectColumns.columns, "project columns");

  const projectRename = await runJson(["project", "rename", projectIdPrimary, projectNameRenamed]);
  expectOk(projectRename, "project rename");

  const projectEditName = await runJson(["project", "edit", "name", projectIdPrimary, projectNameEdited]);
  expectOk(projectEditName, "project edit name");

  const projectEditColor = await runJson(["project", "edit", "color", projectIdPrimary, "#123456"]);
  expectOk(projectEditColor, "project edit color");

  const projectEditView = await runJson(["project", "edit", "view", projectIdPrimary, "kanban"]);
  expectOk(projectEditView, "project edit view");

  const projectEditClosed = await runJson(["project", "edit", "closed", projectIdPrimary, "true"]);
  expectOk(projectEditClosed, "project edit closed true");

  const projectEditReopen = await runJson(["project", "edit", "closed", projectIdPrimary, "false"]);
  expectOk(projectEditReopen, "project edit closed false");

  const projectAddSecondary = await runJson(["project", "add", projectNameSecondary, "--view", "kanban"]);
  expectOk(projectAddSecondary, "project add secondary");
  projectIdSecondary = (projectAddSecondary.project as JsonRecord | null)?.id as string | null;
  if (!projectIdSecondary) {
    projectIdSecondary = await waitForProjectIdByName(projectNameSecondary);
  }

  const taskListBefore = await runJson(["task", "list", "--limit", "5", "--sort", "updated", "--order", "desc"]);
  expectOk(taskListBefore, "task list before");

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
    tagParent,
    "--tag",
    tagTarget,
    "--content",
    "CLI live verification body",
    "--desc",
    "CLI live verification description",
    "--status",
    "open",
  ]);
  expectOk(taskAddPrimary, "task add primary");
  taskIdPrimary = asString((taskAddPrimary.task as JsonRecord | null)?.id, "task add primary id");
  assert(((taskAddPrimary.task as JsonRecord | undefined)?.priority as number | undefined) === 5, "task add primary did not map high priority to 5");

  const taskAddSecondary = await runJson(["task", "add", taskTitleSecondary, "--project", projectIdSecondary, "--priority", "low"]);
  expectOk(taskAddSecondary, "task add secondary");
  taskIdSecondary = asString((taskAddSecondary.task as JsonRecord | null)?.id, "task add secondary id");

  const taskAddTertiary = await runJson(["task", "add", taskTitleTertiary, "--project", projectIdSecondary]);
  expectOk(taskAddTertiary, "task add tertiary");
  taskIdTertiary = asString((taskAddTertiary.task as JsonRecord | null)?.id, "task add tertiary id");

  const taskShow = await runJson(["task", "show", taskIdPrimary]);
  expectOk(taskShow, "task show");

  const taskListSearch = await runJson(["task", "list", "--search", "codex-live-task-", "--limit", "20", "--sort", "title", "--order", "asc"]);
  expectOk(taskListSearch, "task list search");
  assert(asArray<JsonRecord>(taskListSearch.tasks, "task list search tasks").some((task) => task.id === taskIdPrimary), "task list search missing primary task");

  const taskListProject = await runJson(["task", "list", "--project", projectIdPrimary, "--limit", "20"]);
  expectOk(taskListProject, "task list project");
  assert(asArray<JsonRecord>(taskListProject.tasks, "task list project tasks").some((task) => task.id === taskIdPrimary), "task list project missing primary task");

  const taskEditTitle = await runJson(["task", "edit", "title", taskIdPrimary, `${taskTitlePrimary}-edited`]);
  expectOk(taskEditTitle, "task edit title");

  const taskEditContent = await runJson(["task", "edit", "content", taskIdPrimary, "Updated content"]);
  expectOk(taskEditContent, "task edit content");

  const taskEditDesc = await runJson(["task", "edit", "desc", taskIdPrimary, "Updated description"]);
  expectOk(taskEditDesc, "task edit desc");

  const taskEditDue = await runJson(["task", "edit", "due", taskIdPrimary, "2026-04-01 19:00"]);
  expectOk(taskEditDue, "task edit due");

  const taskEditStart = await runJson(["task", "edit", "start", taskIdPrimary, "2026-04-01 08:30"]);
  expectOk(taskEditStart, "task edit start");

  const taskEditPriority = await runJson(["task", "edit", "priority", taskIdPrimary, "medium"]);
  expectOk(taskEditPriority, "task edit priority");
  assert(((taskEditPriority.task as JsonRecord | undefined)?.priority as number | undefined) === 3, "task edit priority did not map medium priority to 3");

  const taskEditTags = await runJson(["task", "edit", "tags", taskIdPrimary, `${tagParent},${tagTarget}`]);
  expectOk(taskEditTags, "task edit tags");

  const taskPin = await runJson(["task", "pin", taskIdPrimary, taskIdSecondary]);
  expectOk(taskPin, "task pin");

  const taskUnpin = await runJson(["task", "unpin", taskIdPrimary, taskIdSecondary]);
  expectOk(taskUnpin, "task unpin");

  const taskEditStatusWontDo = await runJson(["task", "edit", "status", taskIdPrimary, "won't do"]);
  expectOk(taskEditStatusWontDo, "task edit status won't do");
  assert(((taskEditStatusWontDo.task as JsonRecord | undefined)?.status as number | undefined) === -1, "task edit status won't do did not return status -1");

  const taskListAbandoned = await runJson(["task", "list", "--completed", "--status", "abandoned", "--limit", "20"]);
  expectOk(taskListAbandoned, "task list abandoned");
  assert(
    asArray<JsonRecord>(taskListAbandoned.tasks, "task list abandoned tasks").some((task) => task.status === -1),
    "task list abandoned did not return any abandoned tasks",
  );

  const taskEditStatusCompleted = await runJson(["task", "edit", "status", taskIdPrimary, "completed"]);
  expectOk(taskEditStatusCompleted, "task edit status completed");
  assert(((taskEditStatusCompleted.task as JsonRecord | undefined)?.status as number | undefined) === 2, "task edit status completed did not return status 2");

  const taskListCompleted = await runJson(["task", "list", "--completed", "--limit", "20"]);
  expectOk(taskListCompleted, "task list completed");
  assert(
    asArray<JsonRecord>(taskListCompleted.tasks, "task completed tasks").some((task) => task.status === 2),
    "task list completed did not return any completed tasks",
  );

  const taskEditStatusOpen = await runJson(["task", "edit", "status", taskIdPrimary, "open"]);
  expectOk(taskEditStatusOpen, "task edit status open");
  assert(((taskEditStatusOpen.task as JsonRecord | undefined)?.status as number | undefined) === 0, "task edit status open did not return status 0");

  const taskEditProject = await runJson(["task", "edit", "project", taskIdPrimary, projectIdSecondary]);
  expectOk(taskEditProject, "task edit project");

  const taskMove = await runJson(["task", "move", taskIdPrimary, "--project", projectIdPrimary]);
  expectOk(taskMove, "task move");

  const taskComplete = await runJson(["task", "complete", taskIdPrimary, taskIdSecondary]);
  expectOk(taskComplete, "task complete");

  const taskReopen = await runJson(["task", "reopen", taskIdPrimary, taskIdSecondary]);
  expectOk(taskReopen, "task reopen");

  const taskAbandon = await runJson(["task", "abandon", taskIdPrimary]);
  expectOk(taskAbandon, "task abandon");

  const taskWontDo = await runJson(["task", "wont-do", taskIdSecondary]);
  expectOk(taskWontDo, "task wont-do");

  const taskListAll = await runJson(["task", "list", "--all", "--project", projectIdPrimary, "--limit", "50", "--order", "asc", "--sort", "created"]);
  expectOk(taskListAll, "task list all");

  const taskReopenAll = await runJson(["task", "reopen", taskIdPrimary, taskIdSecondary]);
  expectOk(taskReopenAll, "task reopen all");

  const rejectTaskRemove = await runCommand([executablePath, "task", "remove", taskIdPrimary], { expectSuccess: false });
  assert(rejectTaskRemove.exitCode !== 0, "task remove without -y should fail in non-interactive mode");
  expectIncludes(rejectTaskRemove.stderr || rejectTaskRemove.stdout, "requires -y", "task remove rejection");

  const taskRemove = await runJson(["task", "remove", "-y", taskIdPrimary]);
  expectOk(taskRemove, "task remove");
  taskIdPrimary = null;

  const taskRm = await runJson(["task", "rm", "-y", taskIdSecondary]);
  expectOk(taskRm, "task rm");
  taskIdSecondary = null;

  const rejectProjectRemove = await runCommand([executablePath, "project", "remove", projectIdSecondary], { expectSuccess: false });
  assert(rejectProjectRemove.exitCode !== 0, "project remove without -y should fail in non-interactive mode");
  expectIncludes(rejectProjectRemove.stderr || rejectProjectRemove.stdout, "requires -y", "project remove rejection");

  const focusStatusBefore = await runJson(["focus", "status"]);
  if (focusStatusBefore.status === "running" || focusStatusBefore.status === "paused") {
    await runJson(["focus", "stop"]);
  }

  const focusStart = await runJson(["focus", "start", "--task", taskIdTertiary!, "--duration", "5", "--note", "CLI live focus note", "--detach"]);
  expectOk(focusStart, "focus start");

  const focusStatusRunning = await runJson(["focus", "status"]);
  expectIncludes(asString(focusStatusRunning.status, "focus status running"), "running", "focus running status");

  const focusPause = await runJson(["focus", "pause"]);
  expectOk(focusPause, "focus pause");

  const focusResume = await runJson(["focus", "resume"]);
  expectOk(focusResume, "focus resume");

  const focusStop = await runJson(["focus", "stop"]);
  expectOk(focusStop, "focus stop");

  const focusStartSecond = await runJson(["focus", "start", "--task", taskIdTertiary!, "--duration", "1", "--detach"]);
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

  const habitSearch = await runJson(["habit", "list", "--search", "codex-live-habit"]);
  expectOk(habitSearch, "habit list search");

  const habitNamePrimary = `codex-live-habit-${stamp}`;
  const habitNameSecondary = `${habitNamePrimary}-remove`;

  const habitAdd = await runJson([
    "habit",
    "add",
    habitNamePrimary,
    "--goal",
    "3",
    "--step",
    "2",
    "--type",
    "number",
    "--unit",
    "cups",
    "--repeat",
    "RRULE:FREQ=DAILY;INTERVAL=1",
    "--no-record-enable",
  ]);
  expectOk(habitAdd, "habit add");
  habitIdPrimary = (habitAdd.habit as JsonRecord | null)?.id as string | null;
  if (!habitIdPrimary) {
    habitIdPrimary = await waitForHabitIdByName(habitNamePrimary);
  }

  const habitAddSecondary = await runJson(["habit", "add", habitNameSecondary, "--goal", "1", "--unit", "times"]);
  expectOk(habitAddSecondary, "habit add secondary");
  habitIdSecondary = (habitAddSecondary.habit as JsonRecord | null)?.id as string | null;
  if (!habitIdSecondary) {
    habitIdSecondary = await waitForHabitIdByName(habitNameSecondary);
  }

  const habitCheckinUnlabeled = await runJson(["habit", "checkin", habitIdPrimary, "--date", "2026-04-02", "--goal", "4", "--status", "unlabeled"]);
  expectOk(habitCheckinUnlabeled, "habit checkin unlabeled");
  assert(((habitCheckinUnlabeled.checkin as JsonRecord | undefined)?.status as number | undefined) === 0, "habit unlabeled checkin did not return status 0");

  const habitCheckinUndone = await runJson(["habit", "checkin", habitIdPrimary, "--date", "2026-04-03", "--goal", "4", "--status", "undone"]);
  expectOk(habitCheckinUndone, "habit checkin undone");
  assert(((habitCheckinUndone.checkin as JsonRecord | undefined)?.status as number | undefined) === 1, "habit undone checkin did not return status 1");

  const habitCheckinDone = await runJson(["habit", "checkin", habitIdPrimary, "--date", "2026-04-04", "--goal", "4", "--value", "4"]);
  expectOk(habitCheckinDone, "habit checkin done");
  assert(((habitCheckinDone.checkin as JsonRecord | undefined)?.status as number | undefined) === 2, "habit done checkin did not return status 2");

  const invalidHabitCheckin = await runJsonExpectFailure([
    "habit",
    "checkin",
    habitIdPrimary,
    "--date",
    "2026-04-05",
    "--goal",
    "4",
    "--value",
    "2",
    "--status",
    "done",
  ]);
  expectIncludes(readErrorMessage(invalidHabitCheckin.payload), "either value or status", "habit invalid checkin rejection");

  const habitExportResult = await runCommand([executablePath, "habit", "export", exportPath, "--json"], { expectSuccess: false });
  if (habitExportResult.exitCode === 0) {
    const habitExport = parseJsonOutput(habitExportResult.stdout, "habit export success");
    expectOk(habitExport, "habit export");
    await stat(exportPath);
  } else {
    assertAllowedFailure(parseJsonOutput(habitExportResult.stderr, "habit export failure"), "habit export");
  }

  const habitRemove = await runJson(["habit", "remove", "--y", habitIdPrimary]);
  expectOk(habitRemove, "habit remove");
  habitIdPrimary = null;

  const habitRm = await runJson(["habit", "rm", "--y", habitIdSecondary]);
  expectOk(habitRm, "habit rm");
  habitIdSecondary = null;

  const countdownAdd = await runJson([
    "countdown",
    "add",
    countdownNamePrimary,
    "--type",
    "birthday",
    "--date",
    "2026-12-31",
    "--ignore-year",
    "--repeat",
    "RRULE:FREQ=YEARLY",
    "--reminder",
    "TRIGGER:P0D,TRIGGER:P1D",
    "--timer-mode",
    "countdown",
    "--day-calculation-mode",
    "standard",
    "--show-age",
    "--days-option",
    "always-show",
    "--style",
    "default",
    "--style-color",
    "#111111,#222222",
    "--remark",
    "countdown remark",
    "--icon-res",
    "birthday",
    "--color",
    "#abcdef",
  ]);
  expectOk(countdownAdd, "countdown add");
  countdownIdPrimary = (countdownAdd.countdown as JsonRecord | null)?.id as string | null;
  if (!countdownIdPrimary) {
    countdownIdPrimary = await waitForCountdownIdByName(countdownNamePrimary);
  }

  const countdownAddSecondary = await runJson(["countdown", "add", countdownNameSecondary, "--type", "countdown", "--date", "2026-11-30"]);
  expectOk(countdownAddSecondary, "countdown add secondary");
  countdownIdSecondary = (countdownAddSecondary.countdown as JsonRecord | null)?.id as string | null;
  if (!countdownIdSecondary) {
    countdownIdSecondary = await waitForCountdownIdByName(countdownNameSecondary);
  }

  const countdownList = await runJson(["countdown", "list", "--search", "codex-live-countdown"]);
  expectOk(countdownList, "countdown list");
  assert(asArray<JsonRecord>(countdownList.countdowns, "countdown list entries").some((countdown) => countdown.id === countdownIdPrimary), "countdown list missing primary countdown");

  const countdownShow = await runJson(["countdown", "show", countdownIdPrimary]);
  expectOk(countdownShow, "countdown show");

  const countdownUpdate = await runJson([
    "countdown",
    "update",
    countdownIdPrimary,
    "--name",
    `${countdownNamePrimary}-updated`,
    "--date",
    "2027-01-01",
    "--no-ignore-year",
    "--repeat",
    "RRULE:FREQ=MONTHLY;INTERVAL=1",
    "--reminder",
    "TRIGGER:P2D",
    "--timer-mode",
    "count-up",
    "--day-calculation-mode",
    "standard-plus-one-day",
    "--no-show-age",
    "--days-option",
    "7-days-early",
    "--style",
    "compact",
    "--style-color",
    "#333333,#444444",
    "--remark",
    "updated remark",
    "--icon-res",
    "anniversary",
    "--color",
    "#fedcba",
  ]);
  expectOk(countdownUpdate, "countdown update");

  const countdownDelete = await runJson(["countdown", "delete", "--y", countdownIdPrimary]);
  expectOk(countdownDelete, "countdown delete");
  countdownIdPrimary = null;

  const countdownRm = await runJson(["countdown", "rm", "--y", countdownIdSecondary]);
  expectOk(countdownRm, "countdown rm");
  countdownIdSecondary = null;

  const projectRemove = await runJson(["project", "remove", "-y", projectIdSecondary]);
  expectOk(projectRemove, "project remove");
  projectIdSecondary = null;

  const projectRm = await runJson(["project", "rm", "-y", projectIdPrimary]);
  expectOk(projectRm, "project rm");
  projectIdPrimary = null;

  const tagDeleteTarget = await runJson(["tag", "delete", "--y", tagTarget]);
  expectOk(tagDeleteTarget, "tag delete target");
  tagNameTarget = null;

  const tagDeleteParent = await runJson(["tag", "delete", "--y", tagParent]);
  expectOk(tagDeleteParent, "tag delete parent");
  tagNameParent = null;

  const logoutExplicit = await runJson(["logout", "--session", explicitSessionPath]);
  expectOk(logoutExplicit, "logout explicit session");

  const logoutNamed = await runJson(["logout", "--session", namedSessionStore]);
  expectOk(logoutNamed, "logout named session");

  const logoutDefault = await runJson(["logout"]);
  expectOk(logoutDefault, "logout default");

  console.log("Live verification passed.");
} finally {
  await cleanupTask(taskIdPrimary);
  await cleanupTask(taskIdSecondary);
  await cleanupTask(taskIdTertiary);
  await cleanupHabit(habitIdPrimary);
  await cleanupHabit(habitIdSecondary);
  await cleanupCountdown(countdownIdPrimary);
  await cleanupCountdown(countdownIdSecondary);
  await cleanupTag(tagNameMergedSource);
  await cleanupTag(tagNameChild);
  await cleanupTag(tagNameTarget);
  await cleanupTag(tagNameParent);
  await cleanupProject(projectIdSecondary);
  await cleanupProject(projectIdPrimary);
  if (executablePath) {
    await runCommand([executablePath, "logout", "--session", explicitSessionPath], { expectSuccess: false });
    await runCommand([executablePath, "logout", "--session", namedSessionStore], { expectSuccess: false });
    await runCommand([executablePath, "logout"], { expectSuccess: false });
  }
  await rm(exportPath, { force: true }).catch(() => undefined);
  await rm(sessionPath, { force: true }).catch(() => undefined);
  await rm(explicitSessionPath, { force: true }).catch(() => undefined);
  await rm(join(cliDir, ".tmp-subcommand-help.txt"), { force: true }).catch(() => undefined);
}
