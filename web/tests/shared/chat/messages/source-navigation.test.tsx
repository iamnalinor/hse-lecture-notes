import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { expect, it, vi } from "vitest";

import { ChatMarkdown, MessageMaterialPathContext } from "#web/shared/chat/messages/markdown.tsx";
import { ChatStepsBlock } from "#web/shared/chat/messages/steps.tsx";

const material = "/algebra/theory";
const source = `${material}#def:zero`;

it.each(["/", "/pr-45/"])("uses the active site's %s base for every source link", (base) => {
  const jump = vi.fn();
  render(
    <MemoryRouter basename={base} initialEntries={[`${base}algebra/theory/`]}>
      <MessageMaterialPathContext value={material}>
        <ChatMarkdown
          isStreaming={false}
          onJumpToBlock={jump}
          text={`[Определение](#def:zero) [Источник](${source}) [Другая лекция](/algebra/lesson#def:zero)`}
        />
        <ChatStepsBlock
          isBackgroundResponse={false}
          isCheckingBrowser={false}
          isRunningSteps={false}
          onJumpToBlock={jump}
          steps={[{ kind: "search", state: "done", res: ["Найденный источник"], links: [source] }]}
        />
      </MessageMaterialPathContext>
    </MemoryRouter>,
  );
  const links = ["Определение", "Источник", "Найденный источник"].map((name) =>
    screen.getByRole("link", { name }),
  );
  for (const link of links) {
    expect(link).toHaveAttribute("href", `${base}algebra/theory#def:zero`);
    expect(link).toHaveAttribute("data-ref", "def:zero");
  }
  const other = screen.getByRole("link", { name: "Другая лекция" });
  expect(other).toHaveAttribute("href", `${base}algebra/lesson#def:zero`);
  expect(other).not.toHaveAttribute("data-ref");
  for (const link of links) {
    for (const modifier of [{ metaKey: true }, { ctrlKey: true }]) {
      expect(fireEvent.click(link, modifier)).toBe(true);
    }
  }
  expect(jump).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("link", { name: "Найденный источник" }));
  expect(jump).toHaveBeenCalledExactlyOnceWith(source);
});
