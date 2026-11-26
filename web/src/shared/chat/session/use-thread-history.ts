import { useCallback, useRef, useState } from "react";

import type { ChatThreadSummary } from "#web/domain/chat/model.ts";

import { fetchChatThread, type ThreadResponse } from "#web/api/chat/client.ts";

const appendThreads = (
  previous: readonly ChatThreadSummary[],
  page: readonly ChatThreadSummary[],
) => {
  const seen = new Set(previous.map((item) => item.id));
  return [...previous, ...page.filter((item) => !seen.has(item.id))];
};

export const useThreadHistory = () => {
  const [threads, setThreads] = useState<readonly ChatThreadSummary[]>([]);
  const [before, setBefore] = useState<ChatThreadSummary | undefined>();
  const [status, setStatus] = useState<"error" | "idle" | "loading">("idle");
  const generationRef = useRef(0);
  const replacePage = useCallback((page: ThreadResponse) => {
    generationRef.current += 1;
    setStatus("idle");
    const selected = page.thread;
    const hasSelected = page.threads.some((item) => item.id === selected?.id);
    setThreads(hasSelected || selected === null ? page.threads : [...page.threads, selected]);
    setBefore(page.hasMore === true ? page.threads.at(-1) : undefined);
  }, []);
  const loadMore = async (): Promise<void> => {
    if (status === "loading" || before === undefined) {
      return;
    }
    const request = ++generationRef.current;
    setStatus("loading");
    try {
      const page = await fetchChatThread(null, before);
      if (page === null) {
        throw new Error("History unavailable");
      }
      if (request !== generationRef.current) {
        return;
      }
      setThreads((prev) => appendThreads(prev, page.threads));
      setBefore(page.hasMore === true ? page.threads.at(-1) : undefined);
      setStatus("idle");
    } catch {
      if (request === generationRef.current) {
        setStatus("error");
      }
    }
  };
  return {
    threads,
    setThreads,
    replacePage,
    loadMore,
    moreError: status === "error",
    hasMore: before !== undefined,
    isLoadingMore: status === "loading",
  };
};
