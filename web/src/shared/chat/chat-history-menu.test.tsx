import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import { ChatPanelHeader } from "./chat-panel-parts.tsx";

const history = {
  hasMore: true,
  isLoadingMore: false,
  loadMore: vi.fn(),
  moreError: false,
  messages: [],
  threads: [{ id: "1", title: "Матрицы" }],
};
vi.mock("./chat-context.tsx", () => ({ useChat: () => history }));

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
