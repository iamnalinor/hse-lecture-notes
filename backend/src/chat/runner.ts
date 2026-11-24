import { DurableObject } from "cloudflare:workers";
import { ContextSizeError } from "./history";
import { executeAgentRun } from "./agent-loop";
import { r2ToArchiveStorage, runArchiveBatch, type ArchiveBatchStats } from "../archiver";
import { resolveBrowserToken, verifyAllowanceToken } from "../auth";
import { createLlmProvider } from "../llm/provider";
import { normalizeIpAddress, sha256Hex } from "../crypto";
import { TrackedD1 } from "../db";
import { logEvent, maskId } from "../logger";
import { admitRunAtomic, loadPolicy } from "../quotas";
import { validateAssistantQuote, validateQuoteAgainstCourse } from "./tools";
import type { ClientWsFrame, Env, ServerWsFrame } from "../types";

const AUTH_FRAME_TIMEOUT_MS = 5_000;
const encoder = new TextEncoder();

export class ChatRunner extends DurableObject<Env> {
  /** RPC entrypoint called by the daily Cron Trigger (runs with DO 30s CPU budget). */
  async runDailyArchive(): Promise<ArchiveBatchStats> {
    const db = new TrackedD1(this.env.DB);
    const storage = this.env.ARCHIVE_BUCKET ? r2ToArchiveStorage(this.env.ARCHIVE_BUCKET) : null;
    return runArchiveBatch(db, storage);
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Expected WebSocket upgrade", { status: 426 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.accept();

    const clientIp = normalizeIpAddress(
      request.headers.get("CF-Connecting-IP") ?? request.headers.get("X-Forwarded-For"),
    );

    let socketOpen = true;
    let receivedSend = false;
    let stoppedByUser = false;
    let activeAbort: AbortController | null = null;

    const safeSend = (frame: ServerWsFrame): void => {
      if (!socketOpen) return;
      try {
        server.send(JSON.stringify(frame));
      } catch {
        socketOpen = false;
      }
    };

    const safeClose = (code = 1000, reason = "done"): void => {
      if (!socketOpen) return;
      socketOpen = false;
      try {
        server.close(code, reason);
      } catch {
        // ignore close errors
      }
    };

    const authTimeout = setTimeout(() => {
      if (!receivedSend) {
        safeSend({ type: "error", code: "auth_timeout", message: "No initial send frame received" });
        safeClose(4008, "auth_timeout");
      }
    }, AUTH_FRAME_TIMEOUT_MS);

    server.addEventListener("close", () => {
      socketOpen = false;
      clearTimeout(authTimeout);
      // Do NOT abort activeAbort on plain socket disconnect; only explicit `{ type: "stop" }` aborts.
    });

    server.addEventListener("error", () => {
      socketOpen = false;
      clearTimeout(authTimeout);
    });

    server.addEventListener("message", (event) => {
      const raw = event.data;
      const byteLength =
        typeof raw === "string"
          ? encoder.encode(raw).byteLength
          : raw instanceof ArrayBuffer
            ? raw.byteLength
            : 0;

      if (byteLength === 0 || byteLength > 40_960) {
        safeSend({ type: "error", code: "payload_too_large", message: "Frame exceeds maximum size" });
        safeClose(1009, "payload_too_large");
        return;
      }

      if (typeof raw !== "string") {
        safeSend({ type: "error", code: "invalid_frame", message: "Expected UTF-8 JSON frame" });
        safeClose(1003, "invalid_frame");
        return;
      }

      let frame: ClientWsFrame;
      try {
        frame = JSON.parse(raw) as ClientWsFrame;
      } catch {
        safeSend({ type: "error", code: "invalid_json", message: "Malformed JSON frame" });
        safeClose(1007, "invalid_json");
        return;
      }

      if (frame.type === "stop") {
        stoppedByUser = true;
        activeAbort?.abort("user_stop");
        return;
      }

      if (frame.type !== "send") {
        safeSend({ type: "error", code: "unknown_frame_type", message: "Unknown WS frame type" });
        return;
      }

      if (receivedSend) {
        safeSend({
          type: "error",
          code: "duplicate_send",
          message: "Only one send frame is allowed per WebSocket connection",
        });
        return;
      }
      receivedSend = true;
      clearTimeout(authTimeout);

      activeAbort = new AbortController();
      const abortCtrl = activeAbort;

      const runPromise = this.handleSendFrame({
        frame,
        byteLength,
        clientIp,
        signal: abortCtrl.signal,
        isStoppedByUser: () => stoppedByUser,
        safeSend,
        safeClose,
      });

      this.ctx.waitUntil(runPromise);
    });

    return new Response(null, { status: 101, webSocket: client });
  }

