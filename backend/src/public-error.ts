import { LlmUpstreamError } from "./llm/responses-stream";

/** What a client may see about a failure: a stable code, a Russian explanation and a short safe detail. */
export type PublicError = {
  readonly status: number;
  readonly code: string;
  readonly message: string;
  readonly detail?: string;
};

export const PUBLIC_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  storage_quota_exceeded:
    "Хранилище чата исчерпало дневной лимит Cloudflare D1. Он сбрасывается в 03:00 по Москве.",
  storage_unavailable: "Хранилище чата временно недоступно.",
  search_unavailable: "Поиск по материалам временно недоступен.",
  upstream_error: "Сервис модели вернул ошибку.",
  internal_error: "Внутренняя ошибка сервера.",
};

const text = (err: unknown): string => (err instanceof Error ? err.message : String(err));
/** Cloudflare's own storage messages hold no user data; cut them short all the same. */
const short = (s: string): string => s.replace(/\s+/gu, " ").trim().slice(0, 200);

/**
Maps an exception to a public error. Platform failures (D1 limits, Vectorize, the model's HTTP status)
are named with their own detail; anything unknown stays a generic 500 with only the exception's type.
*/
export function classifyError(err: unknown): PublicError {
  const message = text(err);
  if (/exceeded D1'?s? .*limit|daily row (read|write) limit/iu.test(message)) {
    return {
      status: 503,
      code: "storage_quota_exceeded",
      message: PUBLIC_ERROR_MESSAGES.storage_quota_exceeded!,
      detail: short(message),
    };
  }
  if (/\bD1_[A-Z_]+|D1 DB/u.test(message)) {
    return {
      status: 503,
      code: "storage_unavailable",
      message: PUBLIC_ERROR_MESSAGES.storage_unavailable!,
      detail: short(message),
    };
  }
  if (
    /VECTOR_|vectorize|InferenceUpstreamError|AiError/iu.test(message) ||
    (err instanceof Error && /Ai|Vector/u.test(err.name))
  ) {
    return {
      status: 503,
      code: "search_unavailable",
      message: PUBLIC_ERROR_MESSAGES.search_unavailable!,
      detail: short(message),
    };
  }
  if (err instanceof LlmUpstreamError) {
    return {
      status: 502,
      code: "upstream_error",
      message: PUBLIC_ERROR_MESSAGES.upstream_error!,
      detail: `HTTP ${err.status} ${err.code}`.trim(),
    };
  }
  return {
    status: 500,
    code: "internal_error",
    message: PUBLIC_ERROR_MESSAGES.internal_error!,
    detail: err instanceof Error ? err.name : typeof err,
  };
}
