import { loadConfig } from "../lib/config";

const config = loadConfig(undefined, { runtime: "bun" });
await Bun.cron.remove(config.cron.bunJobName);
console.log(`Removed Bun cron '${config.cron.bunJobName}'.`);
