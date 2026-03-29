// Verified against the live TickTick web app, public Help Center content,
// and the logged-in web app payloads on 2026-03-29.

export const TickTickTaskPriorities = {
  none: 0,
  low: 1,
  medium: 3,
  high: 5,
} as const;

export const TickTickTaskPriorityInputHelp = "none, low, medium, high, 0, 1, 3, or 5";

export type TickTickTaskPriorityName = keyof typeof TickTickTaskPriorities;
export type TickTickTaskPriority = (typeof TickTickTaskPriorities)[TickTickTaskPriorityName];
export type TickTickTaskPriorityInput =
  | TickTickTaskPriority
  | TickTickTaskPriorityName
  | `${TickTickTaskPriority}`;

export const TickTickTaskStatuses = {
  open: 0,
  wontDo: -1,
  completed: 2,
} as const;

export const TickTickTaskStatusInputHelp = `open, completed, abandoned, won't do, -1, 0, or 2`;

export type TickTickTaskStatusName = keyof typeof TickTickTaskStatuses;
export type TickTickTaskStatus = (typeof TickTickTaskStatuses)[TickTickTaskStatusName];
export type TickTickTaskStatusInput =
  | TickTickTaskStatus
  | TickTickTaskStatusName
  | `${TickTickTaskStatus}`
  | "abandoned"
  | "won't do";

export const TickTickTaskItemStatuses = {
  open: 0,
  completed: 1,
} as const;

export type TickTickTaskItemStatusName = keyof typeof TickTickTaskItemStatuses;
export type TickTickTaskItemStatus = (typeof TickTickTaskItemStatuses)[TickTickTaskItemStatusName];
export type TickTickTaskItemStatusInput =
  | TickTickTaskItemStatus
  | TickTickTaskItemStatusName
  | `${TickTickTaskItemStatus}`;

export const TickTickHabitStatuses = {
  normal: 0,
  archived: 1,
} as const;

export type TickTickHabitStatusName = keyof typeof TickTickHabitStatuses;
export type TickTickHabitStatus = (typeof TickTickHabitStatuses)[TickTickHabitStatusName];
export type TickTickHabitStatusInput =
  | TickTickHabitStatus
  | TickTickHabitStatusName
  | `${TickTickHabitStatus}`;

export const TickTickHabitCheckinStatuses = {
  unlabeled: 0,
  undone: 1,
  done: 2,
} as const;

export const TickTickHabitCheckinStatusInputHelp = "unlabeled, undone, done, 0, 1, or 2";

export type TickTickHabitCheckinStatusName = keyof typeof TickTickHabitCheckinStatuses;
export type TickTickHabitCheckinStatus = (typeof TickTickHabitCheckinStatuses)[TickTickHabitCheckinStatusName];
export type TickTickHabitCheckinStatusInput =
  | TickTickHabitCheckinStatus
  | TickTickHabitCheckinStatusName
  | `${TickTickHabitCheckinStatus}`;

function normalizeInput(value: string | number): string {
  return String(value).trim().toLowerCase();
}

function formatUnknown(value: number | null | undefined): string {
  if (value == null) {
    return "";
  }

  return String(value);
}

function parseMappedValue<T extends number>(
  input: string | number | null | undefined,
  aliases: Record<string, T>,
  message: string,
): T | undefined {
  if (input == null || input === "") {
    return undefined;
  }

  const normalized = normalizeInput(input);
  const resolved = aliases[normalized];
  if (resolved != null) {
    return resolved;
  }

  throw new Error(message.replace("%s", String(input)));
}

export function parseTickTickTaskPriority(
  input: TickTickTaskPriorityInput | string | number | null | undefined,
): TickTickTaskPriority | undefined {
  return parseMappedValue(
    input,
    {
      none: TickTickTaskPriorities.none,
      "0": TickTickTaskPriorities.none,
      low: TickTickTaskPriorities.low,
      "1": TickTickTaskPriorities.low,
      medium: TickTickTaskPriorities.medium,
      "3": TickTickTaskPriorities.medium,
      high: TickTickTaskPriorities.high,
      "5": TickTickTaskPriorities.high,
    },
    `Invalid TickTick task priority "%s". Use ${TickTickTaskPriorityInputHelp}.`,
  );
}

