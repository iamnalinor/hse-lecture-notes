import { type JSX, lazy, Suspense } from "react";

import { CheckIcon, CopyIcon } from "./chat-icons.tsx";
import { useCopyFeedback } from "./use-chat-state.ts";

const Highlight = lazy(async () => {
  const { ChatCodeHighlight } = await import("./chat-code-highlight.tsx");
  return { default: ChatCodeHighlight };
});

type Props = {
  readonly code: string;
  readonly lang: string;
};

/** Clean fenced code block with optional language label and 1-click copy button. */
export const ChatCodeBlock = ({ code, lang }: Props): JSX.Element => {
  const { copyText, isCopied } = useCopyFeedback();

  return (
    <div className="ai-code">
      <div className="ai-code-head">
        <span>{lang === "" ? "код" : lang}</span>
        <button
          aria-label="Скопировать код"
          className={isCopied ? "ai-code-copy is-done" : "ai-code-copy"}
          onClick={() => {
            void copyText(code);
          }}
          type="button"
        >
          {isCopied ? <CheckIcon /> : <CopyIcon />}
          <span>{isCopied ? "Скопировано" : "Копировать"}</span>
        </button>
      </div>
      <pre>
        <code>
          <Suspense fallback={code}>
            <Highlight code={code} lang={lang} />
          </Suspense>
        </code>
      </pre>
    </div>
  );
};
