import type { ChatRunner } from "./chat/runner";

export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export type AccountTier = "default" | "student" | "extended";
export type AssignedTier = Exclude<AccountTier, "default">;
export type Tier = "guest" | AccountTier;
export type QuotaBucket = "high" | "low";
export type ModelId = string;
export type RunStatus = "running" | "done" | "stopped" | "incomplete" | "error";
export type MessageStatus = "done" | "running" | "stopped" | "incomplete" | "error";
export type DocKind = "lecture" | "theory" | "prep" | "program";

export interface Env {
  DB: D1Database;
  CHAT_RUNNER: DurableObjectNamespace<ChatRunner>;
  VECTORIZE?: VectorizeIndex;
  AI?: Ai;
  ARCHIVE_BUCKET?: R2Bucket;

  // Vars
  LLM_PROVIDER?: string;
  OPENAI_BASE_URL?: string;
  ALLOWED_ORIGINS: string;
  TURNSTILE_EXPECTED_HOSTNAMES: string;
  CODEX_OAUTH_CLIENT_ID: string;
  CODEX_RESPONSES_URL: string;
  CODEX_TOKEN_URL: string;
  TELEGRAM_JWKS_URL: string;
  TELEGRAM_ISSUER: string;

  // Secrets
  OPENAI_API_KEY?: string;
  ALLOWANCE_JWT_SECRET: string;
  BROWSER_TOKEN_SECRET: string;
  CODEX_CREDENTIALS_ENCRYPTION_KEY: string;
  CODEX_PROXY_URL?: string;
  TURNSTILE_SECRET_KEY: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CLIENT_ID: string;
  OWNER_TELEGRAM_ID?: string;
}

export interface BucketModel {
  model: string;
  effort: string;
  pricingVersion: number;
}

export interface ServicePolicy {
  rateLimitPerMinute: number;
  maxQuestionChars: number;
  maxQuoteChars: number;
  maxBodyBytes: number;
  maxHistoryMessages: number;
  maxHistoryChars: number;
  maxToolRounds: number;
  maxToolCalls: number;
  maxToolOutputChars: number;
  maxTotalToolOutputChars: number;
  maxResponseChars: number;
  maxRunDurationMs: number;
  staleRunTimeoutMs: number;
  allowanceTtlMs: number;
  sessionTtlMs: number;
  archiveAfterDays: number;
  threadsPageSize: number;
  requireLoginWithoutFingerprint: boolean;
  budgets: {
    weeklyGlobalUsdMicros: number;
    weeklyWarnRatio: number;
    dailyGuestUsdMicros: number;
    reserveHighMicros: number;
    reserveLowMicros: number;
  };
  buckets: {
    high: BucketModel & { limits: Record<AssignedTier, number> };
    low: BucketModel & { limits: Record<Tier, number> };
  };
}

export interface QuotePayload {
  messageId?: string;
  blockId?: string;
  sectionId?: string;
  label: string;
  tex: string;
}

export interface ChatStep {
  kind: "search" | "read" | "note" | "sample";
  /** `sample`: how many problems the generator gave. */
  count?: number;
  q?: string;
  target?: string;
  note?: string;
  state: "running" | "done" | "error";
  res?: string[];
  links?: string[];
  more?: number;
}

export interface DegradedInfo {
  active: boolean;
  restoresAt?: number | null;
}

export interface BlockInfo {
  code:
    | "auth_required"
    | "tier_quota_exceeded"
    | "guest_budget_exceeded"
    | "global_budget_exceeded"
    | "rate_limited"
    | "concurrent_run"
    | "oauth_unavailable"
    | "service_unavailable";
  nextAvailableAt?: number | null;
  retryAfterSec?: number | null;
}

export interface SessionJwtPayload {
  typ: "session_v2";
  tgId: number;
  tgName: string;
  browserId: string;
  iat: number;
  exp: number;
}

