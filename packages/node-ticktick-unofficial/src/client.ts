import { TickTickAuthError, TickTickApiError } from "./errors.js";
import { getCookieValue, getSetCookieHeaders, mergeCookies, parseSetCookieHeaders, serializeCookies } from "./internal/cookies.js";
import { createDeviceId, createTraceId } from "./internal/ids.js";
import { TickTickFocusApi } from "./modules/focus.js";
import { TickTickHabitsApi } from "./modules/habits.js";
import { TickTickCountdownsApi } from "./modules/countdowns.js";
import { TickTickProjectsApi } from "./modules/projects.js";
import { TickTickStatisticsApi } from "./modules/statistics.js";
import { TickTickTasksApi } from "./modules/tasks.js";
import { TickTickTagsApi } from "./modules/tags.js";
import { TickTickUserApi } from "./modules/user.js";
import type {
  TickTickClientOptions,
  TickTickCredentials,
  TickTickDeviceDescriptor,
  TickTickPasswordLoginResponse,
  TickTickSerializedSession,
  TickTickServiceConfig,
  TickTickServiceName,
} from "./types.js";

interface TickTickRequestOptions {
  path: string;
  method?: string;
  headers?: HeadersInit;
  json?: unknown;
  auth?: "required" | "none";
  base?: "api" | "ms" | "absolute";
  retryAuth?: boolean;
}

const SERVICE_CONFIGS: Record<TickTickServiceName, TickTickServiceConfig> = {
  ticktick: {
    service: "ticktick",
    apiBaseUrl: "https://api.ticktick.com",
    msBaseUrl: "https://ms.ticktick.com",
    webBaseUrl: "https://ticktick.com",
    loginPath: "/api/v2/user/signon?wc=true&remember=true",
    defaultLanguage: "en_US",
  },
  dida365: {
    service: "dida365",
    apiBaseUrl: "https://api.dida365.com",
    msBaseUrl: "https://ms.dida365.com",
    webBaseUrl: "https://dida365.com",
    loginPath: "/api/v2/user/signon?wc=true&remember=true",
    defaultLanguage: "zh_CN",
  },
};

export class TickTickClient {
  readonly service: TickTickServiceConfig;
  readonly timezone: string;
  readonly language: string;
  readonly userAgent: string;
  readonly device: TickTickDeviceDescriptor;

  readonly tasks: TickTickTasksApi;
  readonly tags: TickTickTagsApi;
  readonly projects: TickTickProjectsApi;
  readonly countdowns: TickTickCountdownsApi;
  readonly habits: TickTickHabitsApi;
  readonly focus: TickTickFocusApi;
  readonly pomodoros: TickTickFocusApi;
  readonly statistics: TickTickStatisticsApi;
  readonly user: TickTickUserApi;

  #fetch: typeof globalThis.fetch;
  #credentials?: TickTickCredentials;
  #sessionStore?: TickTickClientOptions["sessionStore"];
  #session: TickTickSerializedSession | null;
  #didLoadStoredSession = false;
  #sessionValidationState: "unknown" | "valid" | "invalid" = "invalid";

