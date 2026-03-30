import { toApiDateTime, toDateStamp } from "../internal/dates.js";
import { createObjectId } from "../internal/ids.js";
import type { TickTickClient } from "../client.js";
import {
  TickTickCountdownDaysOptions,
  TickTickCountdownTimerModes,
  TickTickCountdownTypes,
  parseTickTickCountdownDaysOption,
  parseTickTickCountdownTimerMode,
  parseTickTickCountdownType,
} from "../semantic.js";
import type {
  TickTickCountdown,
  TickTickCountdownBatchRequest,
  TickTickCountdownBatchResponse,
  TickTickCountdownDraft,
} from "../types.js";

export class TickTickCountdownsApi {
  constructor(private readonly client: TickTickClient) {}

  async list(): Promise<TickTickCountdown[]> {
    const response = await this.client.requestJson<{ countdowns?: TickTickCountdown[] }>({
      path: "/api/v2/countdown/list",
    });

    return response.countdowns ?? [];
  }

  async getById(countdownId: string): Promise<TickTickCountdown | null> {
    const countdowns = await this.list();
    return countdowns.find((countdown) => countdown.id === countdownId) ?? null;
  }

  batch(payload: TickTickCountdownBatchRequest): Promise<TickTickCountdownBatchResponse> {
    return this.client.requestJson<TickTickCountdownBatchResponse>({
      path: "/api/v2/countdown/batch",
      method: "POST",
      json: {
        add: payload.add ?? [],
        update: payload.update ?? [],
        delete: payload.delete ?? [],
      },
    });
  }

  create(input: TickTickCountdownDraft): Promise<TickTickCountdownBatchResponse> {
    return this.batch({ add: [this.#buildCreatePayload(input)] });
  }

  update(countdowns: TickTickCountdown | TickTickCountdown[]): Promise<TickTickCountdownBatchResponse> {
    return this.batch({
      update: Array.isArray(countdowns) ? countdowns : [countdowns],
    });
  }

  delete(countdownIds: string | string[]): Promise<TickTickCountdownBatchResponse> {
    return this.batch({
      delete: Array.isArray(countdownIds) ? countdownIds : [countdownIds],
    });
  }

  #buildCreatePayload(input: TickTickCountdownDraft): TickTickCountdown {
    const timestamp = new Date();

    return {
      id: input.id ?? createObjectId(timestamp),
      type: parseTickTickCountdownType(input.type) ?? TickTickCountdownTypes.countdown,
      iconRes: input.iconRes ?? "countdown_countdown",
      color: input.color ?? "#92D0FF",
      name: input.name,
      date: this.#normalizeDate(input.date, timestamp),
      ignoreYear: input.ignoreYear ?? false,
      typeOfSmartList: input.typeOfSmartList ?? 0,
      showCalendarType: input.showCalendarType ?? 1,
      reminders: input.reminders ?? [],
      annoyingAlert: input.annoyingAlert ?? null,
      repeatFlag: input.repeatFlag ?? null,
      remark: input.remark ?? "",
      status: input.status ?? 0,
      deleted: input.deleted ?? 0,
      sortOrder: input.sortOrder ?? -1099511627776,
      background: input.background ?? null,
      style: input.style ?? "normal",
      styleColor: input.styleColor ?? [""],
      dateDisplayFormat: input.dateDisplayFormat ?? "day",
      createdTime: input.createdTime ?? toApiDateTime(timestamp) ?? undefined,
      modifiedTime: input.modifiedTime ?? toApiDateTime(timestamp) ?? undefined,
      pinnedTime: input.pinnedTime ?? null,
      etag: input.etag ?? "",
      archivedTime: input.archivedTime ?? null,
      timerMode: parseTickTickCountdownTimerMode(input.timerMode) ?? TickTickCountdownTimerModes.countdown,
      showAge: input.showAge ?? false,
      daysOption: parseTickTickCountdownDaysOption(input.daysOption) ?? TickTickCountdownDaysOptions["on-the-day"],
      showRemark: input.showRemark ?? null,
      preSet: input.preSet ?? null,
    };
  }

  #normalizeDate(input: TickTickCountdownDraft["date"], fallback: Date): number {
    if (typeof input === "number") {
      return input;
    }

    if (!input) {
      return toDateStamp(fallback);
    }

    return toDateStamp(input);
  }
}
