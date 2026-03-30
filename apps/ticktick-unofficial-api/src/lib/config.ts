import packageJson from "../../package.json";

import type { TickTickServiceName, TickTickSessionStore } from "node-ticktick-unofficial/core";

export type AppRuntime = "bun" | "node" | "vercel" | "cloudflare";
export type CronDriver = "bun" | "elysia" | "vercel" | "cloudflare" | "disabled";
export type RequestedCronDriver = CronDriver | "auto";
export type ApiAuthMode = "none" | "bearer";
export type SessionStoreMode = "memory" | "file" | "redis";
export type RequestedSessionStoreMode = SessionStoreMode | "auto";

export interface AppConfig {
  packageName: string;
  packageVersion: string;
  runtime: {
    name: AppRuntime;
    host: string;
    port: number;
  };
  ticktick: {
    service: TickTickServiceName;
    username: string;
    password: string;
    timezone: string;
    language: string | undefined;
    sessionStore: SessionStoreMode;
    sessionFile: string;
    sessionRedis: {
      url: string | undefined;
      token: string | undefined;
      key: string;
    };
  };
  auth: {
    mode: ApiAuthMode;
    token: string | undefined;
  };
  docs: {
    openapiPath: string;
    swaggerPath: string;
    swaggerEnabled: boolean;
  };
  cron: {
    enabled: boolean;
    driver: CronDriver;
    requestedDriver: RequestedCronDriver;
    schedule: {
      standard: string;
      elysia: string;
    };
    secret: string | undefined;
    internalPath: string;
    bunJobName: string;
    bunScript: string;
  };
  telemetry: {
    enabled: boolean;
    serviceName: string;
    exporterEndpoint: string | undefined;
    headers: Record<string, string>;
  };
}

export interface TickTickServiceDependencies {
  sessionStoreFactory: () => Promise<TickTickSessionStore>;
}

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigurationError";
  }
}

export function loadConfig(
  env: Record<string, string | undefined> = readBaseEnv(),
  options: { runtime?: AppRuntime } = {},
): AppConfig {
  const runtime = options.runtime ?? resolveRuntime(env);
  const ticktickService = readEnum(env, "TICKTICK_SERVICE", ["ticktick", "dida365"], "ticktick");
  const username = requireString(env, "TICKTICK_USERNAME");
  const password = requireString(env, "TICKTICK_PASSWORD");
  const redisUrl = readString(env, "TICKTICK_SESSION_REDIS_URL") ?? readString(env, "UPSTASH_REDIS_REST_URL");
  const redisToken = readString(env, "TICKTICK_SESSION_REDIS_TOKEN") ?? readString(env, "UPSTASH_REDIS_REST_TOKEN");
  const sessionStore = resolveSessionStore(
    runtime,
    readEnum(env, "TICKTICK_SESSION_STORE", ["auto", "memory", "file", "redis"], "auto"),
    { redisUrl, redisToken },
  );
  const requestedCronDriver = readEnum(
    env,
    "CRON_DRIVER",
    ["auto", "bun", "elysia", "vercel", "cloudflare", "disabled"],
    "auto",
  );
  const cronDriver = resolveCronDriver(runtime, requestedCronDriver);
  const standardCron = readString(env, "SESSION_REFRESH_CRON", "*/30 * * * *");
  const cronSecret = readString(env, "CRON_SECRET") ?? readString(env, "API_AUTH_TOKEN");
  const authMode = readEnum(env, "API_AUTH_MODE", ["none", "bearer"], "none");
  const sessionRedisKey =
    readString(env, "TICKTICK_SESSION_REDIS_KEY") ?? `${packageJson.name}:${ticktickService}:${username}:session`;

  if (sessionStore === "redis" && (!redisUrl || !redisToken)) {
    throw new ConfigurationError(
      "Redis session storage requires TICKTICK_SESSION_REDIS_URL/TICKTICK_SESSION_REDIS_TOKEN or UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN.",
    );
  }

  return {
    packageName: packageJson.name,
    packageVersion: packageJson.version,
    runtime: {
      name: runtime,
      host: readString(env, "HOST", "0.0.0.0"),
      port: readInteger(env, "PORT", 3000),
    },
    ticktick: {
      service: ticktickService,
      username,
      password,
      timezone: readString(env, "TICKTICK_TIMEZONE", Intl.DateTimeFormat().resolvedOptions().timeZone),
      language: readString(env, "TICKTICK_LANGUAGE"),
      sessionStore,
      sessionFile: readString(env, "TICKTICK_SESSION_FILE", ".data/ticktick-session.json"),
      sessionRedis: {
        url: redisUrl,
        token: redisToken,
        key: sessionRedisKey,
      },
    },
    auth: {
      mode: authMode,
      token: authMode === "bearer" ? requireString(env, "API_AUTH_TOKEN") : readString(env, "API_AUTH_TOKEN"),
    },
    docs: {
      openapiPath: normalizePath(readString(env, "OPENAPI_PATH", "/openapi")),
      swaggerPath: normalizePath(readString(env, "SWAGGER_PATH", "/swagger")),
      swaggerEnabled: readBoolean(env, "SWAGGER_ENABLED", false),
    },
    cron: {
      enabled: readBoolean(env, "SESSION_REFRESH_ENABLED", true),
      driver: cronDriver,
      requestedDriver: requestedCronDriver,
      schedule: {
        standard: normalizeStandardCron(standardCron),
        elysia: normalizeElysiaCron(standardCron),
      },
      secret: cronSecret,
      internalPath: "/internal/cron/session-refresh",
      bunJobName: readString(env, "BUN_CRON_JOB_NAME", "ticktick-unofficial-api-session-refresh"),
      bunScript: readString(env, "BUN_CRON_SCRIPT", "./src/bun-cron.ts"),
    },
    telemetry: {
      enabled: Boolean(readString(env, "OTEL_EXPORTER_OTLP_ENDPOINT")),
      serviceName: readString(env, "OTEL_SERVICE_NAME", packageJson.name),
      exporterEndpoint: readString(env, "OTEL_EXPORTER_OTLP_ENDPOINT"),
      headers: readJsonObject(env, "OTEL_EXPORTER_OTLP_HEADERS_JSON"),
    },
  };
}

