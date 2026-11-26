import { act, fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import { ChatRefPreview } from "#web/shared/chat/messages/ref-preview.tsx";

it("keeps the citation preview open when the pointer moves onto the card", () => {
  vi.useFakeTimers();
  const panel = document.createElement("div");
  document.body.append(panel);
  try {
    const link = document.createElement("a");
    link.dataset["ref"] = "theorem";
    panel.append(link);
    render(
      <>
        <section data-block-label="Теорема" id="theorem">
          <div data-block-body>
            <p>Формулировка</p>
          </div>
          <button type="button">Показать решение</button>
        </section>
        <ChatRefPreview onJumpToBlock={vi.fn()} panelElement={panel} />
      </>,
    );
    fireEvent.pointerOver(link, { pointerType: "mouse" });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    const card = screen.getByRole("tooltip");
    expect(card).toHaveTextContent("Формулировка");
    expect(card).not.toHaveTextContent("Показать решение");
    fireEvent.pointerOut(link, { pointerType: "mouse" });
    fireEvent.pointerOver(card, { pointerType: "mouse" });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(card).toBeVisible();
    fireEvent.pointerOut(card, { pointerType: "mouse" });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(screen.queryByRole("tooltip")).toBeNull();
    fireEvent.focusIn(link);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(link).toHaveAttribute("aria-describedby", screen.getByRole("tooltip").id);
    fireEvent.keyDown(link, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).toBeNull();
  } finally {
    panel.remove();
    vi.useRealTimers();
  }
});
