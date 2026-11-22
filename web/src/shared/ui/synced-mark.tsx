import { CheckIcon } from "#web/shared/ui/icons.tsx";

const HINT = "Сверено с лекцией: содержание и темп совпадают с реальной лекцией этого года";

/** A small green tick after a lecture title: the note was checked against the real lecture. */
export const SyncedMark = () => (
  <span className="ml-1.5 inline-block align-middle text-ex" title={HINT}>
    <CheckIcon size={14} />
    <span className="sr-only">{HINT}</span>
  </span>
);
