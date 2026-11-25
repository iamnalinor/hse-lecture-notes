import { shortenThreadTitle } from "./thread-title";
import type { CodexFunctionTool } from "../types";
export const MAX_METADATA_ARGUMENTS_CHARS = 4096;
export const MAX_SUGGESTION_CHARS = 80;
export const METADATA_TOOL_NAMES = new Set(["set_topic", "suggest_reply"]);
export function buildMetadataTools(): CodexFunctionTool[] {
  const tool = (name: string, field: string, description: string): CodexFunctionTool => ({
    type: "function",
    name,
    strict: true,
    description,
    parameters: {
      type: "object",
      properties: {
        [field]: { type: "string", maxLength: field === "title" ? 48 : MAX_SUGGESTION_CHARS },
      },
      required: [field],
      additionalProperties: false,
    },
  });
  return [
    tool(
      "set_topic",
      "title",
      "Установи короткую тему чата до ответа на первый вопрос. Далее вызывай только при существенной смене цели. До 48 символов, без разметки.",
    ),
    tool(
      "suggest_reply",
      "suggestion",
      "Когда ответ продуман, перед финальным текстом предложи короткую следующую реплику пользователя по смыслу ответа, написанную в его манере (регистр, пунктуация, ты/вы, сленг, язык): обычно 3–7 слов, до 80 символов, без Markdown/TeX. Не вызывай только если полезного продолжения действительно нет.",
    ),
  ];
}
function parseString(raw: string, field: string): string {
  if (raw.length > MAX_METADATA_ARGUMENTS_CHARS) throw Error("metadata_too_large");
  const v: unknown = JSON.parse(raw);
  if (
    !v ||
    typeof v !== "object" ||
    Array.isArray(v) ||
    Object.keys(v).length !== 1 ||
    typeof (v as Record<string, unknown>)[field] !== "string"
  )
    throw Error("metadata_invalid");
  const rawValue = (v as Record<string, string>)[field]!;
  const value = rawValue.trim();
  if (!value || /[\p{Cc}\p{Cf}]/u.test(rawValue)) throw Error("metadata_invalid");
  return value;
}
export function parseTopicArguments(raw: string): string {
  return shortenThreadTitle(parseString(raw, "title").replace(/\s+/gu, " "));
}
export function parseSuggestionArguments(raw: string): string {
  const value = parseString(raw, "suggestion");
  if (
    Array.from(value).length > MAX_SUGGESTION_CHARS ||
    /[`$]|\\(?:[a-zA-Z]+|[()[\]])|\[[^\]]+\]\([^)]*\)|(?:^|\s)(?:\*\*|__|\*\S[^*]*\*|_\S[^_]*_)|^(?:#{1,6}\s|[-*+]\s|\d+[.)]\s|>\s)/u.test(
      value,
    )
  )
    throw Error("suggestion_invalid");
  return value;
}
