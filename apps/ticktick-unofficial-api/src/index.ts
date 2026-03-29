import { createApp } from "./app";
import { createBunCronRegistration } from "./lib/cron";
import { loadConfig } from "./lib/config";
import { createNodeSessionStore } from "./lib/node-session-store";
import { createTelemetryPlugin } from "./lib/telemetry";
import { TickTickService } from "./lib/ticktick-service";

export const config = loadConfig();
export const ticktick = new TickTickService(config, {
  sessionStoreFactory: () => createNodeSessionStore(config),
});
export const app = createApp(config, ticktick).use(createTelemetryPlugin(config));

if (import.meta.main) {
  if (config.cron.enabled && config.cron.driver === "bun" && typeof Bun !== "undefined") {
    const registration = createBunCronRegistration(config);
    await Bun.cron(registration.scriptPath, registration.schedule as Bun.CronWithAutocomplete, registration.jobName);
  }

  if (typeof Bun !== "undefined") {
    Bun.serve({
      fetch: app.fetch,
      hostname: config.runtime.host,
      port: config.runtime.port,
    });
  } else {
    app.listen({
      hostname: config.runtime.host,
      port: config.runtime.port,
    });
  }

  console.log(
    `[${config.packageName}] listening on http://${config.runtime.host}:${config.runtime.port} (${config.runtime.name})`,
  );
}
