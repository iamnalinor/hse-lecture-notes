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

/**
A whole block (a problem — with its answer and solution) as HTML, to be shown away from its page:
ids are dropped so that the copy neither duplicates the anchor nor steals a jump to it.
*/
export const extractBlock = (fragment: string, id: string): string | undefined => {
  const element = findById(new DOMParser().parseFromString(fragment, "text/html"), id);
  if (element === null) {
    return undefined;
  }
  const parts = [element];
  for (
    let next = element.nextElementSibling;
    next !== null && ATTACHED.some((name) => next?.classList.contains(name) === true);
    next = next.nextElementSibling
  ) {
    parts.push(next);
  }
  return parts.map((part) => withoutIds(part)).join("");
};
