import { useEffect, useState } from "react";

import { findById } from "./dom.ts";

/**
The id of the section currently under the top of the viewport. Sections nest (pandoc's
`--section-divs` puts subsections inside their section), so the band usually crosses a section and
one of its subsections at once: the innermost one wins, which is the last of them in `ids` (document
order). The observer only reports changes, so the ids inside the band are kept between reports.
*/
export const useActiveSection = (ids: readonly string[]): string | undefined => {
  const [active, setActive] = useState<string | undefined>(undefined);
  // A new array every render must not restart the observer: a fresh one reports the outer section first.
  const key = ids.join("\n");

  useEffect(() => {
    const order = key.split("\n");
    const inBand = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            inBand.add(entry.target.id);
          } else {
            inBand.delete(entry.target.id);
          }
        }
        const innermost = order.findLast((id) => inBand.has(id));
        if (innermost !== undefined) {
          setActive(innermost);
        }
      },
      { rootMargin: "-10% 0px -80% 0px" },
    );
    for (const id of order) {
      const element = findById(document, id);
      if (element !== null) {
        observer.observe(element);
      }
    }
    return () => {
      observer.disconnect();
    };
  }, [key]);

  return active;
};
