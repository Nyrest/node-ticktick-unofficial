import { isAbsolute, join } from "node:path";

import { configDir, createStore, stateDir } from "@crustjs/store";
import { createStyle, type StyleInstance } from "@crustjs/style";
import {
  formatTickTickCountdownDayCalculationMode,
  formatTickTickCountdownDaysOption,
  formatTickTickCountdownTimerMode,
  formatTickTickCountdownType,
  parseTickTickCountdownDayCalculationMode,
  parseTickTickCountdownDaysOption,
  parseTickTickCountdownTimerMode,
  parseTickTickCountdownType,
  TickTickClient,
  TickTickNotFoundError,
  type TickTickCountdown,
  type TickTickCountdownDayCalculationMode,
  type TickTickCountdownDaysOption,
  type TickTickCountdownTimerMode,
  type TickTickCountdownType,
  TickTickTaskStatuses,
  resolveTag,
  createFileSessionStore,
  formatTickTickHabitCheckinStatus,
  formatTickTickTaskPriority,
  formatTickTickTaskStatus,
  parseTickTickHabitCheckinStatus,
  parseTickTickTaskPriority,
  parseTickTickTaskStatus,
  type TickTickCredentials,
  type TickTickHabit,
  type TickTickHabitCheckinStatus,
  type TickTickProjectProfile,
  type TickTickSerializedSession,
  type TickTickServiceName,
  type TickTickTaskPriority,
  type TickTickTaskStatus,
  type TickTickTask,
} from "node-ticktick-unofficial";

export { resolveTag };

export const APP_NAME = "ticktick-unofficial-cli";
export const ENV_SERVICE = "TICKTICK_SERVICE";
export const ENV_SESSION_PATH = "TICKTICK_SESSION_PATH";
export const ENV_USERNAME = "TICKTICK_USERNAME";
export const ENV_PASSWORD = "TICKTICK_PASSWORD";
export const DEFAULT_SESSION_FILE = "session.json";

export type SharedFlags = {
  color?: boolean;
  json?: boolean;
  service?: string;
  session?: string;
  timezone?: string;
  verbose?: boolean;
};

export type TaskSortField = "created" | "due" | "priority" | "title" | "updated";
export type SortOrder = "asc" | "desc";

export interface RuntimeConfig {
  service: string;
  username: string | undefined;
}

export interface RuntimeContext {
  readonly authStore: ReturnType<typeof createAuthStore>;
  readonly config: RuntimeConfig;
  readonly flags: SharedFlags;
  readonly json: boolean;
  readonly session: TickTickSerializedSession | null;
  readonly service: TickTickServiceName;
  readonly sessionPath: string;
  readonly style: StyleInstance;
}

const createAuthStore = () =>
  createStore({
    dirPath: configDir(APP_NAME),
    name: "auth",
    fields: {
      service: {
        type: "string",
        default: "ticktick",
        validate: (value) => {
          if (value !== "ticktick" && value !== "dida365") {
            throw new Error("service must be ticktick or dida365");
          }
        },
      },
      username: {
        type: "string",
      },
    },
  });

export class CliError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CliError";
  }
}

export async function createRuntime(flags: SharedFlags): Promise<RuntimeContext> {
  const authStore = createAuthStore();
  const config = await authStore.read();
  const sessionPath = resolveSessionPath(flags.session ?? process.env[ENV_SESSION_PATH]);
  const session = await loadStoredSession(sessionPath);
  const service = resolveService(flags.service ?? process.env[ENV_SERVICE], session?.service ?? config.service);
  const style = createStyle({ mode: flags.color === false ? "never" : "auto" });

  return {
    authStore,
    config,
    flags,
    json: Boolean(flags.json),
    session,
    service,
    sessionPath,
    style,
  };
}

async function loadStoredSession(sessionPath: string): Promise<TickTickSerializedSession | null> {
  return createFileSessionStore(sessionPath).load();
}

export function resolveSessionPath(input: string | undefined): string {
  if (!input) {
    return join(stateDir(APP_NAME), DEFAULT_SESSION_FILE);
  }

  return isAbsolute(input) || input.includes("/") || input.includes("\\")
    ? input
    : join(stateDir(APP_NAME), input);
}

export function resolveService(input: string | undefined, fallback: string): TickTickServiceName {
  const value = (input ?? fallback).trim().toLowerCase();
  if (value === "ticktick" || value === "dida365") {
    return value;
  }

  throw new CliError(`Unsupported service "${input}". Use "ticktick" or "dida365".`);
}

