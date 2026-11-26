import type { CourseId } from "#web/domain/courses.ts";

import type { HERO_FORMULAS } from "./formulas.ts";

type FormulaName = CourseId | keyof typeof HERO_FORMULAS;
declare const HOME_MATH_HTML: Readonly<Record<FormulaName, string>>;

/** Static examples and course symbols are typeset by KaTeX at build time. */
export const HomeFormula = ({ name }: { readonly name: FormulaName }) => (
  <span
    className="math-inline"
    // eslint-disable-next-line @eslint-react/dom-no-dangerously-set-innerhtml -- trusted KaTeX output for fixed formulas from the repository
    dangerouslySetInnerHTML={{ __html: HOME_MATH_HTML[name] }}
  />
);
