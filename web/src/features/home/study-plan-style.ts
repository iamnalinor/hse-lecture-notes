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

export const barBorder = (categoryId: string, strength: number): string =>
  `color-mix(in srgb, ${categoryColor(categoryId)} calc(${String(30 + strength * 30)}%), var(--card))`;
