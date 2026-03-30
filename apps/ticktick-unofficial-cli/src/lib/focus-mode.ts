import type { TickTickClient } from "node-ticktick-unofficial";
import type { StyleInstance } from "@crustjs/style";

import { parseApiDate } from "./app.ts";
import { formatFocusStatus, formatDate } from "./output.ts";

type FocusCurrent = Record<string, unknown> | null | undefined;

interface FocusModeOptions {
  client: TickTickClient;
  current: FocusCurrent;
  style: StyleInstance;
}

export async function runFocusMode({ client, current, style }: FocusModeOptions): Promise<void> {
  if (!process.stdin.isTTY || !process.stderr.isTTY || !current) {
    return;
  }

  let snapshot = current;
  let pausedRemainingMs: number | null = null;
  let closed = false;
  let interval: NodeJS.Timeout | undefined;

  const render = () => {
    const status = formatFocusStatus(asNumber(snapshot?.status), asBoolean(snapshot?.exited));
    const startTime = formatDate(snapshot?.startTime);
    const endTime = formatDate(snapshot?.endTime);
    const remaining = formatRemaining(snapshot, pausedRemainingMs);
    const taskId = readFocusTaskId(snapshot) ?? "-";
    const title = readFocusTitle(snapshot) ?? "-";

    const body = [
      style.bold(`Focus session: ${status}`),
      `Start: ${startTime}`,
      `End: ${endTime}`,
      `Remaining: ${remaining}`,
      `Task: ${title === "-" ? taskId : `${title} (${taskId})`}`,
      "",
      "Controls:",
      "  space / p  pause or resume",
      "  f          finish",
      "  s / x      stop",
      "  q          leave the live view without stopping the session",
    ].join("\n");

    process.stderr.write("\x1b[2J\x1b[H");
    process.stderr.write(`${body}\n`);
  };

  const cleanup = () => {
    if (closed) {
      return;
    }

    closed = true;
    if (interval) {
      clearInterval(interval);
    }
    process.stdin.off("data", onData);
    process.stdin.setRawMode(false);
    process.stdin.pause();
    process.stderr.write("\x1b[2J\x1b[H");
  };

  const detach = () => {
    cleanup();
    process.stderr.write("Detached from live focus view.\n");
  };

  const stopView = async (message: string, action: () => Promise<Record<string, unknown>>) => {
    const result = await action();
    snapshot = (result.current as FocusCurrent) ?? snapshot;
    cleanup();
    process.stderr.write(`${message}\n`);
  };

  const onData = async (buffer: Buffer) => {
    const key = buffer.toString("utf8");

    if (key === "\u0003") {
      detach();
      return;
    }

    if (key === "q") {
      detach();
      return;
    }

    if (key === "f") {
      await stopView("Focus session finished.", () => client.focus.finish());
      return;
    }

    if (key === "s" || key === "x") {
      await stopView("Focus session stopped.", () => client.focus.stop());
      return;
    }

    if (key === " " || key === "p") {
      const status = formatFocusStatus(asNumber(snapshot?.status), asBoolean(snapshot?.exited));
      if (status === "paused") {
        const resumed = await client.focus.resume();
        pausedRemainingMs = null;
        snapshot = (resumed.current as FocusCurrent) ?? snapshot;
      } else if (status === "running") {
        pausedRemainingMs = calculateRemainingMs(snapshot);
        const paused = await client.focus.pause();
        snapshot = (paused.current as FocusCurrent) ?? snapshot;
      }

      render();
    }
  };

  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on("data", (buffer) => {
    void onData(buffer);
  });
  interval = setInterval(render, 250);
  render();

  await new Promise<void>((resolve) => {
    const finish = () => {
      if (closed) {
        resolve();
      } else {
        setTimeout(finish, 50);
      }
    };

    finish();
  });
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function readFocusTaskId(snapshot: FocusCurrent): string | null {
  const tasks = Array.isArray(snapshot?.focusTasks) ? snapshot.focusTasks : [];
  const task = tasks.at(-1);
  return task && typeof task === "object" && typeof (task as { id?: unknown }).id === "string"
    ? ((task as { id: string }).id || null)
    : null;
}

function readFocusTitle(snapshot: FocusCurrent): string | null {
  const tasks = Array.isArray(snapshot?.focusTasks) ? snapshot.focusTasks : [];
  const task = tasks.at(-1);
  return task && typeof task === "object" && typeof (task as { title?: unknown }).title === "string"
    ? ((task as { title: string }).title || null)
    : null;
}

function calculateRemainingMs(snapshot: FocusCurrent): number {
  const end = parseApiDate(snapshot?.endTime);
  if (!end) {
    return 0;
  }

  return Math.max(0, end.getTime() - Date.now());
}

function formatRemaining(snapshot: FocusCurrent, pausedRemainingMs: number | null): string {
  const status = formatFocusStatus(asNumber(snapshot?.status), asBoolean(snapshot?.exited));
  const remainingMs = status === "paused" && pausedRemainingMs != null ? pausedRemainingMs : calculateRemainingMs(snapshot);
  const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
