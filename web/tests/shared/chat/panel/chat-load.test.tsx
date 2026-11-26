import { afterEach, beforeEach, expect, it, vi } from "vitest";

const RUNTIME_MODULE = "#web/shared/chat/runtime.tsx";

/**
The loader keeps its state in the module, so each test gets fresh modules (React and Testing
Library included, or the components would run on a second copy of React).
*/
const setup = async () => {
  vi.resetModules();
  vi.stubEnv("VITE_CHAT_API_URL", "https://api.test");
  vi.stubGlobal("matchMedia", () => ({
    addEventListener: vi.fn(),
    matches: false,
    removeEventListener: vi.fn(),
  }));
  let deployed: string | undefined;
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
      deployed === undefined
        ? Promise.reject(new TypeError("Failed to fetch"))
        : Promise.resolve(Response.json({ id: deployed })),
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
    /** The build id `version.json` answers with; none: the check fails. */
    setDeployed: (id: string | undefined) => {
      deployed = id;
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

const FAILURE = "Не удалось загрузить чат";

it("opens a skeleton shell at once and swaps it for the panel when the chunk arrives", async () => {
  const { act, cleanup, fireEvent, runtime, screen, toggle } = await setup();
  runtime.canLoad = true;
  fireEvent.click(toggle);
  const shell = screen.getByRole("complementary", { name: "Чат с ИИ" });
  expect(shell).toHaveAttribute("aria-busy", "true");
  expect(screen.getByRole("status")).toHaveTextContent("Загружаю чат");
  expect(toggle).not.toHaveAttribute("aria-busy");
  expect(await screen.findByText("Панель чата")).toBeInTheDocument();
  expect(shell).not.toBeInTheDocument();
  expect(screen.queryByText("Загружаю чат")).toBeNull();
  await act(async () => {
    await Promise.resolve();
  });
  cleanup();
});

it("shows a centered failure with a retry when the chunk fails, and opens the chat after it", async () => {
  const { cleanup, fireEvent, runtime, screen, toggle } = await setup();
  fireEvent.click(toggle);
  expect(await screen.findByRole("alert")).toHaveTextContent(FAILURE);
  expect(screen.getByText("Проверь подключение и попробуй еще раз")).toBeInTheDocument();
  expect(screen.getByRole("complementary", { name: "Чат с ИИ" })).toHaveAttribute(
    "aria-busy",
    "false",
  );
  runtime.canLoad = true;
  fireEvent.click(screen.getByRole("button", { name: "Повторить" }));
  expect(await screen.findByText("Панель чата")).toBeInTheDocument();
  expect(screen.queryByText(FAILURE)).toBeNull();
  expect(screen.getByTestId("open-probe")).toHaveTextContent("open");
  cleanup();
});

it("offers a reload when version.json names another build", async () => {
  const { cleanup, fireEvent, screen, setDeployed, toggle } = await setup();
  setDeployed("a-newer-build");
  fireEvent.click(toggle);
  expect(await screen.findByRole("button", { name: "Обновить страницу" })).toBeInTheDocument();
  expect(screen.getByText("Похоже, вышла новая версия сайта")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Повторить" })).toBeNull();
  cleanup();
});

it("keeps offering a retry while version.json names this build, however many retries fail", async () => {
  const { cleanup, fireEvent, screen, setDeployed, toggle } = await setup();
  setDeployed(import.meta.env.BUILD_TIME);
  fireEvent.click(toggle);
  for (let retry = 0; retry < 3; retry += 1) {
    fireEvent.click(await screen.findByRole("button", { name: "Повторить" }));
    await vi.waitFor(() => {
      expect(screen.getByRole("button", { name: "Повторить" })).toBeInTheDocument();
    });
  }
  expect(screen.queryByRole("button", { name: "Обновить страницу" })).toBeNull();
  cleanup();
});

it("keeps offering a retry when the version check itself fails", async () => {
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
    await screen.findByText("Нет сети. Чат откроется, когда связь вернется"),
  ).toBeInTheDocument();
  runtime.canLoad = true;
  setOnline(true);
  await act(async () => {
    globalThis.dispatchEvent(new Event("online"));
    await Promise.resolve();
  });
  expect(await screen.findByText("Панель чата")).toBeInTheDocument();
  cleanup();
});

it.each(["Escape", "the close button"])(
  "closes the shell with %s and drops the wish to open",
  async (how) => {
    const { act, cleanup, fireEvent, runtime, screen, toggle } = await setup();
    fireEvent.click(toggle);
    await screen.findByRole("button", { name: "Повторить" });
    if (how === "Escape") {
      fireEvent.keyDown(document, { key: "Escape" });
    } else {
      fireEvent.click(screen.getByRole("button", { name: "Закрыть чат" }));
    }
    expect(screen.queryByRole("complementary")).toBeNull();
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    runtime.canLoad = true;
    await act(async () => {
      globalThis.dispatchEvent(new Event("online"));
      await Promise.resolve();
    });
    expect(screen.queryByRole("complementary")).toBeNull();
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    cleanup();
  },
);
