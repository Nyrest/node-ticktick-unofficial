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

export const TickTickCountdownTypes = {
  holiday: 1,
  birthday: 2,
  anniversary: 3,
  countdown: 4,
} as const;

export const TickTickCountdownTypeInputHelp = "holiday, birthday, anniversary, countdown, 1, 2, 3, or 4";

export type TickTickCountdownTypeName = keyof typeof TickTickCountdownTypes;
export type TickTickCountdownType = (typeof TickTickCountdownTypes)[TickTickCountdownTypeName];
export type TickTickCountdownTypeInput =
  | TickTickCountdownType
  | TickTickCountdownTypeName
  | `${TickTickCountdownType}`;

export const TickTickCountdownTimerModes = {
  countdown: 0,
  "count-up": 1,
} as const;

export const TickTickCountdownTimerModeInputHelp = "countdown, count-up, 0, or 1";

export type TickTickCountdownTimerModeName = keyof typeof TickTickCountdownTimerModes;
export type TickTickCountdownTimerMode = (typeof TickTickCountdownTimerModes)[TickTickCountdownTimerModeName];
export type TickTickCountdownTimerModeInput =
  | TickTickCountdownTimerMode
  | TickTickCountdownTimerModeName
  | `${TickTickCountdownTimerMode}`;

export const TickTickCountdownDayCalculationModes = {
  standard: 0,
  "standard-plus-one-day": 1,
} as const;

export const TickTickCountdownDayCalculationModeInputHelp = "standard, standard-plus-one-day, 0, or 1";

export type TickTickCountdownDayCalculationModeName = keyof typeof TickTickCountdownDayCalculationModes;
export type TickTickCountdownDayCalculationMode =
  (typeof TickTickCountdownDayCalculationModes)[TickTickCountdownDayCalculationModeName];
export type TickTickCountdownDayCalculationModeInput =
  | TickTickCountdownDayCalculationMode
  | TickTickCountdownDayCalculationModeName
  | `${TickTickCountdownDayCalculationMode}`;

export const TickTickCountdownDaysOptions = {
  "on-the-day": 0,
  "3-days-early": 1,
  "7-days-early": 2,
  "always-show": 3,
  "do-not-show": 4,
} as const;

export const TickTickCountdownDaysOptionInputHelp =
  "on-the-day, 3-days-early, 7-days-early, always-show, do-not-show, 0, 1, 2, 3, or 4";

export type TickTickCountdownDaysOptionName = keyof typeof TickTickCountdownDaysOptions;
export type TickTickCountdownDaysOption = (typeof TickTickCountdownDaysOptions)[TickTickCountdownDaysOptionName];
export type TickTickCountdownDaysOptionInput =
  | TickTickCountdownDaysOption
  | TickTickCountdownDaysOptionName
  | `${TickTickCountdownDaysOption}`;

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

export function parseTickTickCountdownType(
  input: TickTickCountdownTypeInput | string | number | null | undefined,
): TickTickCountdownType | undefined {
  return parseMappedValue(
    input,
    {
      holiday: TickTickCountdownTypes.holiday,
      "1": TickTickCountdownTypes.holiday,
      birthday: TickTickCountdownTypes.birthday,
      "2": TickTickCountdownTypes.birthday,
      anniversary: TickTickCountdownTypes.anniversary,
      "3": TickTickCountdownTypes.anniversary,
      countdown: TickTickCountdownTypes.countdown,
      "4": TickTickCountdownTypes.countdown,
    },
    `Invalid TickTick countdown type "%s". Use ${TickTickCountdownTypeInputHelp}.`,
  );
}

export function formatTickTickCountdownType(value: number | null | undefined): string {
  if (value === TickTickCountdownTypes.holiday) return "holiday";
  if (value === TickTickCountdownTypes.birthday) return "birthday";
  if (value === TickTickCountdownTypes.anniversary) return "anniversary";
  if (value === TickTickCountdownTypes.countdown) return "countdown";
  return formatUnknown(value);
}

export function parseTickTickCountdownTimerMode(
  input: TickTickCountdownTimerModeInput | string | number | null | undefined,
): TickTickCountdownTimerMode | undefined {
  return parseMappedValue(
    input,
    {
      countdown: TickTickCountdownTimerModes.countdown,
      "0": TickTickCountdownTimerModes.countdown,
      "count-up": TickTickCountdownTimerModes["count-up"],
      "1": TickTickCountdownTimerModes["count-up"],
    },
    `Invalid TickTick countdown timer mode "%s". Use ${TickTickCountdownTimerModeInputHelp}.`,
  );
}

export function formatTickTickCountdownTimerMode(value: number | null | undefined): string {
  if (value == null || value === TickTickCountdownTimerModes.countdown) return "countdown";
  if (value === TickTickCountdownTimerModes["count-up"]) return "count-up";
  return formatUnknown(value);
}

export function parseTickTickCountdownDayCalculationMode(
  input: TickTickCountdownDayCalculationModeInput | string | number | null | undefined,
): TickTickCountdownDayCalculationMode | undefined {
  return parseMappedValue(
    input,
    {
      standard: TickTickCountdownDayCalculationModes.standard,
      "0": TickTickCountdownDayCalculationModes.standard,
      "standard-plus-one-day": TickTickCountdownDayCalculationModes["standard-plus-one-day"],
      "1": TickTickCountdownDayCalculationModes["standard-plus-one-day"],
    },
    `Invalid TickTick countdown day calculation mode "%s". Use ${TickTickCountdownDayCalculationModeInputHelp}.`,
  );
}

export function formatTickTickCountdownDayCalculationMode(value: number | null | undefined): string {
  if (value == null || value === TickTickCountdownDayCalculationModes.standard) return "standard";
  if (value === TickTickCountdownDayCalculationModes["standard-plus-one-day"]) return "standard-plus-one-day";
  return formatUnknown(value);
}

export function parseTickTickCountdownDaysOption(
  input: TickTickCountdownDaysOptionInput | string | number | null | undefined,
): TickTickCountdownDaysOption | undefined {
  return parseMappedValue(
    input,
    {
      "on-the-day": TickTickCountdownDaysOptions["on-the-day"],
      "0": TickTickCountdownDaysOptions["on-the-day"],
      "3-days-early": TickTickCountdownDaysOptions["3-days-early"],
      "1": TickTickCountdownDaysOptions["3-days-early"],
      "7-days-early": TickTickCountdownDaysOptions["7-days-early"],
      "2": TickTickCountdownDaysOptions["7-days-early"],
      "always-show": TickTickCountdownDaysOptions["always-show"],
      "3": TickTickCountdownDaysOptions["always-show"],
      "do-not-show": TickTickCountdownDaysOptions["do-not-show"],
      "4": TickTickCountdownDaysOptions["do-not-show"],
    },
    `Invalid TickTick countdown smart-list option "%s". Use ${TickTickCountdownDaysOptionInputHelp}.`,
  );
}

export function formatTickTickCountdownDaysOption(value: number | null | undefined): string {
  if (value == null || value === TickTickCountdownDaysOptions["on-the-day"]) return "on-the-day";
  if (value === TickTickCountdownDaysOptions["3-days-early"]) return "3-days-early";
  if (value === TickTickCountdownDaysOptions["7-days-early"]) return "7-days-early";
  if (value === TickTickCountdownDaysOptions["always-show"]) return "always-show";
  if (value === TickTickCountdownDaysOptions["do-not-show"]) return "do-not-show";
  return formatUnknown(value);
}
