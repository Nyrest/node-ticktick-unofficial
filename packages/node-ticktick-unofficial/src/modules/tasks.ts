import { toApiDateTime } from "../internal/dates.js";
import { createObjectId } from "../internal/ids.js";
import type { TickTickClient } from "../client.js";
import { TickTickTaskPriorities, TickTickTaskStatuses, parseTickTickTaskPriority, parseTickTickTaskStatus } from "../semantic.js";
import type {
  TickTickCompletedTaskOptions,
  TickTickTask,
  TickTickTaskBatchRequest,
  TickTickTaskBatchResponse,
  TickTickTaskDraft,
  TickTickTaskProjectMove,
  TickTickTaskStatusMutation,
  TickTickTaskSyncResponse,
  TickTickTrashResponse,
} from "../types.js";

export class TickTickTasksApi {
  readonly #taskCache = new Map<string, TickTickTask>();

  constructor(private readonly client: TickTickClient) {}

  getAll(): Promise<TickTickTaskSyncResponse> {
    return this.client.requestJson<TickTickTaskSyncResponse>({
      path: "/api/v2/batch/check/0",
    }).then((response) => {
      this.#rememberTasks(response.syncTaskBean?.update ?? []);
      return response;
    });
  }

  async list(): Promise<TickTickTask[]> {
    const response = await this.getAll();
    return response.syncTaskBean?.update ?? [];
  }

  async getById(taskId: string, options: { includeCompleted?: boolean } = {}): Promise<TickTickTask | null> {
    const cachedTask = this.#taskCache.get(taskId);
    if (cachedTask) {
      return cachedTask;
    }

    const tasks = await this.list();
    const task = tasks.find((item) => item.id === taskId);
    if (task || options.includeCompleted === false) {
      if (task) {
        this.#rememberTask(task);
      }
      return task ?? null;
    }

    for (const status of ["Completed", "Abandoned"] as const) {
      for await (const page of this.iterateCompleted(status)) {
        const completedTask = page.find((item) => item.id === taskId);
        if (completedTask) {
          this.#rememberTask(completedTask);
          return completedTask;
        }
      }
    }

    return null;
  }

  listCompleted(options: TickTickCompletedTaskOptions = {}): Promise<TickTickTask[]> {
    const params = new URLSearchParams({
      from: "",
      status: options.status ?? "Completed",
    });

    if (options.to) {
      params.set("to", options.to.replace("T", " ").replace(".000+0000", ""));
    }

    return this.client.requestJson<TickTickTask[]>({
      path: `/api/v2/project/all/closed?${params.toString()}`,
    });
  }

  async *iterateCompleted(status: TickTickCompletedTaskOptions["status"] = "Completed"): AsyncGenerator<TickTickTask[]> {
    let to: string | undefined;

    for (;;) {
      const page = await this.listCompleted({ status, to });
      if (page.length === 0) {
        return;
      }

      yield page;

      if (page.length < 50) {
        return;
      }

      to = page.at(-1)?.completedTime as string | undefined;
      if (!to) {
        return;
      }
    }
  }

  listTrash(limit = 50, taskType = 1): Promise<TickTickTrashResponse> {
    const params = new URLSearchParams({
      limit: String(limit),
      type: String(taskType),
    });

    return this.client.requestJson<TickTickTrashResponse>({
      path: `/api/v2/project/all/trash/page?${params.toString()}`,
    });
  }

  batch(payload: TickTickTaskBatchRequest): Promise<TickTickTaskBatchResponse> {
    return this.client.requestJson<TickTickTaskBatchResponse>({
      path: "/api/v2/batch/task",
      method: "POST",
      json: {
        add: payload.add ?? [],
        update: payload.update ?? [],
        delete: payload.delete ?? [],
        addAttachments: payload.addAttachments ?? [],
        updateAttachments: payload.updateAttachments ?? [],
        deleteAttachments: payload.deleteAttachments ?? [],
      },
    });
  }

