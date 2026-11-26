import { policyQuestionLimit, resolveBrowserToken, verifyAllowanceToken } from "../auth";
import { normalizeIpAddress, sha256Hex } from "../crypto";
import { TrackedD1 } from "../db";
import { createLlmProvider } from "../llm/provider";
import { logEvent, maskId } from "../logger";
import { classifyError } from "../public-error";
import { admitRunAtomic, loadPolicy, type AdmitRunResult } from "../quotas";
import { MAX_CHAT_BODY_BYTES, readBoundedText } from "../request-json";
import type { ClientChatCommand, Env, ChatStreamFrame, ServicePolicy, Tier } from "../types";
import { parseClientFrame } from "./client-frame";
import { ContextSizeError } from "./history";
import { validateAssistantQuote, validateQuoteAgainstCourse } from "./tools";

class MessageValidationError extends Error {
  constructor(readonly response: Response) {
    super("Message validation failed");
  }
}

type Admitted = Extract<AdmitRunResult, { kind: "admitted" }>;
type Duplicate = Extract<AdmitRunResult, { kind: "duplicate" }>;
export interface AcceptedMessage {
  admit: Admitted;
  policy: ServicePolicy;
  tier: Tier;
}

export function messageError(status: number, code: string, message: string,
  extra: Partial<Pick<Extract<ChatStreamFrame, { type: "error" }>, "block" | "retryAfterSec">> = {}) {
  return Response.json({ type: "error", code, message, ...extra }, { status, headers: { "Cache-Control": "no-store" } });
}

