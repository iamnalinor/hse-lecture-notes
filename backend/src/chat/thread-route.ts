import { resolveBrowserToken, verifyActiveSession } from "../auth";
import type { TrackedD1 } from "../db";
import { firstQuestionSql, displayThreadTitle } from "./thread-title";
import { loadPolicy } from "../quotas";
import type { Env } from "../types";

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * GET /v1/thread?threadId=...&beforeUpdatedAt=...
 * The signed browser token identifies guests and binds signed-in requests to their session.
 * Never selects `agent_items_json`.
 */
export async function handleGetThread(
  env: Env,
  db: TrackedD1,
  request: Request,
  url: URL,
  sessionToken: string | null,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const requestedThreadId = url.searchParams.get("threadId")?.trim() || null;
  const cursorSeq = url.searchParams.get("beforeSeq");
  const beforeSeq = cursorSeq === null ? null : Number(cursorSeq);
  if (cursorSeq !== null && (!requestedThreadId || !/^\d+$/.test(cursorSeq) || !Number.isSafeInteger(beforeSeq) || Number(beforeSeq) < 1)) {
    return { status: 400, body: { code: "invalid_cursor", message: "Expected a positive message sequence and threadId" } };
  }
  const beforeUpdatedAtRaw = url.searchParams.get("beforeUpdatedAt");
  const beforeUpdatedAt =
    beforeUpdatedAtRaw && /^\d+$/.test(beforeUpdatedAtRaw) ? Number(beforeUpdatedAtRaw) : null;

  const btCheck = await resolveBrowserToken(
    env.BROWSER_TOKEN_SECRET,
    request.headers.get("X-Browser-Token"),
  );

  if (btCheck.status === "missing") {
    return { status: 401, body: { code: "unauthorized", message: "Browser token required" } };
  }
  const session = await verifyActiveSession(env, sessionToken, btCheck.browserId);

  const policy = await loadPolicy(db);
  const pageSize = policy.threadsPageSize;

  // Query threads list (1 query)
  const owner = session ? "telegram_id = ?" : "browser_id = ? AND telegram_id IS NULL";
  const ownerId = session?.telegramId ?? btCheck.browserId;
  const beforeId = url.searchParams.get("beforeId");
  const cursor = beforeUpdatedAt === null ? "" : beforeId ? "AND (updated_at, id) < (?, ?)" : "AND updated_at < ?";
  const bounds = beforeUpdatedAt === null ? [] : beforeId ? [beforeUpdatedAt, beforeId] : [beforeUpdatedAt];
  const threadsRes = await db.all<{ id: string; first_question: string | null; generated_title: string | null; context_limited: number; updated_at: number }>(
    db.prepare(`SELECT id, ${firstQuestionSql} AS first_question, generated_title, context_limited, updated_at FROM chat_threads
                WHERE ${owner} ${cursor} ORDER BY updated_at DESC, id DESC LIMIT ?`)
      .bind(ownerId, ...bounds, pageSize + 1),
  );

  const threads = threadsRes.results.slice(0, pageSize).map((t) => ({
    id: t.id,
    title: displayThreadTitle(t.generated_title, t.first_question),
    generatedTitle: t.generated_title,
    contextLimited: Boolean(t.context_limited),
    updatedAt: t.updated_at,
  }));

  const targetThreadId = requestedThreadId ?? (beforeUpdatedAt === null ? threads[0]?.id : null) ?? null;
  let thread: Record<string, unknown> | null = null;
  let requestedThreadMissing = false;

  if (targetThreadId) {
    // Verify ownership + fetch last 50 messages (WITHOUT agent_items_json) in 1 batch
    const [thrRes, msgRes] = await db.batch<Record<string, unknown>>([
      db.prepare(`SELECT id, ${firstQuestionSql} AS first_question, generated_title, context_limited, created_at, updated_at
                  FROM chat_threads WHERE id = ? AND ${owner}`).bind(targetThreadId, ownerId),
      db
        .prepare(
          `SELECT id, seq, role, status, course, doc_id, content_tex, quote_json, steps_json, suggestion, error_message, run_id, created_at, updated_at
           FROM chat_messages
           WHERE thread_id = (SELECT id FROM chat_threads WHERE id = ? AND ${owner})
             ${beforeSeq === null ? "" : "AND seq < ?"}
           ORDER BY seq DESC
           LIMIT 51`,
        )
        .bind(targetThreadId, ownerId, ...(beforeSeq === null ? [] : [beforeSeq])),
    ]);

    const thrRow = thrRes?.results[0] as
      | { id: string; first_question: string | null; generated_title: string | null; context_limited: number; created_at: number; updated_at: number }
      | undefined;

    if (!thrRow) {
      if (requestedThreadId) requestedThreadMissing = true;
    } else {
      const rows = msgRes?.results ?? [];
      const messages = rows.slice(0, 50).reverse().map((m) => ({
        id: m.id,
        seq: m.seq,
        page: { course: m.course, docId: m.doc_id },
        role: m.role,
        status: m.status,
        contentTex: m.content_tex,
        quote: typeof m.quote_json === "string" ? safeJsonParse(m.quote_json) : null,
        suggestion: typeof m.suggestion === "string" ? m.suggestion : null,
        steps: typeof m.steps_json === "string" ? safeJsonParse(m.steps_json) : [],
        errorMessage: m.error_message ?? null,
        runId: m.run_id ?? null,
        createdAt: m.created_at,
        updatedAt: m.updated_at,
      }));
      thread = {
        id: thrRow.id,
        title: displayThreadTitle(thrRow.generated_title, thrRow.first_question),
        generatedTitle: thrRow.generated_title,
        contextLimited: Boolean(thrRow.context_limited),
        createdAt: thrRow.created_at,
        updatedAt: thrRow.updated_at,
        beforeSeq: rows.length > 50 ? messages[0]?.seq : null,
        messages,
      };
    }
  }

  return {
    status: 200,
    body: {
      threads,
      hasMore: threadsRes.results.length > pageSize,
      thread,
      requestedThreadMissing,
    },
  };
}
