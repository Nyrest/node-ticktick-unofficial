import { toApiDateTime, toDateStamp } from "../internal/dates.js";
import { createObjectId } from "../internal/ids.js";
import type { TickTickClient } from "../client.js";
import {
  TickTickHabitCheckinStatuses,
  TickTickHabitStatuses,
  parseTickTickHabitCheckinStatus,
  parseTickTickHabitStatus,
} from "../semantic.js";
import type {
  TickTickDeleteResult,
  TickTickHabit,
  TickTickHabitBatchRequest,
  TickTickHabitBatchResponse,
  TickTickHabitCheckin,
  TickTickHabitCheckinUpsertInput,
  TickTickHabitCheckinBatchRequest,
  TickTickHabitDraft,
  TickTickHabitCheckinQuery,
  TickTickHabitCheckinQueryResponse,
  TickTickHabitUpdate,
} from "../types.js";

export class TickTickHabitsApi {
  constructor(private readonly client: TickTickClient) {}

  list(): Promise<TickTickHabit[]> {
    return this.client.requestJson<TickTickHabit[]>({
      path: "/api/v2/habits",
    });
  }

  async findById(habitId: string): Promise<TickTickHabit | null> {
    const habits = await this.list();
    return habits.find((habit) => habit.id === habitId) ?? null;
  }

  getHabits(): Promise<TickTickHabit[]> {
    return this.list();
  }

  batch(payload: TickTickHabitBatchRequest): Promise<TickTickHabitBatchResponse> {
    return this.client.requestJson<TickTickHabitBatchResponse>({
      path: "/api/v2/habits/batch",
      method: "POST",
      json: {
        add: payload.add ?? [],
        update: payload.update ?? [],
        delete: payload.delete ?? [],
      },
    });
  }

  async create(input: TickTickHabitDraft): Promise<TickTickHabit>;
  async create(input: TickTickHabitDraft[]): Promise<TickTickHabit[]>;
  async create(input: TickTickHabitDraft | TickTickHabitDraft[]): Promise<TickTickHabit | TickTickHabit[]> {
    const habits = (Array.isArray(input) ? input : [input]).map((draft) => this.#buildCreatePayload(draft));
    const response = await this.batch({ add: habits });
    const result = habits.map((habit) => ({
      ...habit,
      etag: response.id2etag?.[habit.id] ?? habit.etag,
    }));
    return Array.isArray(input) ? result : result[0]!;
  }

  #buildCreatePayload(input: TickTickHabitDraft): TickTickHabit {
    const timestamp = new Date();
    return {
      color: input.color ?? "",
      iconRes: input.iconRes ?? "",
      createdTime: toApiDateTime(timestamp) ?? undefined,
      encouragement: (input.encouragement as string | undefined) ?? "",
      etag: input.etag ?? "",
      goal: input.goal ?? 1,
      id: input.id ?? createObjectId(timestamp),
      modifiedTime: toApiDateTime(timestamp) ?? undefined,
      name: input.name,
      recordEnable: input.recordEnable ?? true,
      reminders: input.reminders ?? [],
      repeatRule: input.repeatRule ?? "RRULE:FREQ=DAILY;INTERVAL=1",
      sortOrder: input.sortOrder ?? 0,
      status: parseTickTickHabitStatus(input.status) ?? TickTickHabitStatuses.normal,
      step: input.step ?? 1,
      totalCheckIns: input.totalCheckIns ?? 0,
      type: input.type ?? "number",
      unit: input.unit ?? "times",
      sectionId: input.sectionId ?? "-1",
      targetDays: input.targetDays ?? 0,
      targetStartDate: input.targetStartDate ?? toDateStamp(timestamp),
      completedCycles: input.completedCycles ?? 0,
      currentStreak: input.currentStreak ?? 0,
      style: input.style ?? 1,
      exDates: input.exDates ?? [],
      archivedTime: input.archivedTime ?? null,
    };
  }

  async update(habit: TickTickHabitUpdate): Promise<TickTickHabitUpdate>;
  async update(habits: TickTickHabitUpdate[]): Promise<TickTickHabitUpdate[]>;
  async update(habits: TickTickHabitUpdate | TickTickHabitUpdate[]): Promise<TickTickHabitUpdate | TickTickHabitUpdate[]> {
    const updates = Array.isArray(habits) ? habits : [habits];
    await this.batch({ update: updates });
    return habits;
  }

  async delete(habitId: string): Promise<TickTickDeleteResult>;
  async delete(habitIds: string[]): Promise<TickTickDeleteResult[]>;
  async delete(habitIds: string | string[]): Promise<TickTickDeleteResult | TickTickDeleteResult[]> {
    const ids = Array.isArray(habitIds) ? habitIds : [habitIds];
    await this.batch({ delete: ids });
    const result = ids.map((id) => ({ id, deleted: true }) satisfies TickTickDeleteResult);
    return Array.isArray(habitIds) ? result : result[0]!;
  }

  getWeekCurrentStatistics(): Promise<Record<string, { totalHabitCount: number; completedHabitCount: number }>> {
    return this.client.requestJson<Record<string, { totalHabitCount: number; completedHabitCount: number }>>({
      path: "/api/v2/habits/statistics/week/current",
    });
  }

  queryCheckins(query: TickTickHabitCheckinQuery): Promise<TickTickHabitCheckinQueryResponse> {
    return this.client.requestJson<TickTickHabitCheckinQueryResponse>({
      path: "/api/v2/habitCheckins/query",
      method: "POST",
      json: query,
    });
  }

  batchCheckins(payload: TickTickHabitCheckinBatchRequest): Promise<Record<string, unknown>> {
    return this.client.requestJson<Record<string, unknown>>({
      path: "/api/v2/habitCheckins/batch",
      method: "POST",
      json: {
        add: payload.add ?? [],
        update: payload.update ?? [],
        delete: payload.delete ?? [],
      },
    });
  }

  async upsertCheckin(input: TickTickHabitCheckinUpsertInput): Promise<Record<string, unknown>> {
    if (input.status != null && input.value != null) {
      throw new Error("Provide either value or status for a habit checkin, not both.");
    }

    const stamp = toDateStamp(input.date ?? new Date());
    const existing = await this.queryCheckins({
      habitIds: [input.habitId],
      afterStamp: stamp - 1,
    });

    const current = existing.checkins[input.habitId]?.find((entry) => entry.checkinStamp === stamp);
    const status = parseTickTickHabitCheckinStatus(input.status);
    const resolvedValue = input.value ?? (status === TickTickHabitCheckinStatuses.done ? input.goal : 0);
    const resolvedStatus =
      status ?? (resolvedValue >= input.goal ? TickTickHabitCheckinStatuses.done : TickTickHabitCheckinStatuses.unlabeled);
    const now = toApiDateTime(new Date());

    const checkin: TickTickHabitCheckin = {
      id: current?.id ?? createObjectId(),
      habitId: input.habitId,
      checkinStamp: stamp,
      checkinTime: now,
      opTime: now,
      goal: input.goal,
      value: resolvedValue,
      status: resolvedStatus,
    };

    return this.batchCheckins({
      add: current ? [] : [checkin],
      update: current ? [checkin] : [],
      delete: [],
    });
  }

  async export(): Promise<Uint8Array> {
    // TickTick applies a server-side rate limit to habits export and can return
    // `export_too_many_times` even when the request shape is correct.
    const buffer = await this.client.requestBuffer({
      path: "/api/v2/data/export/habits",
      headers: {
        accept: "*/*",
      },
    });

    return new Uint8Array(buffer);
  }
}