  constructor(options: TickTickClientOptions = {}) {
    this.service = SERVICE_CONFIGS[options.service ?? "ticktick"];
    this.timezone = options.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
    this.language = options.language ?? this.service.defaultLanguage;
    this.userAgent =
      options.userAgent ??
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36";
    this.device = {
      platform: "web",
      os: "Windows 10",
      device: "Chrome 136.0.0.0",
      name: "",
      version: 6310,
      id: createDeviceId(),
      channel: "website",
      campaign: "",
      websocket: "",
      ...options.device,
    };

    this.#fetch = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.#credentials = options.credentials;
    this.#sessionStore = options.sessionStore;
    this.#session = options.session ?? null;
    if (this.#session?.device) {
      Object.assign(this.device, this.#session.device);
    }

    this.tasks = new TickTickTasksApi(this);
    this.tags = new TickTickTagsApi(this);
    this.projects = new TickTickProjectsApi(this);
    this.countdowns = new TickTickCountdownsApi(this);
    this.habits = new TickTickHabitsApi(this);
    this.focus = new TickTickFocusApi(this);
    this.pomodoros = this.focus;
    this.statistics = new TickTickStatisticsApi(this);
    this.user = new TickTickUserApi(this);
  }

  static async create(options: TickTickClientOptions = {}): Promise<TickTickClient> {
    const client = new TickTickClient(options);
    await client.restoreSession();
    return client;
  }

  getSession(): TickTickSerializedSession | null {
    return this.#session;
  }

  async restoreSession(): Promise<TickTickSerializedSession | null> {
    if (this.#session || this.#didLoadStoredSession || !this.#sessionStore) {
      return this.#session;
    }

    this.#didLoadStoredSession = true;
    const stored = await this.#sessionStore.load();
    if (stored && stored.service === this.service.service) {
      this.#session = stored;
      Object.assign(this.device, stored.device);
      this.#sessionValidationState = "unknown";
    }

    return this.#session;
  }

  async setSession(session: TickTickSerializedSession | null): Promise<void> {
    this.#session = session;
    this.#sessionValidationState = session ? "unknown" : "invalid";

    if (!this.#sessionStore) {
      return;
    }

    if (session) {
      await this.#sessionStore.save(session);
      return;
    }

    await this.#sessionStore.clear();
  }

  async clearSession(): Promise<void> {
    await this.setSession(null);
  }

  async login(credentials = this.#credentials): Promise<TickTickSerializedSession> {
    if (!credentials) {
      throw new TickTickAuthError("No TickTick credentials are configured.");
    }

    const response = await this.#fetch(`${this.service.apiBaseUrl}${this.service.loginPath}`, {
      method: "POST",
      headers: new Headers({
        accept: "application/json, text/plain, */*",
        "content-type": "application/json",
        referer: `${this.service.webBaseUrl}/`,
        "user-agent": this.userAgent,
        "x-device": JSON.stringify(this.device),
      }),
      body: JSON.stringify(credentials),
    });

    const parsedBody = await this.#parseResponseBody(response);

    if (!response.ok || !parsedBody || typeof parsedBody !== "object" || !("token" in parsedBody)) {
      throw new TickTickAuthError(
        `TickTick login failed with status ${response.status}: ${JSON.stringify(parsedBody)}`,
      );
    }

    const body = parsedBody as TickTickPasswordLoginResponse;
    const cookiesFromHeaders = parseSetCookieHeaders(getSetCookieHeaders(response.headers));
    const cookies = mergeCookies(cookiesFromHeaders, {
      ...cookiesFromHeaders,
      t: cookiesFromHeaders.t ?? body.token,
    });

    const now = new Date().toISOString();
    const session: TickTickSerializedSession = {
      service: this.service.service,
      username: credentials.username,
      token: cookies.t ?? body.token,
      csrfToken: cookies._csrf_token,
      device: { ...this.device },
      cookies,
      login: body,
      createdAt: now,
      updatedAt: now,
    };

