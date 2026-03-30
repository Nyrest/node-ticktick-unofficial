import { table } from "@crustjs/style";
import type {
  TickTickCountdown,
  TickTickGeneralStatistics,
  TickTickHabit,
  TickTickProjectProfile,
  TickTickRankingStatistics,
  TickTickTask,
  TickTickTaskStatisticsEntry,
} from "ticktick-unofficial";
import {
  formatTickTickCountdownDaysOption,
  formatTickTickCountdownTimerMode,
  formatTickTickCountdownType,
  formatTickTickHabitStatus,
  formatTickTickTaskPriority,
  formatTickTickTaskStatus,
} from "ticktick-unofficial";

import { parseApiDate, shortId, type RuntimeContext } from "./app.ts";

export function printOutput<T>(runtime: RuntimeContext, data: T, renderHuman: () => string): void {
  if (runtime.json) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  console.log(renderHuman());
}

export function formatDate(value: unknown): string {
  const date = parseApiDate(value);
  if (!date) {
    return "-";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function formatDay(value: string): string {
  if (!/^\d{8}$/.test(value)) {
    return value;
  }

  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

export function formatTaskStatus(status: number | undefined): string {
  return formatTickTickTaskStatus(status);
}

export function formatFocusStatus(status: number | undefined, exited: boolean | undefined): string {
  if (exited || status === 3) return "stopped";
  if (status === 2) return "finished";
  if (status === 1) return "paused";
  if (status === 0) return "running";
  return "idle";
}

export function renderProjectTable(projects: TickTickProjectProfile[]): string {
  const rows = projects.map((project) => [
    project.id,
    project.name,
    project.kind ?? "-",
    project.viewMode ?? "-",
    project.color ?? "-",
    project.closed ? "yes" : "no",
  ]);

  return table(["ID", "Name", "Kind", "View", "Color", "Closed"], rows);
}

export function renderProjectDetails(project: TickTickProjectProfile): string {
  return [
    `ID: ${project.id}`,
    `Name: ${project.name}`,
    `Kind: ${project.kind ?? "-"}`,
    `View: ${project.viewMode ?? "-"}`,
    `Color: ${project.color ?? "-"}`,
    `Closed: ${project.closed ? "yes" : "no"}`,
    `Permission: ${project.permission ?? "-"}`,
  ].join("\n");
}

export function renderTaskTable(tasks: TickTickTask[], projects: Map<string, TickTickProjectProfile>): string {
  const rows = tasks.map((task) => [
    task.id,
    formatTaskStatus(task.status),
    formatPriority(task.priority),
    formatDate(task.dueDate),
    projects.get(task.projectId)?.name ?? task.projectId,
    task.title,
  ]);

  return table(["ID", "Status", "Prio", "Due", "Project", "Title"], rows);
}

export function renderTaskDetails(task: TickTickTask, projects: Map<string, TickTickProjectProfile>): string {
  return [
    `ID: ${task.id}`,
    `Title: ${task.title}`,
    `Status: ${formatTaskStatus(task.status)}`,
    `Priority: ${formatPriority(task.priority)}`,
    `Project: ${projects.get(task.projectId)?.name ?? task.projectId}`,
    `Due: ${formatDate(task.dueDate)}`,
    `Start: ${formatDate(task.startDate)}`,
    `Tags: ${task.tags?.join(", ") || "-"}`,
    `Content: ${task.content || "-"}`,
    `Description: ${task.desc || "-"}`,
  ].join("\n");
}

export function renderHabitTable(habits: TickTickHabit[]): string {
  const rows = habits.map((habit) => [
    shortId(habit.id),
    habit.name,
    formatTickTickHabitStatus(habit.status),
    habit.goal == null ? "-" : String(habit.goal),
    habit.unit ?? "-",
    habit.type ?? "-",
  ]);

  return table(["ID", "Name", "State", "Goal", "Unit", "Type"], rows);
}

export function renderCountdownTable(countdowns: TickTickCountdown[]): string {
  const rows = countdowns.map((countdown) => [
    shortId(countdown.id),
    countdown.name,
    formatTickTickCountdownType(countdown.type),
    String(countdown.date),
    formatTickTickCountdownTimerMode(countdown.timerMode),
    formatTickTickCountdownDaysOption(countdown.daysOption),
  ]);

  return table(["ID", "Name", "Type", "Date", "Mode", "Smart List"], rows);
}

export function renderCountdownDetails(countdown: TickTickCountdown): string {
  return [
    `ID: ${countdown.id}`,
    `Name: ${countdown.name}`,
    `Type: ${formatTickTickCountdownType(countdown.type)}`,
    `Date: ${countdown.date}`,
    `Ignore year: ${countdown.ignoreYear ? "yes" : "no"}`,
    `Timer mode: ${formatTickTickCountdownTimerMode(countdown.timerMode)}`,
    `Smart List: ${formatTickTickCountdownDaysOption(countdown.daysOption)}`,
    `Repeat: ${countdown.repeatFlag ?? "-"}`,
    `Style: ${countdown.style ?? "-"}`,
    `Style colors: ${countdown.styleColor?.join(", ") || "-"}`,
    `Icon: ${countdown.iconRes ?? "-"}`,
    `Color: ${countdown.color ?? "-"}`,
    `Remark: ${countdown.remark || "-"}`,
  ].join("\n");
}

export function renderStatistics(
  general: TickTickGeneralStatistics,
  ranking: TickTickRankingStatistics,
  daily: TickTickTaskStatisticsEntry[],
): string {
  const summary = [
    `Score: ${general.score}`,
    `Level: ${general.level}`,
    `Completed today: ${general.todayCompleted}`,
    `Completed total: ${general.totalCompleted}`,
    `Pomodoros today: ${general.todayPomoCount}`,
    `Pomodoros total: ${general.totalPomoCount}`,
    `Ranking: ${ranking.ranking}`,
    `Project count: ${ranking.projectCount}`,
    `Task count: ${ranking.taskCount}`,
  ].join("\n");

  const rows = daily.map((entry) => [
    formatDay(entry.day),
    String(entry.onTimeCompleteCount + entry.overdueCompleteCount + entry.noTimeCompleteCount),
    String(entry.notCompleteCount),
    String(entry.overdueCompleteCount),
  ]);

  return `${summary}\n\n${table(["Day", "Completed", "Open", "Overdue"], rows)}`;
}

export function formatPriority(value: number | undefined): string {
  return formatTickTickTaskPriority(value);
}
