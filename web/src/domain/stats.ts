import type { Label } from "./schemas.ts";

export type LabelStats = {
  readonly definitions: number;
  /** Theorems, lemmas, propositions and corollaries. */
  readonly theorems: number;
};

const DEFINITION_TYPES = new Set(["axiom", "definition"]);
const THEOREM_TYPES = new Set(["corollary", "lemma", "proposition", "theorem"]);

export const labelStats = (labels: readonly Label[]): LabelStats => ({
  definitions: labels.filter((label) => DEFINITION_TYPES.has(label.type)).length,
  theorems: labels.filter((label) => THEOREM_TYPES.has(label.type)).length,
});
