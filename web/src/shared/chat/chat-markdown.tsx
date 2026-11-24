import type { JSX, ReactNode } from "react";

import { splitTex } from "#web/domain/text.ts";
import { TexMath } from "#web/shared/reader/tex-math.tsx";

import { ChatCodeBlock } from "./chat-code-block.tsx";
import {
  type BlockSegment,
  type InlineSpan,
  parseChatBlocks,
  safeStreamCut,
  scanInlinePieces,
} from "./chat-markdown-parse.ts";

const pushAnimatedWords = (nodes: ReactNode[], value: string, prefix: string): void => {
  const chunks = value.match(/\S+|\s+/g) ?? [value];
  for (const [cIdx, chunk] of chunks.entries()) {
    nodes.push(
      <span className={chunk.trim() === "" ? undefined : "ai-tok"} key={`${prefix}-${cIdx}`}>
        {chunk}
      </span>,
    );
  }
};

const pushTexNodes = (
  nodes: ReactNode[],
  segment: string,
  opts: { readonly isAnimated: boolean; readonly keyPrefix: string },
): void => {
  for (const [idx, part] of splitTex(segment).entries()) {
    if (part.kind === "math") {
      nodes.push(
        <span className={opts.isAnimated ? "ai-tok" : undefined} key={`${opts.keyPrefix}-m-${idx}`}>
          <TexMath display={false} tex={part.value} />
        </span>,
      );
    } else if (opts.isAnimated) {
      pushAnimatedWords(nodes, part.value, `${opts.keyPrefix}-w-${idx}`);
    } else {
      nodes.push(part.value);
    }
  }
};

type RefAnchorArgs = {
  readonly key: string;
  readonly label: string;
  readonly onJumpToBlock?: ((blockId: string) => void) | undefined;
  readonly target: string;
};

const renderRefAnchor = ({ key, label, onJumpToBlock, target }: RefAnchorArgs): JSX.Element => {
  const inner: ReactNode[] = [];
  pushTexNodes(inner, label, { isAnimated: false, keyPrefix: `${key}-l` });
  return (
    <a
      className="ref"
      data-ref={target}
      href={`#${target}`}
      key={key}
      onClick={(event) => {
        if (onJumpToBlock === undefined) {
          return;
        }

        event.preventDefault();
        onJumpToBlock(target);
      }}
    >
      {inner}
    </a>
  );
};

const renderInlineSpan = (
  span: InlineSpan,
  key: string,
  onJumpToBlock?: (blockId: string) => void,
): JSX.Element => {
  if (span.kind === "ref") {
    return renderRefAnchor({ key, label: span.label, onJumpToBlock, target: span.target });
  }
  if (span.kind === "bold") {
    const inner: ReactNode[] = [];
    pushTexNodes(inner, span.text, { isAnimated: false, keyPrefix: `${key}-b` });
    return <strong key={key}>{inner}</strong>;
  }
  return <code key={key}>{span.text}</code>;
};

type InlineProps = {
  readonly isAnimated?: boolean;
  readonly onJumpToBlock?: (blockId: string) => void;
  readonly text: string;
};

/** Renders inline text with `$...$` KaTeX math, `**bold**`, `` `code` ``, and `a.ref` block links. */
export const InlineTeX = ({
  isAnimated = false,
  onJumpToBlock,
  text,
}: InlineProps): JSX.Element => {
  const nodes: ReactNode[] = [];
  for (const piece of scanInlinePieces(text)) {
    if (piece.kind === "plain") {
      pushTexNodes(nodes, piece.text, { isAnimated, keyPrefix: `p-${piece.pos}` });
    } else {
      nodes.push(renderInlineSpan(piece.span, `t-${piece.pos}`, onJumpToBlock));
    }
  }
  return <>{nodes}</>;
};

const renderBlock = (
  block: BlockSegment,
  index: number,
  opts: { readonly isStreaming: boolean; readonly onJumpToBlock: (blockId: string) => void },
): JSX.Element => {
  if (block.kind === "code") {
    return <ChatCodeBlock code={block.value} key={index} lang={block.lang} />;
  }
  if (block.kind === "display-math") {
    return (
      <div className={opts.isStreaming ? "ai-math ai-tok" : "ai-math"} key={index}>
        <TexMath display tex={block.value} />
      </div>
    );
  }
  if (block.kind === "list") {
    const Tag = block.ordered ? "ol" : "ul";
    return (
      <Tag key={index}>
        {block.items.map((item, itemIdx) => (
          // eslint-disable-next-line @eslint-react/no-array-index-key -- ordered list items
          <li key={itemIdx}>
            <InlineTeX
              isAnimated={opts.isStreaming}
              onJumpToBlock={opts.onJumpToBlock}
              text={item}
            />
          </li>
        ))}
      </Tag>
    );
  }
  return (
    <p key={index}>
      <InlineTeX
        isAnimated={opts.isStreaming}
        onJumpToBlock={opts.onJumpToBlock}
        text={block.value}
      />
    </p>
  );
};

type AnswerProps = {
  readonly isStreaming: boolean;
  readonly onJumpToBlock: (blockId: string) => void;
  readonly text: string;
};

/** Exact `.ai-answer` renderer from prototype.html + fenced/inline code blocks. */
export const ChatMarkdown = ({ isStreaming, onJumpToBlock, text }: AnswerProps): JSX.Element => {
  const safe = isStreaming ? safeStreamCut(text) : text;
  const blocks = parseChatBlocks(safe);

  return (
    <div className="ai-answer">
      {blocks.map((block, index) => renderBlock(block, index, { isStreaming, onJumpToBlock }))}
    </div>
  );
};
