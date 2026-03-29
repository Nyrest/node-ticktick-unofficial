import type { ScheduledController } from "@cloudflare/workers-types";
import { CloudflareAdapter } from "elysia/adapter/cloudflare-worker";
import { MemorySessionStore } from "ticktick-unofficial/core";

import { createApp } from "./app";
import { loadConfig, readBaseEnv } from "./lib/config";
import { TickTickService } from "./lib/ticktick-service";

type WorkerBindings = Record<string, unknown>;

let cached:
  | {
      app: ReturnType<typeof createApp>;
      ticktick: TickTickService;
    }
  | undefined;

function getWorkerRuntime(bindings: WorkerBindings) {
  if (cached) {
    return cached;
  }

  const env = {
    ...readBaseEnv(),
    ...Object.fromEntries(
      Object.entries(bindings).map(([key, value]) => [key, typeof value === "string" ? value : undefined]),
    ),
  };

  const config = loadConfig(env, { runtime: "cloudflare" });
  const ticktick = new TickTickService(config, {
    sessionStoreFactory: () => Promise.resolve(new MemorySessionStore()),
  });

  cached = {
    app: createApp(config, ticktick, { adapter: CloudflareAdapter }).compile(),
    ticktick,
  };

  return cached;
}

export default {
  fetch(request: Request, env: WorkerBindings, ctx: ExecutionContext) {
    const runtime = getWorkerRuntime(env);
    return runtime.app.fetch(request);
  },
  async scheduled(controller: ScheduledController, env: WorkerBindings, ctx: ExecutionContext) {
    const runtime = getWorkerRuntime(env);
    await runtime.ticktick.refreshSession(`cloudflare:${controller.cron}`);
  },
};
