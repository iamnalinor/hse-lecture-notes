import { policyQuestionLimit } from "../auth";
import { courseContextExists } from "../course-repo";
import type { TrackedD1 } from "../db";
import { createLlmProvider } from "../llm/provider";
import type { Env } from "../types";
import { MessageValidationError, messageError } from "./message-error";
import { validateAssistantQuote, validateQuoteAgainstCourse } from "./quote-validation";
import type { SendRequest } from "./send-request";

/**
 * Checks a request that has not been admitted yet (an existing request survives later changes to
 * the source and policy): size limits, the course context, the quote, and the route configuration.
 * Throws `MessageValidationError` carrying the response to send. A retry re-asks the stored question,
 * so only the route is checked for it.
 */
export async function validateNewSend(env: Env, db: TrackedD1, r: SendRequest): Promise<void> {
  const { policy, retryAssistantMessageId } = r;
  if (r.bodyBytes > policy.maxBodyBytes) {
    throw new MessageValidationError(
      messageError(413, "payload_too_large", "Сообщение превышает допустимый размер."),
    );
  }
  const maxQuestionChars =
    r.allowance.maxQuestionChars ?? policyQuestionLimit(policy.maxQuestionChars);
  if (!retryAssistantMessageId && r.questionText.length > maxQuestionChars) {
    throw new MessageValidationError(
      messageError(400, "question_too_long", `Сократи вопрос до ${maxQuestionChars} символов.`),
    );
  }
  if (!retryAssistantMessageId && r.rawQuote && r.rawQuote.tex.length > policy.maxQuoteChars) {
    throw new MessageValidationError(messageError(400, "invalid_quote", "Цитата слишком длинная."));
  }
  if (!retryAssistantMessageId && r.course) {
    if (!(await courseContextExists(db, r.course, r.docId))) {
      throw new MessageValidationError(
        messageError(
          400,
          "invalid_context",
          "Материал не найден. Обнови страницу и выбери материал снова.",
        ),
      );
    }
  }
  if (!retryAssistantMessageId && r.rawQuote) {
    const valid = r.assistantQuote
      ? await validateAssistantQuote(
          db,
          r.frame.threadId ?? null,
          r.rawQuote,
          r.browserId,
          r.allowance.tgId,
        )
      : Boolean(r.docId) && (await validateQuoteAgainstCourse(db, r.course, r.docId, r.rawQuote));
    if (!valid)
      throw new MessageValidationError(
        messageError(
          400,
          "invalid_quote",
          r.assistantQuote
            ? "Фрагмент не найден в ответе этого диалога"
            : "Фрагмент не найден в текущей версии материала. Обнови страницу и выдели цитату заново.",
        ),
      );
  }
  createLlmProvider(env, db); // Validate route configuration before reserving quota.
}
