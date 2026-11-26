import type { PreparedTurnContext } from "../chat/history";
import type { ModelRoute } from "../pricing";
import type {
  BlockInfo,
  DegradedInfo,
  Env,
  MessageStatus,
  ModelId,
  QuotaBucket,
  QuotePayload,
  RunStatus,
  Tier,
  TurnSuggestion,
} from "../types";

export interface BudgetSnapshot {
  globalActual7d: number;
  guestActual24h: number;
  globalReserved: number;
  guestReserved: number;
}

export interface IdentityAxes {
  tier: Tier;
  telegramId: number | null;
  browserId: string;
  ipAddress: string;
  fingerprint: string;
}

export interface QuotaEvaluation {
  allowed: boolean;
  bucket: QuotaBucket;
  reserveMicros: number;
  degraded: DegradedInfo;
  block: BlockInfo | null;
  weeklyWarnTriggered: boolean;
  budget: BudgetSnapshot;
}

export interface EvaluationOptions {
  checkConcurrency?: boolean;
  checkRateLimit?: boolean;
  forceLow?: boolean;
  recoverExpiredGuestQuota?: boolean;
}

/** A running run past its deadline: the minimum needed to settle it. */
export interface ExpiredRun {
  id: string;
  actual_cost_micros: number;
}

export interface FinalizeRunInput {
  runId: string;
  finalStatus: Exclude<RunStatus, "running">;
  messageStatus: MessageStatus;
  contentTex?: string;
  stepsJson?: string | null;
  agentItemsJson?: string | null;
  metadata?: TurnSuggestion;
  errorMessage?: string | null;
  errorCode?: string | null;
  actualCostMicros: number;
  isCostUncertain: boolean;
  uncertaintyEstimated?: boolean;
  estimatedPromptChars?: number;
  streamedOutputChars?: number;
  inputTokens?: number;
  cachedTokens?: number;
  cacheWriteTokens?: number;
  outputTokens?: number;
  toolRounds?: number;
  toolCalls?: number;
  nowMs?: number;
}

export interface CheckpointRoundParams {
  runId: string;
  tier: Tier;
  bucket: QuotaBucket;
  currentReservedMicros: number;
  cumulativeActualMicros: number;
  inputTokens: number;
  cachedTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
  toolRounds: number;
  toolCalls: number;
  nowMs: number;
}

export interface AdmitRunParams {
  env: Pick<Env, "TELEGRAM_BOT_TOKEN" | "OWNER_TELEGRAM_ID" | "LLM_PROVIDER">;
  axes: IdentityAxes;
  clientRequestId: string;
  payloadHash: string;
  threadId: string | null;
  retryAssistantMessageId?: string | null;
  course: string;
  docId: string;
  questionText: string;
  quote: QuotePayload | null;
  nowMs?: number;
}

export type AdmitRunResult =
  | {
      kind: "admitted";
      question: Pick<AdmitRunParams, "course" | "docId" | "questionText" | "quote">;
      contextLimited: boolean;
      preparedContext: PreparedTurnContext;
      questionCreatedAt: number;
      runId: string;
      threadId: string;
      threadTitle: string;
      generatedTitle: string | null;
      userMessageId: string;
      assistantMessageId: string;
      bucket: QuotaBucket;
      requestTitle: boolean;
      route: ModelRoute;
      reserveMicros: number;
      degraded: DegradedInfo;
    }
  | {
      kind: "duplicate";
      contextLimited: boolean;
      runId: string;
      threadId: string;
      threadTitle: string;
      generatedTitle: string | null;
      userMessageId: string;
      assistantMessageId: string;
      status: RunStatus;
      model: ModelId;
    }
  | {
      kind: "conflict";
      message: string;
    }
  | {
      kind: "blocked";
      block: BlockInfo;
      degraded: DegradedInfo;
    }
  | {
      kind: "not_found";
      message: string;
    };
