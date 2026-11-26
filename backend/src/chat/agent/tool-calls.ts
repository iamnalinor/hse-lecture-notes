import type { ChatStep } from "../../types";
import {
  buildMetadataTools,
  METADATA_TOOL_NAMES,
  parseSuggestionArguments,
  parseTopicArguments,
} from "../metadata-tools";
import { persistRunTopic } from "../../quotas";
import { AGENT_TOOLS } from "../tools";
import { appendToolJson, appendToolOutput, type RoundContext, type ToolCall } from "./state";

export const TOOL_NAMES = new Set(AGENT_TOOLS.map((t) => t.name));

/** Every tool offered to the model in a turn: document tools and the metadata tools. */
export const TURN_TOOLS = [...AGENT_TOOLS, ...buildMetadataTools()];

const EARLY_SUGGESTION_ERROR = {
  error: "suggest_with_answer",
  instruction:
    "Подсказка не сохранена: suggest_reply принимается только вместе с финальным текстом ответа. Закончи работу, затем в одном ответе напиши текст пользователю и вызови suggest_reply. Текст подсказки в ответ не пиши.",
};

const TOOL_OUTPUT_LIMIT_ERROR = {
  error: "tool_output_limit",
  instruction:
    "Доступный объем материалов исчерпан. Ответь по уже найденному, не вызывай инструменты и не упоминай служебные лимиты. Если данных не хватает, прямо обозначь, что проверить не удалось.",
};

function preview(raw: string, field: string): string {
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    return typeof value[field] === "string" ? value[field] : "";
  } catch {
    return "";
  }
}

/** Resolves with the tool's result, or rejects as soon as the run is aborted. */
async function waitForTool<T>(signal: AbortSignal, execute: () => Promise<T>): Promise<T> {
  signal.throwIfAborted();
  let onAbort!: () => void;
  const cancelled = new Promise<never>((_, reject) => {
    onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
  });
  try {
    return await Promise.race([execute(), cancelled]);
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}

/** The step shown to the student while the tool runs. */
function runningStep(call: ToolCall): ChatStep {
  if (call.name === "search_materials") {
    return { kind: "search", q: preview(call.arguments, "query"), state: "running" };
  }
  if (call.name === "sample_problems") {
    return { kind: "sample", target: "генератор вариантов", state: "running" };
  }
  return {
    kind: "read",
    target:
      preview(call.arguments, "id") ||
      preview(call.arguments, "doc_id") ||
      preview(call.arguments, "prep_id") ||
      preview(call.arguments, "course"),
    state: "running",
  };
}

/**
 * `set_topic` or `suggest_reply` in an answer round. The suggestion belongs to the last response of
 * the turn: it is accepted only together with the answer text, never from an earlier round.
 */
async function handleMetadataCall(c: RoundContext, call: ToolCall, answer: boolean): Promise<void> {
  const { p, s } = c;
  try {
    if (call.name === "set_topic") {
      const title = parseTopicArguments(call.arguments);
      if (await persistRunTopic(p.db, p.runId, title)) {
        p.sendFrame({ type: "title", threadId: p.threadId, title });
      }
    } else {
      if (!answer) {
        appendToolJson(s, call.callId, EARLY_SUGGESTION_ERROR);
        return;
      }
      s.metadata = { suggestion: parseSuggestionArguments(call.arguments) };
    }
    appendToolJson(s, call.callId, { ok: true });
  } catch {
    appendToolJson(s, call.callId, { error: "metadata_invalid" });
  }
}

async function runExternalCall(c: RoundContext, call: ToolCall): Promise<void> {
  const { p, s } = c;
  s.toolCalls++;
  const index = s.steps.push(runningStep(call)) - 1;
  p.sendFrame({ type: "step", steps: [...s.steps] });
  const value = await waitForTool(c.signal, () => c.runner.execute(call.name, call.arguments));
  if (value.step.kind === "note") s.steps.splice(index, 1);
  else s.steps[index] = value.step;
  p.sendFrame({ type: "step", steps: [...s.steps] });
  appendToolOutput(s, call.callId, value.output || JSON.stringify(TOOL_OUTPUT_LIMIT_ERROR));
}

/**
 * Executes the calls of an answer round in order. Metadata tools are accepted once each;
 * document tools stop at the per-turn call limit.
 */
export async function handleAnswerRoundCalls(
  c: RoundContext,
  calls: ToolCall[],
  answer: boolean,
): Promise<void> {
  const { p, s } = c;
  const usedMetadata = new Set<string>();
  for (const call of calls) {
    if (c.signal.aborted) break;
    if (METADATA_TOOL_NAMES.has(call.name)) {
      if (usedMetadata.has(call.name)) {
        appendToolJson(s, call.callId, { error: "duplicate_metadata" });
        continue;
      }
      usedMetadata.add(call.name);
      await handleMetadataCall(c, call, answer);
      continue;
    }
    if (s.toolCalls >= p.policy.maxToolCalls) {
      appendToolJson(s, call.callId, {
        error: "tool_call_limit",
        instruction: "Ответь по уже найденным материалам.",
      });
      continue;
    }
    await runExternalCall(c, call);
  }
}
