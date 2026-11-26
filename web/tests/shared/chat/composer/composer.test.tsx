import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

import type { ChatContextValue } from "#web/shared/chat/session/types.ts";

import { ChatComposer } from "#web/shared/chat/composer/composer.tsx";
import { makeAssistantMsg } from "#web/shared/chat/stream/helpers.ts";

type ComposerState = { -readonly [Key in keyof ChatContextValue]: ChatContextValue[Key] };

const { state } = vi.hoisted(() => ({
  state: {
    maxQuestionChars: 2000,
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
  } as unknown as ComposerState,
}));
vi.mock("#web/shared/chat/session/context.tsx", () => ({ useChat: () => state }));
beforeEach(() => {
  Object.assign(state, {
    maxQuestionChars: 2000,
    draft: "",
    isStreaming: false,
    quote: null,
    block: null,
    contextLimited: false,
    rateLimitUntil: 0,
    messages: [
      {
        ...makeAssistantMsg({ course: "", docId: "" }),
        id: "a",
        runId: "r",
        status: "done",
        suggestion: "Объясни подробнее",
      },
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
  expect(screen.getByText(/Ты вошел как Albert/u)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Сменить аккаунт" })).toBeEnabled();
  expect(screen.queryByText(/У студентов 1 курса/u)).not.toBeInTheDocument();
});

it("resizes when a long suggestion arrives without a draft change", () => {
  const height = vi
    .spyOn(HTMLTextAreaElement.prototype, "scrollHeight", "get")
    .mockImplementation(function (this: HTMLTextAreaElement) {
      return this.placeholder.length > 30 ? 100 : 24;
    });
  state.isStreaming = true;
  const view = render(<ChatComposer />);
  const input = screen.getByRole("textbox");
  expect(input).toHaveStyle({ height: "24px" });
  state.isStreaming = false;
  state.messages = [
    {
      ...makeAssistantMsg({ course: "", docId: "" }),
      id: "new",
      runId: "new",
      role: "assistant",
      status: "done",
      suggestion: "Какие правила блокирующего экзамена по алгебре?",
    },
  ] as ChatContextValue["messages"];
  view.rerender(<ChatComposer />);
  expect(input).toHaveStyle({ height: "100px" });
  height.mockRestore();
});

it("counts the trimmed question near the active limit and blocks excess text on Enter", () => {
  Object.assign(state, { maxQuestionChars: 10, draft: "пять" });
  const view = render(<ChatComposer />);
  const input = screen.getByRole("textbox");
  expect(input).not.toHaveAttribute("aria-describedby");
  state.draft = " 1234567890 ";
  view.rerender(<ChatComposer />);
  expect(input).toHaveAccessibleDescription("10 / 10");
  expect(screen.getByRole("button", { name: "Отправить" })).toBeEnabled();
  state.draft = " 12345678901 ";
  view.rerender(<ChatComposer />);
  expect(input).toHaveAccessibleDescription("11 / 10");
  expect(input).toHaveAttribute("aria-invalid", "true");
  expect(screen.getByRole("button", { name: "Отправить" })).toBeDisabled();
  fireEvent.keyDown(input, { key: "Enter" });
  expect(state.send).not.toHaveBeenCalled();
});
it("lets a question go while the browser is checked after login, without captions under the box", () => {
  Object.assign(state, { checkingLogin: true, draft: "Вопрос" });
  const view = render(<ChatComposer />);
  expect(screen.queryByText(/Проверяю браузер/u)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Отправить" }));
  expect(state.send).toHaveBeenCalledOnce();
  Object.assign(state, { checkingLogin: false, verificationError: true });
  view.rerender(<ChatComposer />);
  expect(screen.queryByText(/повторим проверку/u)).toBeNull();
  Object.assign(state, { verificationError: false });
});

/** A device whose main input is a finger (phone, tablet): `(hover: none) and (pointer: coarse)` matches. */
const stubTouchDevice = (isTouch: boolean) => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: isTouch && query.includes("(hover: none)") && query.includes("(pointer: coarse)"),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
};

it("Enter sends from a hardware keyboard", () => {
  stubTouchDevice(false);
  state.draft = "Вопрос";
  render(<ChatComposer />);
  const isNotPrevented = fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
  expect(isNotPrevented).toBe(false);
  expect(state.send).toHaveBeenCalledOnce();
  vi.unstubAllGlobals();
});

it("Enter on a phone keyboard starts a new line: a question goes only with the send button", () => {
  stubTouchDevice(true);
  state.draft = "Вопрос";
  render(<ChatComposer />);
  const isNotPrevented = fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
  expect(isNotPrevented).toBe(true);
  expect(state.send).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});
