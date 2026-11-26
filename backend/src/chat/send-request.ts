import { resolveBrowserToken, verifyAllowanceToken } from "../auth";
import { normalizeIpAddress, sha256Hex } from "../crypto";
import type { TrackedD1 } from "../db";
import { loadPolicy } from "../quotas";
import { MAX_CHAT_BODY_BYTES, readBoundedText } from "../request-json";
import type {
  AllowanceJwtPayload,
  ClientChatCommand,
  Env,
  QuotePayload,
  ServicePolicy,
} from "../types";
import { parseClientFrame } from "./client-frame";
import { messageError } from "./message-error";

/** A `send` command that has been read, authenticated and normalized, ready to be admitted. */
export interface SendRequest {
  frame: Extract<ClientChatCommand, { type: "send" }>;
  bodyBytes: number;
  browserId: string;
  allowance: AllowanceJwtPayload;
  policy: ServicePolicy;
  clientIp: string;
  questionText: string;
  course: string;
  docId: string;
  clientRequestId: string;
  /** The quote as the client sent it, validated later against the source it names. */
  rawQuote: QuotePayload | null;
  retryAssistantMessageId: string | null;
  /** The quote points at an earlier assistant message instead of course material. */
  assistantQuote: boolean;
  /** The quote as stored with the question. */
  quote: QuotePayload | null;
  payloadHash: string;
}

type Parsed<T> = { value: T } | { response: Response };

async function readSendCommand(
  request: Request,
): Promise<Parsed<{ frame: SendRequest["frame"]; bodyBytes: number }>> {
  const body = await readBoundedText(request, MAX_CHAT_BODY_BYTES);
  if (!body) {
    return {
      response: messageError(413, "payload_too_large", "Сообщение превышает допустимый размер."),
    };
  }
  let frame: ClientChatCommand;
  try {
    frame = parseClientFrame(body.text);
  } catch (error) {
    return {
      response:
        error instanceof SyntaxError
          ? messageError(400, "invalid_json", "Не удалось прочитать JSON сообщения.")
          : messageError(
              400,
              "invalid_frame",
              error instanceof Error ? error.message : "Не удалось прочитать сообщение.",
            ),
    };
  }
  if (frame.type !== "send") {
    return { response: messageError(400, "invalid_frame", "Ожидается вопрос для чата.") };
  }
  return { value: { frame, bodyBytes: body.bytes } };
}

/** Everything that decides the idempotency of a request: the same id with another payload is a conflict. */
function hashPayload(
  frame: SendRequest["frame"],
  parts: {
    retryAssistantMessageId: string | null;
    course: string;
    docId: string;
    questionText: string;
    quote: QuotePayload | null;
  },
): Promise<string> {
  const { quote } = parts;
  return sha256Hex(
    JSON.stringify({
      threadId: frame.threadId ?? null,
      retryAssistantMessageId: parts.retryAssistantMessageId,
      course: parts.course,
      docId: parts.docId,
      text: parts.questionText,
      quote: quote
        ? {
            blockId: quote.blockId ?? null,
            messageId: quote.messageId ?? null,
            label: quote.label ?? null,
            tex: quote.tex,
          }
        : null,
    }),
  );
}

export async function readSendRequest(
  env: Env,
  db: TrackedD1,
  request: Request,
): Promise<Parsed<SendRequest>> {
  const command = await readSendCommand(request);
  if ("response" in command) return command;
  const { frame, bodyBytes } = command.value;

  const btCheck = await resolveBrowserToken(env.BROWSER_TOKEN_SECRET, frame.browserToken);
  if (btCheck.status === "missing")
    return { response: messageError(401, "browser_token_required", "Подтверди доступ к чату.") };
  const allowance = await verifyAllowanceToken(env, db, frame.allowanceToken, btCheck.browserId);
  if (!allowance)
    return {
      response: messageError(401, "allowance_expired", "Пропуск в чат истек. Попробуй еще раз."),
    };
  const policy = await loadPolicy(db);
  const clientIp = normalizeIpAddress(
    request.headers.get("CF-Connecting-IP") ?? request.headers.get("X-Forwarded-For"),
  );
  const questionText = frame.text.trim();
  const course = frame.course.trim();
  const docId = frame.docId.trim();
  const clientRequestId = frame.clientRequestId.trim();
  const rawQuote = frame.quote ?? null;
  const retryAssistantMessageId = frame.retryAssistantMessageId?.trim() || null;
  const assistantQuote = !retryAssistantMessageId && rawQuote?.messageId !== undefined;
  if (assistantQuote && (rawQuote.blockId || rawQuote.sectionId)) {
    return {
      response: messageError(400, "invalid_quote", "Фрагмент не найден в ответе этого диалога"),
    };
  }
  const quote = assistantQuote
    ? { messageId: rawQuote.messageId, label: "Ответ ассистента", tex: rawQuote.tex }
    : rawQuote;
  const payloadHash = await hashPayload(frame, {
    retryAssistantMessageId,
    course,
    docId,
    questionText,
    quote,
  });
  return {
    value: {
      frame,
      bodyBytes,
      browserId: btCheck.browserId,
      allowance,
      policy,
      clientIp,
      questionText,
      course,
      docId,
      clientRequestId,
      rawQuote,
      retryAssistantMessageId,
      assistantQuote,
      quote,
      payloadHash,
    },
  };
}
