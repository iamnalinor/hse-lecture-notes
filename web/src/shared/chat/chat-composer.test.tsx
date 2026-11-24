import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

import type { ChatContextValue } from "./chat-context.tsx";

import { ChatComposer } from "./chat-composer.tsx";

const { state } = vi.hoisted(() => ({
  state: {
    draft: "",
    messages: [] as unknown[],
    send: vi.fn(),
    setDraft: vi.fn(),
    switchAccount: vi.fn(),
    block: null,
    degraded: { active: false },
    isStreaming: false,
    isThreadLoading: false,
    isLoginBusy: false,
    isOpen: true,
    canStop: false,
    quote: null,
    rateLimitUntil: 0,
    contextLimited: false,
    tier: "default",
    user: { id: 1, name: "Albert" },
    activeThreadId: "t",
  } as unknown as ChatContextValue,
}));
vi.mock("./chat-context.tsx", () => ({ useChat: () => state }));
beforeEach(() => {
  Object.assign(state, {
    draft: "",
    isStreaming: false,
    quote: null,
    block: null,
    contextLimited: false,
    rateLimitUntil: 0,
    messages: [
      { id: "a", runId: "r", role: "assistant", status: "done", suggestion: "Объясни подробнее" },
    ],
  });
  vi.clearAllMocks();
});
it("Tab inserts suggestion without sending; accepted suggestion stays consumed", () => {
  const view = render(<ChatComposer />);
  const input = screen.getByRole("textbox");
  expect(input).toHaveAttribute("placeholder", "Объясни подробнее");
  fireEvent.keyDown(input, { key: "Tab" });
  expect(state.setDraft).toHaveBeenCalledWith("Объясни подробнее");
  expect(state.send).not.toHaveBeenCalled();
  view.rerender(<ChatComposer />);
  expect(input).not.toHaveAttribute("placeholder", "Объясни подробнее");
});
it("Shift+Tab, composing Tab and Enter do not accept a placeholder", () => {
  render(<ChatComposer />);
  const input = screen.getByRole("textbox");
  fireEvent.keyDown(input, { key: "Tab", shiftKey: true });
  fireEvent.keyDown(input, { key: "Tab", isComposing: true });
  fireEvent.keyDown(input, { key: "Enter" });
  expect(state.setDraft).not.toHaveBeenCalled();
  expect(state.send).not.toHaveBeenCalled();
});
it("default identity remains available with one long-thread warning", () => {
  Object.assign(state, { contextLimited: true });
  render(<ChatComposer />);
  expect(
    screen.getByText("Чат слишком длинный, качество снижено. Рекомендуем создать новый чат"),
  ).toBeInTheDocument();
  expect(screen.getByText(/Вы вошли как Albert/u)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Сменить аккаунт" })).toBeEnabled();
  expect(screen.queryByText(/У студентов 1 курса/u)).not.toBeInTheDocument();
});
