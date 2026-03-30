import { MemorySessionStore, type TickTickSessionStore } from "ticktick-unofficial/core";

import type { AppConfig } from "./config";
import { createRedisSessionStore } from "./redis-session-store";

export async function createCloudflareSessionStore(config: AppConfig): Promise<TickTickSessionStore> {
  if (config.ticktick.sessionStore === "redis") {
    return createRedisSessionStore({
      url: config.ticktick.sessionRedis.url!,
      token: config.ticktick.sessionRedis.token!,
      key: config.ticktick.sessionRedis.key,
      runtime: "cloudflare",
    });
  }

  return new MemorySessionStore();
}
