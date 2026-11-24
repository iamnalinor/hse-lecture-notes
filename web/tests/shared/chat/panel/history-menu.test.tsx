import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import { ChatPanelHeader } from "#web/shared/chat/panel/parts.tsx";

const history = {
  isStreaming: false,
  newChat: vi.fn(),
  hasMore: true,
  isLoadingMore: false,
  loadMore: vi.fn(),
  moreError: false,
  messages: [{ id: "answer" }],
  threads: [{ id: "1", title: "Матрицы" }],
};
vi.mock("#web/shared/chat/session/context.tsx", () => ({ useChat: () => history }));

const header = () => <ChatPanelHeader historyOpen onClose={vi.fn()} onToggleHistory={vi.fn()} />;

it("loads older chats near the bottom and offers a manual retry on failure", () => {
  const view = render(header());
  const menu = screen.getByRole("group", { name: "История чатов" });
  Object.defineProperties(menu, { clientHeight: { value: 260 }, scrollHeight: { value: 680 } });
  fireEvent.scroll(menu, { target: { scrollTop: 100 } });
  expect(history.loadMore).not.toHaveBeenCalled();
  fireEvent.scroll(menu, { target: { scrollTop: 400 } });
  expect(history.loadMore).toHaveBeenCalledTimes(1);
  history.isLoadingMore = true;
  view.rerender(header());
  expect(screen.getByRole("status")).toHaveTextContent("Загружаем чаты");
  history.isLoadingMore = false;
  history.moreError = true;
  view.rerender(header());
  fireEvent.scroll(menu);
  expect(history.loadMore).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Повторить загрузку" }));
  expect(history.loadMore).toHaveBeenCalledTimes(2);
});

it("keeps navigation available during a response and closes history for a new chat", () => {
  history.isStreaming = true;
  const onToggleHistory = vi.fn();
  render(<ChatPanelHeader historyOpen onClose={vi.fn()} onToggleHistory={onToggleHistory} />);
  expect(screen.getByRole("button", { name: "История чатов" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "Матрицы" })).toBeEnabled();
  const newChat = screen.getByRole("button", { name: "Новый чат" });
  expect(newChat).toBeEnabled();
  fireEvent.click(newChat);
  expect(history.newChat).toHaveBeenCalledOnce();
  expect(onToggleHistory).toHaveBeenCalledOnce();
});

it("dismisses history on an outside pointer while leaving inside and trigger interactions alone", () => {
  const onToggleHistory = vi.fn();
  render(<ChatPanelHeader historyOpen onClose={vi.fn()} onToggleHistory={onToggleHistory} />);
  fireEvent.pointerDown(screen.getByRole("group", { name: "История чатов" }));
  fireEvent.pointerDown(screen.getByRole("button", { name: "История чатов" }));
  expect(onToggleHistory).not.toHaveBeenCalled();
  fireEvent.pointerDown(document.body);
  expect(onToggleHistory).toHaveBeenCalledOnce();
});

it("dismisses history with Escape and returns focus to its trigger", () => {
  const onToggleHistory = vi.fn();
  render(<ChatPanelHeader historyOpen onClose={vi.fn()} onToggleHistory={onToggleHistory} />);
  fireEvent.keyDown(document, { key: "Escape" });
  expect(onToggleHistory).toHaveBeenCalledOnce();
  expect(screen.getByRole("button", { name: "История чатов" })).toHaveFocus();
});
