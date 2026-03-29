import { ConfigurationError, type AppConfig, type CronDriver } from "./config";
import type { SessionMaintenanceResult, TickTickService } from "./ticktick-service";

export interface BunCronRegistration {
  enabled: boolean;
  driver: CronDriver;
  jobName: string;
  scriptPath: string;
  schedule: string;
}

export function createBunCronRegistration(config: AppConfig): BunCronRegistration {
  return {
    enabled: config.cron.enabled && config.cron.driver === "bun",
    driver: config.cron.driver,
    jobName: config.cron.bunJobName,
    scriptPath: config.cron.bunScript,
    schedule: config.cron.schedule.standard,
  };
}

export async function runScheduledSessionRefresh(
  ticktick: TickTickService,
  source: string,
): Promise<SessionMaintenanceResult> {
  return ticktick.refreshSession(source);
}

export function assertCronSecret(headerValue: string | null, config: AppConfig): void {
  const secret = config.cron.secret;
  if (!secret) {
    throw new ConfigurationError("CRON_SECRET or API_AUTH_TOKEN must be set when cron webhooks are enabled.");
  }

  const normalized = headerValue?.replace(/^Bearer\s+/i, "").trim();
  if (normalized !== secret) {
    throw new ConfigurationError("Invalid cron authorization secret.");
  }
}
