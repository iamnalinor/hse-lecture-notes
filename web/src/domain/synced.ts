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

/** The tooltip of the tick: one sentence; `null` when the note is not synced. */
export const syncedHint = (synced: readonly SyncedPart[]): null | string => {
  if (!hasPart(synced, "lecture")) {
    return null;
  }
  return hasPart(synced, "seminars")
    ? "Содержание совпадает с реальными лекцией и семинаром этого года"
    : "Содержание совпадает с реальной лекцией этого года";
};
