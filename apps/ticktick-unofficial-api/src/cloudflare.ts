import type { ScheduledController } from "@cloudflare/workers-types";
import { CloudflareAdapter } from "elysia/adapter/cloudflare-worker";

import { createApp } from "./app";
import { loadConfig, readBaseEnv } from "./lib/config";
import { createCloudflareSessionStore } from "./lib/cloudflare-session-store";
import { TickTickService } from "./lib/ticktick-service";

type WorkerBindings = Record<string, unknown>;

let cached:
  | {
      app: ReturnType<typeof createApp>;
      ticktick: TickTickService;
    }
  | undefined;

async function getWorkerRuntime(bindings: WorkerBindings) {
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
    sessionStoreFactory: () => createCloudflareSessionStore(config),
  });

  cached = {
    app: createApp(config, ticktick, { adapter: CloudflareAdapter }).compile(),
    ticktick,
  };

  return cached;
}

export default {
  async fetch(request: Request, env: WorkerBindings, ctx: ExecutionContext) {
    const runtime = await getWorkerRuntime(env);
    return runtime.app.fetch(request);
  },
  async scheduled(controller: ScheduledController, env: WorkerBindings, ctx: ExecutionContext) {
    const runtime = await getWorkerRuntime(env);
    await runtime.ticktick.refreshSession(`cloudflare:${controller.cron}`);
  },
};
