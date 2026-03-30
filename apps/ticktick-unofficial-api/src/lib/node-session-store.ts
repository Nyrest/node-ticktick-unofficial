import { MemorySessionStore, type TickTickSessionStore } from "node-ticktick-unofficial/core";

import type { AppConfig } from "./config";
import { createRedisSessionStore } from "./redis-session-store";

export async function createNodeSessionStore(config: AppConfig): Promise<TickTickSessionStore> {
  if (config.ticktick.sessionStore === "redis") {
    return createRedisSessionStore({
      url: config.ticktick.sessionRedis.url!,
      token: config.ticktick.sessionRedis.token!,
      key: config.ticktick.sessionRedis.key,
      runtime: "other",
    });
  }

  if (config.ticktick.sessionStore === "file") {
const { createFileSessionStore } = await import("node-ticktick-unofficial/node");
    return createFileSessionStore(config.ticktick.sessionFile);
  }

  return new MemorySessionStore();
}