function streamResponse(body: BodyInit) {
  return new Response(body, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}

export function metaFrame(admit: Admitted | Duplicate, tier: Tier): Extract<ChatStreamFrame, { type: "meta" }> {
  return {
    type: "meta", threadId: admit.threadId, runId: admit.runId, userMessageId: admit.userMessageId,
    assistantMessageId: admit.assistantMessageId, threadTitle: admit.threadTitle, generatedTitle: admit.generatedTitle,
    contextLimited: admit.contextLimited, tier, ...(admit.kind === "admitted"
      ? { model: admit.route.model, degraded: admit.degraded }
      : { replayed: true, model: admit.model, degraded: { active: false } }),
  };
}

function recoveryResponse(admit: Admitted | Duplicate, tier: Tier) {
  const frames: ChatStreamFrame[] = [
    { ...metaFrame(admit, tier), replayed: true },
    { type: "done", runId: admit.runId, status: admit.kind === "duplicate" ? admit.status : "running",
      text: "", steps: [], block: null, degraded: { active: false }, contextLimited: admit.contextLimited, replayed: true },
  ];
  return streamResponse(frames.map(frame => JSON.stringify(frame) + "\n").join(""));
}

export async function postMessage(env: Env, db: TrackedD1, request: Request): Promise<Response> {
  const body = await readBoundedText(request, MAX_CHAT_BODY_BYTES);
  if (!body) return messageError(413, "payload_too_large", "Сообщение превышает допустимый размер.");
  let frame: ClientChatCommand;
  try {
    frame = parseClientFrame(body.text);
  } catch (error) {
    return error instanceof SyntaxError
      ? messageError(400, "invalid_json", "Не удалось прочитать JSON сообщения.")
      : messageError(400, "invalid_frame", error instanceof Error ? error.message : "Не удалось прочитать сообщение.");
  }
  if (frame.type !== "send") return messageError(400, "invalid_frame", "Ожидается вопрос для чата.");
  const btCheck = await resolveBrowserToken(env.BROWSER_TOKEN_SECRET, frame.browserToken);
  if (btCheck.status === "missing") return messageError(401, "browser_token_required", "Подтверди доступ к чату.");
  const allowance = await verifyAllowanceToken(env, db, frame.allowanceToken, btCheck.browserId);
  if (!allowance) return messageError(401, "allowance_expired", "Пропуск в чат истёк. Попробуй ещё раз.");
  const policy = await loadPolicy(db);
  const clientIp = normalizeIpAddress(request.headers.get("CF-Connecting-IP") ?? request.headers.get("X-Forwarded-For"));
  const questionText = frame.text.trim();
  const course = frame.course.trim();
  const docId = frame.docId.trim();
  const clientRequestId = frame.clientRequestId.trim();
  const rawQuote = frame.quote ?? null;
  const retryAssistantMessageId = frame.retryAssistantMessageId?.trim() || null;
  const assistantQuote = !retryAssistantMessageId && rawQuote?.messageId !== undefined;
  if (assistantQuote && (rawQuote.blockId || rawQuote.sectionId)) {
    return messageError(400, "invalid_quote", "Фрагмент не найден в ответе этого диалога");
  }
  const quote = assistantQuote
    ? { messageId: rawQuote.messageId, label: "Ответ ассистента", tex: rawQuote.tex }
    : rawQuote;
  const payloadHash = await sha256Hex(JSON.stringify({
    threadId: frame.threadId ?? null, retryAssistantMessageId, course, docId, text: questionText,
    quote: quote ? { blockId: quote.blockId ?? null, messageId: quote.messageId ?? null, label: quote.label ?? null, tex: quote.tex } : null,
  }));
  let admit: AdmitRunResult;
  try {
    admit = await admitRunAtomic(db, policy, {
      env, axes: { tier: allowance.tier, telegramId: allowance.tgId ?? null,
        browserId: btCheck.browserId, ipAddress: clientIp || allowance.ip, fingerprint: allowance.fp },
      clientRequestId, payloadHash, threadId: frame.threadId ?? null, retryAssistantMessageId, course, docId, questionText, quote,
    }, async () => {
      if (body.bytes > policy.maxBodyBytes) {
        throw new MessageValidationError(messageError(413, "payload_too_large", "Сообщение превышает допустимый размер."));
      }
      const maxQuestionChars = allowance.maxQuestionChars ?? policyQuestionLimit(policy.maxQuestionChars);
      if (!retryAssistantMessageId && questionText.length > maxQuestionChars) {
        throw new MessageValidationError(messageError(400, "question_too_long",
          `Сократи вопрос до ${maxQuestionChars} символов.`));
      }
      if (!retryAssistantMessageId && rawQuote && rawQuote.tex.length > policy.maxQuoteChars) {
        throw new MessageValidationError(messageError(400, "invalid_quote", "Цитата слишком длинная."));
      }
      if (!retryAssistantMessageId && course) {
        const context = docId
          ? db.prepare("SELECT 1 FROM course_documents WHERE course = ? AND doc_id = ? LIMIT 1").bind(course, docId)
          : db.prepare("SELECT 1 FROM course_documents WHERE course = ? LIMIT 1").bind(course);
        if (!(await db.first(context))) {
          throw new MessageValidationError(messageError(400, "invalid_context",
            "Материал не найден. Обнови страницу и выбери материал снова."));
        }
      }
      if (!retryAssistantMessageId && rawQuote) {
        const valid = assistantQuote
          ? await validateAssistantQuote(db, frame.threadId ?? null, rawQuote, btCheck.browserId, allowance.tgId)
          : Boolean(docId) && await validateQuoteAgainstCourse(db, course, docId, rawQuote);
        if (!valid) throw new MessageValidationError(messageError(400, "invalid_quote", assistantQuote
          ? "Фрагмент не найден в ответе этого диалога" : "Фрагмент не найден в текущей версии материала. Обнови страницу и выдели цитату заново."));
      }
      createLlmProvider(env, db); // Validate route configuration before reserving quota.
    });
  } catch (error) {
    if (error instanceof MessageValidationError) return error.response;
    if (error instanceof ContextSizeError) {
      return messageError(400, "context_too_large", "Контекст вопроса слишком большой. Сократи вопрос или цитату и попробуй снова.");
    }
    throw error;
  }
  if (admit.kind === "blocked") {
    logEvent("warn", "chat_admit_blocked", { browserId: maskId(btCheck.browserId), block: admit.block, course, docId });
    const status = admit.block.code === "service_unavailable" || admit.block.code === "oauth_unavailable" ? 503 :
      admit.block.code === "auth_required" ? 403 : 429;
    return messageError(status, admit.block.code, "Запрос отклонён по ограничениям чата.", {
      block: admit.block, ...(admit.block.retryAfterSec ? { retryAfterSec: admit.block.retryAfterSec } : {}),
    });
  }
  if (admit.kind === "conflict") return messageError(409, "client_request_conflict", admit.message);
  if (admit.kind === "not_found") return messageError(404, "thread_not_found", admit.message);
  if (admit.kind === "duplicate") return recoveryResponse(admit, allowance.tier);

  try {
    const runner = env.CHAT_RUNNER.get(env.CHAT_RUNNER.idFromName(admit.runId));
    return streamResponse(await runner.startMessage({ admit, tier: allowance.tier, policy }));
  } catch (error) {
    // D1 has committed. The runner may already have started. Return the durable run ID so
    // the client polls the result or its deadline without resending and double-charging.
    logEvent("error", "chat_run_handoff_uncertain", { runId: admit.runId, code: classifyError(error).code });
    return recoveryResponse(admit, allowance.tier);
  }
}
