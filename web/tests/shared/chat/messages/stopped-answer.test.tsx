import { fireEvent, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import type { ChatStep } from "#web/domain/chat/model.ts";

import { ChatMessageView } from "#web/shared/chat/messages/message-view.tsx";
import { makeAssistantMsg } from "#web/shared/chat/stream/helpers.ts";

import { renderWithApp } from "../../../support/render.tsx";

const showStopped = (contentTex: string, steps: readonly ChatStep[], canRetry = true) => {
  const message = {
    ...makeAssistantMsg({ course: "", docId: "" }),
    id: "a",
    status: "stopped" as const,
    contentTex,
    steps,
  };
  const retry = vi.fn();
  renderWithApp(
    <ChatMessageView
      canRetry={canRetry}
      message={message}
      onJumpToBlock={vi.fn()}
      onRetry={retry}
    />,
  );
  return retry;
};

it("explains a stop before the first word and retries that answer without inventing steps", () => {
  const retry = showStopped("", []);
  expect(screen.getByRole("status")).toHaveTextContent("Ты остановил ответ");
  expect(screen.queryByRole("list")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /скопировать/iu })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Повторить" }));
  expect(retry).toHaveBeenCalledExactlyOnceWith("a");
});

it.each(["", "Начнём с определения."])(
  "shows the recorded tool calls after a stop, with or without text (%s)",
  (text) => {
    const retry = showStopped(text, [
      {
        kind: "search",
        q: "производная",
        state: "done",
        res: ["Правило степени"],
        links: ["/calculus/theory#power"],
      },
      { kind: "read", target: "Определение производной", state: "error" },
      { kind: "note", note: "служебно", state: "done" },
    ]);
    expect(screen.getByRole("button", { name: "2 шага" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: "Правило степени" })).toHaveAttribute(
      "href",
      "/calculus/theory#power",
    );
    expect(screen.getByText(/Чтение не завершено/u)).toHaveTextContent("Определение производной");
    expect(screen.queryByText(/Прочитал|Подготовил ответ|служебно/u)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Повторить" }));
    expect(retry).toHaveBeenCalledExactlyOnceWith("a");
    expect(screen.queryByRole("button", { name: "Ответить заново" })).not.toBeInTheDocument();
  },
);

it("keeps a historical stopped search idle and does not offer an unavailable retry", () => {
  showStopped("", [{ kind: "search", q: "предел", state: "running" }], false);
  expect(screen.getByRole("button", { name: "1 шаг" })).toBeVisible();
  expect(screen.getByText(/Поиск не завершен/u)).toHaveTextContent("предел");
  expect(screen.queryByText(/Ищу в конспектах/u)).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Повторить" })).not.toBeInTheDocument();
});

it("keeps the partial answer available for reading and copying", () => {
  showStopped("Начнём с определения.", []);
  expect(screen.getByText("Начнём с определения.")).toBeVisible();
  expect(screen.getByRole("button", { name: "Скопировать ответ" })).toBeEnabled();
});
