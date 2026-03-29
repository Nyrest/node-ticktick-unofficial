import { loadConfig } from "./lib/config";
import { createNodeSessionStore } from "./lib/node-session-store";
import { TickTickService } from "./lib/ticktick-service";

export default {
  async scheduled(controller: Bun.CronController) {
    const config = loadConfig(undefined, { runtime: "bun" });
    const ticktick = new TickTickService(config, {
      sessionStoreFactory: () => createNodeSessionStore(config),
    });

    await ticktick.refreshSession(`bun:${controller.cron}`);
  },
};