  private async handleSendFrame(opts: {
    frame: Extract<ClientWsFrame, { type: "send" }>;
    byteLength: number;
    clientIp: string;
    signal: AbortSignal;
    isStoppedByUser: () => boolean;
    safeSend: (frame: ServerWsFrame) => void;
    safeClose: (code?: number, reason?: string) => void;
  }): Promise<void> {
    const {
      frame,
      byteLength,
      clientIp,
      signal,
      isStoppedByUser,
      safeSend,
      safeClose,
    } = opts;
    const db = new TrackedD1(this.env.DB);
    let loggedRunId = "unadmitted";

    try {
      const policy = await loadPolicy(db);
      if (byteLength > policy.maxBodyBytes) {
        safeSend({ type: "error", code: "payload_too_large", message: "Message body exceeds limit" });
        safeClose(1009, "payload_too_large");
        return;
      }

      const btCheck = await resolveBrowserToken(
        this.env.BROWSER_TOKEN_SECRET,
        frame.browserToken,
      );
      if (btCheck.status === "missing") {
        safeSend({
          type: "error",
          code: "browser_token_required",
          message: "Valid browserToken required",
        });
        safeClose(4401, "browser_token_required");
        return;
      }

      const allowance = await verifyAllowanceToken(
        this.env,
        db,
        frame.allowanceToken,
        btCheck.browserId,
      );
      if (!allowance) {
        safeSend({
          type: "error",
          code: "allowance_expired",
          message: "Allowance expired or revoked. Refresh allowance.",
        });
        safeClose(4401, "allowance_expired");
        return;
      }

      const questionText = typeof frame.text === "string" ? frame.text.trim() : "";
      const course = typeof frame.course === "string" ? frame.course.trim() : "";
      const docId = typeof frame.docId === "string" ? frame.docId.trim() : "";
      const clientRequestId =
        typeof frame.clientRequestId === "string" ? frame.clientRequestId.trim() : "";
      let quote = frame.quote ?? null;

      if (!clientRequestId || clientRequestId.length > 128) {
        safeSend({ type: "error", code: "invalid_request", message: "Некорректный идентификатор запроса" });
        safeClose(4400, "invalid_request");
        return;
      }
      if ((frame.course != null && typeof frame.course !== "string") ||
          (frame.docId != null && typeof frame.docId !== "string") || (!course && docId)) {
        safeSend({ type: "error", code: "invalid_context", message: "Некорректная страница для вопроса" });
        safeClose(4400, "invalid_context");
        return;
      }
      if (course) {
        const context = docId
          ? db.prepare("SELECT 1 FROM course_documents WHERE course = ? AND doc_id = ? LIMIT 1").bind(course, docId)
          : db.prepare("SELECT 1 FROM course_documents WHERE course = ? LIMIT 1").bind(course);
        if (!(await db.first(context))) {
          safeSend({ type: "error", code: "invalid_context", message: "Учебный материал не найден" });
          safeClose(4400, "invalid_context");
          return;
        }
      }
      if (!questionText && !quote) {
        safeSend({ type: "error", code: "empty_question", message: "Question or quote is required" });
        safeClose(4400, "empty_question");
        return;
      }
      if (questionText.length > policy.maxQuestionChars) {
        safeSend({
          type: "error",
          code: "question_too_long",
          message: `Question exceeds ${policy.maxQuestionChars} chars`,
        });
        safeClose(4400, "question_too_long");
        return;
      }
      if (quote) {
        if (typeof quote.tex !== "string" || quote.tex.length > policy.maxQuoteChars) {
          safeSend({ type: "error", code: "invalid_quote", message: "Quote exceeds limit or invalid" });
          safeClose(4400, "invalid_quote");
          return;
        }
        const assistantQuote = quote.messageId !== undefined;
        const validQuote = assistantQuote
          ? await validateAssistantQuote(db, frame.threadId ?? null, quote, btCheck.browserId, allowance.tgId)
          : Boolean(docId) && await validateQuoteAgainstCourse(db, course, docId, quote);
        if (!validQuote) {
          safeSend({
            type: "error",
            code: "invalid_quote",
            message: assistantQuote ? "Фрагмент не найден в ответе этого диалога" : "Фрагмент не найден в материале",
          });
          safeClose(4400, "invalid_quote");
          return;
        }
        if (assistantQuote) quote = { messageId: quote.messageId, label: "Ответ ассистента", tex: quote.tex };
      }

      const retryAssistantMessageId =
        typeof frame.retryAssistantMessageId === "string" && frame.retryAssistantMessageId.trim()
          ? frame.retryAssistantMessageId.trim()
          : null;

      const payloadHash = await sha256Hex(
        JSON.stringify({
          threadId: frame.threadId ?? null,
          retryAssistantMessageId,
          course,
          docId,
          text: questionText,
          quote: quote ? { blockId: quote.blockId ?? null, messageId: quote.messageId ?? null, tex: quote.tex } : null,
        }),
      );

      // Validate provider settings before reserving quota or creating a running message.
      const provider = createLlmProvider(this.env, db);
      const admit = await admitRunAtomic(db, policy, {
        env: this.env,
        axes: {
          tier: allowance.tier,
          telegramId: typeof allowance.tgId === "number" ? allowance.tgId : null,
          browserId: btCheck.browserId,
          ipAddress: clientIp || allowance.ip,
          fingerprint: allowance.fp,
        },
        clientRequestId,
        payloadHash,
        threadId: frame.threadId ?? null,
        retryAssistantMessageId,
        course,
        docId,
        questionText,
        quote,
      });

      if (admit.kind === "blocked") {
        logEvent("warn", "ws_admit_blocked", {
          browserId: maskId(btCheck.browserId),
          tier: allowance.tier,
          course,
          docId,
          block: admit.block,
        });
        safeSend({
          type: "error",
          code: admit.block.code,
          message: "Request blocked by quota or budget policy",
          block: admit.block,
          ...(admit.block.retryAfterSec ? { retryAfterSec: admit.block.retryAfterSec } : {}),
        });
        safeClose(4429, admit.block.code);
        return;
      }

      if (admit.kind === "conflict") {
        safeSend({ type: "error", code: "client_request_conflict", message: admit.message });
        safeClose(4409, "client_request_conflict");
        return;
      }

      if (admit.kind === "not_found") {
        safeSend({ type: "error", code: "thread_not_found", message: admit.message });
        safeClose(4404, "thread_not_found");
        return;
      }

      if (admit.kind === "duplicate") {
        loggedRunId = admit.runId;
        safeSend({
          type: "meta",
          replayed: true,
          contextLimited: admit.contextLimited,
          threadId: admit.threadId,
          threadTitle: admit.threadTitle,
          generatedTitle: admit.generatedTitle,
          userMessageId: admit.userMessageId,
          assistantMessageId: admit.assistantMessageId,
          runId: admit.runId,
          tier: allowance.tier,
          model: admit.model,
          degraded: { active: false },
        });
        safeSend({
          type: "done",
          replayed: true,
          contextLimited: admit.contextLimited,
          runId: admit.runId,
          status: admit.status,
          text: "",
          steps: [],
          degraded: { active: false },
          block: null,
        });
        safeClose(1000, "duplicate");
        return;
      }

      loggedRunId = admit.runId;

      safeSend({
        type: "meta",
        contextLimited: admit.contextLimited,
        threadId: admit.threadId,
        threadTitle: admit.threadTitle,
        generatedTitle: admit.generatedTitle,
        userMessageId: admit.userMessageId,
        assistantMessageId: admit.assistantMessageId,
        runId: admit.runId,
        tier: allowance.tier,
        model: admit.route.model,
        degraded: admit.degraded,
      });

      await executeAgentRun({
        env: this.env,
        db,
        provider,
        requestTitle: admit.requestTitle,
        generatedTitle: admit.generatedTitle,
        preparedContext: admit.preparedContext,
        contextLimited: admit.contextLimited,
        questionCreatedAt: admit.questionCreatedAt,
        policy,
        runId: admit.runId,
        threadId: admit.threadId,
        excludeMessageIds: [admit.userMessageId, admit.assistantMessageId],
        course,
        docId,
        tier: allowance.tier,
        bucket: admit.bucket,
        route: admit.route,
        initialReserveMicros: admit.reserveMicros,
        degraded: admit.degraded,
        questionText,
        quote,
        signal,
        isStoppedByUser,
        sendFrame: safeSend,
      });

      safeClose(1000, "done");
    } catch (err) {
      safeSend({
        type: "error",
        code: err instanceof ContextSizeError ? "context_too_large" : "internal_error",
        message: err instanceof ContextSizeError ? "Вопрос с цитатой слишком длинный. Сократи его и попробуй снова." : "Не удалось обработать запрос. Попробуй ещё раз.",
      });
      safeClose(1011, "internal_error");
    } finally {
      console.log(
        JSON.stringify({
          event: "chat_run_telemetry",
          runId: loggedRunId,
          ...db.telemetry.snapshot(),
        }),
      );
    }
  }
}
