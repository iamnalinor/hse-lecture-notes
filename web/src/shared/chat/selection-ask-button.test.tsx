import { act, fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import { SelectionAskButton } from "./selection-ask-button.tsx";

const openWithQuote = vi.fn();
vi.mock("./chat-context.tsx", () => ({
  useChat: () => ({
    activeThreadId: "t",
    docContext: { course: "", docId: "" },
    isConfigured: true,
    isOpen: true,
    openWithQuote,
    quote: null,
  }),
}));

it("attaches the selected text from a saved assistant answer on the homepage", async () => {
  render(
    <>
      <div data-answer-id="answer">
        <div className="ai-answer">
          <p>
            Это <strong>другая операция</strong> с матрицей
          </p>
        </div>
      </div>
      <SelectionAskButton />
    </>,
  );
  const range = document.createRange();
  range.selectNodeContents(screen.getByText("другая операция"));
  Object.defineProperty(range, "getClientRects", { value: () => [new DOMRect(100, 80, 120, 20)] });
  const selection = globalThis.getSelection();
  if (selection === null) {
    throw new Error("missing selection");
  }
  selection.removeAllRanges();
  selection.addRange(range);
  fireEvent.mouseUp(document);
  const reply = await screen.findByRole("button", { name: "Ответить на выделенный фрагмент" });
  expect(reply).toHaveTextContent("Ответить");
  expect(reply.querySelector("svg")).toBeNull();
  fireEvent.click(reply);
  expect(openWithQuote).toHaveBeenCalledWith({
    label: "Ответ ассистента",
    messageId: "answer",
    tex: "другая операция",
  });
});

it.each([
  ["mousedown", "mouseup"],
  ["pointerdown", "pointerup"],
  ["touchstart", "touchend"],
  ["keydown", "keyup"],
])("waits for %s to finish before showing the reply pill", (start, end) => {
  vi.useFakeTimers();
  try {
    render(
      <>
        <div data-answer-id="answer">
          <div className="ai-answer">
            <p>Выделенный ответ</p>
          </div>
        </div>
        <SelectionAskButton />
      </>,
    );
    const range = document.createRange();
    range.selectNodeContents(screen.getByText("Выделенный ответ"));
    Object.defineProperty(range, "getClientRects", {
      value: () => [new DOMRect(100, 80, 120, 20)],
    });
    fireEvent(document, new Event(start, { bubbles: true }));
    const selection = globalThis.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    fireEvent(document, new Event("selectionchange"));
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    fireEvent(document, new Event(end, { bubbles: true }));
    act(() => {
      vi.runAllTimers();
    });
    expect(screen.getByRole("button")).toBeEnabled();
    fireEvent(document, new Event(start, { bubbles: true }));
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  } finally {
    vi.useRealTimers();
  }
});

it.each(["ai-answer", "prose-notes"])(
  "selects a whole %s paragraph on a triple click across math",
  (className) => {
    render(
      <>
        <div data-answer-id="answer">
          <div className={className}>
            <p>
              До <span className="math-inline">x</span> после.
            </p>
          </div>
        </div>
        <SelectionAskButton />
      </>,
    );
    const math = screen.getByText("x");
    const range = document.createRange();
    range.selectNodeContents(math);
    const selection = globalThis.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    fireEvent.mouseDown(math, { detail: 3, button: 0 });
    expect(selection?.toString()).toBe("До x после.");
  },
);
