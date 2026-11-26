import type { TrackedD1 } from "../../db";
import type { ModelRoute } from "../../pricing";
import type {
  ChatStep,
  ChatStreamFrame,
  CodexInputItem,
  DegradedInfo,
  Env,
  LlmProvider,
  LlmRoundResult,
  QuotaBucket,
  QuotePayload,
  RunStatus,
  ServicePolicy,
  Tier,
  TurnSuggestion,
} from "../../types";
import type { PreparedTurnContext } from "../history";
import type { AgentToolRunner } from "../tools";

/** One function call requested by the model. */
export type ToolCall = LlmRoundResult["functionCalls"][number];

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
  sendFrame: (frame: ChatStreamFrame) => void;
}

/** Everything one turn accumulates across its model rounds, and what the run is settled with. */
export interface TurnState {
  steps: ChatStep[];
  /** Items produced by this turn (model output and tool outputs), stored for replay. */
  newItems: CodexInputItem[];
  /** The request input: history plus `newItems`. */
  input: CodexInputItem[];
  /** The visible answer streamed so far. */
  text: string;
  cost: number;
  inputTokens: number;
  cachedTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
  rounds: number;
  toolCalls: number;
  /** Money reserved for the run so far. */
  reserve: number;
  /** A model request is in flight, so its cost is unknown if it fails. */
  pendingRequest: boolean;
  roundStartChars: number;
  uncertain: boolean;
  estimatedPromptChars: number;
  metadata: TurnSuggestion | undefined;
  /** The first round must set the thread topic, with its text hidden. */
  needsTopic: boolean;
  canContinue: boolean;
  finalStatus: Exclude<RunStatus, "running">;
  errorCode: string | null;
  seenCallIds: Set<string>;
}

export function createTurnState(p: AgentLoopParams): TurnState {
  return {
    steps: [],
    newItems: [],
    input: [],
    text: "",
    cost: 0,
    inputTokens: 0,
    cachedTokens: 0,
    cacheWriteTokens: 0,
    outputTokens: 0,
    rounds: 0,
    toolCalls: 0,
    reserve: p.initialReserveMicros,
    pendingRequest: false,
    roundStartChars: 0,
    uncertain: false,
    estimatedPromptChars: 0,
    metadata: undefined,
    needsTopic: !p.generatedTitle,
    canContinue: true,
    finalStatus: "incomplete",
    errorCode: null,
    seenCallIds: new Set(),
  };
}

/** What every step of a round needs. `signal` is the run's own abort signal (stop, timeout, client gone). */
export interface RoundContext {
  p: AgentLoopParams;
  s: TurnState;
  signal: AbortSignal;
  runner: AgentToolRunner;
  instructions: string;
  prepared: PreparedTurnContext;
}

/** Appends a tool output to the next request and to the items stored for replay. */
export function appendToolOutput(s: TurnState, callId: string, rawOutput: string): void {
  const item: CodexInputItem = {
    type: "function_call_output",
    call_id: callId,
    output: rawOutput,
  };
  s.input.push(item);
  s.newItems.push(item);
}

export function appendToolJson(s: TurnState, callId: string, value: unknown): void {
  appendToolOutput(s, callId, JSON.stringify(value));
}
