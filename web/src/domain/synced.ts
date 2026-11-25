/** What a note was checked against (front matter `synced`, see `context/markup.md`). */
export type SyncedPart = "lecture" | "seminars";

const hasPart = (synced: readonly SyncedPart[], part: SyncedPart) => synced.includes(part);

/** «Сверено с лекцией» / «Сверено с лекцией и семинарами»; `null` when the note is not checked against the lecture. */
export const syncedLabel = (synced: readonly SyncedPart[]): null | string => {
  if (!hasPart(synced, "lecture")) {
    return null;
  }
  return hasPart(synced, "seminars") ? "Сверено с лекцией и семинарами" : "Сверено с лекцией";
};

const LECTURE_NOTE = "содержание и темп совпадают с реальной лекцией этого года";
const SEMINARS_NOTE = "в конспект включен материал семинаров этого года";

/** The explanation alone, for the tooltip under the label; `null` when the note is not synced. */
export const syncedNote = (synced: readonly SyncedPart[]): null | string =>
  hasPart(synced, "lecture")
    ? [LECTURE_NOTE, ...(hasPart(synced, "seminars") ? [SEMINARS_NOTE] : [])].join(", ")
    : null;

/** The label with a short explanation, for a tooltip; `null` when the note is not synced. */
export const syncedHint = (synced: readonly SyncedPart[]): null | string => {
  const label = syncedLabel(synced);
  return label === null ? null : `${label}: ${syncedNote(synced) ?? ""}`;
};
