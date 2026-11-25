import { METADATA_PROMPT, SYSTEM_PROMPT } from "./system-prompt";
import { classifyError } from "../public-error";
import {
  buildMetadataTools,
  METADATA_TOOL_NAMES,
  parseTopicArguments,
  parseSuggestionArguments,
} from "./metadata-tools";
import { prepareTurnContext, type PreparedTurnContext } from "./history";
import { CodexAuthError } from "../llm/codex-auth";
import { ProxyConnectError, ResponseEofError } from "../llm/socks5-fetch";
import { LlmUpstreamError } from "../llm/responses-stream";
import type { TrackedD1 } from "../db";
import { logEvent } from "../logger";
import { runErrorMessage } from "./run-error";
import {
  computeRoundCostMicros,
  estimateUncertainRoundCostMicros,
  type ModelRoute,
} from "../pricing";
import { checkpointRound, finalizeRunAtomic, persistRunTopic } from "../quotas";
import { AGENT_TOOLS, AgentToolRunner } from "./tools";
import type {
  ChatStep,
  CodexInputItem,
  DegradedInfo,
  TurnSuggestion,
  Env,
  LlmProvider,
  QuotaBucket,
  QuotePayload,
  RunStatus,
  ServerWsFrame,
  ServicePolicy,
  Tier,
} from "../types";

const TURN_TOOLS = [...AGENT_TOOLS, ...buildMetadataTools()];
const TOOL_NAMES = new Set(AGENT_TOOLS.map((t) => t.name));
export interface AgentLoopParams {
  env: Env;
  db: TrackedD1;
  provider: LlmProvider;
  policy: ServicePolicy;
  runId: string;
  threadId: string;
  requestTitle?: boolean;
  generatedTitle?: string | null;
  preparedContext?: PreparedTurnContext;
  contextLimited?: boolean;
  excludeMessageIds?: readonly string[];
  course: string;
  docId: string;
  tier: Tier;
  bucket: QuotaBucket;
  route: ModelRoute;
  initialReserveMicros: number;
  degraded: DegradedInfo;
  questionCreatedAt: number;
  questionText: string;
  quote: QuotePayload | null;
  signal: AbortSignal;
  isStoppedByUser: () => boolean;
  sendFrame: (frame: ServerWsFrame) => void;
}
function preview(raw: string, field: string): string {
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    return typeof value[field] === "string" ? value[field] : "";
  } catch {
    return "";
  }
}
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

