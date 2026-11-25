import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SearchEntry } from "#web/domain/schemas.ts";

import { HeaderSearch } from "#web/shared/search/header-search.tsx";

import { renderWithApp } from "../../support/render.tsx";

const INDEX: readonly SearchEntry[] = [
  {
    anchor: "thm:lec04:laplace",
    course: "algebra",
    doc: "04_sep23_determinant_properties",
    heading: "Теорема 4.3 (разложение Лапласа)",
    lecture: 4,
    text: "Определитель равен сумме произведений.",
  },
  {
    anchor: "sec:minors",
    course: "algebra",
    doc: "theory",
    heading: "Миноры",
    lecture: 0,
    text: "Минор порядка $k$.",
  },
  {
    anchor: "автомат",
    course: "discrete",
    doc: "program",
    heading: "Автомат",
    lecture: 0,
    text: "Накопленная оценка не меньше 4.",
  },
  {
    anchor: "sec:kr1:cramer",
    course: "algebra",
    doc: "kr1",
    heading: "Формулы Крамера",
    lecture: 0,
    text: "Как решать систему по Крамеру.",
  },
  {
    anchor: "sec:colloq1:cauchy-heine",
    course: "calculus",
    doc: "colloq1",
    heading: "Предел функции по Коши и по Гейне",
    lecture: 0,
    text: "Равносильность определений Гейне.",
  },
];

const Location = () => {
  const { hash, pathname, search } = useLocation();
  return <output data-testid="location">{decodeURIComponent(pathname + search + hash)}</output>;
};

const MANY: readonly SearchEntry[] = Array.from({ length: 20 }, (_, index) => ({
  anchor: `sec:many-${String(index)}`,
  course: "calculus",
  doc: "theory",
  heading: `Ряд номер ${String(index)}`,
  lecture: 0,
  text: "Сходимость ряда.",
}));

const field = () => screen.getByRole("combobox", { name: "Поиск по конспектам" });

const mount = (route = "/") => {
  renderWithApp(
    <>
      <HeaderSearch />
      <Location />
    </>,
    route,
  );
  return field();
};

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>().mockImplementation(async () => {
      await Promise.resolve();
      return Response.json([...INDEX, ...MANY]);
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  globalThis.history.replaceState(null, "", "/");
});

