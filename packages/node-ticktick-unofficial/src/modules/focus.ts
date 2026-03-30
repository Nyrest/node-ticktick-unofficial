import { toApiDateTime } from "../internal/dates.js";
import { createObjectId } from "../internal/ids.js";
import type { TickTickClient } from "../client.js";
import type {
  TickTickFocusBatchRequest,
  TickTickFocusOperation,
  TickTickFocusOperationName,
  TickTickFocusOverview,
  TickTickFocusStateSnapshot,
  TickTickFocusTimelineEntry,
} from "../types.js";

interface InternalFocusState {
  lastPoint: number;
  focusId: string | null;
  firstFocusId: string | null;
  duration: number;
  autoPomoLeft: number;
  pomoCount: number;
  manual: boolean;
  note: string;
  focusOnId: string;
  focusOnType: number | null;
  focusOnTitle: string | null;
  status: number | null;
  rawCurrent: Record<string, unknown>;
}

const DEFAULT_STATE: InternalFocusState = {
  lastPoint: 0,
  focusId: null,
  firstFocusId: null,
  duration: 25,
  autoPomoLeft: 0,
  pomoCount: 0,
  manual: true,
  note: "",
  focusOnId: "",
  focusOnType: null,
  focusOnTitle: null,
  status: null,
  rawCurrent: {},
};

export class TickTickFocusApi {
  #state: InternalFocusState = { ...DEFAULT_STATE };

  constructor(private readonly client: TickTickClient) {}

  getState(): TickTickFocusStateSnapshot {
    return structuredClone(this.#state);
  }

  resetState(): void {
    this.#state = { ...DEFAULT_STATE, lastPoint: this.#state.lastPoint };
  }

  setLastPoint(lastPoint: number): void {
    this.#state.lastPoint = Math.max(0, Math.trunc(lastPoint));
  }

  getOverview(): Promise<TickTickFocusOverview> {
    return this.client.requestJson<TickTickFocusOverview>({
      path: "/api/v2/pomodoros/statistics/generalForDesktop",
    });
  }

  getGeneralForDesktop(): Promise<TickTickFocusOverview> {
    return this.getOverview();
  }

  getTimeline(to?: number): Promise<TickTickFocusTimelineEntry[]> {
    return this.client.requestJson<TickTickFocusTimelineEntry[]>({
      path: to == null ? "/api/v2/pomodoros/timeline" : `/api/v2/pomodoros/timeline?to=${to}`,
    });
  }

  getDistribution(startDate: string, endDate: string): Promise<Record<string, unknown>> {
    return this.client.requestJson<Record<string, unknown>>({
      path: `/api/v2/pomodoros/statistics/dist/${startDate}/${endDate}`,
    });
  }

  getHeatmap(startDate: string, endDate: string): Promise<Array<Record<string, unknown>>> {
    return this.client.requestJson<Array<Record<string, unknown>>>({
      path: `/api/v2/pomodoros/statistics/heatmap/${startDate}/${endDate}`,
    });
  }

  getTimeDistribution(startDate: string, endDate: string): Promise<Array<Record<string, unknown>>> {
    return this.client.requestJson<Array<Record<string, unknown>>>({
      path: `/api/v2/pomodoros/statistics/dist/clockByDay/${startDate}/${endDate}`,
    });
  }

  getHourDistribution(startDate: string, endDate: string): Promise<Array<Record<string, unknown>>> {
    return this.client.requestJson<Array<Record<string, unknown>>>({
      path: `/api/v2/pomodoros/statistics/dist/clock/${startDate}/${endDate}`,
    });
  }

  batch(request: TickTickFocusBatchRequest): Promise<Record<string, unknown>> {
    return this.client
      .requestJson<Record<string, unknown>>({
        path: "/focus/batch/focusOp",
        base: "ms",
        method: "POST",
        json: request,
      })
      .then((response) => {
        this.#updateStateFromResponse(response);
        return response;
      });
  }

  async syncCurrentState(lastPoint?: number): Promise<Record<string, unknown>> {
    return this.batch({
      lastPoint: lastPoint ?? this.#state.lastPoint,
      opList: [],
    });
  }

  getCurrentState(lastPoint?: number): Promise<Record<string, unknown>> {
    return this.syncCurrentState(lastPoint);
  }

  async start(options: {
    duration?: number;
    autoPomoLeft?: number;
    pomoCount?: number;
    manual?: boolean;
    note?: string;
    focusOnId?: string;
    focusOnType?: number | null;
    focusOnTitle?: string | null;
    lastPoint?: number;
  } = {}): Promise<Record<string, unknown>> {
    const focusId = createObjectId();
    const duration = options.duration ?? 25;
    const autoPomoLeft = options.autoPomoLeft ?? 5;
    const pomoCount = options.pomoCount ?? 1;
    const manual = options.manual ?? true;
    const note = options.note ?? "";
    const focusOnId = options.focusOnId ?? "";
    const focusOnType = options.focusOnType ?? null;
    const focusOnTitle = options.focusOnTitle ?? null;

    this.#state = {
      ...this.#state,
      focusId,
      firstFocusId: focusId,
      duration,
      autoPomoLeft,
      pomoCount,
      manual,
      note,
      focusOnId,
      focusOnType,
      focusOnTitle,
    };

    const operation: TickTickFocusOperation = {
      id: createObjectId(),
      oId: focusId,
      oType: 0,
      op: "start",
      duration,
      firstFocusId: focusId,
      focusOnId,
      focusOnType,
      focusOnTitle,
      autoPomoLeft,
      pomoCount,
      manual,
      note,
      time: toApiDateTime(new Date()) ?? "",
      createdTime: Date.now(),
    };

    return this.batch({
      lastPoint: options.lastPoint ?? this.#state.lastPoint,
      opList: [operation],
    });
  }