  moveBetweenProjects(move: TickTickTaskProjectMove | TickTickTaskProjectMove[]): Promise<TickTickTaskBatchResponse> {
    const payload = Array.isArray(move) ? move : [move];
    return this.client.requestJson<TickTickTaskBatchResponse>({
      path: "/api/v2/batch/taskProject",
      method: "POST",
      json: payload,
    });
  }

  async create(input: TickTickTaskDraft): Promise<TickTickTask>;
  async create(input: TickTickTaskDraft[]): Promise<TickTickTask[]>;
  async create(input: TickTickTaskDraft | TickTickTaskDraft[]): Promise<TickTickTask | TickTickTask[]> {
    const drafts = Array.isArray(input) ? input : [input];
    const tasks = await this.#buildCreatePayloads(drafts);
    if (!Array.isArray(input)) {
      return this.#upsertTask(tasks[0]!);
    }

    await this.batch({ add: tasks });
    this.#rememberTasks(tasks);
    return tasks;
  }

  async update(tasks: TickTickTask): Promise<TickTickTask>;
  async update(tasks: TickTickTask[]): Promise<TickTickTask[]>;
  async update(tasks: TickTickTask | TickTickTask[]): Promise<TickTickTask | TickTickTask[]> {
    if (!Array.isArray(tasks)) {
      await this.batch({ update: [tasks] });
      this.#rememberTask(tasks);
      return tasks;
    }

    await this.batch({ update: tasks });
    this.#rememberTasks(tasks);
    return tasks;
  }

  async move(taskId: string, toProjectId: string): Promise<TickTickTask> {
    const task = await this.#requireTask(taskId);
    if (task.projectId === toProjectId) {
      return task;
    }

    const columns = await this.client.projects.listColumns(toProjectId);
    await this.moveBetweenProjects({
      taskId,
      fromProjectId: task.projectId,
      toProjectId,
    });

    const movedTask: TickTickTask = {
      ...task,
      projectId: toProjectId,
      columnId: columns[0]?.id ?? null,
      modifiedTime: toApiDateTime(new Date()) ?? task.modifiedTime,
    };

    await this.update(movedTask);
    const resolvedTask = (await this.getById(taskId)) ?? movedTask;
    this.#rememberTask(resolvedTask);
    return resolvedTask;
  }

  async setStatus(change: TickTickTaskStatusMutation): Promise<TickTickTask>;
  async setStatus(change: TickTickTaskStatusMutation[]): Promise<TickTickTask[]>;
  async setStatus(
    change: TickTickTaskStatusMutation | TickTickTaskStatusMutation[],
  ): Promise<TickTickTask | TickTickTask[]> {
    if (!Array.isArray(change)) {
      const task = await this.#buildStatusUpdate(change);
      await this.batch({ update: [task] });
      this.#rememberTask(task);
      return task;
    }

    const updates = await Promise.all(change.map((entry) => this.#buildStatusUpdate(entry)));
    await this.batch({ update: updates });
    this.#rememberTasks(updates);
    return updates;
  }

  async delete(taskId: string): Promise<TickTickTask>;
  async delete(taskIds: string[]): Promise<TickTickTask[]>;
  async delete(taskIds: string | string[]): Promise<TickTickTask | TickTickTask[]> {
    if (!Array.isArray(taskIds)) {
      const task = await this.#buildDeletedTask(taskIds);
      await this.batch({ update: [task] });
      this.#rememberTask(task);
      return task;
    }

    const updates = await Promise.all(taskIds.map((taskId) => this.#buildDeletedTask(taskId)));
    await this.batch({ update: updates });
    this.#rememberTasks(updates);
    return updates;
  }

  async #requireTask(taskId: string, options: { includeCompleted?: boolean } = {}): Promise<TickTickTask> {
    const task = await this.getById(taskId, options);
    if (!task) {
      throw new Error(`Task ${taskId} was not found.`);
    }

    return task;
  }

  #currentUserId(): number | undefined {
    const rawUserId = this.client.getSession()?.login?.userId;
    if (typeof rawUserId === "number") {
      return rawUserId;
    }

    const parsedUserId = Number(rawUserId);
    return Number.isFinite(parsedUserId) ? parsedUserId : undefined;
  }

  async #upsertTask(task: TickTickTask): Promise<TickTickTask> {
    const response = await this.client.requestJson<TickTickTask | null>({
      path: "/api/v2/task",
      method: "POST",
      json: task,
    });

    const resolvedTask = response && typeof response === "object" ? response : task;
    this.#rememberTask(resolvedTask);
    return resolvedTask;
  }

  #rememberTask(task: TickTickTask): void {
    this.#taskCache.set(task.id, task);
  }