export async function executeAgentRun(p: AgentLoopParams): Promise<void> {
  const { env, db, policy, runId, threadId, route, sendFrame, signal } = p;
  const steps: ChatStep[] = [],
    newItems: CodexInputItem[] = [];
  let text = "",
    cost = 0,
    inputTokens = 0,
    cachedTokens = 0,
    cacheWriteTokens = 0,
    outputTokens = 0,
    rounds = 0,
    toolCalls = 0,
    reserve = p.initialReserveMicros;
  let pendingRequest = false;
  let roundStartChars = 0;
  let uncertain = false,
    estimatedPromptChars = 0,
    metadata: TurnSuggestion | undefined,
    needsTopic = !p.generatedTitle,
    timedOut = false,
    canContinue = true;
  let finalStatus: Exclude<RunStatus, "running"> = "incomplete",
    errorCode: string | null = null;
  const abort = new AbortController();
  const timer = setTimeout(() => {
    timedOut = true;
    abort.abort("run_timeout");
  }, policy.maxRunDurationMs);
  const forwardAbort = () => abort.abort(signal.reason);
  if (signal.aborted) forwardAbort();
  else signal.addEventListener("abort", forwardAbort, { once: true });
  const seenIds = new Set<string>();
  let prepared: PreparedTurnContext | undefined = p.preparedContext;
  try {
    prepared ??= await prepareTurnContext(db, {
      threadId,
      course: p.course,
      docId: p.docId,
      questionText: p.questionText,
      quote: p.quote,
      createdAt: p.questionCreatedAt,
      generatedTitle: p.generatedTitle ?? null,
      route: {
        provider: env.LLM_PROVIDER?.trim().toLowerCase() === "openai" ? "openai" : "codex",
        model: route.model,
        effort: route.effort,
      },
      limits: policy,
    });
    const input = [...prepared.history.items];
    const instructions = SYSTEM_PROMPT + "\n\n" + METADATA_PROMPT;
    const runner = new AgentToolRunner({
      signal: abort.signal,
      env,
      db,
      currentCourse: p.course,
      currentDocId: p.docId,
      currentDocOrder: prepared.snapshot.currentDocOrder,
      maxToolOutputChars: policy.maxToolOutputChars,
      maxTotalToolOutputChars: policy.maxTotalToolOutputChars,
    });
    const appendToolOutput = (callId: string, rawOutput: string) => {
      const item: CodexInputItem = {
        type: "function_call_output",
        call_id: callId,
        output: rawOutput,
      };
      input.push(item);
      newItems.push(item);
    };
    const output = (callId: string, value: unknown) =>
      appendToolOutput(callId, JSON.stringify(value));
    for (let n = 1; n <= policy.maxToolRounds && !abort.signal.aborted && canContinue; n++) {
      const topicStage = needsTopic;
      const forced =
        !topicStage && (n === policy.maxToolRounds || toolCalls >= policy.maxToolCalls || runner.isOutputBudgetExhausted);
      let roundText = "";
      const appendText = (delta: string) => {
        if (topicStage || !delta) return;
        if (!roundText && text) {
          const separator = text.endsWith("\n\n") ? "" : text.endsWith("\n") ? "\n" : "\n\n";
          text += separator;
          if (separator) sendFrame({ type: "delta", text: separator });
        }
        roundText += delta;
        text += delta;
        sendFrame({ type: "delta", text: delta });
      };
      estimatedPromptChars = instructions.length + JSON.stringify(input).length;
      pendingRequest = true;
      roundStartChars = text.length;
      const result = await p.provider.runRound({
        model: route.model,
        effort: route.effort,
        instructions,
        input,
        tools: TURN_TOOLS,
        toolChoice: topicStage ? { type: "function", name: "set_topic" } : forced ? "none" : "auto",
        parallelToolCalls: true,
        hideText: topicStage,
        maxResponseChars: Math.max(0, policy.maxResponseChars - text.length),
        signal: abort.signal,
        onUnconfirmedRetry: () => {
          uncertain = true;
          cost += estimateUncertainRoundCostMicros(route, estimatedPromptChars, 0);
        },
        onDelta: appendText,
      });
      pendingRequest = false;
      if (!roundText && result.text && !topicStage) appendText(result.text);
      rounds++;
      if (result.usage) {
        cost += computeRoundCostMicros(route, result.usage);
        inputTokens += result.usage.inputTokens;
        cachedTokens += result.usage.cachedTokens;
        cacheWriteTokens += result.usage.cacheWriteTokens;
        outputTokens += result.usage.outputTokens;
      } else {
        uncertain = true;
        cost += estimateUncertainRoundCostMicros(
          route,
          estimatedPromptChars,
          JSON.stringify(result.outputItems).length +
            (result.observedOutputChars ?? roundText.length),
        );
      }
      logEvent(result.completed ? "info" : "warn", "llm_round", {
        runId,
        provider: prepared.provenance.provider,
        round: n,
        model: route.model,
        effort: route.effort,
        responseId: result.responseId,
        completed: result.completed,
        status: result.status,
        usage: result.usage,
      });
      if (!result.completed || result.truncated || result.refusal) {
        errorCode = "upstream_incomplete";
        break;
      }
      const calls = result.functionCalls;
      const badCalls = calls.some(
        (c) =>
          !c.callId ||
          seenIds.has(c.callId) ||
          (!TOOL_NAMES.has(c.name) && !METADATA_TOOL_NAMES.has(c.name)),
      );
      if (
        result.protocolViolations?.length ||
        badCalls ||
        new Set(calls.map((c) => c.callId)).size !== calls.length ||
        (forced && calls.length)
      ) {
        errorCode = "response_protocol_invalid";
        break;
      }
      for (const c of calls) seenIds.add(c.callId);
      input.push(...result.outputItems);
      newItems.push(...result.outputItems);
      if (topicStage) {
        if (calls.length !== 1 || calls[0]!.name !== "set_topic") {
          errorCode = "topic_required";
          finalStatus = "error";
          break;
        }
        try {
          const title = parseTopicArguments(calls[0]!.arguments);
          if (!(await persistRunTopic(db, runId, title))) break;
          sendFrame({ type: "title", threadId, title });
          needsTopic = false;
          output(calls[0]!.callId, {
            ok: true,
            instruction:
              "Тема сохранена. Теперь дай ответ пользователю. Текст служебного шага не был показан.",
          });
        } catch {
          errorCode = "topic_invalid";
          finalStatus = "error";
          break;
        }
      } else {
        const externalCalls = calls.filter((c) => TOOL_NAMES.has(c.name));
        const answer = Boolean(roundText.trim()) && externalCalls.length === 0;
        // A proposal made before subsequent research may no longer fit the answer.
        if (externalCalls.length) metadata = undefined;
        const usedMetadata = new Set<string>();
        for (const call of calls) {
          if (abort.signal.aborted) break;
          if (METADATA_TOOL_NAMES.has(call.name)) {
            if (usedMetadata.has(call.name)) {
              output(call.callId, { error: "duplicate_metadata" });
              continue;
            }
            usedMetadata.add(call.name);
            try {
              if (call.name === "set_topic") {
                const title = parseTopicArguments(call.arguments);
                if (await persistRunTopic(db, runId, title))
                  sendFrame({ type: "title", threadId, title });
              } else {
                if (externalCalls.length) {
                  output(call.callId, { error: "answer_not_available" });
                  continue;
                }
                // Responses may emit a function call before the final text. Keep it
                // pending; only a successfully completed answer can publish it.
                metadata = { suggestion: parseSuggestionArguments(call.arguments) };
              }
              output(call.callId, {
                ok: true,
                ...(call.name === "suggest_reply" && !answer
                  ? { instruction: "Предложение сохранено. Теперь ответь пользователю; повторять служебный вызов не нужно." }
                  : {}),
              });
            } catch {
              output(call.callId, { error: "metadata_invalid" });
            }
            continue;
          }
          if (toolCalls >= policy.maxToolCalls) {
            output(call.callId, {
              error: "tool_call_limit",
              instruction: "Ответь по уже найденным материалам.",
            });
            continue;
          }
          toolCalls++;
          const step: ChatStep =
            call.name === "search_materials"
              ? { kind: "search", q: preview(call.arguments, "query"), state: "running" }
              : {
                  kind: "read",
                  target:
                    preview(call.arguments, "id") ||
                    preview(call.arguments, "doc_id") ||
                    preview(call.arguments, "prep_id") ||
                    preview(call.arguments, "course"),
                  state: "running",
                };
          const index = steps.push(step) - 1;
          sendFrame({ type: "step", steps: [...steps] });
          const value = await waitForTool(abort.signal, () => runner.execute(call.name, call.arguments));
          if (value.step.kind === "note") steps.splice(index, 1);
          else steps[index] = value.step;
          sendFrame({ type: "step", steps: [...steps] });
          appendToolOutput(call.callId, value.output || JSON.stringify({
            error: "tool_output_limit",
            instruction: "Доступный объем материалов исчерпан. Ответь по уже найденному, не вызывай инструменты и не упоминай служебные лимиты. Если данных не хватает, прямо обозначь, что проверить не удалось.",
          }));
        }
        if (answer && !abort.signal.aborted) {
          finalStatus = "done";
          break;
        }
        if (!calls.length) {
          errorCode = "upstream_empty_answer";
          break;
        }
      }
      if (n === policy.maxToolRounds || abort.signal.aborted) break;
      const cp = await checkpointRound(db, policy, {
        runId,
        tier: p.tier,
        bucket: p.bucket,
        currentReservedMicros: reserve,
        cumulativeActualMicros: cost,
        inputTokens,
        cachedTokens,
        cacheWriteTokens,
        outputTokens,
        toolRounds: rounds,
        toolCalls,
        nowMs: Date.now(),
      });
      reserve = cp.updatedReservedMicros;
      canContinue = cp.canContinueToolRounds;
    }
  } catch (error) {
    const proxy = error instanceof ProxyConnectError;
    const unknownRequest =
      pendingRequest &&
      !proxy &&
      !(error instanceof CodexAuthError) &&
      !(error instanceof LlmUpstreamError && error.status < 500);
    uncertain ||= unknownRequest;
    if (unknownRequest)
      cost += estimateUncertainRoundCostMicros(
        route,
        estimatedPromptChars,
        text.length - roundStartChars,
      );
    errorCode =
      error instanceof CodexAuthError
        ? "oauth_unavailable"
        : error instanceof LlmUpstreamError
          ? "upstream_error"
          : error instanceof ResponseEofError
            ? "upstream_eof"
            : classifyError(error).code;
    if (!abort.signal.aborted) logEvent("error", "agent_run_exception", {
      runId,
      code: errorCode,
      upstreamStatus: error instanceof LlmUpstreamError ? error.status : undefined,
      detail: classifyError(error).detail,
    });
    finalStatus = text.trim() ? "incomplete" : "error";
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", forwardAbort);
  }
  if (p.isStoppedByUser()) {
    finalStatus = "stopped";
    metadata = undefined;
    errorCode = "user_stopped";
  } else if (timedOut || signal.aborted) {
    finalStatus = "incomplete";
    metadata = undefined;
    errorCode = timedOut ? "run_timeout" : "upstream_incomplete";
  }
  if (abort.signal.aborted) {
    for (const step of steps) if (step.state === "running") step.state = "error";
  }
  if (finalStatus !== "done") metadata = undefined;
  const errorMessage =
    finalStatus === "done" || finalStatus === "stopped"
      ? null
      : runErrorMessage(errorCode, Boolean(text.trim()));
  const won = await finalizeRunAtomic(db, {
    runId,
    finalStatus,
    messageStatus: finalStatus,
    contentTex: text,
    stepsJson: JSON.stringify(steps),
    agentItemsJson: JSON.stringify({
      version: 1,
      complete: finalStatus === "done",
      provenance: prepared?.provenance ?? null,
      items: newItems,
    }),
    metadata,
    errorCode,
    errorMessage,
    actualCostMicros: cost,
    isCostUncertain: uncertain,
    uncertaintyEstimated: true,
    estimatedPromptChars,
    streamedOutputChars: text.length,
    inputTokens,
    cachedTokens,
    cacheWriteTokens,
    outputTokens,
    toolRounds: rounds,
    toolCalls,
  });
  if (!won) {
    sendFrame({ type: "error", code: "run_expired", message: "Ответ уже завершен. Обнови историю беседы." });
    return;
  }
  sendFrame({
    type: "done",
    runId,
    status: finalStatus,
    errorMessage,
    text,
    steps,
    degraded: p.degraded,
    block: null,
    suggestion: metadata?.suggestion ?? null,
    contextLimited: p.contextLimited ?? false,
  });
}
