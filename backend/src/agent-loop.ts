import { FIRST_TURN_TITLE_PROMPT } from "./system-prompt";
import { ThreadTitleStream } from "./thread-title";
import { CodexAuthError } from "./codex-auth";
import { ProxyConnectError, ResponseEofError } from "./socks5-fetch";
import { CodexUpstreamError } from "./codex-provider";
import type { TrackedD1 } from "./db";
import { logEvent } from "./logger";
import { computeRoundCostMicros, type ModelRoute } from "./pricing";
import { checkpointRound, finalizeRunAtomic } from "./quotas";
import { AGENT_TOOLS, AgentToolRunner, buildSystemPrompt } from "./tools";
import type {
  ChatStep,
  CodexInputItem,
  DegradedInfo,
  Env,
  LlmProvider,
  QuotaBucket,
  QuotePayload,
  RunStatus,
  ServerWsFrame,
  ServicePolicy,
  Tier,
} from "./types";

export interface AgentLoopParams {
  env: Env;
  db: TrackedD1;
  provider: LlmProvider;
  policy: ServicePolicy;
  runId: string;
  threadId: string;
  requestTitle?: boolean;
  excludeMessageIds?: readonly string[];
  course: string;
  docId: string;
  tier: Tier;
  bucket: QuotaBucket;
  route: ModelRoute;
  initialReserveMicros: number;
  degraded: DegradedInfo;
  questionText: string;
  quote: QuotePayload | null;
  signal: AbortSignal;
  isStoppedByUser: () => boolean;
  sendFrame: (frame: ServerWsFrame) => void;
}

interface HistoryRow {
  course: string;
  doc_id: string;
  role: "user" | "assistant";
  status: string;
  content_tex: string;
  quote_json: string | null;
}

function formatUserTurnContent(text: string, quote: QuotePayload | null): string {
  if (!quote) return text;
  const header = quote.messageId ? "Цитата из предыдущего ответа ассистента:" : quote.blockId
    ? `Цитата из конспекта (${quote.label}, блок #${quote.blockId}):`
    : `Цитата из конспекта (${quote.label}):`;
  return `${header}\n> ${quote.tex}\n\nВопрос студента:\n${text}`;
}

function extractPreviewArg(rawArgs: string, field: string): string {
  try {
    const parsed = JSON.parse(rawArgs) as Record<string, unknown>;
    return typeof parsed[field] === "string" ? parsed[field] : "";
  } catch {
    return "";
  }
}

async function loadThreadHistoryInput(
  db: TrackedD1,
  threadId: string,
  excludeRunId: string,
  excludeMessageIds: readonly string[],
  policy: ServicePolicy,
): Promise<CodexInputItem[]> {
  const excluded = new Set(excludeMessageIds);
  const rows = await db.all<HistoryRow & { id: string }>(
    db
      .prepare(
        `SELECT m.id, m.role, m.status, m.course, m.doc_id, m.content_tex, m.quote_json
         FROM chat_messages m
         WHERE m.thread_id = ? AND (m.run_id IS NULL OR m.run_id != ?) AND m.status IN ('done', 'stopped', 'incomplete')
         ORDER BY seq DESC
         LIMIT ?`,
      )
      .bind(threadId, excludeRunId, policy.maxHistoryMessages + excluded.size),
  );

  const chronological = [...rows.results]
    .filter((r) => !excluded.has(r.id))
    .slice(0, policy.maxHistoryMessages)
    .reverse();
  const items: CodexInputItem[] = [];
  let charBudget = policy.maxHistoryChars;

  const selected: HistoryRow[] = [];
  for (let i = chronological.length - 1; i >= 0; i -= 1) {
    const r = chronological[i]!;
    const len = r.content_tex.length + (r.quote_json?.length ?? 0);
    if (len > charBudget && selected.length > 0) break;
    charBudget -= len;
    selected.unshift(r);
  }

  for (const r of selected) {
    let quote: QuotePayload | null = null;
    if (r.quote_json) {
      try {
        quote = JSON.parse(r.quote_json) as QuotePayload;
      } catch {
        quote = null;
      }
    }
    if (r.role === "user") {
      items.push({
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: `Страница на момент вопроса: /${[r.course, r.doc_id].filter(Boolean).join("/")}\n` + formatUserTurnContent(r.content_tex, quote) }],
      });
    } else if (r.content_tex.trim()) {
      items.push({
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: r.content_tex }],
      });
    }
  }

  return items;
}

