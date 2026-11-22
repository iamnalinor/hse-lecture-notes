import { useCallback, useMemo, useState } from "react";
import { z } from "zod";

const storageKey = (course: string, prepId: string): string => `prep-topics:${course}/${prepId}`;

const load = (key: string): readonly string[] | undefined => {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? undefined : z.array(z.string()).parse(JSON.parse(raw));
  } catch {
    // private mode or a broken value: start from all topics
    return undefined;
  }
};

/**
The topics chosen in the generator, kept in `localStorage` per page, so a reload does not lose
them. «All» is stored as nothing: a topic added to the bank later is then chosen too. Ids that the
bank no longer has are ignored.
*/
export const useChosenTopics = (
  course: string,
  prepId: string,
  topics: readonly string[],
): readonly [ReadonlySet<string>, (next: ReadonlySet<string>) => void] => {
  const key = storageKey(course, prepId);
  const [picked, setPicked] = useState(() => load(key));
  const chosen = useMemo(
    () => new Set(picked === undefined ? topics : topics.filter((topic) => picked.includes(topic))),
    [picked, topics],
  );
  const choose = useCallback(
    (next: ReadonlySet<string>): void => {
      const isAll = topics.every((topic) => next.has(topic));
      setPicked(isAll ? undefined : [...next]);
      try {
        if (isAll) {
          localStorage.removeItem(key);
        } else {
          localStorage.setItem(key, JSON.stringify([...next]));
        }
      } catch {
        // private mode: the choice lives until the page is closed
      }
    },
    [key, topics],
  );
  return [chosen, choose];
};
