import { autoUpdate, flip, offset, shift, useFloating } from "@floating-ui/react-dom";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { setChatOpen } from "../open-state.ts";
import { type ChatLoadFailure, loadChatRuntime } from "../runtime-loader.ts";

const MESSAGES = {
  network: "Чат не загрузился: нет связи.",
  offline: "Нет сети — открою чат, когда связь вернётся.",
  stale: "Чат не загрузился. Возможно, вышла новая версия сайта.",
} as const satisfies Record<ChatLoadFailure, string>;

type Props = {
  /** The chat toggle: the popover hangs under it, and a press on it is not «outside». */
  readonly anchor: HTMLElement | null;
  readonly failure: ChatLoadFailure;
};

/**
Shown under the chat button while the user wants the chat open but its code did not arrive.
Closing it takes back the wish to open (the chat would otherwise pop up by itself when the network
returns). The look is the tooltip of the synced tick (`synced-mark.tsx`). It sits right after the
button in the DOM, so Tab from the button reaches the action.
*/
export const ChatLoadFailurePopover = ({ anchor, failure }: Props) => {
  const [popover, setPopover] = useState<HTMLElement | null>(null);
  const popoverRef = useRef<HTMLElement | null>(null);
  const { floatingStyles, update } = useFloating({
    elements: { floating: popover, reference: anchor },
    middleware: [offset(8), flip(), shift({ padding: 8 })],
    placement: "bottom-end",
    strategy: "fixed",
  });
  useLayoutEffect(() => {
    return anchor === null || popover === null ? undefined : autoUpdate(anchor, popover, update);
  }, [anchor, popover, update]);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        anchor?.contains(event.target) !== true &&
        popoverRef.current?.contains(event.target) !== true
      ) {
        setChatOpen(false);
      }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      setChatOpen(false);
      anchor?.focus();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [anchor]);
  const message = MESSAGES[failure];
  return (
    <>
      {/* A region that stays in the page is what screen readers announce changes of. */}
      <div className="sr-only" role="status">
        {message}
      </div>
      <div
        className="z-50 max-w-64 rounded-lg bg-ink px-3 py-2 text-left text-footnote/snug font-normal whitespace-normal text-paper shadow-lg"
        data-popover=""
        data-state="open"
        ref={(node) => {
          popoverRef.current = node;
          setPopover(node);
        }}
        style={floatingStyles}
      >
        <p aria-hidden="true">{message}</p>
        <button
          className="mt-2 min-h-8 cursor-pointer rounded-md bg-paper px-3 text-footnote font-semibold text-ink max-sm:min-h-11"
          onClick={() => {
            if (failure === "stale") {
              location.reload();
              return;
            }
            loadChatRuntime();
            anchor?.focus();
          }}
          type="button"
        >
          {failure === "stale" ? "Обновить страницу" : "Повторить"}
        </button>
      </div>
    </>
  );
};
