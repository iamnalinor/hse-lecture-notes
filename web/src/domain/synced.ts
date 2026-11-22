/** What a note was checked against (front matter `synced`, see `context/markup.md`). */
export type SyncedPart = "lecture" | "seminars";

const hasPart = (synced: readonly SyncedPart[], part: SyncedPart) => synced.includes(part);

/** «Сверено с лекцией» / «… и семинарами» / «… с семинарами»; `null` when the note is not synced. */
export const syncedLabel = (synced: readonly SyncedPart[]): null | string => {
  const isLecture = hasPart(synced, "lecture");
  const isSeminars = hasPart(synced, "seminars");
  if (isLecture && isSeminars) {
    return "Сверено с лекцией и семинарами";
  }
  if (isLecture) {
    return "Сверено с лекцией";
  }
  return isSeminars ? "Сверено с семинарами" : null;
};

const LECTURE_NOTE = "содержание и темп совпадают с реальной лекцией этого года";
const SEMINARS_NOTE = "в конспект включён материал семинаров этого года";

/** The label with a short explanation, for a tooltip; `null` when the note is not synced. */
export const syncedHint = (synced: readonly SyncedPart[]): null | string => {
  const label = syncedLabel(synced);
  if (label === null) {
    return null;
  }
  const notes = [
    ...(hasPart(synced, "lecture") ? [LECTURE_NOTE] : []),
    ...(hasPart(synced, "seminars") ? [SEMINARS_NOTE] : []),
  ];
  return `${label}: ${notes.join(", ")}`;
};
