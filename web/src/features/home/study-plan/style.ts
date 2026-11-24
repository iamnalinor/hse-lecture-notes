/** Category colour: a token of `app.css` per category id of `curriculum.json` (muted for an unknown one). */
const CATEGORY_TOKEN: Readonly<Record<string, string>> = {
  math: "def",
  other: "thm",
  prog: "ex",
};

export const categoryColor = (categoryId: string): string =>
  `var(--${CATEGORY_TOKEN[categoryId] ?? "rem"})`;

/**
Bar fill: the category colour mixed into the card, the more the more hours. `--plan-max` (`app.css`) is
the strongest mix of a theme: dark ink on light bars and light ink on dark bars stay readable at 4.5:1.
*/
export const barBackground = (categoryId: string, strength: number): string =>
  `color-mix(in srgb, ${categoryColor(categoryId)} calc(${String(strength)} * var(--plan-max)), var(--card))`;

/**
One bar over several neighbouring modules: the fill runs smoothly from the strength of one module's
centre to the next one's, so the shade changes across the boundary without a step.
*/
export const runBackground = (categoryId: string, strengths: readonly number[]): string => {
  if (strengths.length === 1) {
    return barBackground(categoryId, strengths[0] ?? 0);
  }
  const stops = strengths.map(
    (strength, index) =>
      `${barBackground(categoryId, strength)} ${String(((index + 0.5) / strengths.length) * 100)}%`,
  );
  return `linear-gradient(to right, ${stops.join(", ")})`;
};

export const barBorder = (categoryId: string, strength: number): string =>
  `color-mix(in srgb, ${categoryColor(categoryId)} calc(${String(30 + strength * 30)}%), var(--card))`;
