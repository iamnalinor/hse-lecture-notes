import type { BucketModel, RoundTokenUsage } from "./types";

/**
 * Rates expressed in microdollars per 1,000,000 tokens
 * (equivalently: microdollars per 1M tokens / 1_000_000 * tokens).
 * Using integer microdollars per 1M tokens avoids float precision loss:
 *   $1.00 / 1M  = 1_000_000 micros / 1M
 *   $0.125 / 1M = 125_000 micros / 1M
 */
export interface ModelPricing {
  inputMicrosPer1M: number;
  cachedInputMicrosPer1M: number;
  cacheWriteMicrosPer1M: number;
  outputMicrosPer1M: number;
  minUncertainRoundMicros: number;
}

export interface ModelRoute extends ModelPricing {
  model: string;
  effort: string;
  pricing_version: number;
}

// Keep published versions so a run can settle at the rates selected at admission.
const pricingVersions: Readonly<Record<number, Readonly<Record<string, ModelPricing>>>> = {
  1: {
    "gpt-6.1-terra": {
      inputMicrosPer1M: 1_000_000,
      cachedInputMicrosPer1M: 50_000,
      cacheWriteMicrosPer1M: 1_250_000,
      outputMicrosPer1M: 5_000_000,
      minUncertainRoundMicros: 5_000,
    },
    "gpt-6-luna": {
      inputMicrosPer1M: 100_000,
      cachedInputMicrosPer1M: 10_000,
      cacheWriteMicrosPer1M: 125_000,
      outputMicrosPer1M: 500_000,
      minUncertainRoundMicros: 1_000,
    },
  },
};

export function modelPricing(model: string, version: number): ModelPricing {
  const prices = pricingVersions[version];
  const rates = prices && Object.hasOwn(prices, model) ? prices[model] : undefined;
  if (!rates) throw new Error(`Missing pricing version ${version} for ${model}`);
  return rates;
}

export function resolveModelRoute({ model, effort, pricingVersion }: BucketModel): ModelRoute {
  return { ...modelPricing(model, pricingVersion), model, effort, pricing_version: pricingVersion };
}

export function computeRoundCostMicros(rates: ModelPricing, usage: RoundTokenUsage): number {
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
  rates: ModelPricing,
  estimatedPromptChars: number,
  streamedOutputChars: number,
): number {
  // ~3 chars per token is conservative for Russian + LaTeX
  const estInputTokens = Math.ceil(Math.max(0, estimatedPromptChars) / 3);
  const estOutputTokens = Math.ceil(Math.max(0, streamedOutputChars) / 3) + 200;
  const estimated = computeRoundCostMicros(rates, {
    inputTokens: estInputTokens,
    cachedTokens: 0,
    cacheWriteTokens: 0,
    outputTokens: estOutputTokens,
  });
  return Math.max(rates.minUncertainRoundMicros, estimated);
}
