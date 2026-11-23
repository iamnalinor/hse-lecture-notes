import { useEffect } from "react";
import { useLocation } from "react-router";

import { findById, hashTarget } from "#web/shared/ui/dom.ts";

const flashTarget = (target: Element): Element => {
  // A section is too big to light up: flash its heading (or summary of a folded ticket) instead.
  if (target.tagName !== "SECTION") {
    return target;
  }
  const first = target.firstElementChild;
  return first?.tagName === "DETAILS"
    ? (first.querySelector(":scope > summary") ?? first)
    : (first ?? target);
};

const flash = (target: Element): void => {
  const element = flashTarget(target);
  element.classList.remove("flash");
  element.getBoundingClientRect(); // restart the animation when the same anchor is hit twice
  element.classList.add("flash");
  element.addEventListener(
    "animationend",
    () => {
      element.classList.remove("flash");
    },
    { once: true },
  );
};

/** After navigation to `#anchor`: open folded proofs and tickets around it, scroll to it, highlight it. */
export const useScrollToHash = (): void => {
  const { hash, key } = useLocation();
  useEffect(() => {
    const target = hash === "" ? null : findById(document, hashTarget(hash));
    if (target === null) {
      return;
    }
    const ownDetails = target.querySelector(":scope > details");
    if (ownDetails instanceof HTMLDetailsElement) {
      ownDetails.open = true;
    }
    for (
      let node = target.closest("details");
      node !== null;
      node = node.parentElement?.closest("details") ?? null
    ) {
      node.open = true;
    }
    target.scrollIntoView({ block: "start" });
    flash(target);
  }, [hash, key]);
};
