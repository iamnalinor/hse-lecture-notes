import {
  createThreadStatement,
  insertAssistantPlaceholderStatement,
  insertUserMessageStatement,
  readRetryTarget,
  readThread,
  resetAssistantForRetryStatement,
  savePromptContextStatement,
  selectMaxSeqStatement,
  selectThreadStatement,
  threadBelongsTo,
  threadContextGuard,
  threadOwnerGuard,
  touchThreadForRunStatement,
  type ThreadRow,
} from "../chat/thread-repo";
import { decodeStoredQuote, prepareTurnContext, type PreparedTurnContext } from "../chat/history";
import { displayThreadTitle } from "../chat/thread-title";
import { randomToken } from "../crypto";
import type { TrackedD1 } from "../db";
import { resolveModelRoute, type ModelRoute } from "../pricing";
import type { QuotaBucket, ServicePolicy } from "../types";
import { reportAdmissionAlerts } from "./alerts";
import { addReserveStatement, budgetLimits } from "./budget-repo";
import { evaluateQuotasAndBudgets } from "./evaluate";
import { sweepExpiredRuns } from "./finalize";
import { dailyLimit, isGuestAxes } from "./policy";
import { DAY_MS, hourBucketTs, WEEK_MS } from "./time";
import type { AdmitRunParams, AdmitRunResult, IdentityAxes, QuotaEvaluation } from "./types";
import {
  admissionRefusalStatement,
  findRunByClientRequest,
  identityQuotaGuard,
  insertRunStatement,
  type AdmissionRefusal,
  type CountColumn,
  type IdentityValue,
} from "./usage-repo";

/** What one admission attempt resolves to; `reevaluate` makes the caller start over on fresh state. */
type Outcome = AdmitRunResult | { kind: "reevaluate" };

/** A step either yields a value for the next step or ends the attempt with an outcome. */
type Step<T> = { value: T } | { stop: Outcome };

interface Owner {
  isGuest: boolean;
  browserId: string;
  telegramId: number | null;
}

interface ThreadState {
  threadId: string;
  creatingThread: boolean;
  nextSeq: number;
  contextLimited: boolean;
  contextRevision: number;
  generatedTitle: string | null;
  threadTitle: string;
}

type Question = Pick<AdmitRunParams, "course" | "docId" | "questionText" | "quote">;

interface QuestionPlan {
  question: Question;
  questionCreatedAt: number;
  userMessageId: string;
  assistantMessageId: string;
  /** Set when the run re-answers the latest exchange instead of adding a new one. */
  retryAssistantSeq: number | null;
}

interface RoutedContext {
  evalRes: QuotaEvaluation;
  preparedContext: PreparedTurnContext;
  contextLimited: boolean;
}

export async function admitRunAtomic(
  db: TrackedD1,
  policy: ServicePolicy,
  params: AdmitRunParams,
  validateNewRequest?: () => Promise<void>,
): Promise<AdmitRunResult> {
  // A second transaction may have occupied the last slot after the preflight.
  // Re-evaluation returns its precise block or chooses the next available bucket.
  for (let attempt = 0; attempt < 3; attempt++) {
    const result = await tryAdmitRun(db, policy, params, validateNewRequest);
    if (result.kind !== "reevaluate") return result;
  }
  return {
    kind: "conflict",
    message: "История чата изменилась. Попробуй отправить вопрос еще раз.",
  };
}

