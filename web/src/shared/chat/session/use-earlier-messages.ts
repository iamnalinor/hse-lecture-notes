import { type Dispatch, type SetStateAction, useCallback, useRef, useState } from "react";

import type { ChatMessage } from "#web/domain/chat/model.ts";

import { fetchChatThread } from "#web/api/chat/client.ts";

type Messages = readonly ChatMessage[];

const mergeEarlier = (older: Messages, current: Messages): Messages => {
  const ids = new Set(current.map((message) => message.id));
  return [...older.filter((message) => !ids.has(message.id)), ...current];
};

const readEarlier = async (threadId: string, cursor: number) => {
  const response = await fetchChatThread(threadId, undefined, cursor);
  if (response?.thread?.id !== threadId) {
    throw new Error("History unavailable");
  }
  return response.thread;
};

export const useEarlierMessages = (setMessages: Dispatch<SetStateAction<Messages>>) => {
  const [cursor, setCursor] = useState<null | number>(null);
  const [status, setStatus] = useState<"error" | "idle" | "loading">("idle");
  const pendingRef = useRef<null | symbol>(null);
  const cancelEarlier = useCallback(() => {
    pendingRef.current = null;
    setStatus("idle");
  }, []);
  const load = async (threadId: null | string) => {
    if (threadId === null || cursor === null || pendingRef.current !== null) {
      return;
    }
    const request = Symbol();
    pendingRef.current = request;
    setStatus("loading");
    try {
      const thread = await readEarlier(threadId, cursor);
      if (pendingRef.current !== request) {
        return;
      }
      setMessages((current) => mergeEarlier(thread.messages, current));
      setCursor(thread.beforeSeq ?? null);
      cancelEarlier();
    } catch {
      if (pendingRef.current === request) {
        cancelEarlier();
        setStatus("error");
      }
    }
  };
  return { cursor, setCursor, status, cancelEarlier, load };
};
