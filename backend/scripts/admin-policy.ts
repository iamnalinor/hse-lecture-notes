import defaults from "../policy.json";
import { resolveModelRoute } from "../src/pricing";
import type { ServicePolicy } from "../src/types";

export function validatePolicyPatch(value: unknown, template: unknown, path: string): void {
  if (template && typeof template === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Expected an object at ${path}`);
    for (const [key, item] of Object.entries(value)) {
      if (!Object.hasOwn(template, key)) throw new Error(`Unknown policy field ${path}.${key}`);
      validatePolicyPatch(item, (template as Record<string, unknown>)[key], `${path}.${key}`);
    }
  } else if (typeof value !== typeof template || (typeof value === "string" && !value.trim()) ||
      (typeof value === "number" && (!Number.isFinite(value) || value < 0 ||
        (path === "policy.budgets.weeklyWarnRatio" ? value > 1 : !Number.isSafeInteger(value))))) {
    throw new Error(`Invalid policy value at ${path}`);
  }
}

export function validatePolicy(value: ServicePolicy): void {
  validatePolicyPatch(value, defaults, "policy");
  function requireFields(actual: unknown, template: unknown, path: string): void {
    if (!template || typeof template !== "object") return;
    for (const [key, child] of Object.entries(template)) {
      if (!actual || typeof actual !== "object" || !Object.hasOwn(actual, key))
        throw new Error(`Missing policy field ${path}.${key}`);
      requireFields((actual as Record<string, unknown>)[key], child, path + "." + key);
    }
  }
  requireFields(value, defaults, "policy");
  // A fresh chat spends round 1 on the forced set_topic call, so it needs a second round for the answer.
  if (value.maxToolRounds < 2) throw new Error("policy.maxToolRounds must be at least 2");
  if (value.staleRunTimeoutMs <= value.maxRunDurationMs)
    throw new Error("staleRunTimeoutMs must leave time to finalize after maxRunDurationMs");
  for (const route of [value.buckets.high, value.buckets.low]) {
    resolveModelRoute(route);
    if (!["none", "minimal", "low", "medium", "high", "xhigh"].includes(route.effort))
      throw new Error(`Invalid reasoning effort: ${route.effort}`);
  }
}