export function resolveCredentials(input: Partial<TickTickCredentials> = {}): TickTickCredentials | null {
  const username = input.username ?? process.env[ENV_USERNAME];
  const password = input.password ?? process.env[ENV_PASSWORD];

  if (!username || !password) {
    return null;
  }

  return { username, password };
}

export async function loginWithCredentials(
  runtime: RuntimeContext,
  credentials: TickTickCredentials,
  service = runtime.service,
): Promise<TickTickClient> {
  const client = await TickTickClient.create({
    service,
    credentials,
    sessionStore: createFileSessionStore(runtime.sessionPath),
    timezone: runtime.flags.timezone,
  });

  await client.session.login(credentials);
  await runtime.authStore.write({
    service,
    username: credentials.username,
  });
  return client;
}

export async function requireClient(
  runtime: RuntimeContext,
  input: Partial<TickTickCredentials> = {},
): Promise<TickTickClient> {
  const credentials = resolveCredentials(input);
  const client = await TickTickClient.create({
    service: runtime.service,
    credentials: credentials ?? undefined,
    sessionStore: createFileSessionStore(runtime.sessionPath),
    timezone: runtime.flags.timezone,
  });

  if (await client.session.validate()) {
    return client;
  }

  if (!credentials) {
    throw new CliError(
      `No active ${runtime.service} session. Run \`${APP_NAME} login\` or set ${ENV_USERNAME}/${ENV_PASSWORD}.`,
    );
  }

  await client.session.login(credentials);
  await runtime.authStore.write({
    service: runtime.service,
    username: credentials.username,
  });
  return client;
}

export async function logout(runtime: RuntimeContext): Promise<void> {
  const client = await TickTickClient.create({
    service: runtime.service,
    sessionStore: createFileSessionStore(runtime.sessionPath),
    timezone: runtime.flags.timezone,
  });

  await client.session.clear();
  await runtime.authStore.write({
    service: runtime.service,
    username: undefined,
  });
}

export function withService(runtime: RuntimeContext, service: TickTickServiceName): RuntimeContext {
  return {
    ...runtime,
    service,
  };
}

export function withSessionPath(
  runtime: RuntimeContext,
  sessionPath: string,
  session: TickTickSerializedSession | null = null,
): RuntimeContext {
  return {
    ...runtime,
    session,
    sessionPath,
  };
}

export function shortId(value: string): string {
  return value.slice(0, 8);
}

export function parseDateInput(value: string | undefined): Date | undefined {
  if (!value) {
    return undefined;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new CliError(`Invalid date "${value}". Use ISO date/time like 2026-03-29 or 2026-03-29T18:00.`);
  }

  return date;
}

export function toDayKey(value: Date): string {
  const year = value.getUTCFullYear();
  const month = `${value.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${value.getUTCDate()}`.padStart(2, "0");
  return `${year}${month}${day}`;
}

