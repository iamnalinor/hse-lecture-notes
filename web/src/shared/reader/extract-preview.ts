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
