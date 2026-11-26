import { logEvent } from "../../logger";
import { computeRoundCostMicros, estimateUncertainRoundCostMicros } from "../../pricing";
import { checkpointRound, persistRunTopic } from "../../quotas";
import type { LlmRoundResult } from "../../types";
import { METADATA_TOOL_NAMES, parseTopicArguments } from "../metadata-tools";
import { appendToolJson, type RoundContext } from "./state";
import { handleAnswerRoundCalls, TOOL_NAMES, TURN_TOOLS } from "./tool-calls";

/** `continue`: run the next round; `stop`: the turn is over (the reason is in the turn state). */
export type RoundOutcome = "continue" | "stop";

/**
 * Sends one request to the model, streaming its text to the student. Returns the response and the
 * text this round added to the answer. The topic round's text is hidden.
 */
async function requestModelRound(
  c: RoundContext,
  topicStage: boolean,
  forced: boolean,
): Promise<{ result: LlmRoundResult; roundText: string }> {
  const { p, s } = c;
  const { route, policy } = p;
  let roundText = "";
  const appendText = (delta: string) => {
    if (topicStage || !delta) return;
    if (!roundText && s.text) {
      const separator = s.text.endsWith("\n\n") ? "" : s.text.endsWith("\n") ? "\n" : "\n\n";
      s.text += separator;
      if (separator) p.sendFrame({ type: "delta", text: separator });
    }
    roundText += delta;
    s.text += delta;
    p.sendFrame({ type: "delta", text: delta });
  };
  s.estimatedPromptChars = c.instructions.length + JSON.stringify(s.input).length;
  s.pendingRequest = true;
  s.roundStartChars = s.text.length;
  const result = await p.provider.runRound({
    model: route.model,
    effort: route.effort,
    instructions: c.instructions,
    input: s.input,
    tools: TURN_TOOLS,
    toolChoice: topicStage ? { type: "function", name: "set_topic" } : forced ? "none" : "auto",
    parallelToolCalls: true,
    hideText: topicStage,
    maxResponseChars: Math.max(0, policy.maxResponseChars - s.text.length),
    signal: c.signal,
    onUnconfirmedRetry: () => {
      s.uncertain = true;
      s.cost += estimateUncertainRoundCostMicros(route, s.estimatedPromptChars, 0);
    },
    onDelta: appendText,
  });
  s.pendingRequest = false;
  if (!roundText && result.text && !topicStage) appendText(result.text);
  s.rounds++;
  return { result, roundText };
}

/** Adds the round's tokens and cost to the turn; without usage the cost is estimated and uncertain. */
function recordRoundUsage(
  c: RoundContext,
  n: number,
  result: LlmRoundResult,
  roundText: string,
): void {
  const { p, s } = c;
  const { route } = p;
  if (result.usage) {
    s.cost += computeRoundCostMicros(route, result.usage);
    s.inputTokens += result.usage.inputTokens;
    s.cachedTokens += result.usage.cachedTokens;
    s.cacheWriteTokens += result.usage.cacheWriteTokens;
    s.outputTokens += result.usage.outputTokens;
  } else {
    s.uncertain = true;
    s.cost += estimateUncertainRoundCostMicros(
      route,
      s.estimatedPromptChars,
      JSON.stringify(result.outputItems).length + (result.observedOutputChars ?? roundText.length),
    );
  }
  logEvent(result.completed ? "info" : "warn", "llm_round", {
    runId: p.runId,
    provider: c.prepared.provenance.provider,
    round: n,
    model: route.model,
    effort: route.effort,
    responseId: result.responseId,
    completed: result.completed,
    status: result.status,
    usage: result.usage,
  });
}

/** The error code when the response cannot be used, else null. */
function responseError(c: RoundContext, result: LlmRoundResult, forced: boolean): string | null {
  if (!result.completed || result.truncated || result.refusal) return "upstream_incomplete";
  const calls = result.functionCalls;
  const badCalls = calls.some(
    (call) =>
      !call.callId ||
      c.s.seenCallIds.has(call.callId) ||
      (!TOOL_NAMES.has(call.name) && !METADATA_TOOL_NAMES.has(call.name)),
  );
  if (
    result.protocolViolations?.length ||
    badCalls ||
    new Set(calls.map((call) => call.callId)).size !== calls.length ||
    (forced && calls.length)
  ) {
    return "response_protocol_invalid";
  }
  return null;
}