    await this.setSession(session);
    this.#sessionValidationState = "valid";
    return session;
  }

  async validateSession(): Promise<boolean> {
    await this.restoreSession();
    return this.#checkCurrentSession();
  }

  async keepAlive(): Promise<void> {
    await this.request({
      path: "/api/v2/column?from=0",
      auth: "required",
    });
  }

  async requestJson<T>(options: TickTickRequestOptions): Promise<T> {
    const response = await this.request(options);
    return (await this.#parseResponseBody(response)) as T;
  }

  async requestBuffer(options: TickTickRequestOptions): Promise<ArrayBuffer> {
    const response = await this.request(options);
    return response.arrayBuffer();
  }

  async request(options: TickTickRequestOptions): Promise<Response> {
    return this.#requestInternal(options);
  }

  async #requestInternal(options: TickTickRequestOptions, didRetryAuth = false): Promise<Response> {
    const session = options.auth === "none" ? null : await this.#ensureSession({ allowLogin: true });
    const url = this.#resolveUrl(options.path, options.base ?? "api");
    const response = await this.#fetch(url, {
      method: options.method ?? (options.json === undefined ? "GET" : "POST"),
      headers: this.#buildBaseHeaders({
        auth: options.auth !== "none",
        session,
        extraHeaders: {
          ...(options.json === undefined ? null : { "content-type": "application/json" }),
          ...options.headers,
        },
      }),
      body: options.json === undefined ? undefined : JSON.stringify(options.json),
    });

    this.#mergeSessionCookies(parseSetCookieHeaders(getSetCookieHeaders(response.headers)));

    if (response.ok) {
      return response;
    }

    const responseBody = await this.#parseResponseBody(response);
    const shouldRetryAuth = !didRetryAuth && options.auth !== "none" && (options.retryAuth ?? true);

    if (shouldRetryAuth && this.#credentials && this.#looksLikeAuthFailure(response.status, responseBody)) {
      await this.login();
      return this.#requestInternal(options, true);
    }

    throw new TickTickApiError(`TickTick request failed with status ${response.status}`, {
      url,
      method: options.method ?? (options.json === undefined ? "GET" : "POST"),
      status: response.status,
      responseBody,
    });
  }

  async #ensureSession(options: { allowLogin: boolean }): Promise<TickTickSerializedSession | null> {
    await this.restoreSession();

    if (this.#session) {
      if (this.#sessionValidationState === "valid") {
        return this.#session;
      }

      if (await this.#checkCurrentSession()) {
        return this.#session;
      }

      await this.clearSession();
    }

    if (!options.allowLogin) {
      return null;
    }

    if (!this.#credentials) {
      throw new TickTickAuthError("No active TickTick session is available and no credentials were provided.");
    }

    return this.login();
  }

  async #checkCurrentSession(): Promise<boolean> {
    if (!this.#session) {
      this.#sessionValidationState = "invalid";
      return false;
    }

    const response = await this.#fetch(`${this.service.apiBaseUrl}/api/v2/user/profile`, {
      method: "GET",
      headers: this.#buildBaseHeaders({
        auth: true,
        session: this.#session,
      }),
    });

    if (!response.ok) {
      this.#sessionValidationState = "invalid";
      return false;
    }

    this.#sessionValidationState = "valid";
    this.#mergeSessionCookies(parseSetCookieHeaders(getSetCookieHeaders(response.headers)));
    return true;
  }

  #buildBaseHeaders(input: {
    auth: boolean;
    session?: TickTickSerializedSession | null;
    extraHeaders?: HeadersInit | null;
  }): Headers {
    const headers = new Headers({
      accept: "application/json, text/plain, */*",
      "accept-language": this.language.replace("_", "-"),
      origin: this.service.webBaseUrl,
      referer: `${this.service.webBaseUrl}/webapp/`,
      "user-agent": this.userAgent,
      hl: this.language,
      "x-device": JSON.stringify(this.device),
      "x-tz": this.timezone,
    });

    if (input.auth && input.session) {
      const csrfToken = getCookieValue(input.session, "_csrf_token");
      if (csrfToken) {
        headers.set("x-csrftoken", csrfToken);
      }

      headers.set("traceid", createTraceId());

      const cookieHeader = serializeCookies(input.session.cookies);
      if (cookieHeader) {
        headers.set("cookie", cookieHeader);
      }
    }

    if (input.extraHeaders) {
      for (const [key, value] of new Headers(input.extraHeaders)) {
        headers.set(key, value);
      }
    }

    return headers;
  }

  #resolveUrl(path: string, base: "api" | "ms" | "absolute"): string {
    if (base === "absolute") {
      return path;
    }

    const root = base === "ms" ? this.service.msBaseUrl : this.service.apiBaseUrl;
    return `${root}${path.startsWith("/") ? path : `/${path}`}`;
  }

  #mergeSessionCookies(nextCookies: Record<string, string>): void {
    if (!this.#session || Object.keys(nextCookies).length === 0) {
      return;
    }

    this.#session = {
      ...this.#session,
      device: { ...this.device },
      token: nextCookies.t ?? this.#session.token,
      csrfToken: nextCookies._csrf_token ?? this.#session.csrfToken,
      cookies: mergeCookies(this.#session.cookies, nextCookies),
      updatedAt: new Date().toISOString(),
    };
    this.#sessionValidationState = "valid";

    if (this.#sessionStore) {
      void this.#sessionStore.save(this.#session);
    }
  }

  async #parseResponseBody(response: Response): Promise<unknown> {
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      return response.json();
    }

    const text = await response.text();
    if (!text) {
      return null;
    }

    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  #looksLikeAuthFailure(status: number, responseBody: unknown): boolean {
    if (status === 401 || status === 403) {
      return true;
    }

    if (!responseBody || typeof responseBody !== "object") {
      return false;
    }

    const body = responseBody as Record<string, unknown>;
    const errorCode = typeof body.errorCode === "string" ? body.errorCode.toLowerCase() : "";
    const errorMessage = typeof body.errorMessage === "string" ? body.errorMessage.toLowerCase() : "";

    return (
      errorCode.includes("token") ||
      errorCode.includes("auth") ||
      errorCode.includes("login") ||
      errorMessage.includes("login") ||
      errorMessage.includes("auth")
    );
  }
}
