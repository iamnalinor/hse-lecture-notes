import { useCallback, useEffect, useRef, useState } from "react";

import { fetchChatRunStatus, fetchChatThread, type ThreadResponse } from "#web/api/chat/client.ts";
import { readPageThread, readStoredAuth, savePageThread } from "#web/api/chat/storage.ts";
import { type ChatMessage, nextRunPollDelayMs } from "#web/domain/chat/model.ts";

import { useEarlierMessages } from "./use-earlier-messages.ts";
import { useThreadHistory } from "./use-thread-history.ts";

const readThread = async (threadId?: null | string): Promise<null | ThreadResponse> => {
  try {
    return await fetchChatThread(threadId);
  } catch {
    return null;
  }
};

const usePageState = (pageKey: string, isConfigured: boolean, isOpen: boolean) => {
  const [threadId, setThreadId] = useState<null | string>(null);
  const [messages, setMessages] = useState<readonly ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isThreadLoading, setIsThreadLoading] = useState(
    () => isConfigured && readStoredAuth().browserToken !== null,
  );

  const [pollRunId, setPollRunId] = useState<null | string>(null);
  const [currentKey, setCurrentKey] = useState(pageKey);
  if (!isOpen && !isStreaming && currentKey !== pageKey) {
    setCurrentKey(pageKey);
    setThreadId(null);
    setMessages([]);
    setPollRunId(null);
    setIsThreadLoading(isConfigured && readStoredAuth().browserToken !== null);
  }
  const setActiveThreadId = useCallback(
    (id: null | string) => {
      savePageThread(currentKey, id);
      setThreadId(id);
    },
    [currentKey],
  );
  return {
    currentKey,
    activeThreadId: threadId,
    setActiveThreadId,
    messages,
    setMessages,
    isStreaming,
    setIsStreaming,
    pollRunId,
    setPollRunId,
    isThreadLoading,
    setIsThreadLoading,
  };
};

type PageRestore = {
  preferredThreadId: null | string | undefined;
  currentKey: string;
  isOpen: boolean;
  isConfigured: boolean;
  requestRef: React.RefObject<number>;
  invalidateLoad: () => void;
  loadThread: (id: null | string) => Promise<"loaded" | "unavailable">;
};
const usePageRestore = (options: PageRestore) => {
  const {
    currentKey,
    isOpen,
    isConfigured,
    requestRef,
    loadThread,
    invalidateLoad,
    preferredThreadId,
  } = options;
  const loadedPageRef = useRef<null | string>(null);
  useEffect(() => {
    loadedPageRef.current = null;
  }, [currentKey]);
  useEffect(() => {
    if (
      !isOpen ||
      !isConfigured ||
      loadedPageRef.current === currentKey ||
      readStoredAuth().browserToken === null
    ) {
      return;
    }
    const generation = requestRef.current;
    const restore = async () => {
      if (generation !== requestRef.current) {
        return;
      }
      const status = await loadThread(
        preferredThreadId === undefined ? readPageThread(currentKey) : preferredThreadId,
      );
      if (status === "loaded" && generation + 1 === requestRef.current) {
        loadedPageRef.current = currentKey;
      }
    };
    queueMicrotask(() => void restore());
    return invalidateLoad;
  }, [currentKey, invalidateLoad, isConfigured, isOpen, loadThread, preferredThreadId, requestRef]);
};

const selectThread = (data: ThreadResponse, id?: null | string) => {
  const selected = data.thread?.id === id ? data.thread : null;
  const items = selected?.messages ?? [];
  return { selected, items, run: runningId(items) };
};

const runningId = (items: readonly ChatMessage[]) => {
  const last = items.at(-1);
  return last?.role === "assistant" && last.status === "running" ? last.runId : null;
};