  pause(options: Partial<Pick<TickTickFocusOperation, "manual" | "note">> & { lastPoint?: number } = {}) {
    return this.#sendSessionOperation("pause", options);
  }

  resume(options: Partial<Pick<TickTickFocusOperation, "manual" | "note">> & { lastPoint?: number } = {}) {
    return this.#sendSessionOperation("continue", options);
  }

  finish(options: Partial<Pick<TickTickFocusOperation, "manual" | "note">> & { lastPoint?: number } = {}) {
    return this.#sendSessionOperation("finish", options);
  }

  stop(
    options: Partial<Pick<TickTickFocusOperation, "manual" | "note">> & {
      lastPoint?: number;
      includeExit?: boolean;
    } = {},
  ) {
    const drop = this.#composeOperation("drop", {
      manual: options.manual,
      note: options.note,
      duration: 0,
    });

    const operations = [drop];

    if (options.includeExit !== false) {
      operations.push(
        this.#composeOperation("exit", {
          manual: options.manual,
          note: options.note,
          duration: 0,
          autoPomoLeft: 0,
          pomoCount: 0,
        }),
      );
    }

    return this.batch({
      lastPoint: options.lastPoint ?? this.#state.lastPoint,
      opList: operations,
    });
  }

  #sendSessionOperation(
    op: TickTickFocusOperationName,
    options: Partial<Pick<TickTickFocusOperation, "manual" | "note">> & { lastPoint?: number },
  ): Promise<Record<string, unknown>> {
    const operation = this.#composeOperation(op, options);

    return this.batch({
      lastPoint: options.lastPoint ?? this.#state.lastPoint,
      opList: [operation],
    });
  }

  #composeOperation(
    op: TickTickFocusOperationName,
    overrides: Partial<TickTickFocusOperation> = {},
  ): TickTickFocusOperation {
    if (!this.#state.focusId) {
      throw new Error("No active focus session is available.");
    }

    return {
      id: createObjectId(),
      oId: this.#state.focusId,
      oType: 0,
      op,
      duration: overrides.duration ?? this.#state.duration,
      firstFocusId: this.#state.firstFocusId ?? this.#state.focusId,
      focusOnId: overrides.focusOnId ?? this.#state.focusOnId,
      focusOnType: overrides.focusOnType ?? this.#state.focusOnType,
      focusOnTitle: overrides.focusOnTitle ?? this.#state.focusOnTitle,
      autoPomoLeft: overrides.autoPomoLeft ?? this.#state.autoPomoLeft,
      pomoCount: overrides.pomoCount ?? this.#state.pomoCount,
      manual: overrides.manual ?? this.#state.manual,
      note: overrides.note ?? this.#state.note,
      time: overrides.time ?? (toApiDateTime(new Date()) ?? ""),
      createdTime: overrides.createdTime ?? Date.now(),
    };
  }

  #updateStateFromResponse(response: Record<string, unknown>): void {
    const point = response.point;
    if (typeof point === "number") {
      this.#state.lastPoint = point;
    }

    const current = response.current;
    if (!current || typeof current !== "object") {
      return;
    }

    const rawCurrent = current as Record<string, unknown>;
    this.#state.rawCurrent = rawCurrent;
    this.#state.status = typeof rawCurrent.status === "number" ? rawCurrent.status : this.#state.status;
    this.#state.focusId = typeof rawCurrent.id === "string" ? rawCurrent.id : this.#state.focusId;
    this.#state.firstFocusId =
      typeof rawCurrent.firstFocusId === "string"
        ? rawCurrent.firstFocusId
        : typeof rawCurrent.firstId === "string"
          ? rawCurrent.firstId
          : this.#state.firstFocusId;
    this.#state.duration = typeof rawCurrent.duration === "number" ? rawCurrent.duration : this.#state.duration;
    this.#state.autoPomoLeft =
      typeof rawCurrent.autoPomoLeft === "number" ? rawCurrent.autoPomoLeft : this.#state.autoPomoLeft;
    this.#state.pomoCount = typeof rawCurrent.pomoCount === "number" ? rawCurrent.pomoCount : this.#state.pomoCount;
    this.#state.note = typeof rawCurrent.note === "string" ? rawCurrent.note : this.#state.note;

    const focusLogs = Array.isArray(rawCurrent.focusOnLogs) ? rawCurrent.focusOnLogs : [];
    const lastFocusLog = focusLogs.at(-1);
    if (lastFocusLog && typeof lastFocusLog === "object" && typeof (lastFocusLog as { id?: unknown }).id === "string") {
      this.#state.focusOnId = (lastFocusLog as { id: string }).id;
    }

    const focusTasks = Array.isArray(rawCurrent.focusTasks) ? rawCurrent.focusTasks : [];
    const lastFocusTask = focusTasks.at(-1);
    if (lastFocusTask && typeof lastFocusTask === "object") {
      const typedTask = lastFocusTask as { type?: unknown; title?: unknown };
      this.#state.focusOnType = typeof typedTask.type === "number" ? typedTask.type : this.#state.focusOnType;
      this.#state.focusOnTitle = typeof typedTask.title === "string" ? typedTask.title : this.#state.focusOnTitle;
    }

    if (rawCurrent.exited === true || this.#state.status === 2 || this.#state.status === 3) {
      this.resetState();
    }
  }
}
