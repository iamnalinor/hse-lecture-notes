import type { useThreadState } from "./use-thread-state.ts";

/** What leaving the thread on screen needs: stop following its stream, forget its composer state. */
export type ThreadLeaving = {
  readonly detach: () => void;
  readonly leaveThread: (isNewChat: boolean) => void;
  readonly thr: ReturnType<typeof useThreadState>;
};

export const detachThread = (a: Omit<ThreadLeaving, "thr">, isNewChat: boolean): void => {
  a.detach();
  a.leaveThread(isNewChat);
};

/** Leaves the thread on screen for an empty one: stream, run, messages and the page's saved thread are dropped. */
export const startNewThread = (
  a: ThreadLeaving,
  { isCancellingLoad }: { readonly isCancellingLoad: boolean },
): void => {
  const { thr } = a;
  detachThread(a, true);
  if (isCancellingLoad) {
    thr.invalidateLoad();
  }
  thr.setPollRunId(null);
  thr.setIsStreaming(false);
  thr.setActiveThreadId(null);
  thr.setMessages([]);
};

/**
Leaves the thread on screen for a new one without touching a load under way: a closed panel opens
on a new thread (a thread without messages is kept: it is the new one already). The page forgets
its saved thread, so opening restores «no thread» and the history list, not the last thread.
*/
export const startFreshThread = (a: ThreadLeaving): void => {
  const { thr } = a;
  if (thr.activeThreadId !== null && thr.messages.length === 0 && !thr.isThreadLoading) {
    return;
  }
  startNewThread(a, { isCancellingLoad: false });
};

export const isContextLimited = (thr: ThreadLeaving["thr"]): boolean =>
  thr.threads.find((thread) => thread.id === thr.activeThreadId)?.contextLimited === true;

export const isShownAndLoaded = (thr: ThreadLeaving["thr"], threadId: string): boolean =>
  thr.activeThreadId === threadId && !thr.isThreadLoading && !thr.isThreadFailed;
