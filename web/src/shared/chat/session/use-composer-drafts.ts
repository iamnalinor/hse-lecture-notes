import { useState } from "react";

import type { ChatQuote, ChatUser } from "#web/domain/chat/model.ts";

import type { UnsentQuestion } from "../stream/types.ts";

type Draft = {
  readonly text: string;
  readonly quote: ChatQuote | null;
  readonly draftError: null | string;
  readonly unsent: null | UnsentQuestion;
};
const empty: Draft = { text: "", quote: null, unsent: null, draftError: null };
type Store = {
  readonly owner: null | number;
  readonly page: string;
  readonly revision: number;
  readonly drafts: ReadonlyMap<string, Draft>;
  readonly migration: null | { threadId: null | string; resume: null | UnsentQuestion };
};
const initial = (owner: null | number, page: string): Store => ({
  owner,
  page,
  revision: 0,
  drafts: new Map(),
  migration: null,
});
const scope = (page: string, threadId: null | string) => JSON.stringify([page, threadId]);
const changeDraft = (store: Store, key: string, draft: Draft): Store => {
  const drafts = new Map(store.drafts);
  if (
    draft.text === "" &&
    draft.quote === null &&
    draft.unsent === null &&
    draft.draftError === null
  ) {
    drafts.delete(key);
  } else {
    drafts.set(key, draft);
  }
  const migration = store.migration;
  const isEditingMigratedDraft =
    migration !== null && key === scope(store.page, migration.threadId);
  return {
    ...store,
    drafts,
    migration: isEditingMigratedDraft ? { ...migration, resume: null } : migration,
  };
};

const isEmpty = (draft: Draft) => draft.quote === null && draft.text === "";
const rejectQuote = (current: Draft, message: UnsentQuestion): Draft =>
  isEmpty(current)
    ? { ...current, text: message.contentTex, draftError: message.errorMessage }
    : {
        ...current,
        unsent: message.contentTex === "" ? current.unsent : message,
        draftError: message.errorMessage,
      };

const editUnsent = (current: Draft): Draft => {
  const { unsent } = current;
  if (unsent === null) {
    return current;
  }
  return {
    text: unsent.contentTex,
    quote: unsent.quote,
    draftError: null,
    unsent: isEmpty(current) ? null : { ...unsent, contentTex: current.text, quote: current.quote },
  };
};

type DraftScope = { key: string; page: string; threadId: null | string };
const assignThread = (store: Store, target: DraftScope, id: string): Store => {
  const pending = store.drafts.get(target.key);
  if (pending === undefined) {
    return store;
  }
  const unsent = pending.unsent === null ? null : { ...pending.unsent, threadId: id };
  return changeDraft(changeDraft(store, target.key, empty), scope(target.page, id), {
    ...pending,
    unsent,
  });
};

const migrateGuestDraft = (
  prev: Store,
  account: ChatUser,
  { key, threadId, revision }: DraftScope & { revision: number },
): Store => {
  if (prev.owner !== null) {
    return prev;
  }
  const migrated = initial(account.id, prev.page);
  const current = prev.drafts.get(key);
  if (current === undefined || prev.revision !== revision) {
    return migrated;
  }
  const resume = current.unsent?.errorMessage === null && isEmpty(current) ? current.unsent : null;
  return { ...changeDraft(migrated, key, current), migration: { threadId, resume } };
};

export const useComposerDrafts = (page: string, user: ChatUser | null) => {
  const owner = user?.id ?? null;
  const [store, setStore] = useState(() => initial(owner, page));
  if (store.owner !== owner) {
    setStore(initial(owner, page));
  } else if (store.page !== page) {
    setStore({ ...store, page, revision: store.revision + 1, migration: null });
  }

  const forThread = (threadId: null | string) => {
    const key = scope(page, threadId);
    const target = { key, page, threadId };
    const draft = store.drafts.get(key) ?? empty;
    const update = (apply: (current: Draft) => Draft) => {
      setStore((prev) =>
        prev.owner === owner ? changeDraft(prev, key, apply(prev.drafts.get(key) ?? empty)) : prev,
      );
    };
    return {
      ...draft,
      setDraft: (text: string) => {
        update((current) => ({ ...current, text, draftError: null }));
      },
      setQuote: (quote: ChatQuote | null) => {
        update((current) => ({ ...current, quote, draftError: null }));
      },
      setUnsent: (unsent: null | UnsentQuestion) => {
        update((current) =>
          unsent === null && typeof current.unsent?.errorMessage === "string"
            ? current
            : { ...current, unsent },
        );
      },
      rejectQuote: (message: UnsentQuestion) => {
        update((current) => rejectQuote(current, message));
      },
      editUnsent: () => {
        update(editUnsent);
      },
      restoreRejectedDraft: (text: string, quote: ChatQuote | null) => {
        update((current) => (isEmpty(current) ? { ...current, text, quote } : current));
      },
      assignThread: (id: string) => {
        if (threadId !== null) {
          return;
        }
        setStore((prev) => (prev.owner === owner ? assignThread(prev, target, id) : prev));
      },
      onLogin: (account: ChatUser) => {
        if (owner !== null) {
          return;
        }
        setStore((prev) =>
          migrateGuestDraft(prev, account, { ...target, revision: store.revision }),
        );
      },
    };
  };
  return {
    forThread,
    migration: store.migration,
    clearResume: () => {
      setStore((prev) =>
        prev.migration === null
          ? prev
          : { ...prev, migration: { ...prev.migration, resume: null } },
      );
    },
    leaveThread: (isNewChat: boolean) => {
      setStore((prev) => {
        const next = { ...prev, revision: prev.revision + 1, migration: null };
        return isNewChat ? changeDraft(next, scope(page, null), empty) : next;
      });
    },
  };
};
