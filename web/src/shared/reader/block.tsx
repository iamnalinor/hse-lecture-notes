import type { ReactNode } from "react";

import type { BlockStyle } from "#web/domain/blocks.ts";
import type { RemarkTag } from "#web/domain/remarks.ts";

import { TagPill } from "#web/shared/ui/tag-pill.tsx";

const THEME: Readonly<Record<BlockStyle, string>> = {
  definition: "[--c:var(--def)] [--t:var(--def-soft)]",
  example: "[--c:var(--ex)]",
  problem: "[--c:var(--prob)] [--t:var(--prob-soft)]",
  remark: "[--c:var(--rem)]",
  theorem: "[--c:var(--thm)] [--t:var(--thm-soft)]",
};

const BOXED = new Set<BlockStyle>(["definition", "problem", "theorem"]);

export type BlockHeading = {
  readonly label: string;
  /** Rendered parenthesised title. */
  readonly title: ReactNode;
};

type Props = {
  readonly children: ReactNode;
  readonly footer?: ReactNode;
  readonly id: string | undefined;
  readonly kind: BlockStyle;
  readonly name: BlockHeading;
  readonly number: string | undefined;
  readonly tag: RemarkTag | undefined;
};

const Header = ({ id, name, number, tag }: Pick<Props, "id" | "name" | "number" | "tag">) => (
  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-subhead">
    <b className="font-semibold text-(--c)">{name.label}</b>
    {name.title !== null && <span className="text-muted">{name.title}</span>}
    {tag !== undefined && <TagPill tag={tag} />}
    {id !== undefined && number !== undefined && (
      /* The anchor is for copying a link: shown on hover or focus, not competing with the label. */
      <a
        className="ml-auto text-footnote text-muted no-underline opacity-0 transition-opacity group-hover/block:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:hidden"
        href={`#${id}`}
      >
        #{number}
      </a>
    )}
  </div>
);

/*
One shape for every block: the type is in the label («Теорема 8.4», in its hue), not in a frame.
Definitions, theorems and problems sit on a soft tint; examples and remarks are text with a hairline.
*/
export const Block = ({ children, footer, id, kind, name, number, tag }: Props) => {
  const header = <Header id={id} name={name} number={number} tag={tag} />;
  const theme = `group/block relative my-7 scroll-mt-6 ${THEME[kind]}`;

  if (BOXED.has(kind)) {
    return (
      <div className={`${theme} rounded-lg bg-(--t)`} data-block-label={name.label} id={id}>
        <div className="px-5 pt-3.5">{header}</div>
        <div className="px-5 py-2">{children}</div>
        {footer}
      </div>
    );
  }

  return (
    <div
      className={`${theme} border-l-2 border-rule py-0.5 pl-5`}
      data-block-label={name.label}
      id={id}
    >
      <div className="mb-1.5">{header}</div>
      {children}
    </div>
  );
};
