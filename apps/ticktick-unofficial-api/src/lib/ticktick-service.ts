import {
  MemorySessionStore,
  TickTickApiError,
  TickTickAuthError,
  TickTickClient,
  type TickTickSerializedSession,
  type TickTickSessionStore,
} from "node-ticktick-unofficial/core";

import type { AppConfig, TickTickServiceDependencies } from "./config";

export interface SessionStatus {
  hasSession: boolean;
  username: string;
  service: AppConfig["ticktick"]["service"];
  updatedAt: string | null;
  createdAt: string | null;
  deviceId: string | null;
  sessionStore: AppConfig["ticktick"]["sessionStore"];
  authMode: AppConfig["auth"]["mode"];
  cronDriver: AppConfig["cron"]["driver"];
  telemetryEnabled: boolean;
}

export interface SessionMaintenanceResult {
  ok: true;
  action: "login" | "relogin" | "keepalive";
  source: string;
  ranAt: string;
  sessionUpdatedAt: string | null;
  sessionCreatedAt: string | null;
  deviceId: string | null;
}

export class TickTickService {
  #clientPromise?: Promise<TickTickClient>;
  #maintenancePromise?: Promise<SessionMaintenanceResult>;
  readonly #sessionStoreFactory: () => Promise<TickTickSessionStore>;

  constructor(
    readonly config: AppConfig,
    dependencies: Partial<TickTickServiceDependencies> = {},
  ) {
    this.#sessionStoreFactory = dependencies.sessionStoreFactory ?? (() => Promise.resolve(new MemorySessionStore()));
  }

  async getClient(): Promise<TickTickClient> {
    if (!this.#clientPromise) {
      this.#clientPromise = this.#createClient();
    }

    return this.#clientPromise;
  }

  async getSessionStatus(): Promise<SessionStatus> {
    const client = await this.getClient();
    const session = await client.restoreSession();

    return {
      hasSession: Boolean(session),
      username: this.config.ticktick.username,
      service: this.config.ticktick.service,
      updatedAt: session?.updatedAt ?? null,
      createdAt: session?.createdAt ?? null,
      deviceId: session?.device.id ?? null,
      sessionStore: this.config.ticktick.sessionStore,
      authMode: this.config.auth.mode,
      cronDriver: this.config.cron.driver,
      telemetryEnabled: this.config.telemetry.enabled,
    };
  }

  async refreshSession(source: string): Promise<SessionMaintenanceResult> {
    if (!this.#maintenancePromise) {
      this.#maintenancePromise = this.#runRefreshSession(source).finally(() => {
        this.#maintenancePromise = undefined;
      });
    }

    return this.#maintenancePromise;
  }

  async listTasks() {
    return (await this.getClient()).tasks.list();
  }

  async #createClient(): Promise<TickTickClient> {
    const sessionStore = await this.#sessionStoreFactory();

    return TickTickClient.create({
      service: this.config.ticktick.service,
      credentials: {
        username: this.config.ticktick.username,
        password: this.config.ticktick.password,
      },
      sessionStore,
      timezone: this.config.ticktick.timezone,
      language: this.config.ticktick.language,
    });
  }

  async #runRefreshSession(source: string): Promise<SessionMaintenanceResult> {
    const client = await this.getClient();
    const existingSession = await client.restoreSession();
    const hadSession = Boolean(existingSession);
    const isValid = hadSession ? await client.validateSession() : false;

    let action: SessionMaintenanceResult["action"];
    if (isValid) {
      await client.keepAlive();
      action = "keepalive";
    } else {
      await client.login();
      action = hadSession ? "relogin" : "login";
    }

    const session = client.getSession();
    return this.#toMaintenanceResult(session, action, source);
  }

  #toMaintenanceResult(
    session: TickTickSerializedSession | null,
    action: SessionMaintenanceResult["action"],
    source: string,
  ): SessionMaintenanceResult {
    return {
      ok: true,
      action,
      source,
      ranAt: new Date().toISOString(),
      sessionUpdatedAt: session?.updatedAt ?? null,
      sessionCreatedAt: session?.createdAt ?? null,
      deviceId: session?.device.id ?? null,
    };
  }
}

export function mapErrorToResponse(error: unknown) {
  if (error instanceof TickTickApiError) {
    return {
      status: error.status >= 400 && error.status < 500 ? error.status : 502,
      body: {
        code: "TICKTICK_API_ERROR",
        message: error.message,
        details: {
          method: error.method,
          url: error.url,
          responseBody: error.responseBody,
        },
      },
    };
  }

  if (error instanceof TickTickAuthError) {
    return {
      status: 503,
      body: {
        code: "TICKTICK_AUTH_ERROR",
        message: error.message,
      },
    };
  }

  if (error instanceof Error) {
    return {
      status: 500,
      body: {
        code: "INTERNAL_ERROR",
        message: error.message,
      },
    };
  }

  return {
    status: 500,
    body: {
      code: "INTERNAL_ERROR",
      message: "Unknown error",
    },
  };
}
