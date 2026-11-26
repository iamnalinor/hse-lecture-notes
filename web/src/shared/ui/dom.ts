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

/** Earlier chat citations prefixed generated section IDs with sec:<document>:. */
export const findMaterialTarget = (hash: string, docId: string): Element | null => {
  const id = hashTarget(hash);
  const exact = findById(document, id);
  const prefix = `sec:${docId}:`;
  return exact ?? (id.startsWith(prefix) ? findById(document, id.slice(prefix.length)) : null);
};

/** Reveal the target’s own exam ticket and every fold that encloses the anchor before scrolling. */
export const openTargetDetails = (target: Element): void => {
  const ownTicket = target.querySelector(":scope > details[data-ticket]");
  if (ownTicket instanceof HTMLDetailsElement) {
    ownTicket.open = true;
  }
  for (
    let node = target.closest("details");
    node !== null;
    node = node.parentElement?.closest("details") ?? null
  ) {
    node.open = true;
  }
};