export function formatTickTickTaskPriority(value: number | null | undefined): string {
  if (value == null || value === TickTickTaskPriorities.none) return "none";
  if (value === TickTickTaskPriorities.low) return "low";
  if (value === TickTickTaskPriorities.medium) return "medium";
  if (value === TickTickTaskPriorities.high) return "high";
  return formatUnknown(value);
}

export function parseTickTickTaskStatus(
  input: TickTickTaskStatusInput | string | number | null | undefined,
): TickTickTaskStatus | undefined {
  return parseMappedValue(
    input,
    {
      open: TickTickTaskStatuses.open,
      "0": TickTickTaskStatuses.open,
      abandoned: TickTickTaskStatuses.wontDo,
      "won't do": TickTickTaskStatuses.wontDo,
      "-1": TickTickTaskStatuses.wontDo,
      completed: TickTickTaskStatuses.completed,
      "2": TickTickTaskStatuses.completed,
    },
    `Invalid TickTick task status "%s". Use ${TickTickTaskStatusInputHelp}.`,
  );
}

export function formatTickTickTaskStatus(value: number | null | undefined): string {
  if (value == null || value === TickTickTaskStatuses.open) return "open";
  if (value === TickTickTaskStatuses.wontDo) return "wont-do";
  if (value === TickTickTaskStatuses.completed) return "completed";
  return formatUnknown(value);
}

export function parseTickTickTaskItemStatus(
  input: TickTickTaskItemStatusInput | string | number | null | undefined,
): TickTickTaskItemStatus | undefined {
  return parseMappedValue(
    input,
    {
      open: TickTickTaskItemStatuses.open,
      "0": TickTickTaskItemStatuses.open,
      completed: TickTickTaskItemStatuses.completed,
      "1": TickTickTaskItemStatuses.completed,
    },
    'Invalid TickTick checklist status "%s". Use open, completed, 0, or 1.',
  );
}

export function formatTickTickTaskItemStatus(value: number | null | undefined): string {
  if (value == null || value === TickTickTaskItemStatuses.open) return "open";
  if (value === TickTickTaskItemStatuses.completed) return "completed";
  return formatUnknown(value);
}

export function parseTickTickHabitStatus(
  input: TickTickHabitStatusInput | string | number | null | undefined,
): TickTickHabitStatus | undefined {
  return parseMappedValue(
    input,
    {
      normal: TickTickHabitStatuses.normal,
      "0": TickTickHabitStatuses.normal,
      archived: TickTickHabitStatuses.archived,
      "1": TickTickHabitStatuses.archived,
    },
    'Invalid TickTick habit status "%s". Use normal, archived, 0, or 1.',
  );
}

export function formatTickTickHabitStatus(value: number | null | undefined): string {
  if (value == null || value === TickTickHabitStatuses.normal) return "normal";
  if (value === TickTickHabitStatuses.archived) return "archived";
  return formatUnknown(value);
}

export function parseTickTickHabitCheckinStatus(
  input: TickTickHabitCheckinStatusInput | string | number | null | undefined,
): TickTickHabitCheckinStatus | undefined {
  if (normalizeInput(input ?? "") === "skip") {
    throw new Error('Invalid TickTick habit checkin status "skip". Skipping is tracked via habit exDates, not checkin status.');
  }

  return parseMappedValue(
    input,
    {
      unlabeled: TickTickHabitCheckinStatuses.unlabeled,
      "0": TickTickHabitCheckinStatuses.unlabeled,
      undone: TickTickHabitCheckinStatuses.undone,
      "1": TickTickHabitCheckinStatuses.undone,
      done: TickTickHabitCheckinStatuses.done,
      "2": TickTickHabitCheckinStatuses.done,
    },
    `Invalid TickTick habit checkin status "%s". Use ${TickTickHabitCheckinStatusInputHelp}.`,
  );
}

export function formatTickTickHabitCheckinStatus(value: number | null | undefined): string {
  if (value == null || value === TickTickHabitCheckinStatuses.unlabeled) return "unlabeled";
  if (value === TickTickHabitCheckinStatuses.undone) return "undone";
  if (value === TickTickHabitCheckinStatuses.done) return "done";
  return formatUnknown(value);
}
