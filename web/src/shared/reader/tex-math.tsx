import { renderToString } from "katex";

import { useMacros } from "#web/api/queries.ts";

type Props = { readonly display: boolean; readonly tex: string };

/**
Rendered formulas by macro table, then by mode and source. The same formula shows up again and again
(in a lecture, in search hits on every keystroke), and KaTeX parsing is the costly part.
*/
const cache = new WeakMap<object, Map<string, string>>();
const MAX_CACHED = 5000;

const rendered = (tex: string, isDisplay: boolean, macros: Readonly<Record<string, string>>) => {
  const byKey = cache.get(macros) ?? new Map<string, string>();
  cache.set(macros, byKey);
  const key = `${isDisplay ? "D" : "I"}${tex}`;
  const hit = byKey.get(key);
  if (hit !== undefined) {
    return hit;
  }
  const html = renderToString(tex, {
    displayMode: isDisplay,
    // KaTeX mutates the macro table (\gdef), so every call gets its own copy.
    macros: { ...macros },
    strict: "ignore",
    throwOnError: false,
  });
  if (byKey.size >= MAX_CACHED) {
    byKey.clear();
  }
  byKey.set(key, html);
  return html;
};

/** KaTeX output is our own markup from a trusted source (the build), set as HTML. */
export const TexMath = ({ display, tex }: Props) => {
  const html = rendered(tex, display, useMacros());
  return (
    <span
      className={display ? "math-display" : "math-inline"}
      // eslint-disable-next-line @eslint-react/dom-no-dangerously-set-innerhtml -- KaTeX output of our own formulas, cached per formula
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};
