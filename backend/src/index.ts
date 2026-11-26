import { readBoundedJson } from "./request-json";
import { classifyError } from "./public-error";
import {
  handleAllowance,
  handleTelegramLogin,
  resolveBrowserToken,
  verifyActiveSession,
} from "./auth";
import { ChatRunner } from "./chat/runner";
import { postMessage } from "./chat/send-route";
import { randomToken } from "./crypto";
import { TrackedD1 } from "./db";
import { logEvent } from "./logger";
import { handleGetThread } from "./chat/thread-route";
import { readRunAfterExpiry } from "./quotas";
import type { Env } from "./types";

export { ChatRunner };

function getAllowedOrigin(request: Request, env: Env): string | null {
  const origin = request.headers.get("Origin");
  if (!origin) return null;
  const allowed = env.ALLOWED_ORIGINS.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return allowed.includes(origin) ? origin : null;
}

function withCorsHeaders(
  headers: Headers,
  allowedOrigin: string | null,
): Headers {
  if (allowedOrigin) {
    headers.set("Access-Control-Allow-Origin", allowedOrigin);
    // Older clients still use credentials: "include"; browser cookies remain ignored.
    headers.set("Access-Control-Allow-Credentials", "true");
    headers.set("Vary", "Origin");
  }
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Browser-Token, X-Session-Token",
  );
  headers.set("Access-Control-Max-Age", "86400");
  return headers;
}

function jsonResponse(
  status: number,
  body: Record<string, unknown>,
  allowedOrigin: string | null,
): Response {
  const headers = withCorsHeaders(
    new Headers({
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    }),
    allowedOrigin,
  );
  return new Response(JSON.stringify(body), { status, headers });
}

function extractSessionToken(request: Request): string | null {
  const headerTok = request.headers.get("X-Session-Token");
  if (headerTok) return headerTok.trim();
  const auth = request.headers.get("Authorization");
  if (auth && auth.startsWith("Bearer ")) {
    return auth.slice(7).trim();
  }
  return null;
}


/**
 * GET /v1/runs/:runId/status
 * Compact recovery status check: 1 PK read + owner verification, NO budget/quota recomputation.
 */
async function handleRunRequest(
  env: Env,
  db: TrackedD1,
  request: Request,
  runId: string,
  action: "status" | "stop",
): Promise<{ status: number; body: Record<string, unknown> }> {
  const btCheck = await resolveBrowserToken(
    env.BROWSER_TOKEN_SECRET,
    request.headers.get("X-Browser-Token"),
  );

  if (btCheck.status === "missing") {
    return { status: 401, body: { code: "unauthorized", message: "Browser token required" } };
  }
  const session = await verifyActiveSession(env, extractSessionToken(request), btCheck.browserId);

  const run = await db.first<{
    id: string;
    status: string;
    expires_at: number;
    actual_cost_micros: number;
    assistant_message_id: string;
    thread_id: string;
    telegram_id: number | null;
    browser_id: string;
  }>(
    db
      .prepare(
        "SELECT id, status, expires_at, actual_cost_micros, assistant_message_id, thread_id, telegram_id, browser_id FROM usage_runs WHERE id = ?",
      )
      .bind(runId),
  );

  if (!run) {
    return { status: 404, body: { code: "run_not_found", message: "Run not found" } };
  }

  const ownsRun = run.telegram_id === null
    ? run.browser_id === btCheck.browserId
    : run.telegram_id === session?.telegramId;

  if (!ownsRun) {
    return { status: 403, body: { code: "forbidden", message: "Not owner of run" } };
  }

  if (action === "stop") {
    if (run.status === "running") {
      await env.CHAT_RUNNER.get(env.CHAT_RUNNER.idFromName(run.id)).stopMessage();
    }
    return { status: 204, body: {} };
  }

  const nowMs = Date.now();
  const current = run.status === "running" && run.expires_at < nowMs
    ? await readRunAfterExpiry(db, run, nowMs)
    : run;
  if (!current) return { status: 404, body: { code: "run_not_found", message: "Run not found" } };

  return {
    status: 200,
    body: {
      runId: run.id,
      status: current.status,
      expiresAt: current.expires_at,
      assistantMessageId: run.assistant_message_id,
      threadId: run.thread_id,
    },
  };
}



function configurationError(env: Env): string | null {
  for (const name of ["TELEGRAM_CLIENT_ID", "BROWSER_TOKEN_SECRET", "ALLOWANCE_JWT_SECRET", "TURNSTILE_SECRET_KEY"] as const) {
    if (!env[name]?.trim()) return `Required Worker secret ${name} is missing or empty`;
  }
  if (env.LLM_PROVIDER?.trim() === "openai" && !env.OPENAI_API_KEY?.trim()) {
    return "Required Worker secret OPENAI_API_KEY is missing or empty";
  }
  return null;
}

