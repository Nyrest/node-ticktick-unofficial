import { createBunCronRegistration } from "../lib/cron";
import { loadConfig } from "../lib/config";

const config = loadConfig(undefined, { runtime: "bun" });
const registration = createBunCronRegistration(config);

if (!registration.enabled) {
  throw new Error("CRON_DRIVER must resolve to 'bun' and SESSION_REFRESH_ENABLED must be true to register Bun cron.");
}

await Bun.cron(registration.scriptPath, registration.schedule as Bun.CronWithAutocomplete, registration.jobName);
console.log(`Registered Bun cron '${registration.jobName}' on schedule '${registration.schedule}'.`);
