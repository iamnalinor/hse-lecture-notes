import { END_TURN_PROMPT, SYSTEM_PROMPT } from "./system-prompt";
import { buildEndTurnTool, MetadataValidationError, parseEndTurnArguments } from "./end-turn";
import { prepareTurnContext, type PreparedTurnContext } from "./chat-history";
import { CodexAuthError } from "./codex-auth";
import { ProxyConnectError, ResponseEofError } from "./socks5-fetch";
import { LlmUpstreamError } from "./responses-stream";
import type { TrackedD1 } from "./db";
import { logEvent } from "./logger";
import {
  computeRoundCostMicros,
  estimateUncertainRoundCostMicros,
  type ModelRoute,
} from "./pricing";
import { checkpointRound, finalizeRunAtomic } from "./quotas";
import { AGENT_TOOLS, AgentToolRunner } from "./tools";
import type {
  ChatStep,
  CodexInputItem,
  DegradedInfo,
  EndTurnMetadata,
  Env,
  LlmProvider,
  QuotaBucket,
  QuotePayload,
  RunStatus,
  ServerWsFrame,
  ServicePolicy,
  Tier,
} from "./types";

const TURN_TOOLS = [...AGENT_TOOLS, buildEndTurnTool()];
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
    metadata: EndTurnMetadata | undefined,
    hasAnswer = false,
    repairs = 0,
    metadataOnly = false,
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
    const instructions = SYSTEM_PROMPT + "\n\n" + END_TURN_PROMPT;
    const runner = new AgentToolRunner({
      env,
      db,
      currentCourse: p.course,
      currentDocId: p.docId,
      currentDocOrder: prepared.snapshot.currentDocOrder,
      maxToolOutputChars: policy.maxToolOutputChars,
      maxTotalToolOutputChars: policy.maxTotalToolOutputChars,
    });
    const output = (callId: string, value: unknown) => {
      const item: CodexInputItem = {
        type: "function_call_output",
        call_id: callId,
        output: JSON.stringify(value),
      };
      input.push(item);
      newItems.push(item);
    };
    for (let n = 1; n <= policy.maxToolRounds && !abort.signal.aborted && canContinue; n++) {
      const forced = n === policy.maxToolRounds || metadataOnly || toolCalls >= policy.maxToolCalls;
      let roundText = "";
      estimatedPromptChars = instructions.length + JSON.stringify(input).length;
      pendingRequest = true;
      roundStartChars = text.length;
      const result = await p.provider.runRound({
        model: route.model,
        effort: route.effort,
        instructions,
        input,
        tools: TURN_TOOLS,
        toolChoice: forced ? { type: "function", name: "end_turn" } : "required",
        parallelToolCalls: true,
        metadataOnly,
        maxResponseChars: Math.max(0, policy.maxResponseChars - text.length),
        signal: abort.signal,
        onUnconfirmedRetry: () => {
          uncertain = true;
          cost += estimateUncertainRoundCostMicros(route, estimatedPromptChars, 0);
        },
        onDelta: (delta) => {
          if (!metadataOnly && delta) {
            roundText += delta;
            text += delta;
            sendFrame({ type: "delta", text: delta });
          }
        },
      });
      pendingRequest = false;
      if (!roundText && result.text && !metadataOnly) {
        roundText = result.text;
        text += result.text;
        sendFrame({ type: "delta", text: result.text });
      }
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
          JSON.stringify(result.outputItems).length + roundText.length,
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
      const ends = calls.filter((c) => c.name === "end_turn");
      const badCalls = calls.some(
        (c) =>
          !c.callId || seenIds.has(c.callId) || (!TOOL_NAMES.has(c.name) && c.name !== "end_turn"),
      );
      const repeated = new Set(calls.map((c) => c.callId)).size !== calls.length;
      const endIndex = result.outputItems.findIndex(
        (i) => i.type === "function_call" && i.name === "end_turn",
      );
      const textAfterEnd =
        endIndex >= 0 &&
        result.outputItems
          .slice(endIndex + 1)
          .some((i) => i.type === "message" && i.content.some((c) => c.text.trim()));
      if (
        result.protocolViolations?.length ||
        badCalls ||
        repeated ||
        ends.length > 1 ||
        (ends.length && calls.length !== 1) ||
        textAfterEnd ||
        (metadataOnly && result.text.trim())
      ) {
        errorCode = "response_protocol_invalid";
        break;
      }
      for (const c of calls) seenIds.add(c.callId);
      input.push(...result.outputItems);
      newItems.push(...result.outputItems);
      // Responses may label visible text before a tool as commentary, including
      // the actual answer before end_turn. Search/read preambles still do not count.
      if (roundText.trim() && !calls.some((c) => c.name !== "end_turn")) hasAnswer = true;
      if (ends.length === 1) {
        const end = ends[0]!;
        let repairCode: string | undefined;
        if (!hasAnswer) repairCode = "answer_required";
        else
          try {
            metadata = parseEndTurnArguments(end.arguments, !p.generatedTitle);
          } catch (e) {
            repairCode = e instanceof MetadataValidationError ? e.code : "metadata_invalid";
          }
        if (!repairCode) {
          output(end.callId, { ok: true });
          finalStatus = "done";
          break;
        }
        output(end.callId, {
          error: repairCode,
          instruction:
            repairCode === "answer_required"
              ? "Сначала напиши ответ, затем новый end_turn с метаданными по нему."
              : "Исправь метаданные через end_turn без повторения уже данного ответа.",
        });
        if (repairs++ >= 1) {
          errorCode = "completion_unavailable";
          break;
        }
        metadataOnly = hasAnswer;
      } else if (calls.length === 0) {
        if (!hasAnswer || repairs++ >= 1) {
          errorCode = "completion_unavailable";
          break;
        }
        metadataOnly = true;
        input.push({
          type: "message",
          role: "developer",
          content: [
            {
              type: "input_text",
              text: "Ответ уже дан. Заверши его только вызовом end_turn, без нового текста ответа.",
            },
          ],
        });
        // The repair instruction is part of the actual exchange replay.
        newItems.push(input.at(-1)!);
      } else {
        hasAnswer = false;
        if (forced) {
          errorCode = "response_protocol_invalid";
          break;
        }
        for (const call of calls) {
          if (abort.signal.aborted) break;
          if (toolCalls >= policy.maxToolCalls) {
            output(call.callId, {
              error: "tool_call_limit",
              instruction: "Заверши ответ через end_turn по уже найденным материалам.",
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
                    preview(call.arguments, "course"),
                  state: "running",
                };
          const index = steps.push(step) - 1;
          sendFrame({ type: "step", steps: [...steps] });
          const value = await runner.execute(call.name, call.arguments);
          steps[index] = value.step;
          sendFrame({ type: "step", steps: [...steps] });
          output(call.callId, JSON.parse(value.output));
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
            : "internal_error";
    logEvent("error", "agent_run_exception", {
      runId,
      code: errorCode,
      upstreamStatus: error instanceof LlmUpstreamError ? error.status : undefined,
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
  if (finalStatus !== "done") metadata = undefined;
  const errorMessage =
    finalStatus === "done" || finalStatus === "stopped"
      ? null
      : finalStatus === "error"
        ? "Не удалось получить ответ. Попробуй ещё раз."
        : "Ответ не завершён. Полученный текст сохранён.";
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
  if (!won) return;
  if (metadata?.title) sendFrame({ type: "title", threadId, title: metadata.title });
  sendFrame({
    type: "done",
    runId,
    status: finalStatus,
    text,
    steps,
    degraded: p.degraded,
    block: null,
    suggestion: metadata?.suggestion ?? null,
    contextLimited: p.contextLimited ?? false,
  });
}
