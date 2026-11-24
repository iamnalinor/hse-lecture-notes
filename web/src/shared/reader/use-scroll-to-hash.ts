import { useEffect } from "react";
import { useLocation } from "react-router";

import { findMaterialTarget } from "#web/shared/ui/dom.ts";

const flashTarget = (target: Element): Element => {
  // A section is too big to light up: flash its heading (or summary of a folded ticket) instead.
  if (target.tagName !== "SECTION") {
    return target;
  }
  const first = target.firstElementChild;
  return first?.matches("details[data-ticket]") === true
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
  const { hash, key, pathname } = useLocation();
  useEffect(() => {
    const target =
      hash === ""
        ? null
        : findMaterialTarget(hash, pathname.split("/").findLast((part) => part !== "") ?? "");
    if (target === null) {
      return;
    }
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
    target.scrollIntoView({ block: "start" });
    flash(target);
  }, [hash, key, pathname]);
};
