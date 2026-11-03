import { REMARK_TAGS, type RemarkTag, type TagTone } from "#web/domain/remarks.ts";

const TONES: Readonly<Record<TagTone, string>> = {
  blue: "bg-def-chip text-def-deep",
  neutral: "bg-wash text-muted",
  orange: "bg-org-soft text-org-deep",
  red: "bg-red-soft text-red-deep",
};

export const TagPill = ({ tag }: { readonly tag: RemarkTag }) => {
  const { label, tone } = REMARK_TAGS[tag];
  return (
    <span
      className={`rounded-sm px-1.5 py-px text-caption font-semibold ${TONES[tone]}`}
      data-testid="tag-pill"
    >
      {label}
    </span>
  );
};
