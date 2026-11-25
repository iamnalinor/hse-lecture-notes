import { readBoundedJson } from "./request-json";
import { classifyError } from "./public-error";
import {
  handleAllowance,
  handleCreateNonce,
  handleLogout,
  handleTelegramLogin,
  resolveBrowserToken,
  verifyActiveSession,
} from "./auth";
import { ChatRunner } from "./chat/runner";
import { randomToken } from "./crypto";
import { TrackedD1 } from "./db";
import { logEvent } from "./logger";
import { handleGetThread } from "./chat/thread-route";
import { sweepExpiredRuns } from "./quotas";
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
async function handleGetRunStatus(
  env: Env,
  db: TrackedD1,
  request: Request,
  runId: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const btCheck = await resolveBrowserToken(
    env.BROWSER_TOKEN_SECRET,
    request.headers.get("X-Browser-Token"),
  );

  const session = await verifyActiveSession(env, db, extractSessionToken(request));
  if (!session && btCheck.status === "missing") {
    return { status: 401, body: { code: "unauthorized", message: "Session or browser token required" } };
  }

  const run = await db.first<{
    id: string;
    status: string;
    expires_at: number;
    assistant_message_id: string;
    thread_id: string;
    telegram_id: number | null;
    browser_id: string;
  }>(
    db
      .prepare(
        "SELECT id, status, expires_at, assistant_message_id, thread_id, telegram_id, browser_id FROM usage_runs WHERE id = ?",
      )
      .bind(runId),
  );

  if (!run) {
    return { status: 404, body: { code: "run_not_found", message: "Run not found" } };
  }

  const ownsRun = session
    ? run.telegram_id === session.telegramId ||
      (run.telegram_id === null && btCheck.status === "ok" && run.browser_id === btCheck.browserId)
    : btCheck.status === "ok" && run.telegram_id === null && run.browser_id === btCheck.browserId;

  if (!ownsRun) {
    return { status: 403, body: { code: "forbidden", message: "Not owner of run" } };
  }

  const nowMs = Date.now();
  if (run.status === "running" && run.expires_at < nowMs) {
    await sweepExpiredRuns(db, nowMs);
    return {
      status: 200,
      body: {
        runId: run.id,
        status: "error",
        expiresAt: run.expires_at,
        assistantMessageId: run.assistant_message_id,
        threadId: run.thread_id,
      },
    };
  }

  return {
    status: 200,
    body: {
      runId: run.id,
      status: run.status,
      expiresAt: run.expires_at,
      assistantMessageId: run.assistant_message_id,
      threadId: run.thread_id,
    },
  };
}



function configurationError(env: Env): string | null {
  for (const name of ["TELEGRAM_CLIENT_ID", "BROWSER_TOKEN_SECRET", "ALLOWANCE_JWT_SECRET", "TURNSTILE_SECRET_KEY"] as const) {
    if (!env[name]?.trim()) return `Required Worker secret ${name} is missing or empty`;
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

  async fetch(request: Request, env: Env): Promise<Response> {
    const error = configurationError(env);
    if (error) {
      logEvent("error", "configuration_error", { message: error });
      return jsonResponse(503, { code: "configuration_error", message: error }, null);
    }
    const url = new URL(request.url);
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

    // WebSocket /v1/messages -> enforce Origin, then route to ChatRunner Durable Object
    if (url.pathname === "/v1/messages") {
      const origin = request.headers.get("Origin");
      if (origin && !allowedOrigin) {
        return jsonResponse(403, { code: "forbidden_origin", message: "Origin not allowed" }, null);
      }
      if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
        return jsonResponse(426, { code: "upgrade_required", message: "Expected WebSocket upgrade" }, allowedOrigin);
      }
      // One fresh ChatRunner instance per WebSocket run session (high horizontal scalability, zero contention)
      const stub = env.CHAT_RUNNER.get(env.CHAT_RUNNER.newUniqueId());
      return stub.fetch(request);
    }

    // Enforce Origin on mutating endpoints when browser sends Origin header
    const origin = request.headers.get("Origin");
    if (origin && !allowedOrigin) {
      return jsonResponse(403, { code: "forbidden_origin", message: "Origin not allowed" }, null);
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
      if (url.pathname === "/v1/auth/nonce" && request.method === "POST") {
        const res = await handleCreateNonce(env, db, request);
        return finish(res.status, res.body);
      }

      if (url.pathname === "/v1/auth/telegram" && request.method === "POST") {
        const body = await readBoundedJson(request);
        if (!body) {
          return finish(400, { code: "invalid_json", message: "Invalid JSON body" });
        }
        const res = await handleTelegramLogin(env, db, request, body as { telegramIdToken?: string });
        return finish(res.status, res.body);
      }

      if (url.pathname === "/v1/auth/logout" && request.method === "POST") {
        const body = await readBoundedJson(request);
        if (!body) return finish(400, { code: "invalid_json", message: "Invalid JSON body" });
        const token =
          typeof body.sessionToken === "string" ? body.sessionToken : extractSessionToken(request);
        const res = await handleLogout(env, db, token);
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

      const runStatusMatch = /^\/v1\/runs\/([a-zA-Z0-9_-]+)\/status$/.exec(url.pathname);
      if (runStatusMatch && request.method === "GET") {
        const res = await handleGetRunStatus(env, db, request, runStatusMatch[1]!);
        return finish(res.status, res.body);
      }

      return finish(404, { code: "not_found", message: "Endpoint not found" });
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
        { code: failure.code, message: failure.message, detail: failure.detail },
        allowedOrigin,
      );
    }
  },
};
