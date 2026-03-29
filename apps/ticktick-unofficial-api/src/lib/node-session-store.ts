import { MemorySessionStore, type TickTickSessionStore } from "ticktick-unofficial/core";

import type { AppConfig } from "./config";

export async function createNodeSessionStore(config: AppConfig): Promise<TickTickSessionStore> {
  if (config.ticktick.sessionStore !== "file") {
    return new MemorySessionStore();
  }

  const { createFileSessionStore } = await import("ticktick-unofficial/node");
  return createFileSessionStore(config.ticktick.sessionFile);
}