describe("HeaderSearch", () => {
  it("is a field in the top bar, not a button that opens a dialog", () => {
    mount();
    expect(field()).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { hidden: true })).toBeNull();
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("finds a block by its number and opens it on Enter, then folds", async () => {
    await userEvent.type(mount(), "4.3");
    expect(await screen.findByRole("option")).toHaveTextContent("Алгебра · Лекция 4");
    await userEvent.keyboard("{Enter}");
    expect(screen.getByTestId("location")).toHaveTextContent(
      "/algebra/04_sep23_determinant_properties#thm:lec04:laplace",
    );
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(field()).toHaveValue("");
  });

  it("finds a word in the theory and highlights it", async () => {
    await userEvent.type(mount(), "миноры");
    const hits = await screen.findAllByRole("option");
    expect(hits.map((hit) => hit.textContent)).toStrictEqual([
      expect.stringContaining("Алгебра · Теория"),
    ]);
    expect(screen.getByText("Минор", { selector: "mark" })).toBeInTheDocument();
  });

  it("opens the program, test and colloquium pages from a hit", async () => {
    const input = mount();
    await userEvent.type(input, "автомат");
    expect(await screen.findByRole("option")).toHaveTextContent("Дискра · План учебной дисциплины");
    await userEvent.keyboard("{Enter}");
    expect(screen.getByTestId("location")).toHaveTextContent("/discrete/program#автомат");
    await userEvent.type(input, "крамеру");
    expect(await screen.findByRole("option")).toHaveTextContent("Алгебра · Подготовка к КР-1");
    await userEvent.keyboard("{Enter}");
    expect(screen.getByTestId("location")).toHaveTextContent("/algebra/kr1#sec:kr1:cramer");
    await userEvent.type(input, "гейне");
    expect(await screen.findByRole("option")).toHaveTextContent(
      "Матан · Подготовка к коллоквиуму 1",
    );
  });

  it("draws the first dozen hits and the rest on request", async () => {
    await userEvent.type(mount(), "ряд");
    expect(await screen.findAllByRole("option")).toHaveLength(12);
    await userEvent.click(screen.getByRole("button", { name: /Показать еще 8/u }));
    expect(screen.getAllByRole("option")).toHaveLength(20);
  });

  it("folds and clears on Esc, the focus stays in the field", async () => {
    await userEvent.type(mount(), "миноры");
    await screen.findByRole("option");
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(field()).toHaveValue("");
    expect(field()).toHaveFocus();
  });

  it("keeps the folded panel in the DOM, inert, so it can fade out", async () => {
    await userEvent.type(mount(), "миноры");
    await screen.findByRole("option");
    const panel = document.querySelector("[data-popover]");
    expect(panel).toHaveAttribute("data-state", "open");
    await userEvent.keyboard("{Escape}");
    expect(panel).toHaveAttribute("data-state", "closed");
    expect(panel).toHaveAttribute("aria-hidden", "true");
    expect(panel).toHaveAttribute("inert");
  });

  it("has a fixed width: it does not widen on focus", () => {
    mount();
    expect(field().closest("label")?.className).not.toMatch(/focus-within:w-/u);
  });

  it("folds on Esc from a button of the panel too", async () => {
    await userEvent.type(mount(), "ряд");
    await screen.findAllByRole("option");
    screen.getByRole("button", { name: /Показать еще/u }).focus();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(field()).toHaveFocus();
  });

  it("folds the panel when Tab leaves the search", async () => {
    renderWithApp(
      <>
        <HeaderSearch />
        <button type="button">Дальше</button>
      </>,
      "/",
    );
    await userEvent.type(field(), "миноры");
    await screen.findByRole("option");
    screen.getByRole("button", { name: "Дальше" }).focus();
    await waitFor(() => {
      expect(screen.queryByRole("listbox")).toBeNull();
    });
    expect(field()).toHaveValue("миноры");
  });

  it("on a phone unfolds from the magnifier over the bar and folds with «Отмена»", async () => {
    mount();
    expect(screen.queryByRole("button", { name: "Отмена" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Поиск" }));
    expect(field()).toHaveFocus();
    await userEvent.type(field(), "миноры");
    await screen.findByRole("option");
    await userEvent.click(screen.getByRole("button", { name: "Отмена" }));
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(screen.queryByRole("button", { name: "Отмена" })).toBeNull();
    expect(screen.getByRole("button", { name: "Поиск" })).toHaveFocus();
  });

  it("on a phone the folded field is not a Tab stop, and Esc returns to the magnifier", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      addEventListener: vi.fn<() => void>(),
      matches: query === "(width < 21rem)",
      removeEventListener: vi.fn<() => void>(),
    }));
    mount();
    expect(field()).toHaveAttribute("tabindex", "-1");
    await userEvent.click(screen.getByRole("button", { name: "Поиск" }));
    expect(field()).not.toHaveAttribute("tabindex");
    await userEvent.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: "Поиск" })).toHaveFocus();
  });

  it("keeps the query in the address, past the router, and drops it on Esc", async () => {
    globalThis.history.replaceState(null, "", "/discrete#x");
    await userEvent.type(mount("/discrete#x"), "миноры");
    expect(decodeURIComponent(globalThis.location.search)).toBe("?q=миноры");
    expect(globalThis.location.hash).toBe("#x");
    // the router does not navigate: no new location, no scroll back to #x on every key
    expect(screen.getByTestId("location").textContent).toBe("/discrete#x");
    await userEvent.keyboard("{Escape}");
    expect(globalThis.location.search).toBe("");
    expect(globalThis.location.hash).toBe("#x");
  });

  it("opens with the query from the address", async () => {
    mount("/?q=миноры");
    expect(field()).toHaveValue("миноры");
    expect(await screen.findByRole("option")).toHaveTextContent("Алгебра · Теория");
  });

  it("drops the query from the address when the panel folds on a click outside", async () => {
    await userEvent.type(mount(), "миноры");
    await screen.findByRole("option");
    fireEvent.pointerDown(document.body);
    expect(globalThis.location.search).toBe("");
    expect(field()).toHaveValue("миноры");
  });

  it("does not fetch the index until the field is touched", async () => {
    mount();
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.pointerDown(field());
    await waitFor(() => {
      expect(fetch).toHaveBeenCalled();
    });
  });

  it("focuses with Ctrl+K, in the Russian layout too, and with «/»", async () => {
    mount();
    fireEvent.keyDown(document, { code: "KeyK", ctrlKey: true, key: "л" });
    expect(field()).toHaveFocus();
    field().blur();
    await userEvent.keyboard("{Control>}k{/Control}");
    expect(field()).toHaveFocus();
    field().blur();
    await userEvent.keyboard("/");
    expect(field()).toHaveFocus();
  });
});

it("uses a short search placeholder in the header", () => {
  mount();
  expect(field()).toHaveAttribute("placeholder", "Поиск");
});
