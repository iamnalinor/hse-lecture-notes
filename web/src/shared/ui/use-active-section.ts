import { useEffect, useState } from "react";
import { useLocation } from "react-router";

import { findById } from "./dom.ts";

/** The reading line as a share of the viewport height: sections whose top has crossed it are read. */
export const READING_LINE = 0.25;

/** The user moves the page: a section pinned by a jump gives way to the reading line. */
const USER_SCROLL = ["wheel", "touchmove", "keydown"] as const;

const topOf = (element: Element): number => element.getBoundingClientRect().top;

/**
The section being read, by layout. Sections nest (pandoc's `--section-divs` puts subsections inside
their section), and document order is the order of their tops, so the last one that has crossed the
reading line is the innermost section under it. A subsection right below its section's heading
crosses the line while that heading is still on screen: as long as the heading is visible, the reader
is on the section itself, so the choice climbs to it.
*/
const readSection = (ids: readonly string[]): string | undefined => {
  const line = globalThis.innerHeight * READING_LINE;
  const crossed = ids.findLast((id) => {
    const element = findById(document, id);
    return element !== null && topOf(element) <= line;
  });
  return crossed === undefined ? undefined : climbToVisibleHeading(ids, crossed);
};

/** The outermost of `ids` around `id` (or `id` itself) whose heading is still on screen. */
const climbToVisibleHeading = (ids: readonly string[], id: string): string => {
  let result = id;
  for (
    let parent = findById(document, id)?.parentElement?.closest("section") ?? null;
    parent !== null && ids.includes(parent.id) && topOf(parent) >= 0;
    parent = parent.parentElement?.closest("section") ?? null
  ) {
    result = parent.id;
  }
  return result;
};

/**
The id of the section being read (see `readSection`). After a jump to one of `ids` (a tap in the
table of contents, a link) that section stays active until the user scrolls by themselves: a short
section at the end of the page never reaches the reading line.
*/
export const useActiveSection = (ids: readonly string[]): string | undefined => {
  const { hash, key: locationKey } = useLocation();
  const [active, setActive] = useState<string | undefined>(undefined);
  // A new array every render must not re-subscribe the listeners.
  const key = ids.join("\n");

  useEffect(() => {
    const order = key.split("\n");
    const target = decodeURIComponent(hash.slice(1));
    let pinned = order.includes(target) ? target : undefined;
    let frame = 0;

    const schedule = () => {
      if (frame === 0) {
        frame = requestAnimationFrame(() => {
          frame = 0;
          setActive(pinned ?? readSection(order));
        });
      }
    };
    const unpin = () => {
      pinned = undefined;
    };

    schedule();
    globalThis.addEventListener("scroll", schedule, { passive: true });
    globalThis.addEventListener("resize", schedule, { passive: true });
    for (const type of USER_SCROLL) {
      globalThis.addEventListener(type, unpin, { passive: true });
    }
    return () => {
      cancelAnimationFrame(frame);
      globalThis.removeEventListener("scroll", schedule);
      globalThis.removeEventListener("resize", schedule);
      for (const type of USER_SCROLL) {
        globalThis.removeEventListener(type, unpin);
      }
    };
  }, [key, hash, locationKey]);

  return active;
};
