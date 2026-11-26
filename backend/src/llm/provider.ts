import { CodexResponsesProvider } from "./codex-provider";
import type { TrackedD1 } from "../db";
import { OpenAIResponsesProvider } from "./openai-provider";
import type { Env, LlmProvider } from "../types";

export function createLlmProvider(env: Env, db: TrackedD1): LlmProvider {
  const provider = env.LLM_PROVIDER?.trim() || "codex";
  if (provider === "codex") return new CodexResponsesProvider(env, db);
  if (provider === "openai") return new OpenAIResponsesProvider(env);
  throw new Error("LLM_PROVIDER must be codex or openai");
}
