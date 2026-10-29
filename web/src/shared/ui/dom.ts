/** `getElementById` that works for any root and ids with colons (`thm:lec04:laplace`). */
export const findById = (root: ParentNode, id: string): Element | null =>
  root.querySelector(`[id="${CSS.escape(id)}"]`);

/** The id a `#hash` points to; a malformed escape (`#%E0`) is taken literally instead of throwing. */
export const hashTarget = (hash: string): string => {
  const raw = hash.replace(/^#/u, "");
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
};
