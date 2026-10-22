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
  <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 text-sm text-(--c)">
    <b className="font-bold">{name.label}</b>
    {name.title !== null && <span className="font-normal text-ink">{name.title}</span>}
    {tag !== undefined && <TagPill tag={tag} />}
    {id !== undefined && number !== undefined && (
      <a className="ml-auto text-xs text-(--c) no-underline opacity-70" href={`#${id}`}>
        #{number}
      </a>
    )}
  </div>
);

export const Block = ({ children, footer, id, kind, name, number, tag }: Props) => {
  const header = <Header id={id} name={name} number={number} tag={tag} />;
  const theme = `relative my-7 scroll-mt-6 ${THEME[kind]}`;

  if (BOXED.has(kind)) {
    return (
      <div
        className={`${theme} rounded-sm border-[1.25px] border-(--c) bg-(--t)`}
        data-block-label={name.label}
        id={id}
      >
        <div className="border-b border-[color-mix(in_srgb,var(--c)_22%,transparent)] px-4.5 pt-2.5 pb-2">
          {header}
        </div>
        <div className="px-4.5 pt-3.5 pb-1.5">{children}</div>
        {footer}
      </div>
    );
  }

  return (
    <div
      className={`${theme} border-l-[3px] border-(--c) py-0.5 pl-5`}
      data-block-label={name.label}
      id={id}
    >
      <div className="mb-1.5">{header}</div>
      {children}
    </div>
  );
};
