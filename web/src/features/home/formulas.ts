export const HERO_FORMULAS = {
  naturals: String.raw`\mathbb{N}`,
  operands: String.raw`a, b \in \mathbb{N}`,
  nonzero: String.raw`b \neq 0`,
  pair: "(q, r)",
  division: "a = bq + r,",
  remainder: String.raw`0 \le r < b`,
  subset: String.raw`X \subseteq \mathbb{N}`,
  minimum: String.raw`\min X`,
} as const;