export function readBaseEnv(): Record<string, string | undefined> {
  if (typeof Bun !== "undefined" && Bun.env) {
    return Bun.env;
  }

  if (typeof process !== "undefined") {
    return process.env;
  }

  return {};
}

function resolveRuntime(env: Record<string, string | undefined>): AppRuntime {
  if (env.APP_RUNTIME) {
    const requested = readEnum(env, "APP_RUNTIME", ["bun", "node", "vercel", "cloudflare", "auto"], "auto");
    return requested === "auto" ? detectRuntime(env) : requested;
  }

  return detectRuntime(env);
}

function detectRuntime(env: Record<string, string | undefined>): AppRuntime {
  if (env.VERCEL === "1") {
    return "vercel";
  }

  if (env.CF_PAGES === "1" || env.WORKERS_RS_VERSION || env.CLOUDFLARE_ACCOUNT_ID) {
    return "cloudflare";
  }

  if (typeof Bun !== "undefined") {
    return "bun";
  }

  return "node";
}

function resolveSessionStore(
  runtime: AppRuntime,
  mode: RequestedSessionStoreMode,
  options: { redisUrl?: string; redisToken?: string },
): SessionStoreMode {
  if (mode !== "auto") {
    return mode;
  }

  if (runtime === "cloudflare" || runtime === "vercel") {
    return options.redisUrl && options.redisToken ? "redis" : "memory";
  }

  return "file";
}

function resolveCronDriver(runtime: AppRuntime, driver: RequestedCronDriver): CronDriver {
  if (driver !== "auto") {
    return driver;
  }

  switch (runtime) {
    case "bun":
      return "bun";
    case "vercel":
      return "vercel";
    case "cloudflare":
      return "cloudflare";
    default:
      return "elysia";
  }
}

function requireString(env: Record<string, string | undefined>, name: string): string {
  const value = readString(env, name);
  if (!value) {
    throw new ConfigurationError(`${name} is required.`);
  }

  return value;
}

function readString(env: Record<string, string | undefined>, name: string, fallback: string): string;
function readString(env: Record<string, string | undefined>, name: string, fallback?: string): string | undefined;
function readString(env: Record<string, string | undefined>, name: string, fallback?: string): string | undefined {
  const value = env[name]?.trim();
  return value ? value : fallback;
}

function readInteger(env: Record<string, string | undefined>, name: string, fallback: number): number {
  const raw = readString(env, name);
  if (!raw) {
    return fallback;
  }

  const value = Number(raw);
  if (!Number.isInteger(value)) {
    throw new ConfigurationError(`${name} must be an integer.`);
  }

  return value;
}

function readBoolean(env: Record<string, string | undefined>, name: string, fallback: boolean): boolean {
  const raw = readString(env, name);
  if (!raw) {
    return fallback;
  }

  switch (raw.toLowerCase()) {
    case "1":
    case "true":
    case "yes":
    case "on":
      return true;
    case "0":
    case "false":
    case "no":
    case "off":
      return false;
    default:
      throw new ConfigurationError(`${name} must be a boolean-like value.`);
  }
}

function readEnum<const T extends readonly string[]>(
  env: Record<string, string | undefined>,
  name: string,
  values: T,
  fallback: T[number],
): T[number] {
  const raw = readString(env, name, fallback);
  if (raw && values.includes(raw)) {
    return raw as T[number];
  }

  throw new ConfigurationError(`${name} must be one of: ${values.join(", ")}.`);
}

function readJsonObject(env: Record<string, string | undefined>, name: string): Record<string, string> {
  const raw = readString(env, name);
  if (!raw) {
    return {};
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new ConfigurationError(`${name} must be valid JSON. ${(error as Error).message}`);
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ConfigurationError(`${name} must be a JSON object.`);
  }

  return Object.fromEntries(
    Object.entries(parsed).map(([key, value]) => [key, typeof value === "string" ? value : String(value)]),
  );
}

function normalizePath(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

function normalizeStandardCron(value: string): string {
  const fields = value.trim().split(/\s+/);
  if (fields.length === 5) {
    return value.trim();
  }

  if (fields.length === 6 && fields[0] === "0") {
    return fields.slice(1).join(" ");
  }

  throw new ConfigurationError(
    "SESSION_REFRESH_CRON must be either a standard 5-field cron string or a 6-field cron string with a leading 0 seconds field.",
  );
}

function normalizeElysiaCron(value: string): string {
  const fields = value.trim().split(/\s+/);
  if (fields.length === 6) {
    return value.trim();
  }

  if (fields.length === 5) {
    return `0 ${value.trim()}`;
  }

  throw new ConfigurationError("SESSION_REFRESH_CRON must contain 5 or 6 fields.");
}