export default {
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    const error = configurationError(env);
    if (error) throw new Error(error);
    // Delegate immediately to SQLite-backed DO (30s CPU budget instead of 10ms Free Cron limit)
    const stub = env.CHAT_RUNNER.get(env.CHAT_RUNNER.idFromName("daily-archiver"));
    ctx.waitUntil(stub.runDailyArchive());
  },

  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const isMessage = url.pathname === "/v1/messages";
    const runRoute = /^\/v1\/runs\/([a-zA-Z0-9_-]+)\/(status|stop)$/.exec(url.pathname);
    const chatError = isMessage || runRoute?.[2] === "stop" ? { type: "error" } : {};
    const error = configurationError(env);
    if (error) {
      logEvent("error", "configuration_error", { message: error });
      return jsonResponse(503, { ...chatError, code: "configuration_error", message: error }, getAllowedOrigin(request, env));
    }
    const allowedOrigin = getAllowedOrigin(request, env);

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: withCorsHeaders(new Headers(), allowedOrigin),
      });
    }

    // Health check
    if (url.pathname === "/v1/health" && request.method === "GET") {
      return jsonResponse(200, { ok: true, service: "hse-lecture-notes-api" }, allowedOrigin);
    }

    // Enforce Origin on mutating endpoints when browser sends Origin header
    const origin = request.headers.get("Origin");
    if (origin && !allowedOrigin) {
      return jsonResponse(403, { ...chatError, code: "forbidden_origin", message: "Origin not allowed" }, null);
    }

    if (isMessage && request.method === "GET" && request.headers.get("Upgrade")?.toLowerCase() === "websocket") {
      // Already-open pages use the old protocol. Send one actionable frame at the edge.
      const { 0: client, 1: server } = new WebSocketPair();
      server.accept();
      server.send(JSON.stringify({ type: "error", code: "client_update_required",
        message: "Обнови страницу, чтобы отправить вопрос в чат. Перед обновлением скопируй текст вопроса." }));
      server.close(1000, "client_update_required");
      return new Response(null, { status: 101, webSocket: client });
    }
    const db = new TrackedD1(env.DB);
    const reqId = `req_${randomToken(8)}`;
    const reqStart = Date.now();
    const finish = (
      status: number,
      body: Record<string, unknown>,
    ): Response => {
      logEvent(status >= 500 ? "error" : status >= 400 ? "warn" : "info", "http_request", {
        reqId,
        method: request.method,
        path: url.pathname,
        status,
        code: typeof body.code === "string" ? body.code : undefined,
        reason: typeof body.reason === "string" ? body.reason : undefined,
        durationMs: Date.now() - reqStart,
        ...db.telemetry.snapshot(),
      });
      return jsonResponse(status, body, allowedOrigin);
    };

    try {
      if (isMessage) {
        if (request.method !== "POST") return finish(405, { ...chatError, code: "method_not_allowed", message: "Используй POST для отправки сообщения." });
        const admission = postMessage(env, db, request);
        // Complete the D1 reservation and its handoff even if the reader leaves before meta.
        ctx.waitUntil(admission.then(() => {}, () => {}));
        const response = await admission;
        logEvent("info", "chat_admission_telemetry", { reqId, status: response.status, ...db.telemetry.snapshot() });
        return new Response(response.body, { status: response.status,
          headers: withCorsHeaders(new Headers(response.headers), allowedOrigin) });
      }
      if (url.pathname === "/v1/auth/telegram" && request.method === "POST") {
        const body = await readBoundedJson(request);
        if (!body) {
          return finish(400, { code: "invalid_json", message: "Invalid JSON body" });
        }
        const res = await handleTelegramLogin(env, db, request, body as { telegramIdToken?: string });
        return finish(res.status, res.body);
      }

      if (url.pathname === "/v1/allowance" && request.method === "POST") {
        const body = await readBoundedJson(request);
        if (!body) {
          return finish(400, { code: "invalid_json", message: "Invalid JSON body" });
        }
        const res = await handleAllowance(env, db, request, {
          turnstileToken: typeof body.turnstileToken === "string" ? body.turnstileToken : undefined,
          sessionToken:
            typeof body.sessionToken === "string"
              ? body.sessionToken
              : extractSessionToken(request) ?? undefined,
          browserToken: typeof body.browserToken === "string" ? body.browserToken : undefined,
          fingerprint: typeof body.fingerprint === "string" ? body.fingerprint : undefined,
        });
        return finish(res.status, res.body);
      }

      if (url.pathname === "/v1/thread" && request.method === "GET") {
        const res = await handleGetThread(env, db, request, url, extractSessionToken(request));
        return finish(res.status, res.body);
      }

      if (runRoute && (runRoute[2] === "status" && request.method === "GET" || runRoute[2] === "stop" && request.method === "POST")) {
        const res = await handleRunRequest(env, db, request, runRoute[1]!, runRoute[2]);
        if (res.status === 204) return new Response(null, { status: 204, headers: withCorsHeaders(new Headers(), allowedOrigin) });
        return finish(res.status, { ...chatError, ...res.body });
      }

      return finish(404, { ...chatError, code: "not_found", message: "Endpoint not found" });
    } catch (err) {
      logEvent("error", "http_unhandled_error", {
        reqId,
        method: request.method,
        path: url.pathname,
        durationMs: Date.now() - reqStart,
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack?.slice(0, 600) : undefined,
        ...db.telemetry.snapshot(),
      });
      const failure = classifyError(err);
      return jsonResponse(
        failure.status,
        { ...chatError, code: failure.code, message: failure.message, detail: failure.detail },
        allowedOrigin,
      );
    }
  },
};
