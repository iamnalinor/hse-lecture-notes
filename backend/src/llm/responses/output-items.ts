import { MAX_METADATA_ARGUMENTS_CHARS } from "../../chat/metadata-tools";
import type { CodexInputItem, LlmRoundResult, RoundTokenUsage } from "../../types";

export type Raw = Record<string, unknown>;
export const object = (v: unknown): Raw | null =>
  v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : null;
export function extractUsage(response: Raw | null): RoundTokenUsage | null {
  const u = object(response?.usage),
    details = object(u?.input_tokens_details);
  if (!u) return null;
  const values = [
    u.input_tokens,
    details?.cached_tokens ?? 0,
    details?.cache_creation_input_tokens ?? details?.cache_write_tokens ?? 0,
    u.output_tokens,
  ];
  if (!values.every((n) => typeof n === "number" && Number.isSafeInteger(n) && n >= 0)) return null;
  const [inputTokens, cachedTokens, cacheWriteTokens, outputTokens] = values as number[];
  if (cachedTokens! + cacheWriteTokens! > inputTokens!) return null;
  return {
    inputTokens: inputTokens!,
    cachedTokens: cachedTokens!,
    cacheWriteTokens: cacheWriteTokens!,
    outputTokens: outputTokens!,
  };
}
interface ParsedOutput {
  outputItems: CodexInputItem[];
  functionCalls: LlmRoundResult["functionCalls"];
  violations: string[];
  text: string;
  refusal: string | undefined;
}

function readFunctionCall(item: Raw, out: ParsedOutput, ids: Set<string>): void {
  if (
    typeof item.call_id !== "string" ||
    !item.call_id ||
    ids.has(item.call_id) ||
    typeof item.name !== "string" ||
    !item.name ||
    typeof item.arguments !== "string"
  ) {
    out.violations.push("invalid_function_call");
    return;
  }
  ids.add(item.call_id);
  if (item.name === "set_topic" && item.arguments.length > MAX_METADATA_ARGUMENTS_CHARS)
    out.violations.push("metadata_too_large");
  const fc = {
    ...(typeof item.id === "string" ? { id: item.id } : {}),
    callId: item.call_id,
    name: item.name,
    arguments:
      item.name === "suggest_reply"
        ? item.arguments.slice(0, MAX_METADATA_ARGUMENTS_CHARS + 1)
        : item.arguments,
  };
  out.functionCalls.push(fc);
  out.outputItems.push({
    type: "function_call",
    ...(fc.id ? { id: fc.id } : {}),
    call_id: fc.callId,
    name: fc.name,
    arguments: fc.arguments,
  });
}

function readMessage(item: Raw, out: ParsedOutput, strict: boolean): void {
  if (strict && item.role !== "assistant") {
    out.violations.push("invalid_output_role");
    return;
  }
  const parts: Array<{ type: "output_text"; text: string }> = [];
  if (!Array.isArray(item.content)) {
    out.violations.push("invalid_message");
    return;
  }
  for (const value of item.content) {
    const part = object(value);
    if (part?.type === "refusal" && typeof part.refusal === "string") {
      out.refusal = part.refusal;
      continue;
    }
    if (part?.type !== "output_text" || typeof part.text !== "string") {
      out.violations.push("invalid_content");
      continue;
    }
    parts.push({ type: "output_text", text: part.text });
  }
  if (!parts.length) return;
  const messageText = parts.map((p) => p.text).join("");
  // A response carries exactly one answer: later message items (an echo of a
  // service call, a self-correction) are dropped from the text and from replay.
  if (messageText && out.text) return;
  out.text = messageText;
  out.outputItems.push({
    type: "message",
    role: "assistant",
    ...(typeof item.id === "string" ? { id: item.id } : {}),
    ...(typeof item.phase === "string" ? { phase: item.phase } : {}),
    content: parts,
  });
}

/** Validates the final output items of a response and extracts the answer text, calls and refusal. */
export function parseOutput(rawItems: Raw[], strict: boolean): ParsedOutput {
  const out: ParsedOutput = {
    outputItems: [],
    functionCalls: [],
    violations: [],
    text: "",
    refusal: undefined,
  };
  const ids = new Set<string>();
  for (const item of rawItems) {
    if (item.type === "reasoning") out.outputItems.push(item as CodexInputItem);
    else if (item.type === "function_call") readFunctionCall(item, out, ids);
    else if (item.type === "message") readMessage(item, out, strict);
    else out.violations.push("unknown_output_item");
  }
  return out;
}
