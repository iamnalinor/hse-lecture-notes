import type { CSSProperties } from "react";

import { useQuery } from "@tanstack/react-query";
import { createPortal } from "react-dom";

import type { Label } from "#web/domain/schemas.ts";

import { fragmentQuery } from "#web/api/queries.ts";
import { blockStyle } from "#web/domain/blocks.ts";

import { extractPreview } from "./extract-preview.ts";
import { useReaderContext } from "./reader-context.ts";
import { TexText } from "./tex-text.tsx";

const HEADER_TONE = {
  definition: "text-def",
  example: "text-ex",
  problem: "text-prob",
  remark: "text-muted",
  theorem: "text-thm",
} as const;

type Props = {
  readonly cardProps: object;
  readonly onGo: () => void;
  readonly refCallback: (element: HTMLElement | null) => void;
  readonly style: CSSProperties;
  readonly target: Label;
};

export const RefPreviewCard = ({ cardProps, onGo, refCallback, style, target }: Props) => {
  const { course, renderPreview } = useReaderContext();
  const { data: html } = useQuery({
    ...fragmentQuery(course, target.weekId),
    select: (fragment) => extractPreview(fragment, target.id),
  });
  const kind = blockStyle(target.type);
  const tone = kind === undefined ? "text-ink" : HEADER_TONE[kind];
  // A formula is referred to as «(4.4)» in the text, so the card says the same.
  const heading =
    target.type === "equation"
      ? `(${target.number})`
      : [target.name, target.number].filter((part) => part !== "").join(" ");

  return createPortal(
    <div
      className="z-50 w-[min(430px,calc(100vw-24px))] cursor-pointer overflow-hidden rounded-lg border border-rule bg-card shadow-[0_18px_40px_-12px_rgba(0,0,0,0.25)]"
      onClick={onGo}
      onKeyDown={undefined}
      ref={refCallback}
      role="tooltip"
      style={style}
      {...cardProps}
    >
      <div className={`flex gap-2 px-4 pt-3.5 text-subhead ${tone}`}>
        <b className="font-semibold">{heading}</b>
        {/* A figure's title is its caption, and the caption is the card body. */}
        {target.title !== "" && target.type !== "figure" && (
          <span className="text-muted">
            <TexText text={target.title} />
          </span>
        )}
      </div>
      <div className="prose-notes ref-preview max-h-72 overflow-hidden px-4 pt-1.5 pb-1 text-body/normal">
        {html === undefined ? (
          <p className="text-muted">Загрузка…</p>
        ) : (
          renderPreview(html, target.weekId)
        )}
      </div>
      <div className="flex justify-between border-t border-rule px-4 py-2 text-caption text-muted">
        <span>Лекция {target.lecture}</span>
        <span className="font-semibold text-def">Перейти →</span>
      </div>
    </div>,
    document.body,
  );
};