export interface AllowanceJwtPayload {
  typ: "allowance" | "account_allowance_v2";
  browserId: string;
  tgId?: number;
  tgName?: string;
  tier: Tier;
  ip: string;
  fp: string;
  maxQuestionChars?: number; // Absent on allowances issued before the limit was signed.
  iat: number;
  exp: number;
}

// =============================================================================
// Codex Responses API types
// =============================================================================

export interface CodexFunctionTool {
  type: "function";
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  strict?: boolean;
}

export type CodexInputItem =
  | {
      type: "message";
      role: "user" | "assistant" | "developer";
      id?: string;
      phase?: string;
      content: Array<{ type: "input_text" | "output_text"; text: string }>;
    }
  | {
      type: "reasoning";
      id?: string;
      summary?: unknown;
      encrypted_content?: string;
      [key: string]: unknown;
    }
  | {
      type: "function_call";
      id?: string;
      call_id: string;
      name: string;
      arguments: string;
    }
  | {
      type: "function_call_output";
      call_id: string;
      output: string;
    };

export interface RoundTokenUsage {
  inputTokens: number;
  cachedTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
}

export interface LlmRoundRequest {
  effort: string;
  model: ModelId;
  instructions: string;
  input: CodexInputItem[];
  tools: CodexFunctionTool[];
  maxResponseChars: number;
  toolChoice?: "auto" | "none" | "required" | { type: "function"; name: string };
  parallelToolCalls?: boolean;
  hideText?: boolean;
  signal: AbortSignal;
  onDelta: (delta: string) => void;
  onUnconfirmedRetry?: () => void;
}

export interface TurnSuggestion { suggestion: string | null }
export interface TurnContextSnapshot {
  version: 1; contextItems: CodexInputItem[]; userItem: CodexInputItem; currentDocOrder: number;
}
export interface ReplayProvenance {
  provider: string; model: string; effort: string; promptVersion: string; toolsVersion: string; inputPrefixHash: string;
}
export interface AgentReplayEnvelope {
  version: 1; complete: boolean; provenance: ReplayProvenance | null; items: CodexInputItem[];
}
export interface LlmRoundResult {
  observedOutputChars?: number;
  responseId?: string;
  protocolViolations?: string[];
  refusal?: string;

  completed: boolean;
  status: string;
  text: string;
  truncated: boolean;
  outputItems: CodexInputItem[];
  functionCalls: Array<{
    id?: string;
    callId: string;
    name: string;
    arguments: string;
  }>;
  usage: RoundTokenUsage | null;
}

export interface LlmProvider {
  runRound(req: LlmRoundRequest): Promise<LlmRoundResult>;
}

// =============================================================================
// Chat commands and streamed HTTP responses (/v1/messages)
// =============================================================================

export type ClientChatCommand =
  | {
      type: "send";
      allowanceToken: string;
      browserToken: string;
      sessionToken?: string;
      clientRequestId: string;
      threadId?: string | null;
      retryAssistantMessageId?: string | null;
      course: string;
      docId: string;
      text: string;
      quote?: QuotePayload | null;
    }
  | {
      type: "stop";
    };

export type ChatStreamFrame =
  | { type: "title"; threadId: string; title: string }
  | {
      type: "meta";
      contextLimited?: boolean;
      replayed?: boolean;
      threadId: string;
      threadTitle: string;
      generatedTitle: string | null;
      userMessageId: string;
      assistantMessageId: string;
      runId: string;
      tier: Tier;
      model: ModelId;
      degraded: DegradedInfo;
    }
  | {
      type: "step";
      steps: ChatStep[];
    }
  | {
      type: "delta";
      text: string;
    }
  | {
      type: "done";
      errorMessage?: string | null;
      suggestion?: string | null;
      contextLimited?: boolean;
      replayed?: boolean;
      runId: string;
      status: RunStatus;
      text: string;
      steps: ChatStep[];
      degraded: DegradedInfo;
      block: BlockInfo | null;
    }
  | {
      type: "error";
      code: string;
      message: string;
      block?: BlockInfo | null;
      retryAfterSec?: number;
    };
