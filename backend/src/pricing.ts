import type { ModelId, QuotaBucket, RoundTokenUsage } from "./types";

export const PRICING_VERSION = 1;

/**
 * Rates expressed in microdollars per 1,000,000 tokens
 * (equivalently: microdollars per 1M tokens / 1_000_000 * tokens).
 * Using integer microdollars per 1M tokens avoids float precision loss:
 *   $1.00 / 1M  = 1_000_000 micros / 1M
 *   $0.125 / 1M = 125_000 micros / 1M
 */
export interface ModelPricing {
  model: ModelId;
  bucket: QuotaBucket;
  inputMicrosPer1M: number;
  cachedInputMicrosPer1M: number;
  cacheWriteMicrosPer1M: number;
  outputMicrosPer1M: number;
  minUncertainRoundMicros: number;
}

export const MODEL_PRICING: Record<ModelId, ModelPricing> = {
  "gpt-6.1-terra": {
    model: "gpt-6.1-terra",
    bucket: "high",
    inputMicrosPer1M: 1_000_000, // $1.00 / 1M
    cachedInputMicrosPer1M: 50_000, // $0.05 / 1M
    cacheWriteMicrosPer1M: 1_250_000, // $1.25 / 1M
    outputMicrosPer1M: 5_000_000, // $5.00 / 1M
    minUncertainRoundMicros: 5_000, // $0.005 conservative floor on mid-stream abort
  },
  "gpt-6-luna": {
    model: "gpt-6-luna",
    bucket: "low",
    inputMicrosPer1M: 100_000, // $0.10 / 1M
    cachedInputMicrosPer1M: 10_000, // $0.01 / 1M
    cacheWriteMicrosPer1M: 125_000, // $0.125 / 1M (Standard processing, 1.25x input)
    outputMicrosPer1M: 500_000, // $0.50 / 1M
    minUncertainRoundMicros: 1_000, // $0.001 conservative floor on mid-stream abort
  },
};

export function computeRoundCostMicros(model: ModelId, usage: RoundTokenUsage): number {
  const rates = MODEL_PRICING[model];
  const inputTokens = Math.max(0, Math.floor(usage.inputTokens));
  const cachedTokens = Math.max(0, Math.floor(usage.cachedTokens));
  const cacheWriteTokens = Math.max(0, Math.floor(usage.cacheWriteTokens));
  const outputTokens = Math.max(0, Math.floor(usage.outputTokens));
  const uncachedInputTokens = Math.max(0, inputTokens - cachedTokens - cacheWriteTokens);

  const exactMicros =
    (uncachedInputTokens * rates.inputMicrosPer1M +
      cachedTokens * rates.cachedInputMicrosPer1M +
      cacheWriteTokens * rates.cacheWriteMicrosPer1M +
      outputTokens * rates.outputMicrosPer1M) /
    1_000_000;

  return Math.ceil(exactMicros);
}

/**
 * Conservative cost estimate used when an upstream stream breaks before `response.completed`
 * (`is_cost_uncertain = 1`), so aborted rounds still count against budgets.
 */
export function estimateUncertainRoundCostMicros(
  model: ModelId,
  estimatedPromptChars: number,
  streamedOutputChars: number,
): number {
  const rates = MODEL_PRICING[model];
  // ~3 chars per token is conservative for Russian + LaTeX
  const estInputTokens = Math.ceil(Math.max(0, estimatedPromptChars) / 3);
  const estOutputTokens = Math.ceil(Math.max(0, streamedOutputChars) / 3) + 200;
  const estimated = computeRoundCostMicros(model, {
    inputTokens: estInputTokens,
    cachedTokens: 0,
    cacheWriteTokens: 0,
    outputTokens: estOutputTokens,
  });
  return Math.max(rates.minUncertainRoundMicros, estimated);
}