type ThreadStateOptions = {
  readonly readingSource: boolean;
  readonly isOpen: boolean;
  readonly isConfigured: boolean;
  readonly pageKey: string;
  readonly preferredThreadId: null | string | undefined;
};
export const useThreadState = ({
  isOpen,
  isConfigured,
  pageKey,
  preferredThreadId,
  readingSource,
}: ThreadStateOptions) => {
  const history = useThreadHistory();
  const { replacePage } = history;
  const page = usePageState(pageKey, isConfigured, isOpen || readingSource);
  const earlier = useEarlierMessages(page.setMessages);
  const { setCursor, cancelEarlier } = earlier;
  const { setActiveThreadId, setMessages, setIsStreaming, setPollRunId, setIsThreadLoading } = page;
  const requestRef = useRef(0);
  const invalidateLoad = useCallback(() => {
    requestRef.current += 1;
    cancelEarlier();
    setIsThreadLoading(false);
  }, [cancelEarlier, setIsThreadLoading]);
  const applyPage = useCallback(
    (data: ThreadResponse, requestedThreadId?: null | string) => {
      const { selected, items, run } = selectThread(data, requestedThreadId);
      replacePage({ ...data, thread: selected });
      setActiveThreadId(selected?.id ?? null);
      setMessages(items);
      setCursor(selected?.beforeSeq ?? null);
      setIsStreaming(run !== null);
      setPollRunId(run);
    },
    [replacePage, setActiveThreadId, setCursor, setMessages, setIsStreaming, setPollRunId],
  );
  const loadThread = useCallback(
    async (requestedThreadId?: null | string): Promise<"loaded" | "unavailable"> => {
      const request = ++requestRef.current;
      cancelEarlier();
      setIsThreadLoading(true);
      const data = await readThread(requestedThreadId);
      if (request !== requestRef.current) {
        return "unavailable";
      }
      setIsThreadLoading(false);
      if (data === null) {
        return "unavailable";
      }
      applyPage(data, requestedThreadId);
      return "loaded";
    },
    [applyPage, cancelEarlier, setIsThreadLoading],
  );
  useRunStatusPoller({
    runId: page.isThreadLoading ? null : page.pollRunId,
    threadId: page.activeThreadId,
    loadThread,
  });
  usePageRestore({
    preferredThreadId,
    currentKey: page.currentKey,
    isOpen: isOpen && !page.isStreaming,
    isConfigured,
    requestRef,
    invalidateLoad,
    loadThread,
  });
  return {
    ...page,
    ...history,
    loadThread,
    canStop: page.isStreaming && page.pollRunId === null,
    invalidateLoad: () => {
      invalidateLoad();
      setCursor(null);
    },
    earlierStatus: earlier.status,
    hasEarlier: page.activeThreadId !== null && earlier.cursor !== null,
    loadEarlier: () => earlier.load(page.activeThreadId),
  };
};

type PollTarget = {
  readonly runId: null | string;
  readonly threadId: null | string;
  readonly loadThread: (threadId: null | string) => Promise<"loaded" | "unavailable">;
};

const useRunStatusPoller = ({ runId, threadId, loadThread }: PollTarget): void => {
  useEffect(() => {
    if (runId === null) {
      return;
    }
    let isActive = true;
    let attempt = 0;
    let timer: ReturnType<typeof globalThis.setTimeout>;
    const tick = async (): Promise<void> => {
      if (!document.hidden) {
        try {
          const status = await fetchChatRunStatus(runId);
          if (isActive && status?.status !== "running") {
            await loadThread(threadId);
          }
        } catch {
          // A temporary connection error leaves the saved run eligible for the next poll.
        }
      }
      if (isActive) {
        timer = globalThis.setTimeout(() => void tick(), nextRunPollDelayMs(++attempt));
      }
    };
    timer = globalThis.setTimeout(() => void tick(), nextRunPollDelayMs(0));
    return () => {
      isActive = false;
      globalThis.clearTimeout(timer);
    };
  }, [loadThread, runId, threadId]);
};
