import { fireEvent, render, screen } from "@testing-library/react";
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
  fireEvent.click(await screen.findByRole("button", { name: "Ответить на выделенный фрагмент" }));
  expect(openWithQuote).toHaveBeenCalledWith({
    label: "Ответ ассистента",
    messageId: "answer",
    tex: "другая операция",
  });
});
