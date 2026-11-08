import { findById } from "#web/shared/ui/dom.ts";

const MAX_BLOCKS = 3;

/** A figure: the picture and its caption; the number is already in the card header. */
const figurePreview = (figure: Element): string => {
  const image = figure.querySelector("img");
  const caption = figure.querySelector("figcaption")?.cloneNode(true);
  if (caption instanceof Element) {
    caption.querySelector(".nb-fig-num")?.remove();
  }
  const parts = [image?.outerHTML, caption instanceof Element ? caption.outerHTML : undefined];
  return `<figure class="nb-figure">${parts.join("")}</figure>`;
};

/** The statement of a block (or caption / formula) as HTML for a hover card. */
export const extractPreview = (fragment: string, id: string): string | undefined => {
  const element = findById(new DOMParser().parseFromString(fragment, "text/html"), id);
  if (element === null) {
    return undefined;
  }
  if (element.tagName === "FIGURE") {
    return figurePreview(element);
  }
  const body = element.querySelector(".nb-body") ?? element;
  const blocks = [...body.children].filter((child) => !/^H[1-6]$/.test(child.tagName));
  return blocks
    .slice(0, MAX_BLOCKS)
    .map((child) => child.outerHTML)
    .join("");
};

/** A problem's answer and solution follow it in the fragment; the problem card draws them inside. */
const ATTACHED = ["nb-answer", "nb-solution"];

const withoutIds = (element: Element): string => {
  const copy = element.cloneNode(true);
  if (!(copy instanceof Element)) {
    return "";
  }
  copy.removeAttribute("id");
  for (const inner of copy.querySelectorAll("[id]")) {
    inner.removeAttribute("id");
  }
  return copy.outerHTML;
};

const isStop = (element: Element): boolean =>
  element.classList.contains("nb") || /^(?:H[1-6]|SECTION)$/u.test(element.tagName);

/**
The proof of a statement: the `div.nb-proof` (and the ones right after it) that follows the block,
possibly after a few paragraphs; the next numbered block or heading means there is none.
The linter checks the same rule for the ticket bank (`proof_after` in `scripts/lint.py`).
*/
const proofOf = (element: Element): readonly Element[] => {
  let next = element.nextElementSibling;
  while (next !== null && !isStop(next) && !next.classList.contains("nb-proof")) {
    next = next.nextElementSibling;
  }
  const proofs: Element[] = [];
  while (next?.classList.contains("nb-proof") === true) {
    proofs.push(next);
    next = next.nextElementSibling;
  }
  return proofs;
};

const attachedTo = (element: Element): readonly Element[] => {
  const parts: Element[] = [];
  for (
    let next = element.nextElementSibling;
    next !== null && ATTACHED.some((name) => next?.classList.contains(name) === true);
    next = next.nextElementSibling
  ) {
    parts.push(next);
  }
  return parts;
};

/** One referenced block of a ticket answer, written as plain text: no card, no folding. */
export type AnswerPart = {
  /** The block's content: the statement (and its proof), a problem's answer and solution. */
  readonly html: string;
  /** What the link under the answer is called: «Теорема 6.26 (критерий обратимости)». */
  readonly name: string;
};

const contentOf = (parts: readonly Element[]): string =>
  parts
    .flatMap((part) => [...part.children])
    .map((child) => withoutIds(child))
    .join("");

const nameOf = (element: Element): string => {
  const name = element.querySelector(":scope > .nb-head .nb-name")?.textContent;
  if (name !== undefined) {
    return name.replaceAll(/\s+/gu, " ").trim();
  }
  const { number } = (element as HTMLElement).dataset;
  return number === undefined ? "В конспекте" : `Формула (${number})`;
};

const bodyOf = (element: Element): readonly Element[] => {
  const body = element.querySelector(":scope > .nb-body");
  return body === null ? [] : [body];
};

/**
A block as part of a ticket answer: its content without the card around it, so that several blocks
read as one answer. A statement gives its text (with `shouldAttachProof` — and the proof that follows
it); a problem gives its answer and solution, since the question already says what to do; a formula
or a figure is taken whole. Ids are dropped, as in every copy of a block away from its page.
*/
export const extractAnswerPart = (
  fragment: string,
  id: string,
  shouldAttachProof = false,
): AnswerPart | undefined => {
  const element = findById(new DOMParser().parseFromString(fragment, "text/html"), id);
  if (element === null) {
    return undefined;
  }
  const name = nameOf(element);
  if (!element.classList.contains("nb")) {
    return { html: withoutIds(element), name };
  }
  const attached = attachedTo(element);
  if (element.classList.contains("nb-problem") && attached.length > 0) {
    return { html: contentOf(attached), name };
  }
  const proof = shouldAttachProof ? proofOf(element) : [];
  return { html: contentOf([...bodyOf(element), ...proof]), name };
};
