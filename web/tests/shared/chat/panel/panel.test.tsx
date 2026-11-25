import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, expect, it, vi } from "vitest";

import {
  type ChatDocContext,
  type ChatMessage,
  type ChatTier,
  parseDocContext,
} from "#web/domain/chat/model.ts";
import { BottomCaption } from "#web/shared/chat/composer/composer-plates.tsx";
import { ChatCodeBlock } from "#web/shared/chat/messages/code-block.tsx";
import { ChatMessageView } from "#web/shared/chat/messages/message-view.tsx";
import responseVerbs from "#web/shared/chat/messages/response-verbs.json";
import { ChatPanel } from "#web/shared/chat/panel/panel.tsx";
import { ChatPanelHeader } from "#web/shared/chat/panel/parts.tsx";
import { ChatResizeHandle } from "#web/shared/chat/panel/resize-handle.tsx";
import { ChatToggleButton } from "#web/shared/chat/panel/toggle-button.tsx";
import { TurnstileModal } from "#web/shared/chat/panel/turnstile-modal.tsx";
import { SelectionAskButton } from "#web/shared/chat/selection/ask-button.tsx";
import {
  applyMetaMessageIds,
  makeAssistantMsg,
  makeUserMsg,
} from "#web/shared/chat/stream/helpers.ts";

afterEach(() => vi.unstubAllEnvs());

const state: {
  docContext: ChatDocContext;
  messages: readonly ChatMessage[];
  tier: ChatTier;
  isThreadLoading?: boolean;
  isCheckingBrowser?: boolean;
  isStreaming?: boolean;
  canStop?: boolean;
} = {
  docContext: parseDocContext("/"),
  messages: [],
  tier: "guest",
};
vi.mock("#web/shared/chat/session/context.tsx", () => ({
  TURNSTILE_HOST_ID: "turnstile",
  useChat: () => ({
    ...state,
    isConfigured: true,
    threads: [],
    user: { id: 1, name: "Albert" },
    degraded: { active: false },
  }),
}));
vi.mock("#web/shared/chat/composer/composer.tsx", () => ({ ChatComposer: () => null }));
vi.mock("#web/shared/chat/messages/ref-preview.tsx", () => ({
  ChatRefPreview: () => null,
}));

it("keeps the user bubble mounted when the server assigns message IDs", () => {
  HTMLElement.prototype.scrollTo = vi.fn();
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  state.messages = [
    makeUserMsg("вопрос", null, state.docContext),
    makeAssistantMsg(state.docContext),
  ];
  const client = new QueryClient();
  const panel = () => (
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <ChatPanel />
      </QueryClientProvider>
    </MemoryRouter>
  );
  const view = render(panel());
  const bubble = screen.getByText("вопрос");
  state.messages = applyMetaMessageIds(state.messages, {
    assistantId: "assistant",
    runId: "run",
    userId: "user",
  });
  view.rerender(panel());
  expect(screen.getByText("вопрос")).toBe(bubble);
  expect(state.messages[0]?.id).toBe("user");
  vi.unstubAllGlobals();
});

it("shows regeneration only for the latest answer while keeping both copy buttons", () => {
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  state.messages = ["Первый", "Второй"].flatMap((text) => [
    makeUserMsg(text, null, state.docContext),
    { ...makeAssistantMsg(state.docContext), status: "done" as const, contentTex: text },
  ]);
  try {
    render(
      <MemoryRouter>
        <QueryClientProvider client={new QueryClient()}>
          <ChatPanel />
        </QueryClientProvider>
      </MemoryRouter>,
    );
    expect(screen.getAllByRole("button", { name: "Скопировать ответ" })).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Ответить заново" })).toBeEnabled();
  } finally {
    vi.unstubAllGlobals();
  }
});

