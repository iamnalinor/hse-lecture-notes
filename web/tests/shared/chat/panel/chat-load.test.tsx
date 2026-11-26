import { afterEach, beforeEach, expect, it, vi } from "vitest";

const RUNTIME_MODULE = "#web/shared/chat/runtime.tsx";

/**
The loader keeps its state in the module, so each test gets fresh modules (React and Testing
Library included, or the components would run on a second copy of React).
*/
const setup = async () => {
  vi.resetModules();
  vi.stubEnv("VITE_CHAT_API_URL", "https://api.test");
  let isReachable = false;
  const runtime = { attempts: 0, canLoad: false };
  vi.doMock(RUNTIME_MODULE, () => {
    runtime.attempts += 1;
    if (!runtime.canLoad) {
      throw new Error("Failed to fetch dynamically imported module");
    }
    return { ChatRuntime: () => <div>Панель чата</div> };
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      isReachable
        ? Promise.resolve(new Response(null, { status: 404 }))
        : Promise.reject(new TypeError("Failed to fetch")),
    ),
  );
  const { act, cleanup, fireEvent, render, screen } = await import("@testing-library/react");
  const { MemoryRouter } = await import("react-router");
  const { LazyChat } = await import("#web/app/lazy-chat.tsx");
  const { ChatToggleButton } = await import("#web/shared/chat/panel/toggle-button.tsx");
  const { useIsChatOpen } = await import("#web/shared/chat/open-state.ts");
  const OpenProbe = () => (
    <span data-testid="open-probe">{useIsChatOpen() ? "open" : "closed"}</span>
  );
  render(
    <MemoryRouter>
      <ChatToggleButton />
      <LazyChat />
      <OpenProbe />
    </MemoryRouter>,
  );
  return {
    act,
    cleanup,
    fireEvent,
    runtime,
    screen,
    toggle: screen.getByRole("button", { name: "Чат" }),
    setReachable: (isNowReachable: boolean) => {
      isReachable = isNowReachable;
    },
  };
};

const setOnline = (isOnline: boolean) =>
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(isOnline);

beforeEach(() => {
  setOnline(true);
});
afterEach(() => {
  vi.doUnmock(RUNTIME_MODULE);
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("starts the download on hover and focus, before the click", async () => {
  const { cleanup, fireEvent, runtime, toggle } = await setup();
  runtime.canLoad = true;
  fireEvent.pointerEnter(toggle);
  await vi.waitFor(() => {
    expect(runtime.attempts).toBe(1);
  });
  fireEvent.focus(toggle);
  fireEvent.pointerDown(toggle);
  expect(runtime.attempts).toBe(1);
  cleanup();
});

it("marks the button busy while the chunk downloads and shows the panel after", async () => {
  const { act, cleanup, fireEvent, runtime, screen, toggle } = await setup();
  runtime.canLoad = true;
  fireEvent.click(toggle);
  expect(toggle).toHaveAttribute("aria-busy", "true");
  expect(toggle).toHaveAccessibleName("Чат");
  expect(await screen.findByText("Панель чата")).toBeInTheDocument();
  expect(toggle).not.toHaveAttribute("aria-busy");
  await act(async () => {
    await Promise.resolve();
  });
  expect(screen.queryByText("Открываю чат…")).toBeNull();
  cleanup();
});

it("offers a retry when the chunk fails, and opens the chat after it", async () => {
  const { cleanup, fireEvent, runtime, screen, toggle } = await setup();
  fireEvent.click(toggle);
  expect(await screen.findByRole("status")).toHaveTextContent("Чат не загрузился: нет связи.");
  expect(toggle).not.toHaveAttribute("aria-busy");
  runtime.canLoad = true;
  fireEvent.click(screen.getByRole("button", { name: "Повторить" }));
  expect(await screen.findByText("Панель чата")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Повторить" })).toBeNull();
  expect(screen.getByTestId("open-probe")).toHaveTextContent("open");
  cleanup();
});

it("offers a reload when a retry fails while the site answers", async () => {
  const { cleanup, fireEvent, screen, setReachable, toggle } = await setup();
  setReachable(true);
  fireEvent.click(toggle);
  fireEvent.click(await screen.findByRole("button", { name: "Повторить" }));
  expect(await screen.findByRole("button", { name: "Обновить страницу" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Повторить" })).toBeNull();
  cleanup();
});

it("keeps offering a retry when the second failure comes with no answer from the site", async () => {
  const { cleanup, fireEvent, screen, toggle } = await setup();
  fireEvent.click(toggle);
  fireEvent.click(await screen.findByRole("button", { name: "Повторить" }));
  await vi.waitFor(() => {
    expect(screen.getByRole("button", { name: "Повторить" })).toBeInTheDocument();
  });
  cleanup();
});

it("waits for the network when offline and opens the chat when it returns", async () => {
  const { act, cleanup, fireEvent, runtime, screen, toggle } = await setup();
  setOnline(false);
  fireEvent.click(toggle);
  expect(
    await screen.findAllByText("Нет сети — открою чат, когда связь вернётся."),
  ).not.toHaveLength(0);
  runtime.canLoad = true;
  setOnline(true);
  await act(async () => {
    globalThis.dispatchEvent(new Event("online"));
    await Promise.resolve();
  });
  expect(await screen.findByText("Панель чата")).toBeInTheDocument();
  cleanup();
});

it("closes on Escape and drops the wish to open, so the return of the network does nothing", async () => {
  const { act, cleanup, fireEvent, runtime, screen, toggle } = await setup();
  fireEvent.click(toggle);
  await screen.findByRole("button", { name: "Повторить" });
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByRole("button", { name: "Повторить" })).toBeNull();
  expect(toggle).toHaveFocus();
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  runtime.canLoad = true;
  await act(async () => {
    globalThis.dispatchEvent(new Event("online"));
    await Promise.resolve();
  });
  expect(screen.queryByRole("button", { name: "Повторить" })).toBeNull();
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  cleanup();
});

it("closes on a press outside, but not on the button itself", async () => {
  const { cleanup, fireEvent, screen, toggle } = await setup();
  fireEvent.click(toggle);
  await screen.findByRole("button", { name: "Повторить" });
  fireEvent.pointerDown(toggle);
  expect(screen.getByRole("button", { name: "Повторить" })).toBeInTheDocument();
  fireEvent.pointerDown(document.body);
  expect(screen.queryByRole("button", { name: "Повторить" })).toBeNull();
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  cleanup();
});