  #rememberTasks(tasks: TickTickTask[]): void {
    for (const task of tasks) {
      this.#rememberTask(task);
    }
  }

  async #buildStatusUpdate(entry: TickTickTaskStatusMutation): Promise<TickTickTask> {
    const task = await this.#requireTask(entry.id, { includeCompleted: true });
    const status = parseTickTickTaskStatus(entry.status) ?? TickTickTaskStatuses.open;
    const completedTime =
      status === TickTickTaskStatuses.open ? null : toApiDateTime(entry.completedTime ?? task.completedTime ?? new Date());

    return {
      ...task,
      status,
      completedTime,
      completedUserId: completedTime ? this.#currentUserId() : undefined,
      modifiedTime: toApiDateTime(new Date()) ?? task.modifiedTime,
    };
  }

  async #buildDeletedTask(taskId: string): Promise<TickTickTask> {
    const task = await this.#requireTask(taskId);
    return {
      ...task,
      deleted: 1,
      modifiedTime: toApiDateTime(new Date()) ?? task.modifiedTime,
    };
  }

  async #buildCreatePayloads(inputs: TickTickTaskDraft[]): Promise<TickTickTask[]> {
    const session = this.client.getSession();
    const columnIdCache = new Map<string, string | null>();
    const tasks: TickTickTask[] = [];

    for (const input of inputs) {
      const projectId = input.projectId ?? session?.login?.inboxId;
      if (!projectId) {
        throw new Error("projectId is required. Provide it explicitly or log in with an account that returns inboxId.");
      }

      let columnId = input.columnId ?? null;
      if (!columnId) {
        if (!columnIdCache.has(projectId)) {
          const columns = await this.client.projects.listColumns(projectId);
          columnIdCache.set(projectId, columns[0]?.id ?? null);
        }

        columnId = columnIdCache.get(projectId) ?? null;
      }

      const timestamp = new Date();
      const priority = parseTickTickTaskPriority(input.priority) ?? TickTickTaskPriorities.none;
      const status = parseTickTickTaskStatus(input.status) ?? TickTickTaskStatuses.open;
      const completedTime =
        status === TickTickTaskStatuses.completed || status === TickTickTaskStatuses.wontDo
          ? toApiDateTime(input.completedTime ?? timestamp) ?? undefined
          : null;

      tasks.push({
        ...input,
        items: [],
        reminders: [],
        exDate: [],
        completedTime,
        completedUserId: completedTime ? this.#currentUserId() : undefined,
        dueDate: input.dueDate ? toApiDateTime(input.dueDate) : null,
        priority,
        progress: (input.progress as number | undefined) ?? 0,
        sortOrder: input.sortOrder ?? Number(-(BigInt(Date.now()) * 1024n)),
        startDate: input.startDate ? toApiDateTime(input.startDate) : null,
        isFloating: input.isFloating ?? false,
        isAllDay: input.isAllDay ?? Boolean(input.startDate && !String(input.startDate).includes("T")),
        columnId,
        status,
        projectId,
        kind: input.kind ?? null,
        createdTime: toApiDateTime(timestamp) ?? undefined,
        modifiedTime: toApiDateTime(timestamp) ?? undefined,
        title: input.title,
        tags: input.tags ?? [],
        timeZone: input.timeZone ?? this.client.timezone,
        content: input.content ?? "",
        id: input.id ?? createObjectId(timestamp),
        desc: input.desc ?? null,
      });
    }

    return tasks;
  }
}
