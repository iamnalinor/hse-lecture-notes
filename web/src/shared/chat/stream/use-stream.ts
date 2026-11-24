import { useCallback, useEffect, useRef, useState } from "react";

import type { TurnstileHooks } from "#web/api/chat/widgets.ts";

import { type ChatAccess, getChatEnvConfig } from "#web/api/chat/client.ts";
import {
  type ActiveWsStream,
  openChatMessageStream,
  type WsStreamCallbacks,
} from "#web/api/chat/stream.ts";

import type { SendArgs, StreamStateSetters } from "./types.ts";

import { type AllowanceOutcome, fetchAllowanceOutcome } from "./allowance.ts";
import { buildStreamCallbacks } from "./events.ts";
import { rejectOptimisticTurn, rollbackOptimisticTurn, startOptimisticTurn } from "./helpers.ts";

export type ChatStreamController = {
  readonly detachActive: () => void;
  readonly isCheckingBrowser: boolean;
  readonly sendQuestion: (args: SendArgs) => Promise<void>;
  readonly stopActive: () => void;
};

const connectStream = (
  args: SendArgs & { readonly clientRequestId: string },
  allowance: ChatAccess,
  callbacks: WsStreamCallbacks,
): ActiveWsStream | null => {
  try {
    return openChatMessageStream(
      getChatEnvConfig().apiUrl,
      {
        allowanceToken: allowance.allowanceToken,
        browserToken: allowance.browserToken,
        clientRequestId: args.clientRequestId,
        course: args.docContext.course,
        docId: args.docContext.docId,
        quote: args.quote,
        retryAssistantMessageId:
          args.retryMessage === undefined || args.retryMessage.runId === null
            ? null
            : args.retryMessage.id,
        text: args.text,
        threadId: args.activeThreadId,
      },
      callbacks,
    );
  } catch {
    callbacks.onCloseUnexpected();
    return null;
  }
};

const useStreamConnection = () => {
  const streamRef = useRef<ActiveWsStream | null>(null);
  const abortedPreWsRef = useRef(false);
  const mountedRef = useRef(true);
  const sendingRef = useRef(false);
  const allowanceAbortRef = useRef<AbortController | null>(null);
  const detachRef = useRef<(() => void) | null>(null);
  const generationRef = useRef(0);
  const [isCheckingBrowser, setIsCheckingBrowser] = useState(false);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      allowanceAbortRef.current?.abort();
      streamRef.current?.disconnect();
    };
  }, []);

  const detachActive = useCallback((): void => {
    streamRef.current?.disconnect();
    detachRef.current?.();
    detachRef.current = null;
    generationRef.current += 1;
    allowanceAbortRef.current?.abort();
    allowanceAbortRef.current = null;
    streamRef.current = null;
    sendingRef.current = false;
    setIsCheckingBrowser(false);
  }, []);

  const stopActive = useCallback((): void => {
    if (streamRef.current !== null) {
      streamRef.current.stop();
      return;
    }
    abortedPreWsRef.current = true;
    allowanceAbortRef.current?.abort();
  }, []);

  const clearActive = useCallback((): void => {
    detachRef.current = null;
    sendingRef.current = false;
    streamRef.current = null;
  }, []);

  return {
    streamRef,
    abortedPreWsRef,
    mountedRef,
    sendingRef,
    allowanceAbortRef,
    detachRef,
    generationRef,
    isCheckingBrowser,
    setIsCheckingBrowser,
    detachActive,
    stopActive,
    clearActive,
  };
};

const startStreamTurn = (
  args: SendArgs,
  setters: StreamStateSetters,
  connection: ReturnType<typeof useStreamConnection>,
) => {
  const {
    generationRef,
    mountedRef,
    abortedPreWsRef,
    sendingRef,
    allowanceAbortRef,
    detachRef,
    clearActive,
    setIsCheckingBrowser,
  } = connection;
  const generation = ++generationRef.current;
  const isSameTurn = (): boolean => mountedRef.current && generationRef.current === generation;
  const isCurrent = (): boolean => isSameTurn() && !abortedPreWsRef.current;
  const clientRequestId = args.retryMessage?.pendingRequestId ?? crypto.randomUUID();
  sendingRef.current = true;
  abortedPreWsRef.current = false;
  allowanceAbortRef.current = new AbortController();
  startOptimisticTurn(setters, args);
  detachRef.current = () => {
    rollbackOptimisticTurn(setters, args);
  };
  return {
    callbacks: buildStreamCallbacks({ args, clearActive, clientRequestId, setters }, isSameTurn),
    clientRequestId,
    isCurrent,
    isSameTurn,
    context: {
      isCurrent,
      signal: allowanceAbortRef.current.signal,
      onChecking: () => {
        if (isSameTurn()) {
          setIsCheckingBrowser(true);
        }
      },
      onChecked: () => {
        if (isSameTurn()) {
          setIsCheckingBrowser(false);
        }
      },
    },
  };
};

const finishAccessFailure = (
  outcome: AllowanceOutcome,
  deps: {
    readonly args: SendArgs;
    readonly setters: StreamStateSetters;
    readonly connection: ReturnType<typeof useStreamConnection>;
    readonly callbacks: WsStreamCallbacks;
  },
): void => {
  if (outcome.kind === "error") {
    deps.callbacks.onError({ code: "allowance_error", message: outcome.message });
  } else if (outcome.kind === "blocked") {
    deps.connection.clearActive();
    rejectOptimisticTurn(deps.setters, deps.args);
  } else {
    deps.connection.detachActive();
  }
};

export const useChatStream = (
  setters: StreamStateSetters,
  turnstileHooks: TurnstileHooks,
): ChatStreamController => {
  const connection = useStreamConnection();
  const { sendingRef, streamRef, detachRef, detachActive, isCheckingBrowser, stopActive } =
    connection;
  const sendQuestion = useCallback(
    async (args: SendArgs): Promise<void> => {
      if (sendingRef.current) {
        return;
      }
      const { callbacks, clientRequestId, isCurrent, isSameTurn, context } = startStreamTurn(
        args,
        setters,
        connection,
      );
      const outcome = await fetchAllowanceOutcome(turnstileHooks, setters, context);
      if (!isSameTurn()) {
        return;
      }
      if (outcome.kind !== "ok" || !isCurrent()) {
        finishAccessFailure(outcome, { args, setters, connection, callbacks });
        return;
      }
      streamRef.current = connectStream({ ...args, clientRequestId }, outcome.allowance, callbacks);
      if (streamRef.current !== null) {
        detachRef.current = callbacks.onCloseUnexpected;
      }
    },
    [connection, detachRef, sendingRef, setters, streamRef, turnstileHooks],
  );

  return { detachActive, isCheckingBrowser, sendQuestion, stopActive };
};