function describeRunError(err: unknown, code: string): string {
  if (err instanceof ProxyConnectError) {
    if (err.reply === null) return "Не удалось установить соединение через прокси.";
    if (err.reply === 2) return "Правила прокси запрещают подключение к модели (SOCKS5 REP=2).";
    return `Прокси отклонил подключение к модели (SOCKS5 REP=${err.reply}).`;
  }
  if (err instanceof ResponseEofError) {
    return err.stage === "headers"
      ? "Соединение с моделью оборвалось до получения заголовков ответа (EOF)."
      : "Соединение с моделью оборвалось во время получения ответа (EOF).";
  }
  const detail = (err instanceof Error ? err.message : String(err)).trim().slice(0, 400);
  if (err instanceof CodexAuthError) return `Ошибка авторизации Codex (${code}): ${detail}`;
  if (err instanceof CodexUpstreamError) return `Ошибка модели HTTP ${err.status} (${code}): ${detail}`;
  return `Ошибка сервера (${code}): ${detail}`;
}

const moscowClock = new Intl.DateTimeFormat("ru-RU", {
  timeZone: "Europe/Moscow",
  dateStyle: "short",
  timeStyle: "short",
});

export async function executeAgentRun(params: AgentLoopParams): Promise<void> {
  const {
    env,
    db,
    provider,
    policy,
    runId,
    threadId,
    course,
    docId,
    tier,
    bucket,
    route,
    degraded,
    questionText,
    quote,
    signal,
    isStoppedByUser,
    sendFrame,
  } = params;
  const { model, effort } = route;

  const steps: ChatStep[] = [];
  const turnNewAgentItems: CodexInputItem[] = [];

  let currentReservedMicros = params.initialReserveMicros;
  let cumulativeCostMicros = 0;
  let totalInputTokens = 0;
  let totalCachedTokens = 0;
  let totalCacheWriteTokens = 0;
  let totalOutputTokens = 0;
  let roundsCompleted = 0;
  let totalToolCalls = 0;
  let accumulatedText = "";
  let upstreamIncomplete = false;
  let isCostUncertain = false;
  let estimatedPromptChars = 0;

  const { instructions, currentDocOrder } = await buildSystemPrompt(db, course, docId);
  const historyItems = await loadThreadHistoryInput(
    db,
    threadId,
    runId,
    params.excludeMessageIds ?? [],
    policy,
  );

  const userTurnItem: CodexInputItem = {
    type: "message",
    role: "user",
    content: [{ type: "input_text", text: formatUserTurnContent(questionText, quote) }],
  };
  const conversationInput: CodexInputItem[] = [
    ...historyItems,
    {
      type: "message",
      role: "developer",
      content: [{ type: "input_text", text: `Дата и время вопроса (МСК): ${moscowClock.format(new Date())}.` }],
    },
    userTurnItem,
  ];

  const toolRunner = new AgentToolRunner({
    env,
    db,
    currentCourse: course,
    currentDocId: docId,
    currentDocOrder,
    maxToolOutputChars: policy.maxToolOutputChars,
    maxTotalToolOutputChars: policy.maxTotalToolOutputChars,
  });

  const timeoutAbort = new AbortController();
  let timedOut = false;
  const timeoutTimer = setTimeout(() => {
    timedOut = true;
    timeoutAbort.abort("run_timeout");
  }, policy.maxRunDurationMs);

  const onExternalAbort = () => timeoutAbort.abort(signal.reason);
  if (signal.aborted) {
    timeoutAbort.abort(signal.reason);
  } else {
    signal.addEventListener("abort", onExternalAbort, { once: true });
  }

  try {
    let allowTools = true;
    let titleReceived = false;

    for (let round = 1; round <= policy.maxToolRounds; round += 1) {
      if (timeoutAbort.signal.aborted) break;

      const isFinalAllowedRound = round === policy.maxToolRounds || !allowTools;
      const toolsForRound = isFinalAllowedRound ? [] : AGENT_TOOLS;

      estimatedPromptChars =
        instructions.length +
        conversationInput.reduce((acc, item) => acc + JSON.stringify(item).length, 0);

      let roundText = "";
      const remainingChars = Math.max(200, policy.maxResponseChars - accumulatedText.length);
      const roundStartMs = Date.now();

      const titleStream = params.requestTitle && !titleReceived ? new ThreadTitleStream() : null;
      const emit = (text: string) => {
        if (!text) return;
        roundText += text;
        accumulatedText += text;
        sendFrame({ type: "delta", text });
      };
      let streamed = false;
      const roundRes = await provider.runRound({
        model,
        effort,
        instructions: titleStream ? instructions + "\n\n" + FIRST_TURN_TITLE_PROMPT : instructions,
        input: conversationInput,
        tools: toolsForRound,
        maxResponseChars: remainingChars,
        signal: timeoutAbort.signal,
        onDelta: (delta) => {
          streamed = true;
          emit(titleStream ? titleStream.push(delta) : delta);
        },
      });

      const tail = streamed ? "" : roundRes.text;
      emit(titleStream ? titleStream.push(tail, true) : tail);
      if (titleStream?.title) {
        const title = titleStream.title;
        try {
          const saved = await db.run(db.prepare(
            "UPDATE chat_threads SET generated_title = ? WHERE id = ? AND generated_title IS NULL",
          ).bind(title, threadId));
          if (saved.meta.changes === 1) sendFrame({ type: "title", threadId, title });
        } catch {
          logEvent("warn", "thread_title_save_failed", { threadId, runId });
        }
        titleReceived = true;
      }
      const roundDurationMs = Date.now() - roundStartMs;
      logEvent(roundRes.completed ? "info" : "warn", "codex_round", {
        runId,
        round,
        model,
        completed: roundRes.completed,
        status: roundRes.status,
        truncated: roundRes.truncated,
        durationMs: roundDurationMs,
        textChars: roundText.length,
        toolCalls: roundRes.functionCalls.map((f) => f.name),
        usage: roundRes.usage,
      });

      upstreamIncomplete = !roundRes.completed || roundRes.truncated;
      if (!roundRes.completed) {
        isCostUncertain = true;
        break;
      }

      roundsCompleted += 1;
      if (roundRes.usage) {
        const roundCost = computeRoundCostMicros(route, roundRes.usage);
        cumulativeCostMicros += roundCost;
        totalInputTokens += roundRes.usage.inputTokens;
        totalCachedTokens += roundRes.usage.cachedTokens;
        totalCacheWriteTokens += roundRes.usage.cacheWriteTokens;
        totalOutputTokens += roundRes.usage.outputTokens;
      } else {
        isCostUncertain = true;
      }

      for (const item of roundRes.outputItems) {
        conversationInput.push(item);
        turnNewAgentItems.push(item);
      }

      const cp = await checkpointRound(db, policy, {
        runId,
        tier,
        bucket,
        currentReservedMicros,
        cumulativeActualMicros: cumulativeCostMicros,
        inputTokens: totalInputTokens,
        cachedTokens: totalCachedTokens,
        cacheWriteTokens: totalCacheWriteTokens,
        outputTokens: totalOutputTokens,
        toolRounds: roundsCompleted,
        toolCalls: totalToolCalls,
        nowMs: Date.now(),
      });
      currentReservedMicros = cp.updatedReservedMicros;
      if (!cp.canContinueToolRounds) {
        allowTools = false;
      }

      if (roundRes.functionCalls.length === 0 || roundRes.truncated || isFinalAllowedRound) {
        break;
      }

      for (const fc of roundRes.functionCalls) {
        if (timeoutAbort.signal.aborted) break;

        if (totalToolCalls >= policy.maxToolCalls) {
          const capItem: CodexInputItem = {
            type: "function_call_output",
            call_id: fc.callId,
            output: JSON.stringify({
              error: "Tool call limit reached for this turn. Answer using already gathered materials.",
            }),
          };
          conversationInput.push(capItem);
          turnNewAgentItems.push(capItem);
          allowTools = false;
          continue;
        }

        totalToolCalls += 1;

        const runningStep: ChatStep =
          fc.name === "search_materials"
            ? { kind: "search", q: extractPreviewArg(fc.arguments, "query"), state: "running" }
            : {
                kind: "read",
                target:
                  extractPreviewArg(fc.arguments, "id") ||
                  extractPreviewArg(fc.arguments, "doc_id") ||
                  extractPreviewArg(fc.arguments, "course"),
                state: "running",
              };
        const stepIdx = steps.push(runningStep) - 1;
        sendFrame({ type: "step", steps: [...steps] });

        const toolResult = await toolRunner.execute(fc.name, fc.arguments);
        steps[stepIdx] = toolResult.step;
        sendFrame({ type: "step", steps: [...steps] });

        const outputItem: CodexInputItem = {
          type: "function_call_output",
          call_id: fc.callId,
          output: toolResult.output,
        };
        conversationInput.push(outputItem);
        turnNewAgentItems.push(outputItem);
      }

      if (roundText && !roundText.endsWith("\n")) {
        accumulatedText += "\n\n";
        sendFrame({ type: "delta", text: "\n\n" });
      }
    }

    let finalStatus: Exclude<RunStatus, "running"> = "done";
    let errorCode: string | null = null;
    let errorMessage: string | null = null;

    if (isStoppedByUser()) {
      finalStatus = "stopped";
      isCostUncertain = true;
    } else if (timedOut) {
      finalStatus = "incomplete";
      errorCode = "run_timeout";
      errorMessage = "Время генерации ответа истекло (60 с).";
      isCostUncertain = true;
    } else if (upstreamIncomplete) {
      finalStatus = accumulatedText.trim() ? "incomplete" : "error";
      errorCode = "upstream_incomplete";
      errorMessage = "Соединение с моделью прервалось до завершения ответа.";
    }

    await finalizeRunAtomic(db, {
      runId,
      finalStatus,
      messageStatus: finalStatus,
      contentTex: accumulatedText,
      stepsJson: steps.length > 0 ? JSON.stringify(steps) : null,
      agentItemsJson:
        turnNewAgentItems.length > 0 ? JSON.stringify(turnNewAgentItems.slice(-24)) : null,
      errorCode,
      errorMessage,
      actualCostMicros: cumulativeCostMicros,
      isCostUncertain,
      estimatedPromptChars,
      streamedOutputChars: accumulatedText.length,
      inputTokens: totalInputTokens,
      cachedTokens: totalCachedTokens,
      cacheWriteTokens: totalCacheWriteTokens,
      outputTokens: totalOutputTokens,
      toolRounds: roundsCompleted,
      toolCalls: totalToolCalls,
    });

    sendFrame({
      type: "done",
      runId,
      status: finalStatus,
      text: accumulatedText,
      steps,
      degraded,
      block: null,
    });
  } catch (err) {
    const abortedByUser = isStoppedByUser();
    const isProxyError = err instanceof ProxyConnectError;
    const isAuthErr = err instanceof CodexAuthError;
    const isUpstreamErr = err instanceof CodexUpstreamError;

    const errorCode = abortedByUser
      ? "user_stopped"
      : timedOut
        ? "run_timeout"
        : isProxyError ? "proxy_unavailable"
        : err instanceof ResponseEofError ? "upstream_eof"
        : isAuthErr || isUpstreamErr ? err.code
        : "internal_error";

    logEvent(abortedByUser ? "info" : "error", "agent_run_exception", {
      runId,
      threadId,
      course,
      docId,
      model,
      abortedByUser,
      timedOut,
      roundsCompleted,
      totalToolCalls,
      errCode: errorCode,
      upstreamStatus: isUpstreamErr ? err.status : undefined,
      errMessage: err instanceof Error ? err.message.slice(0, 500) : String(err),
    });

    const finalStatus: Exclude<RunStatus, "running"> = abortedByUser
      ? "stopped"
      : timedOut
        ? "incomplete"
        : "error";
    const errorMessage = abortedByUser ? null : `${describeRunError(err, errorCode)} [run: ${runId}]`;

    await finalizeRunAtomic(db, {
      runId,
      finalStatus,
      messageStatus: finalStatus,
      contentTex: accumulatedText,
      stepsJson: steps.length > 0 ? JSON.stringify(steps) : null,
      agentItemsJson:
        turnNewAgentItems.length > 0 ? JSON.stringify(turnNewAgentItems.slice(-24)) : null,
      errorCode,
      errorMessage,
      actualCostMicros: cumulativeCostMicros,
      isCostUncertain: isProxyError ? isCostUncertain : true,
      estimatedPromptChars,
      streamedOutputChars: accumulatedText.length,
      inputTokens: totalInputTokens,
      cachedTokens: totalCachedTokens,
      cacheWriteTokens: totalCacheWriteTokens,
      outputTokens: totalOutputTokens,
      toolRounds: roundsCompleted,
      toolCalls: totalToolCalls,
    });

    if (abortedByUser) {
      sendFrame({
        type: "done",
        runId,
        status: "stopped",
        text: accumulatedText,
        steps,
        degraded,
        block: null,
      });
    } else {
      sendFrame({
        type: "error",
        code: errorCode,
        message: errorMessage ?? "Ошибка генерации",
        block: isAuthErr ? { code: "oauth_unavailable" } : null,
      });
    }
  } finally {
    clearTimeout(timeoutTimer);
    signal.removeEventListener("abort", onExternalAbort);
  }
}
