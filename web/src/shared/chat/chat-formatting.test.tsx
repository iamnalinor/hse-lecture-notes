import { fireEvent, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import { renderWithApp } from "#web/test/render.tsx";

import { ChatMarkdown } from "./chat-markdown.tsx";
import { ChatStepsBlock } from "./chat-steps.tsx";

it("renders math in search result titles while preserving their navigation", () => {
  const onJumpToBlock = vi.fn();
  const href = "/calculus/quiz-limits#sec:quiz-limits:power-exp";
  const view = renderWithApp(
    <ChatStepsBlock
      isBackgroundResponse={false}
      isCheckingBrowser={false}
      isRunningSteps
      onJumpToBlock={onJumpToBlock}
      steps={[
        {
          kind: "search",
          state: "done",
          q: "пределы",
          res: [String.raw`Показательно-степенные пределы вида $1^\infty$`],
          links: [href],
        },
      ]}
    />,
  );
  const link = screen.getByRole("link");
  expect(link.querySelector(":scope .math-inline .katex")).not.toBeNull();
  expect(view.container.querySelector(".katex-error")).toBeNull();
  expect(link).toHaveAttribute("href", href);
  fireEvent.click(link);
  expect(onJumpToBlock).toHaveBeenCalledExactlyOnceWith(href);
});

it("renders standard TeX math and leaves only the intended citation clickable", () => {
  const view = renderWithApp(
    <ChatMarkdown
      isStreaming={false}
      onJumpToBlock={vi.fn()}
      text={String.raw`Для \(f(x)>0\): \[f(x)^{g(x)}=e^{g(x)\ln f(x)}.\] См. [памятку](/calculus/quiz-limits).`}
    />,
  );
  expect(view.container.querySelectorAll(":scope .math-inline .katex")).toHaveLength(1);
  expect(view.container.querySelectorAll(":scope .math-display .katex")).toHaveLength(1);
  expect(view.container.querySelector(".katex-error")).toBeNull();
  expect(screen.getAllByRole("link")).toHaveLength(1);
  expect(screen.getByRole("link", { name: "памятку" })).toHaveAttribute(
    "href",
    "/calculus/quiz-limits",
  );
});