async function tryAdmitRun(
  db: TrackedD1,
  policy: ServicePolicy,
  params: AdmitRunParams,
  validateNewRequest?: () => Promise<void>,
): Promise<Outcome> {
  const nowMs = params.nowMs ?? Date.now();
  const owner: Owner = {
    isGuest: isGuestAxes(params.axes),
    browserId: params.axes.browserId,
    telegramId: params.axes.telegramId,
  };
  const ownerKey = owner.isGuest ? `br:${owner.browserId}` : `tg:${owner.telegramId}`;

  // 1. Check idempotency across both current owner_key and guest br:<browserId> (survives login!)
  const replay = await replayDuplicate(db, params, owner, ownerKey);
  if (replay) return replay;

  // Existing requests survive changes to current source and policy.
  await validateNewRequest?.();

  // 2. Sweep any expired running slots before evaluating limits
  await sweepExpiredRuns(db, nowMs);

  // 3. Evaluate budgets, quotas, concurrency & rate limits
  const firstEvaluation = await evaluateQuotasAndBudgets(db, policy, params.axes, nowMs, {
    checkConcurrency: true,
    checkRateLimit: true,
  });

  // 4. Verify existing thread ownership or prepare new thread
  const threadStep = await loadThreadState(db, params, owner);
  if ("stop" in threadStep) return threadStep.stop;
  const thread = threadStep.value;

  // 5. Route by quota; a long thread can only use the low bucket
  const evaluateLow = () =>
    evaluateQuotasAndBudgets(db, policy, params.axes, nowMs, { forceLow: true });
  let possibleLow: QuotaEvaluation | undefined;
  let evalRes = firstEvaluation;
  if (thread.contextLimited) {
    evalRes = await evaluateLow();
  } else if (
    evalRes.bucket === "high" &&
    evalRes.block?.code === "global_budget_exceeded" &&
    evalRes.budget.globalActual7d +
      evalRes.budget.globalReserved +
      policy.budgets.reserveLowMicros <=
      policy.budgets.weeklyGlobalUsdMicros
  ) {
    // Only a permitted smaller reservation can overturn this denial during history routing.
    possibleLow = await evaluateLow();
  }
  if (evalRes.block && !possibleLow?.allowed) {
    await reportAdmissionAlerts(params.env, db, policy, evalRes, nowMs);
    return { kind: "blocked", block: evalRes.block, degraded: evalRes.degraded };
  }

  // 6. The question: the new one, or the latest exchange when retrying
  const questionStep = await resolveQuestion(db, params, thread, nowMs);
  if ("stop" in questionStep) return questionStep.stop;
  const questionPlan = questionStep.value;

  // 7. Build the prompt context; hitting the history limit re-routes to the low bucket
  const provider = params.env.LLM_PROVIDER?.trim().toLowerCase() === "openai" ? "openai" : "codex";
  const routedStep = await routeWithContext(
    { db, policy, params, nowMs, provider },
    thread,
    questionPlan,
    evalRes,
    possibleLow,
    evaluateLow,
  );
  if ("stop" in routedStep) return routedStep.stop;
  const { preparedContext, contextLimited } = routedStep.value;
  evalRes = routedStep.value.evalRes;

  // 8. One batch: the run row gates every other write
  const runId = `run_${randomToken(12)}`;
  const route = resolveModelRoute(policy.buckets[evalRes.bucket]);
  const refusal = await writeAdmission(db, policy, {
    params,
    owner,
    ownerKey,
    nowMs,
    runId,
    provider,
    route,
    thread,
    questionPlan,
    evalRes,
    preparedContext,
    contextLimited,
  });
  if (refusal) return refusal;

  return {
    kind: "admitted",
    question: questionPlan.question,
    contextLimited,
    preparedContext,
    questionCreatedAt: questionPlan.questionCreatedAt,
    runId,
    threadId: thread.threadId,
    threadTitle: thread.threadTitle,
    generatedTitle: thread.generatedTitle,
    requestTitle: !thread.generatedTitle,
    userMessageId: questionPlan.userMessageId,
    assistantMessageId: questionPlan.assistantMessageId,
    bucket: evalRes.bucket,
    route,
    reserveMicros: evalRes.reserveMicros,
    degraded: evalRes.degraded,
  };
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

/** A request that was already admitted returns its run; the same id with other content is a conflict. */
async function replayDuplicate(
  db: TrackedD1,
  params: AdmitRunParams,
  owner: Owner,
  ownerKey: string,
): Promise<Outcome | null> {
  const run = await findRunByClientRequest(
    db,
    owner.isGuest,
    ownerKey,
    owner.browserId,
    params.clientRequestId,
  );
  if (!run) return null;

  // Verify current caller actually owns the duplicate's thread
  const thread = await readThread(db, run.thread_id);
  if (!threadBelongsTo(thread, owner) || run.payload_hash !== params.payloadHash) {
    return {
      kind: "conflict",
      message: "clientRequestId reused with different payload or thread",
    };
  }
  return {
    kind: "duplicate",
    contextLimited: Boolean(thread.context_limited),
    runId: run.id,
    threadId: run.thread_id,
    threadTitle: displayThreadTitle(thread.generated_title, thread.first_question),
    generatedTitle: thread.generated_title,
    userMessageId: run.user_message_id,
    assistantMessageId: run.assistant_message_id,
    status: run.status,
    model: run.model,
  };
}

async function loadThreadState(
  db: TrackedD1,
  params: AdmitRunParams,
  owner: Owner,
): Promise<Step<ThreadState>> {
  if (!params.threadId) {
    return {
      value: {
        threadId: `thr_${randomToken(12)}`,
        creatingThread: true,
        nextSeq: 1,
        contextLimited: false,
        contextRevision: 0,
        generatedTitle: null,
        threadTitle: displayThreadTitle(null, params.questionText),
      },
    };
  }

  const [threadRes, seqRes] = await db.batch<Record<string, unknown>>([
    selectThreadStatement(db, params.threadId),
    selectMaxSeqStatement(db, params.threadId),
  ]);
  const thread = threadRes?.results[0] as ThreadRow | undefined;
  if (!threadBelongsTo(thread, owner)) {
    return { stop: { kind: "not_found", message: "Thread not found or not owned by user" } };
  }
  return {
    value: {
      threadId: params.threadId,
      creatingThread: false,
      nextSeq: Number(seqRes?.results[0]?.max_seq ?? 0) + 1,
      contextLimited: Boolean(thread.context_limited),
      contextRevision: thread.context_revision,
      generatedTitle: thread.generated_title,
      threadTitle: displayThreadTitle(thread.generated_title, thread.first_question),
    },
  };
}

async function resolveQuestion(
  db: TrackedD1,
  params: AdmitRunParams,
  thread: ThreadState,
  nowMs: number,
): Promise<Step<QuestionPlan>> {
  const plan: QuestionPlan = {
    question: {
      course: params.course,
      docId: params.docId,
      questionText: params.questionText,
      quote: params.quote,
    },
    questionCreatedAt: nowMs,
    userMessageId: `msg_${randomToken(12)}`,
    assistantMessageId: `msg_${randomToken(12)}`,
    retryAssistantSeq: null,
  };
  if (!params.retryAssistantMessageId) return { value: plan };

  const target = await readRetryTarget(db, thread.threadId, params.retryAssistantMessageId);
  if (!target || target.seq !== thread.nextSeq - 1) {
    return {
      stop: { kind: "conflict", message: "Only the latest assistant message can be retried" },
    };
  }
  return {
    value: {
      question: {
        course: target.course,
        docId: target.doc_id,
        questionText: target.content_tex,
        quote: decodeStoredQuote(target.quote_json),
      },
      questionCreatedAt: target.created_at,
      userMessageId: target.user_id,
      assistantMessageId: target.id,
      retryAssistantSeq: target.seq,
    },
  };
}

/** The prompt context was built from a history that has since changed. */
function isStaleContext(thread: ThreadState, prepared: PreparedTurnContext): boolean {
  return (
    !thread.creatingThread &&
    (prepared.expectedMaxSeq !== thread.nextSeq - 1 ||
      prepared.expectedContextRevision !== thread.contextRevision)
  );
}

async function routeWithContext(
  env: {
    db: TrackedD1;
    policy: ServicePolicy;
    params: AdmitRunParams;
    nowMs: number;
    provider: "codex" | "openai";
  },
  thread: ThreadState,
  questionPlan: QuestionPlan,
  initial: QuotaEvaluation,
  possibleLow: QuotaEvaluation | undefined,
  evaluateLow: () => Promise<QuotaEvaluation>,
): Promise<Step<RoutedContext>> {
  const { db, policy, params, nowMs, provider } = env;
  const prepare = (bucket: QuotaBucket) =>
    prepareTurnContext(db, {
      threadId: thread.creatingThread ? null : thread.threadId,
      retryAssistantMessageId: params.retryAssistantMessageId,
      ...questionPlan.question,
      createdAt: questionPlan.questionCreatedAt,
      generatedTitle: thread.generatedTitle,
      route: {
        provider,
        model: policy.buckets[bucket].model,
        effort: policy.buckets[bucket].effort,
      },
      limits: policy,
    });

  let evalRes = initial;
  let contextLimited = thread.contextLimited;
  let preparedContext = await prepare(evalRes.bucket);
  if (isStaleContext(thread, preparedContext)) return { stop: { kind: "reevaluate" } };
  if (!contextLimited && preparedContext.history.limitReached) {
    contextLimited = true;
    const candidateBucket = evalRes.bucket;
    evalRes = possibleLow ?? (await evaluateLow());
    if (candidateBucket !== "low" && !evalRes.block) preparedContext = await prepare("low");
    if (isStaleContext(thread, preparedContext)) return { stop: { kind: "reevaluate" } };
  }
  await reportAdmissionAlerts(params.env, db, policy, evalRes, nowMs);
  if (evalRes.block) {
    return { stop: { kind: "blocked", block: evalRes.block, degraded: evalRes.degraded } };
  }
  return { value: { evalRes, preparedContext, contextLimited } };
}

/** Columns an admission counts the identity on: browser always; IP and fingerprint for guests, account otherwise. */
function admissionIdentifiers(axes: IdentityAxes, owner: Owner): [CountColumn, IdentityValue][] {
  const identifiers: [CountColumn, IdentityValue][] = [["browser_id", axes.browserId]];
  if (owner.isGuest) {
    identifiers.push(["ip_address", axes.ipAddress]);
    if (axes.fingerprint) identifiers.push(["fingerprint", axes.fingerprint]);
  } else {
    identifiers.push(["telegram_id", axes.telegramId!]);
  }
  return identifiers;
}

interface AdmissionWrite {
  params: AdmitRunParams;
  owner: Owner;
  ownerKey: string;
  nowMs: number;
  runId: string;
  provider: string;
  route: ModelRoute;
  thread: ThreadState;
  questionPlan: QuestionPlan;
  evalRes: QuotaEvaluation;
  preparedContext: PreparedTurnContext;
  contextLimited: boolean;
}

/**
 * Writes the run, thread, messages and reservation in one batch. The run row gates every write:
 * a denied reservation cannot leave behind a thread, messages, or a partially reset retry.
 * Returns the outcome that ends the attempt when the run was not admitted, otherwise null.
 */
async function writeAdmission(
  db: TrackedD1,
  policy: ServicePolicy,
  w: AdmissionWrite,
): Promise<Outcome | null> {
  const { params, owner, thread, questionPlan, evalRes, nowMs, runId } = w;
  const { threadId, creatingThread } = thread;
  const { retryAssistantSeq } = questionPlan;

  const quotaGuard = identityQuotaGuard(
    admissionIdentifiers(params.axes, owner),
    evalRes.bucket,
    dailyLimit(policy, params.axes, evalRes.bucket),
    policy.rateLimitPerMinute,
    nowMs,
  );
  const threadGuard = threadOwnerGuard(
    creatingThread,
    owner.isGuest,
    threadId,
    owner.browserId,
    owner.telegramId,
  );
  const contextGuard = threadContextGuard(
    creatingThread,
    threadId,
    w.preparedContext.expectedContextRevision,
    w.preparedContext.expectedMaxSeq,
  );

  const insertStmts: D1PreparedStatement[] = [
    insertRunStatement(
      db,
      {
        runId,
        ownerKey: w.ownerKey,
        clientRequestId: params.clientRequestId,
        payloadHash: params.payloadHash,
        threadId,
        userMessageId: questionPlan.userMessageId,
        assistantMessageId: questionPlan.assistantMessageId,
        nowMs,
        expiresAt: nowMs + policy.staleRunTimeoutMs,
        tier: owner.isGuest ? "guest" : params.axes.tier,
        bucket: evalRes.bucket,
        model: w.route.model,
        pricingVersion: w.route.pricing_version,
        effort: w.route.effort,
        telegramId: owner.isGuest ? null : params.axes.telegramId,
        browserId: params.axes.browserId,
        ipAddress: params.axes.ipAddress,
        fingerprint: params.axes.fingerprint,
        provider: w.provider,
        reserveMicros: evalRes.reserveMicros,
        isGuest: owner.isGuest,
        budgetBindings: budgetLimits(policy, nowMs),
        retryAssistantSeq,
      },
      quotaGuard,
      threadGuard,
      contextGuard,
    ),
    creatingThread
      ? createThreadStatement(db, {
          threadId,
          browserId: owner.isGuest ? owner.browserId : null,
          telegramId: owner.isGuest ? null : owner.telegramId,
          nowMs,
          contextLimited: w.contextLimited,
          runId,
        })
      : touchThreadForRunStatement(db, {
          threadId,
          nowMs,
          contextLimited: w.contextLimited,
          runId,
        }),
  ];

  if (retryAssistantSeq !== null) {
    insertStmts.push(
      resetAssistantForRetryStatement(db, {
        runId,
        nowMs,
        assistantMessageId: questionPlan.assistantMessageId,
      }),
    );
  } else {
    insertStmts.push(
      insertUserMessageStatement(db, {
        messageId: questionPlan.userMessageId,
        threadId,
        course: params.course,
        docId: params.docId,
        seq: thread.nextSeq,
        contentTex: params.questionText,
        quoteJson: params.quote ? JSON.stringify(params.quote) : null,
        runId,
        nowMs,
      }),
      insertAssistantPlaceholderStatement(db, {
        messageId: questionPlan.assistantMessageId,
        threadId,
        course: params.course,
        docId: params.docId,
        seq: thread.nextSeq + 1,
        runId,
        nowMs,
      }),
    );
  }

  insertStmts.push(
    savePromptContextStatement(db, {
      userMessageId: questionPlan.userMessageId,
      snapshotJson: JSON.stringify(w.preparedContext.snapshot),
      runId,
    }),
    addReserveStatement(db, runId, evalRes.reserveMicros, owner.isGuest, nowMs),
  );

  try {
    // Report a lost race using the same transaction snapshot.
    insertStmts.push(
      admissionRefusalStatement(db, {
        runId,
        threadGuard,
        contextGuard,
        retryAssistantSeq,
        threadId,
        reserveMicros: evalRes.reserveMicros,
        isGuest: owner.isGuest,
        weekCutoff: hourBucketTs(nowMs - WEEK_MS),
        weeklyGlobalUsdMicros: policy.budgets.weeklyGlobalUsdMicros,
        dayCutoff: hourBucketTs(nowMs - DAY_MS),
        dailyGuestUsdMicros: policy.budgets.dailyGuestUsdMicros,
      }),
    );
    const result = await db.batch<{ reason: AdmissionRefusal }>(insertStmts);
    if (result[0]?.meta.changes === 1) return null;
    const reason = result.at(-1)?.results[0]?.reason;
    if (!reason) throw new Error("Budget reserve row missing");
    return refusalOutcome(reason, evalRes);
  } catch (err) {
    return mapAdmissionError(err, evalRes);
  }
}

function refusalOutcome(reason: AdmissionRefusal, evalRes: QuotaEvaluation): Outcome {
  if (reason === "thread_changed")
    return { kind: "not_found", message: "Thread ownership changed" };
  if (reason === "reevaluate") return { kind: "reevaluate" };
  if (reason === "stale_retry") {
    return { kind: "conflict", message: "Only the latest assistant message can be retried" };
  }
  return { kind: "blocked", block: { code: reason }, degraded: evalRes.degraded };
}

/** Unique-index violations are lost races between concurrent admissions; anything else is a bug. */
function mapAdmissionError(err: unknown, evalRes: QuotaEvaluation): Outcome {
  const msg = err instanceof Error ? err.message : String(err);
  if (
    msg.includes("idx_usage_runs_active_thread") ||
    msg.includes("UNIQUE constraint failed: usage_runs.thread_id")
  ) {
    return { kind: "blocked", block: { code: "concurrent_run" }, degraded: evalRes.degraded };
  }
  if (
    msg.includes("idx_usage_runs_idempotency") ||
    msg.includes("UNIQUE constraint failed: usage_runs.owner_key")
  ) {
    return { kind: "conflict", message: "Concurrent duplicate clientRequestId" };
  }
  throw err;
}
