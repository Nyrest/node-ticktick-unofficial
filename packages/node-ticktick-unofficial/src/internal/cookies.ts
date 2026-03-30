import type { TickTickSerializedSession } from "../types.js";

export function splitSetCookieHeader(rawHeader: string): string[] {
  return rawHeader
    .split(/,(?=\s*[^;,=\s]+=[^;,]+)/g)
    .map((value) => value.trim())
    .filter(Boolean);
}

export function getSetCookieHeaders(headers: Headers): string[] {
  const withGetSetCookie = headers as Headers & { getSetCookie?: () => string[] };
  if (typeof withGetSetCookie.getSetCookie === "function") {
    return withGetSetCookie.getSetCookie();
  }

  const raw = headers.get("set-cookie");
  return raw ? splitSetCookieHeader(raw) : [];
}

export function parseSetCookieHeaders(setCookieHeaders: string[]): Record<string, string> {
  const cookies: Record<string, string> = {};

  for (const header of setCookieHeaders) {
    const [cookiePart] = header.split(";", 1);
    if (!cookiePart) {
      continue;
    }

    const separatorIndex = cookiePart.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const name = cookiePart.slice(0, separatorIndex).trim();
    const value = cookiePart.slice(separatorIndex + 1).trim().replace(/^"|"$/g, "");

    if (!name) {
      continue;
    }

    cookies[name] = value;
  }

  return cookies;
}

export function serializeCookies(cookies: Record<string, string>): string {
  return Object.entries(cookies)
    .filter(([, value]) => value !== "")
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

export function mergeCookies(
  baseCookies: Record<string, string>,
  nextCookies: Record<string, string>,
): Record<string, string> {
  const merged = { ...baseCookies };

  for (const [name, value] of Object.entries(nextCookies)) {
    if (value === "") {
      delete merged[name];
      continue;
    }

    merged[name] = value;
  }

  return merged;
}

export function getCookieValue(session: TickTickSerializedSession | null, name: string): string | undefined {
  return session?.cookies[name];
}
