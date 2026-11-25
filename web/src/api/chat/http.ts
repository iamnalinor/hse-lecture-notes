import { readStoredAuth } from "./storage.ts";

export type ChatEnvConfig = {
  readonly apiUrl: string;
  readonly telegramClientId: string;
  readonly turnstileSiteKey: string;
};

const stripTrailingSlash = (url: string): string =>
  url.endsWith("/") ? stripTrailingSlash(url.slice(0, -1)) : url;

export const getChatEnvConfig = (): ChatEnvConfig => {
  const env = import.meta.env as Record<string, string | undefined>;
  return {
    apiUrl: stripTrailingSlash(env["VITE_CHAT_API_URL"] ?? ""),
    telegramClientId: env["VITE_TELEGRAM_CLIENT_ID"] ?? "",
    turnstileSiteKey: env["VITE_TURNSTILE_SITE_KEY"] ?? "",
  };
};

export const isChatConfigured = (): boolean => getChatEnvConfig().apiUrl !== "";

const buildHeaders = (extra?: Record<string, string>): Headers => {
  const auth = readStoredAuth();
  const headers = new Headers(extra);
  if (auth.browserToken !== null) {
    headers.set("X-Browser-Token", auth.browserToken);
  }
  if (auth.sessionToken !== null) {
    headers.set("X-Session-Token", auth.sessionToken);
  }
  return headers;
};

export const apiJson = async (
  path: string,
  init: RequestInit,
): Promise<{ readonly data: unknown; readonly ok: boolean; readonly status: number }> => {
  const { apiUrl } = getChatEnvConfig();
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    credentials: "omit",
    signal: init.signal ?? AbortSignal.timeout(30_000),
    headers: buildHeaders(init.headers as Record<string, string> | undefined),
  });
  try {
    const data: unknown = await response.json();
    return { data, ok: response.ok, status: response.status };
  } catch {
    return { data: {}, ok: response.ok, status: response.status };
  }
};

export const assertSameSession = (sessionToken: null | string): void => {
  if (sessionToken !== readStoredAuth().sessionToken) {
    throw new Error("Chat session changed");
  }
};

/**
The server's own explanation of a failed call: message, then code, HTTP status and detail. A body
without a message (a proxy page, an old Worker) still names the status, so nothing is a bare "500".
*/
export const describeApiFailure = (res: {
  readonly data: unknown;
  readonly status: number;
}): string => {
  const body = (typeof res.data === "object" && res.data !== null ? res.data : {}) as Record<
    string,
    unknown
  >;
  const text = (key: string): string | undefined =>
    typeof body[key] === "string" && body[key] !== "" ? body[key] : undefined;
  const code = text("code");
  const detail = text("detail");
  const meta = `${code === undefined ? "" : `${code}, `}HTTP ${String(res.status)}${detail === undefined ? "" : `: ${detail}`}`;
  const message = text("message");
  return message === undefined ? `Сервер ответил ошибкой (${meta})` : `${message} (${meta})`;
};
