import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";
import { expect, it, vi } from "vitest";

import {
  type ChatDocContext,
  type ChatMessage,
  type ChatTier,
  parseDocContext,
} from "#web/domain/chat.ts";

import { ChatCodeBlock } from "./chat-code-block.tsx";
import { BottomCaption } from "./chat-composer-plates.tsx";
import { ChatPanel } from "./chat-panel.tsx";
import { ChatResizeHandle } from "./chat-resize-handle.tsx";
import { applyMetaMessageIds, makeAssistantMsg, makeUserMsg } from "./chat-stream-helpers.ts";
import { ChatToggleButton } from "./chat-toggle-button.tsx";
import { SelectionAskButton } from "./selection-ask-button.tsx";

const state: { docContext: ChatDocContext; messages: readonly ChatMessage[]; tier: ChatTier } = {
  docContext: parseDocContext("/"),
  messages: [],
  tier: "guest",
};
vi.mock("./chat-context.tsx", () => ({
  TURNSTILE_HOST_ID: "turnstile",
  useChat: () => ({
    ...state,
    isConfigured: true,
    threads: [],
    user: { id: 1, name: "Albert" },
    degraded: { active: false },
  }),
}));
vi.mock("./chat-composer.tsx", () => ({ ChatComposer: () => null }));
vi.mock("./chat-ref-preview.tsx", () => ({ ChatRefPreview: () => null }));

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
  const url = "https://hse.nalinor.dev/calculus/quiz-o-symbols";
  expect(screen.getByText(url)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: `Копировать ссылку ${url}` }));
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
] as const)("shows the chat and scopes selection on %s", (path, material) => {
  state.docContext = parseDocContext(path);
  render(
    <>
      <ChatToggleButton />
      <SelectionAskButton />
    </>,
  );
  expect(screen.getByRole("button", { name: "Чат" })).toBeInTheDocument();
  const ask = screen.queryByRole("button", { name: "Спросить ИИ о выделенном фрагменте" });
  expect(ask !== null).toBe(material);
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
    state.tier = "external";
    const caption = <BottomCaption mode="composer" nowMs={0} rateRemainSec={0} />;
    const view = render(caption);
    expect(screen.getByRole("button", { name: "Сменить аккаунт" })).toBeVisible();
    state.tier = "internal";
    view.rerender(<BottomCaption mode="composer" nowMs={0} rateRemainSec={0} />);
    expect(screen.queryByText(/Вы вошли как/u)).toBeNull();
    expect(screen.queryByRole("button", { name: "Сменить аккаунт" })).toBeNull();
  } finally {
    state.tier = "guest";
  }
});