/** The first round: the model must call `set_topic` and nothing else. */
async function handleTopicRound(
  c: RoundContext,
  calls: LlmRoundResult["functionCalls"],
): Promise<RoundOutcome> {
  const { p, s } = c;
  if (calls.length !== 1 || calls[0]!.name !== "set_topic") {
    s.errorCode = "topic_required";
    s.finalStatus = "error";
    return "stop";
  }
  try {
    const title = parseTopicArguments(calls[0]!.arguments);
    if (!(await persistRunTopic(p.db, p.runId, title))) return "stop";
    p.sendFrame({ type: "title", threadId: p.threadId, title });
    s.needsTopic = false;
    appendToolJson(s, calls[0]!.callId, {
      ok: true,
      instruction:
        "Тема сохранена. Теперь дай ответ пользователю. Текст служебного шага не был показан.",
    });
  } catch {
    s.errorCode = "topic_invalid";
    s.finalStatus = "error";
    return "stop";
  }
  return "continue";
}

/**
 * A round that answers: runs its tool calls. The round is the final answer when it has text and
 * no document tool calls; a round without any calls and without text is an empty answer.
 */
async function handleAnswerRound(
  c: RoundContext,
  calls: LlmRoundResult["functionCalls"],
  roundText: string,
): Promise<RoundOutcome> {
  const { s } = c;
  const externalCalls = calls.filter((call) => TOOL_NAMES.has(call.name));
  const answer = Boolean(roundText.trim()) && externalCalls.length === 0;
  await handleAnswerRoundCalls(c, calls, answer);
  if (answer && !c.signal.aborted) {
    s.finalStatus = "done";
    return "stop";
  }
  if (!calls.length) {
    s.errorCode = "upstream_empty_answer";
    return "stop";
  }
  return "continue";
}

/** Saves progress and tops up the reservation; the turn stops when the budget no longer allows another round. */
async function checkpoint(c: RoundContext): Promise<void> {
  const { p, s } = c;
  const cp = await checkpointRound(p.db, p.policy, {
    runId: p.runId,
    tier: p.tier,
    bucket: p.bucket,
    currentReservedMicros: s.reserve,
    cumulativeActualMicros: s.cost,
    inputTokens: s.inputTokens,
    cachedTokens: s.cachedTokens,
    cacheWriteTokens: s.cacheWriteTokens,
    outputTokens: s.outputTokens,
    toolRounds: s.rounds,
    toolCalls: s.toolCalls,
    nowMs: Date.now(),
  });
  s.reserve = cp.updatedReservedMicros;
  s.canContinue = cp.canContinueToolRounds;
}

export async function playRound(c: RoundContext, n: number): Promise<RoundOutcome> {
  const { p, s } = c;
  const topicStage = s.needsTopic;
  const forced =
    !topicStage &&
    (n === p.policy.maxToolRounds ||
      s.toolCalls >= p.policy.maxToolCalls ||
      c.runner.isOutputBudgetExhausted);

  const { result, roundText } = await requestModelRound(c, topicStage, forced);
  recordRoundUsage(c, n, result, roundText);

  const error = responseError(c, result, forced);
  if (error) {
    s.errorCode = error;
    return "stop";
  }
  const calls = result.functionCalls;
  for (const call of calls) s.seenCallIds.add(call.callId);
  // Text from the topic stage is hidden from the user, so it must not enter later requests or replay.
  const keptItems = topicStage
    ? result.outputItems.filter((item) => (item as { type?: string }).type !== "message")
    : result.outputItems;
  s.input.push(...keptItems);
  s.newItems.push(...keptItems);

  const outcome = topicStage
    ? await handleTopicRound(c, calls)
    : await handleAnswerRound(c, calls, roundText);
  if (outcome === "stop") return "stop";
  if (n === p.policy.maxToolRounds || c.signal.aborted) return "stop";
  await checkpoint(c);
  return "continue";
}
