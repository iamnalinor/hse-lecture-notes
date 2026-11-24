import {
  handleAllowance,
  handleCreateNonce,
  handleLogout,
  handleTelegramLogin,
  makeBrowserTokenCookie,
  resolveBrowserToken,
  verifyActiveSession,
} from "./auth";
import { ChatRunner } from "./chat-runner";
import { randomToken } from "./crypto";
import { TrackedD1 } from "./db";
import { logEvent } from "./logger";
import { loadPolicy, sweepExpiredRuns } from "./quotas";
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
  setCookie?: string,
): Response {
  const headers = withCorsHeaders(
    new Headers({
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    }),
    allowedOrigin,
  );
  if (setCookie) {
    headers.append("Set-Cookie", setCookie);
  }
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

async function readBoundedJson(request: Request, maxBytes = 32_768): Promise<Record<string, unknown> | null> {
  const cl = Number(request.headers.get("Content-Length") ?? "0");
  if (cl > maxBytes) return null;
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) return null;
  if (!text.trim()) return {};
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/**
 * GET /v1/thread?course=...&doc=...&threadId=...&beforeUpdatedAt=...
 * Authorized by sessionToken (logged-in) or browserToken (guest) — NO Turnstile and NO IP binding!
 * Never selects `agent_items_json`.
 */
async function handleGetThread(
  env: Env,
  db: TrackedD1,
  request: Request,
  url: URL,
): Promise<{ status: number; body: Record<string, unknown>; setCookie?: string }> {
  const course = url.searchParams.get("course")?.trim() ?? "";
  const docId = url.searchParams.get("doc")?.trim() ?? "";
  const requestedThreadId = url.searchParams.get("threadId")?.trim() || null;
  const beforeUpdatedAtRaw = url.searchParams.get("beforeUpdatedAt");
  const beforeUpdatedAt =
    beforeUpdatedAtRaw && /^\d+$/.test(beforeUpdatedAtRaw) ? Number(beforeUpdatedAtRaw) : null;

  if (!url.searchParams.has("course") || !url.searchParams.has("doc") || (!course && docId)) {
    return { status: 400, body: { code: "missing_params", message: "course and doc are required" } };
  }

  const btCheck = await resolveBrowserToken(
    env.BROWSER_TOKEN_SECRET,
    request.headers.get("Cookie"),
    request.headers.get("X-Browser-Token"),
  );
  if (btCheck.status === "mismatch") {
    return { status: 409, body: { code: "browser_token_mismatch", message: "Browser token mismatch" } };
  }

  const session = await verifyActiveSession(env, db, extractSessionToken(request));
  if (!session && btCheck.status === "missing") {
    return { status: 401, body: { code: "unauthorized", message: "Session or browser token required" } };
  }

  const policy = await loadPolicy(db);
  const pageSize = policy.threadsPageSize;

  // Query threads list (1 query)
  const threadsRes = session
    ? beforeUpdatedAt !== null
      ? await db.all<{ id: string; title: string; updated_at: number }>(
          db
            .prepare(
              `SELECT id, title, updated_at
               FROM chat_threads
               WHERE telegram_id = ? AND course = ? AND doc_id = ? AND updated_at < ?
               ORDER BY updated_at DESC
               LIMIT ?`,
            )
            .bind(session.telegramId, course, docId, beforeUpdatedAt, pageSize),
        )
      : await db.all<{ id: string; title: string; updated_at: number }>(
          db
            .prepare(
              `SELECT id, title, updated_at
               FROM chat_threads
               WHERE telegram_id = ? AND course = ? AND doc_id = ?
               ORDER BY updated_at DESC
               LIMIT ?`,
            )
            .bind(session.telegramId, course, docId, pageSize),
        )
    : beforeUpdatedAt !== null
      ? await db.all<{ id: string; title: string; updated_at: number }>(
          db
            .prepare(
              `SELECT id, title, updated_at
               FROM chat_threads
               WHERE browser_id = ? AND telegram_id IS NULL AND course = ? AND doc_id = ? AND updated_at < ?
               ORDER BY updated_at DESC
               LIMIT ?`,
            )
            .bind(btCheck.status === "ok" ? btCheck.browserId : "", course, docId, beforeUpdatedAt, pageSize),
        )
      : await db.all<{ id: string; title: string; updated_at: number }>(
          db
            .prepare(
              `SELECT id, title, updated_at
               FROM chat_threads
               WHERE browser_id = ? AND telegram_id IS NULL AND course = ? AND doc_id = ?
               ORDER BY updated_at DESC
               LIMIT ?`,
            )
            .bind(btCheck.status === "ok" ? btCheck.browserId : "", course, docId, pageSize),
        );

  const threads = threadsRes.results.map((t) => ({
    id: t.id,
    title: t.title,
    updatedAt: t.updated_at,
  }));

  const targetThreadId = requestedThreadId ?? threads[0]?.id ?? null;
  let thread: Record<string, unknown> | null = null;
  let requestedThreadMissing = false;

  if (targetThreadId) {
    // Verify ownership + fetch last 50 messages (WITHOUT agent_items_json) in 1 batch
    const [thrRes, msgRes] = await db.batch<Record<string, unknown>>([
      session
        ? db
            .prepare(
              "SELECT id, course, doc_id, title, created_at, updated_at FROM chat_threads WHERE id = ? AND telegram_id = ?",
            )
            .bind(targetThreadId, session.telegramId)
        : db
            .prepare(
              "SELECT id, course, doc_id, title, created_at, updated_at FROM chat_threads WHERE id = ? AND browser_id = ? AND telegram_id IS NULL",
            )
            .bind(targetThreadId, btCheck.status === "ok" ? btCheck.browserId : ""),
      db
        .prepare(
          `SELECT id, seq, role, status, content_tex, quote_json, steps_json, error_message, run_id, created_at, updated_at
           FROM chat_messages
           WHERE thread_id = ?
           ORDER BY seq DESC
           LIMIT 50`,
        )
        .bind(targetThreadId),
    ]);

    const thrRow = thrRes?.results[0] as
      | { id: string; course: string; doc_id: string; title: string; created_at: number; updated_at: number }
      | undefined;

    if (!thrRow || thrRow.course !== course || thrRow.doc_id !== docId) {
      if (requestedThreadId) requestedThreadMissing = true;
    } else {
      const messages = [...(msgRes?.results ?? [])].reverse().map((m) => ({
        id: m.id,
        seq: m.seq,
        role: m.role,
        status: m.status,
        contentTex: m.content_tex,
        quote: typeof m.quote_json === "string" ? safeJsonParse(m.quote_json) : null,
        steps: typeof m.steps_json === "string" ? safeJsonParse(m.steps_json) : [],
        errorMessage: m.error_message ?? null,
        runId: m.run_id ?? null,
        createdAt: m.created_at,
        updatedAt: m.updated_at,
      }));
      thread = {
        id: thrRow.id,
        course: thrRow.course,
        docId: thrRow.doc_id,
        title: thrRow.title,
        createdAt: thrRow.created_at,
        updatedAt: thrRow.updated_at,
        messages,
      };
    }
  }

  const isSecure = request.url.startsWith("https://");
  return {
    status: 200,
    body: {
      threads,
      thread,
      requestedThreadMissing,
      ...(btCheck.status === "ok" && btCheck.needsStorageSync
        ? { browserToken: btCheck.browserToken }
        : {}),
    },
    ...(btCheck.status === "ok" && btCheck.needsCookieSync
      ? { setCookie: makeBrowserTokenCookie(btCheck.browserToken, isSecure) }
      : {}),
  };
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
    request.headers.get("Cookie"),
    request.headers.get("X-Browser-Token"),
  );
  if (btCheck.status === "mismatch") {
    return { status: 409, body: { code: "browser_token_mismatch", message: "Browser token mismatch" } };
  }

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

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export default {
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    // Delegate immediately to SQLite-backed DO (30s CPU budget instead of 10ms Free Cron limit)
    const stub = env.CHAT_RUNNER.get(env.CHAT_RUNNER.idFromName("daily-archiver"));
    ctx.waitUntil(stub.runDailyArchive());
  },

  async fetch(request: Request, env: Env): Promise<Response> {
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
      setCookie?: string,
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
      return jsonResponse(status, body, allowedOrigin, setCookie);
    };

    try {
      if (url.pathname === "/v1/auth/nonce" && request.method === "POST") {
        const res = await handleCreateNonce(env, db, request);
        return finish(res.status, res.body, res.setCookie);
      }

      if (url.pathname === "/v1/auth/telegram" && request.method === "POST") {
        const body = await readBoundedJson(request);
        if (!body) {
          return finish(400, { code: "invalid_json", message: "Invalid JSON body" });
        }
        const res = await handleTelegramLogin(env, db, request, body as { telegramIdToken?: string });
        return finish(res.status, res.body, res.setCookie);
      }

      if (url.pathname === "/v1/auth/logout" && request.method === "POST") {
        const body = (await readBoundedJson(request)) ?? {};
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
        return finish(res.status, res.body, res.setCookie);
      }

      if (url.pathname === "/v1/thread" && request.method === "GET") {
        const res = await handleGetThread(env, db, request, url);
        return finish(res.status, res.body, res.setCookie);
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
      return jsonResponse(500, { code: "internal_error", message: "Internal server error" }, allowedOrigin);
    }
  },
};