export function resolveDateRange(from: string | undefined, to: string | undefined, days = 7): {
  from: string;
  to: string;
} {
  const toDate = parseDateInput(to) ?? new Date();
  const fromDate = parseDateInput(from) ?? new Date(toDate.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
  return {
    from: toDayKey(fromDate),
    to: toDayKey(toDate),
  };
}

function rethrowCliError(error: unknown): never {
  if (error instanceof Error) {
    throw new CliError(error.message);
  }

  throw new CliError(String(error));
}

export function parsePriority(input: string | number | undefined): TickTickTaskPriority | undefined {
  try {
    return parseTickTickTaskPriority(input);
  } catch (error) {
    rethrowCliError(error);
  }
}

export function parseTaskStatus(input: string | number | undefined): TickTickTaskStatus | undefined {
  try {
    return parseTickTickTaskStatus(input);
  } catch (error) {
    rethrowCliError(error);
  }
}

export function parseHabitCheckinStatus(input: string | number | undefined): TickTickHabitCheckinStatus | undefined {
  try {
    return parseTickTickHabitCheckinStatus(input);
  } catch (error) {
    rethrowCliError(error);
  }
}

export function formatPriorityLabel(value: number | undefined): string {
  return formatTickTickTaskPriority(value);
}

export function formatTaskStatusLabel(value: number | undefined): string {
  return formatTickTickTaskStatus(value);
}

export function formatHabitCheckinStatusLabel(value: number | undefined): string {
  return formatTickTickHabitCheckinStatus(value);
}

export function parseCountdownType(input: string | number | undefined): TickTickCountdownType | undefined {
  try {
    return parseTickTickCountdownType(input);
  } catch (error) {
    rethrowCliError(error);
  }
}

export function parseCountdownTimerMode(input: string | number | undefined): TickTickCountdownTimerMode | undefined {
  try {
    return parseTickTickCountdownTimerMode(input);
  } catch (error) {
    rethrowCliError(error);
  }
}

export function parseCountdownDayCalculationMode(
  input: string | number | undefined,
): TickTickCountdownDayCalculationMode | undefined {
  try {
    return parseTickTickCountdownDayCalculationMode(input);
  } catch (error) {
    rethrowCliError(error);
  }
}

export function parseCountdownDaysOption(input: string | number | undefined): TickTickCountdownDaysOption | undefined {
  try {
    return parseTickTickCountdownDaysOption(input);
  } catch (error) {
    rethrowCliError(error);
  }
}

export function formatCountdownTypeLabel(value: number | undefined): string {
  return formatTickTickCountdownType(value);
}

export function formatCountdownTimerModeLabel(value: number | undefined): string {
  return formatTickTickCountdownTimerMode(value);
}

export function formatCountdownDayCalculationModeLabel(value: number | undefined): string {
  return formatTickTickCountdownDayCalculationMode(value);
}

export function formatCountdownDaysOptionLabel(value: number | undefined): string {
  return formatTickTickCountdownDaysOption(value);
}

function normalizeLabel(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function displayLabel(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

/**
 * Generic resolver for TickTick entities (projects, habits, tags, etc.)
 */
function resolveEntity<T>(
  entities: T[],
  reference: string,
  options: {
    type: string;
    getId: (item: T) => string | undefined;
    getName: (item: T) => string | undefined;
  },
): T {
  const normalized = normalizeLabel(reference);

  // 1. Try exact match on ID or Name
  const exact = entities.find(
    (item) =>
      options.getId(item) === reference ||
      normalizeLabel(options.getName(item)) === normalized,
  );
  if (exact) return exact;

  // 2. Try partial match on Name
  const matches = entities.filter((item) =>
    normalizeLabel(options.getName(item)).includes(normalized),
  );

  if (matches.length === 1) return matches[0]!;

  if (matches.length > 1) {
    throw new CliError(
      `${options.type} "${reference}" is ambiguous: ${matches
        .map((item) => displayLabel(options.getName(item), options.getId(item) ?? ""))
        .join(", ")}.`,
    );
  }

  throw new CliError(`${options.type} "${reference}" was not found.`);
}

export function resolveProject(
  projects: TickTickProjectProfile[],
  reference: string,
): TickTickProjectProfile {
  return resolveEntity(projects, reference, {
    type: "Project",
    getId: (p) => p.id,
    getName: (p) => p.name,
  });
}

export function resolveProjects(
  projects: TickTickProjectProfile[],
  references: string[],
): TickTickProjectProfile[] {
  return references.map((reference) => resolveProject(projects, reference));
}

export function resolveTask(tasks: TickTickTask[], reference: string): TickTickTask {
  return resolveEntity(tasks, reference, {
    type: "Task",
    getId: (t) => t.id,
    getName: (t) => t.title,
  });
}

export function resolveCountdown(
  countdowns: TickTickCountdown[],
  reference: string,
): TickTickCountdown {
  return resolveEntity(countdowns, reference, {
    type: "Countdown",
    getId: (c) => c.id,
    getName: (c) => c.name,
  });
}

export function resolveTasks(tasks: TickTickTask[], references: string[]): TickTickTask[] {
  return references.map((reference) => resolveTask(tasks, reference));
}

export function resolveHabit(habits: TickTickHabit[], reference: string): TickTickHabit {
  return resolveEntity(habits, reference, {
    type: "Habit",
    getId: (h) => h.id,
    getName: (h) => h.name,
  });
}

export function looksLikeTaskId(input: string): boolean {
  return /^[a-f0-9]{24}$/i.test(input.trim());
}

export async function resolveTaskByReference(
  client: TickTickClient,
  reference: string,
  options: { includeCompleted?: boolean } = {},
): Promise<TickTickTask> {
  if (looksLikeTaskId(reference)) {
    try {
      return await client.tasks.get(reference, options);
    } catch (error) {
      if (!(error instanceof TickTickNotFoundError)) {
        throw error;
      }
    }
  }

  // Fallback to name resolution
  const [openTasks, completedTasks, abandonedTasks] = await Promise.all([
    client.tasks.listActive(),
    options.includeCompleted
      ? client.tasks.listCompleted({ status: "Completed" })
      : Promise.resolve([]),
    options.includeCompleted
      ? client.tasks.listCompleted({ status: "Abandoned" })
      : Promise.resolve([]),
  ]);

  return resolveTask([...openTasks, ...completedTasks, ...abandonedTasks], reference);
}

export async function resolveTasksByReferences(
  client: TickTickClient,
  references: string[],
  options: { includeCompleted?: boolean } = {},
): Promise<TickTickTask[]> {
  // Try fast path: all are IDs
  if (references.every(looksLikeTaskId)) {
    try {
      return await Promise.all(references.map((id) => client.tasks.get(id, options)));
    } catch (error) {
      if (!(error instanceof TickTickNotFoundError)) {
        throw error;
      }
    }
  }

  // Fallback: fetch all and resolve
  const [openTasks, completedTasks, abandonedTasks] = await Promise.all([
    client.tasks.listActive(),
    options.includeCompleted
      ? client.tasks.listCompleted({ status: "Completed" })
      : Promise.resolve([]),
    options.includeCompleted
      ? client.tasks.listCompleted({ status: "Abandoned" })
      : Promise.resolve([]),
  ]);

  const allTasks = [...openTasks, ...completedTasks, ...abandonedTasks];
  return references.map((ref) => resolveTask(allTasks, ref));
}

export function indexProjects(projects: TickTickProjectProfile[]): Map<string, TickTickProjectProfile> {
  return new Map(projects.map((project) => [project.id, project]));
}

export function pickTaskCollection(
  tasks: TickTickTask[],
  options: {
    completed?: boolean;
    projectId?: string;
    search?: string;
  } = {},
): TickTickTask[] {
  const search = options.search?.trim().toLowerCase();
  return tasks.filter((task) => {
    if (options.completed != null) {
      const isClosed = task.status !== TickTickTaskStatuses.open;
      if (isClosed !== options.completed) {
        return false;
      }
    }

    if (options.projectId && task.projectId !== options.projectId) {
      return false;
    }

    if (!search) {
      return true;
    }

    return [task.title, task.content ?? "", task.desc ?? ""].some((value) => value.toLowerCase().includes(search));
  });
}

export function sortTasks(
  tasks: TickTickTask[],
  field: TaskSortField = "updated",
  order: SortOrder = "desc",
): TickTickTask[] {
  const direction = order === "asc" ? 1 : -1;

  return [...tasks].sort((left, right) => {
    if (field === "title") {
      return direction * left.title.localeCompare(right.title, undefined, { sensitivity: "base" });
    }

    if (field === "priority") {
      return direction * compareNumbers(left.priority ?? 0, right.priority ?? 0);
    }

    const leftDate = field === "created" ? left.createdTime : field === "due" ? left.dueDate : left.modifiedTime;
    const rightDate = field === "created" ? right.createdTime : field === "due" ? right.dueDate : right.modifiedTime;
    return direction * compareNumbers(parseApiDate(leftDate)?.getTime() ?? 0, parseApiDate(rightDate)?.getTime() ?? 0);
  });
}

function compareNumbers(left: number, right: number): number {
  if (left === right) {
    return 0;
  }

  return left < right ? -1 : 1;
}

export function pickHabits(habits: TickTickHabit[], search: string | undefined): TickTickHabit[] {
  const normalized = search?.trim().toLowerCase();
  if (!normalized) {
    return habits;
  }

  return habits.filter((habit) => habit.name.toLowerCase().includes(normalized));
}

export function parseApiDate(value: unknown): Date | null {
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }

  const normalized = value.replace(/\+0000$/, "Z");
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    const record: Record<string, unknown> = {
      name: error.name,
      message: error.message,
    };

    for (const key of ["code", "status", "url", "method", "responseBody"]) {
      const value = Reflect.get(error as object, key);
      if (value !== undefined) {
        record[key] = value;
      }
    }

    return record;
  }

  return { message: String(error) };
}
