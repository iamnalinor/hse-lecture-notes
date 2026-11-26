import { prepareTurnContext, type PreparedTurnContext } from "./history";
import { recordTurnFailure } from "./agent/failure";
import { playRound } from "./agent/round";
import { applyInterruption, settleRun } from "./agent/settle";
import { createTurnState, type AgentLoopParams, type RoundContext } from "./agent/state";
import { METADATA_PROMPT, SYSTEM_PROMPT } from "./system-prompt";
import { AgentToolRunner } from "./tools";

/**
 * Runs one chat turn: model rounds with tool calls until an answer, then settles the run once.
 * Invariant: the last model response of a turn is the answer, and `suggest_reply` counts only in
 * that response (see `agent/tool-calls.ts`).
 */
export async function executeAgentRun(p: AgentLoopParams): Promise<void> {
  const s = createTurnState(p);

  // The run's own signal: the caller's stop/disconnect plus the run time limit.
  let timedOut = false;
  const abort = new AbortController();
  const timer = setTimeout(() => {
    timedOut = true;
    abort.abort("run_timeout");
  }, p.policy.maxRunDurationMs);
  const forwardAbort = () => abort.abort(p.signal.reason);
  if (p.signal.aborted) forwardAbort();
  else p.signal.addEventListener("abort", forwardAbort, { once: true });

  let prepared: PreparedTurnContext | undefined = p.preparedContext;
  try {
    prepared ??= await prepareTurnContext(p.db, {
      threadId: p.threadId,
      course: p.course,
      docId: p.docId,
      questionText: p.questionText,
      quote: p.quote,
      createdAt: p.questionCreatedAt,
      generatedTitle: p.generatedTitle ?? null,
      route: {
        provider: p.env.LLM_PROVIDER?.trim().toLowerCase() === "openai" ? "openai" : "codex",
        model: p.route.model,
        effort: p.route.effort,
      },
      limits: p.policy,
    });
    s.input = [...prepared.history.items];
    const round: RoundContext = {
      p,
      s,
      signal: abort.signal,
      prepared,
      instructions: SYSTEM_PROMPT + "\n\n" + METADATA_PROMPT,
      runner: new AgentToolRunner({
        signal: abort.signal,
        env: p.env,
        db: p.db,
        currentCourse: p.course,
        currentDocId: p.docId,
        currentDocOrder: prepared.snapshot.currentDocOrder,
        maxToolOutputChars: p.policy.maxToolOutputChars,
        maxTotalToolOutputChars: p.policy.maxTotalToolOutputChars,
      }),
    };
    for (let n = 1; n <= p.policy.maxToolRounds && !abort.signal.aborted && s.canContinue; n++) {
      if ((await playRound(round, n)) === "stop") break;
    }
  } catch (error) {
    recordTurnFailure(p, s, error, abort.signal);
  } finally {
    clearTimeout(timer);
    p.signal.removeEventListener("abort", forwardAbort);
  }

  applyInterruption(p, s, { timedOut, runAborted: abort.signal.aborted });
  await settleRun(p, s, prepared);
}
