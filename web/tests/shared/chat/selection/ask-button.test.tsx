import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { SelectionAskButton } from "#web/shared/chat/selection/ask-button.tsx";

const { docContext, openWithQuote } = vi.hoisted(() => ({
  docContext: { course: "", docId: "" },
  openWithQuote: vi.fn(),
}));
vi.mock("#web/shared/chat/session/context.tsx", () => ({
  useChat: () => ({
    activeThreadId: "t",
    docContext,
    isConfigured: true,
    isOpen: true,
    openWithQuote,
    quote: null,
  }),
}));

afterEach(() => {
  docContext.docId = "";
  globalThis.getSelection()?.removeAllRanges();
});

it("does not mount a quote action when selecting agent steps on a lecture page", async () => {
  docContext.docId = "lecture";
  render(
    <>
      <div className="ai-steps">
        <span>Ищу в конспектах</span>
      </div>
      <SelectionAskButton />
    </>,
  );
  const range = document.createRange();
  range.selectNodeContents(screen.getByText("Ищу в конспектах"));
  Object.defineProperty(range, "getClientRects", { value: () => [new DOMRect(100, 80, 120, 20)] });
  globalThis.getSelection()?.addRange(range);
  fireEvent.mouseUp(document);
  await act(() => new Promise((resolve) => globalThis.setTimeout(resolve, 0)));
  expect(document.querySelector(".ai-sel-btn")).toBeNull();
});

it.each(["mousedown", "selectionchange"])(
  "removes the positioned quote action immediately on %s on a lecture page",
  async (event) => {
    docContext.docId = "lecture";
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
    const paragraph = screen.getByText("Выделенный ответ");
    const range = document.createRange();
    range.selectNodeContents(paragraph);
    Object.defineProperty(range, "getClientRects", {
      value: () => [new DOMRect(100, 80, 120, 20)],
    });
    globalThis.getSelection()?.addRange(range);
    fireEvent.mouseUp(document);
    const reply = await screen.findByRole("button", { name: "Ответить на выделенный фрагмент" });
    expect(reply).toHaveStyle({ left: "220px", top: "108px" });
    fireEvent(paragraph, new Event(event, { bubbles: true }));
    expect(document.querySelector(".ai-sel-btn")).toBeNull();
  },
);

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
