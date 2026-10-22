export type RemarkTag = "convention" | "corner-case" | "misconception" | "pitfall" | "reminder";

export type TagTone = "blue" | "neutral" | "orange" | "red";

type TagInfo = { readonly label: string; readonly tone: TagTone };

export const REMARK_TAGS: Readonly<Record<RemarkTag, TagInfo>> = {
  pitfall: { label: "подводный камень", tone: "red" },
  misconception: { label: "частое заблуждение", tone: "red" },
  "corner-case": { label: "корнер-кейс", tone: "orange" },
  convention: { label: "соглашение курса", tone: "blue" },
  reminder: { label: "напоминание", tone: "neutral" },
};

export const isRemarkTag = (value: string | undefined): value is RemarkTag =>
  value !== undefined && Object.hasOwn(REMARK_TAGS, value);
