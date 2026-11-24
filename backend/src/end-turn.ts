import { shortenThreadTitle } from "./thread-title";
import type { CodexFunctionTool, EndTurnMetadata } from "./types";
export const MAX_END_TURN_ARGUMENTS_CHARS = 4096;
export class MetadataValidationError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
export function buildEndTurnTool(): CodexFunctionTool {
  return {
    type: "function",
    name: "end_turn",
    strict: true,
    description:
      "Заверши ход после текста ответа. Единственный вызов в завершающем ответе. title: первое название обязательно, далее null сохраняет название. suggestion: следующая реплика пользователя по ответу, обычным текстом без Markdown и TeX, до 160 символов; предпочти полезное продолжение, null только если его нет.",
    parameters: {
      type: "object",
      properties: {
        title: {
          type: ["string", "null"],
          description: "Короткое название, до 48 символов; null сохраняет прежнее.",
        },
        suggestion: {
          type: ["string", "null"],
          description:
            "Реплика пользователя без Markdown/TeX и переносов, до 160 символов, либо null.",
        },
      },
      required: ["title", "suggestion"],
      additionalProperties: false,
    },
  };
}
export function parseEndTurnArguments(raw: string, requireTitle: boolean): EndTurnMetadata {
  const invalid = (code: string): never => {
    throw new MetadataValidationError(code);
  };
  if (raw.length > MAX_END_TURN_ARGUMENTS_CHARS) invalid("metadata_too_large");
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return invalid("metadata_invalid_json");
  }
  if (!value || typeof value !== "object" || Array.isArray(value))
    invalid("metadata_invalid_shape");
  const v = value as Record<string, unknown>;
  if (Object.keys(v).length !== 2 || !Object.hasOwn(v, "title") || !Object.hasOwn(v, "suggestion"))
    invalid("metadata_invalid_shape");
  if (
    (v.title !== null && typeof v.title !== "string") ||
    (v.suggestion !== null && typeof v.suggestion !== "string")
  )
    invalid("metadata_invalid_type");
  let title = v.title as string | null;
  if (title !== null) {
    title = title.replace(/\s+/gu, " ").trim();
    if (!title) invalid("title_empty");
    title = shortenThreadTitle(title);
  }
  if (requireTitle && !title) invalid("first_title_required");
  let suggestion = v.suggestion as string | null;
  if (suggestion !== null) {
    if (/[\p{Cc}\p{Cf}]/u.test(suggestion)) invalid("suggestion_format_invalid");
    suggestion = suggestion.trim();
    if (!suggestion || Array.from(suggestion).length > 160) invalid("suggestion_invalid_length");
    if (
      /[`$]|\\(?:[a-zA-Z]+|[()[\]])|\[[^\]]+\]\([^)]*\)|(?:^|\s)(?:\*\*|__|\*\S[^*]*\*|_\S[^_]*_)|^(?:#{1,6}\s|[-*+]\s|\d+[.)]\s|>\s)/u.test(
        suggestion,
      )
    )
      invalid("suggestion_format_invalid");
  }
  return { title, suggestion };
}