it("shows and copies the agent link without a trailing slash", () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("navigator", { clipboard: { writeText } });
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  state.messages = [];
  render(
    <MemoryRouter initialEntries={["/calculus/quiz-o-symbols/"]}>
      <QueryClientProvider client={new QueryClient()}>
        <ChatPanel />
      </QueryClientProvider>
    </MemoryRouter>,
  );
  const url = `${globalThis.location.origin}/calculus/quiz-o-symbols`;
  // The field shows the address without the scheme; the copy is the full URL.
  expect(screen.getByText(url.replace(/^https?:\/\//u, ""))).toBeInTheDocument();
  expect(
    screen.getByRole("group", { name: "Ссылка для ChatGPT, Claude и других" }),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Копировать ссылку" }));
  expect(writeText).toHaveBeenCalledWith(url);
  vi.unstubAllGlobals();
});

it("highlights streamed C code and copies its original text", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("navigator", { clipboard: { writeText } });
  const view = render(<ChatCodeBlock code="int" lang="c" />);
  const code = 'int main() { puts("<b>"); return 0; }';
  view.rerender(<ChatCodeBlock code={code} lang="C" />);
  await waitFor(() => {
    expect(screen.getByText("int")).toHaveAttribute("data-syntax", "kwd");
  });
  expect(view.container.querySelector("code")?.textContent).toBe(code);
  fireEvent.click(screen.getByRole("button", { name: "Скопировать код" }));
  expect(writeText).toHaveBeenCalledWith(code);
  vi.unstubAllGlobals();
});

it("resizes the panel from its left edge and remembers the width", () => {
  const view = render(
    <aside>
      <ChatResizeHandle />
    </aside>,
  );
  const panel = screen.getByRole("complementary");
  const handle = screen.getByRole("button", { name: "Изменить ширину чата" });
  vi.spyOn(panel, "getBoundingClientRect").mockReturnValue(new DOMRect(624, 0, 400, 768));
  Object.defineProperties(handle, {
    setPointerCapture: { value: vi.fn() },
    hasPointerCapture: { value: () => true },
  });
  vi.spyOn(document.documentElement, "clientWidth", "get").mockReturnValue(1024);
  fireEvent.pointerDown(handle, { button: 0, clientX: 624, isPrimary: true, pointerId: 1 });
  fireEvent.pointerMove(handle, { clientX: 524, pointerId: 1 });
  fireEvent.lostPointerCapture(handle, { pointerId: 1 });
  expect(localStorage.getItem("hse_chat_width")).toBe("500px");
  view.unmount();
  document.documentElement.style.removeProperty("--chat-preferred-width");
  render(<ChatResizeHandle />);
  expect(document.documentElement.style.getPropertyValue("--chat-preferred-width")).toBe("500px");
  localStorage.removeItem("hse_chat_width");
  document.documentElement.style.removeProperty("--chat-preferred-width");
  vi.restoreAllMocks();
});

it.each([
  ["/", false],
  ["/discrete", false],
  ["/algebra/program", true],
  ["/calculus/kr1", true],
  ["/aiya/04_nov24_integer_operations", true],
] as const)("shows the chat and scopes selection on %s", async (path, material) => {
  vi.stubEnv("VITE_CHAT_API_URL", "https://api.test");
  state.docContext = parseDocContext(path);
  render(
    <>
      <div className="prose-notes">
        <p>Выделенный фрагмент конспекта</p>
      </div>
      <ChatToggleButton />
      <SelectionAskButton />
    </>,
  );
  expect(screen.getByRole("button", { name: "Чат" })).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Спросить в чате о выделенном фрагменте" }),
  ).toBeNull();
  const range = document.createRange();
  range.selectNodeContents(screen.getByText("Выделенный фрагмент конспекта"));
  Object.defineProperty(range, "getClientRects", { value: () => [new DOMRect(100, 80, 120, 20)] });
  const selection = globalThis.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  fireEvent.mouseUp(document);
  await waitFor(() => {
    const ask = screen.queryByRole("button", { name: "Спросить в чате о выделенном фрагменте" });
    expect(ask !== null).toBe(material);
  });
  selection?.removeAllRanges();
});

const LocationProbe = () => {
  const location = useLocation();
  return (
    <output>
      {location.pathname}
      {location.hash}
    </output>
  );
};

it("opens the owning lecture for a historical local-only citation", async () => {
  const anchor = "thm:lec05:equiv";
  const client = new QueryClient();
  client.setQueryData(["labels"], { discrete: { [anchor]: { weekId: "05_equivalence" } } });
  state.docContext = parseDocContext("/discrete/06_sets");
  state.messages = [
    {
      ...makeAssistantMsg(parseDocContext("/discrete/05_equivalence")),
      status: "done",
      contentTex: `[теорема](#${anchor})`,
    },
  ];
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  try {
    render(
      <MemoryRouter initialEntries={["/discrete/06_sets"]}>
        <QueryClientProvider client={client}>
          <ChatPanel />
          <LocationProbe />
        </QueryClientProvider>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByText("теорема"));
    expect(await screen.findByText(`/discrete/05_equivalence#${anchor}`)).toBeInTheDocument();
  } finally {
    vi.unstubAllGlobals();
  }
});

it.each(["", "/algebra/exam1"])(
  "opens the exam overview from a saved citation with path %s",
  (path) => {
    state.docContext = parseDocContext("/algebra/exam1");
    state.messages = [
      {
        ...makeAssistantMsg(state.docContext),
        status: "done",
        contentTex: `[об экзамене](${path}#sec:exam1:${encodeURIComponent("об-экзамене")})`,
      },
    ];
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    try {
      const view = render(
        <MemoryRouter initialEntries={["/algebra/exam1"]}>
          <QueryClientProvider client={new QueryClient()}>
            <section id="об-экзамене">
              <h1>Об экзамене</h1>
            </section>
            <ChatPanel />
          </QueryClientProvider>
        </MemoryRouter>,
      );
      const scroll = vi.fn();
      const section = view.getByRole("heading", { name: "Об экзамене" }).parentElement;
      if (section === null) {
        throw new Error("Missing exam section");
      }
      section.scrollIntoView = scroll;
      fireEvent.click(screen.getByText("об экзамене", { exact: true }));
      expect(scroll).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  },
);

it("shows the account switch caption only for an external account", () => {
  try {
    state.tier = "default";
    const caption = <BottomCaption mode="composer" nowMs={0} rateRemainSec={0} />;
    const view = render(caption);
    expect(screen.getByRole("button", { name: "Сменить аккаунт" })).toBeVisible();
    state.tier = "student";
    view.rerender(<BottomCaption mode="composer" nowMs={0} rateRemainSec={0} />);
    expect(screen.queryByText(/Твой аккаунт —/u)).toBeNull();
    expect(screen.queryByRole("button", { name: "Сменить аккаунт" })).toBeNull();
  } finally {
    state.tier = "guest";
  }
});

it("replaces stale messages with accessible skeletons until history is ready", () => {
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  state.messages = [
    { ...makeAssistantMsg(state.docContext), status: "done", contentTex: "Old answer" },
  ];
  state.isThreadLoading = true;
  const panel = (
    <MemoryRouter>
      <QueryClientProvider client={new QueryClient()}>
        <ChatPanel />
      </QueryClientProvider>
    </MemoryRouter>
  );
  try {
    const view = render(panel);
    expect(screen.getByRole("status", { name: "Загрузка переписки" })).toHaveAttribute(
      "aria-busy",
      "true",
    );
    expect(screen.queryByText("Old answer")).toBeNull();
    state.isThreadLoading = false;
    view.rerender(
      <MemoryRouter>
        <QueryClientProvider client={new QueryClient()}>
          <ChatPanel />
        </QueryClientProvider>
      </MemoryRouter>,
    );
    expect(screen.queryByRole("status", { name: "Загрузка переписки" })).toBeNull();
    expect(screen.getByText("Old answer")).toBeVisible();
  } finally {
    state.isThreadLoading = false;
    vi.unstubAllGlobals();
  }
});

const statusPanel = () => (
  <MemoryRouter>
    <QueryClientProvider client={new QueryClient()}>
      <ChatPanel />
    </QueryClientProvider>
  </MemoryRouter>
);

it("rotates response words every five seconds while browser and background statuses stay fixed", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  const random = vi.spyOn(Math, "random").mockReturnValue(0);
  state.messages = [makeAssistantMsg(state.docContext)];
  state.isCheckingBrowser = true;
  try {
    const view = render(statusPanel());
    const status = screen.getByText("Проверяю браузер…");
    await act(() => vi.advanceTimersByTime(10_000));
    expect(screen.getByText("Проверяю браузер…")).toBe(status);
    expect(status).toHaveClass("ai-steps-sum");
    expect(status.closest(".ai-steps")).toHaveClass("is-run");
    state.isCheckingBrowser = false;
    view.rerender(statusPanel());
    expect(screen.getByText(`${responseVerbs[0]}…`)).toBe(status);
    random.mockReturnValue(0.999);
    view.rerender(statusPanel());
    expect(screen.getByText(`${responseVerbs[0]}…`)).toBe(status);
    await act(() => vi.advanceTimersByTime(4999));
    expect(screen.getByText(`${responseVerbs[0]}…`)).toBe(status);
    await act(() => vi.advanceTimersByTime(1));
    expect(screen.getByText(`${responseVerbs.at(-1)}…`)).toBe(status);
    await act(() => vi.advanceTimersByTime(5000));
    expect(screen.getByText(`${responseVerbs.at(-2)}…`)).toBe(status);
    state.isStreaming = true;
    state.canStop = false;
    state.messages = state.messages.map((message) => ({
      ...message,
      contentTex: "Частичный ответ",
    }));
    view.rerender(statusPanel());
    expect(screen.getByText("Отвечаю в фоне…")).toBe(status);
    await act(() => vi.advanceTimersByTime(10_000));
    expect(screen.getByText("Отвечаю в фоне…")).toBe(status);
    expect(view.baseElement.querySelector(".ai-answer")).toHaveTextContent("Частичный ответ");
    state.canStop = true;
    state.messages = [makeAssistantMsg(state.docContext)];
    view.rerender(statusPanel());
    expect(screen.getByText(`${responseVerbs.at(-1)}…`)).toBeVisible();
    view.unmount();
  } finally {
    vi.useRealTimers();
    random.mockRestore();
    state.isCheckingBrowser = false;
    state.isStreaming = false;
    state.canStop = true;
    vi.unstubAllGlobals();
  }
});

it("keeps the Turnstile host and iframe mounted while toggling modal visibility", () => {
  const cancel = vi.fn();
  const view = render(<TurnstileModal cancelTurnstile={cancel} turnstileOpen={false} />);
  const host = document.querySelector("#hse-turnstile-host");
  const iframe = document.createElement("iframe");
  host?.append(iframe);
  expect(host?.closest(".ai-modal")).toHaveAttribute("inert");
  view.rerender(<TurnstileModal cancelTurnstile={cancel} turnstileOpen />);
  expect(document.querySelector("#hse-turnstile-host")).toBe(host);
  expect(host?.firstChild).toBe(iframe);
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  view.rerender(<TurnstileModal cancelTurnstile={cancel} turnstileOpen={false} />);
  expect(host?.firstChild).toBe(iframe);
  expect(host?.closest(".ai-modal")).toHaveAttribute("aria-hidden", "true");
});

it("keeps a restored account signed in even if its cached tier is unknown", () => {
  state.tier = "guest";
  render(<ChatPanelHeader historyOpen={false} onClose={vi.fn()} onToggleHistory={vi.fn()} />);
  expect(screen.queryByRole("button", { name: "Войти" })).not.toBeInTheDocument();
});

it("shows a safe reason and one retry for an empty incomplete response", () => {
  const errorMessage = "Соединение с моделью оборвалось. Код: upstream_eof.";
  render(
    <ChatMessageView
      canRetry
      message={{ ...makeAssistantMsg(state.docContext), status: "incomplete", errorMessage }}
      onJumpToBlock={vi.fn()}
      onRetry={vi.fn()}
    />,
  );
  expect(screen.getByText(errorMessage)).toBeVisible();
  expect(screen.getByRole("button", { name: "Повторить" })).toBeEnabled();
  expect(screen.queryByRole("button", { name: "Ответить заново" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Скопировать ответ" })).not.toBeInTheDocument();
});
