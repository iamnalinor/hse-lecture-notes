import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SearchEntry } from "#web/domain/schemas.ts";

import { renderWithApp } from "#web/test/render.tsx";

import { SearchButton } from "./search-button.tsx";

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
  const { hash, pathname } = useLocation();
  return <output data-testid="location">{decodeURIComponent(pathname + hash)}</output>;
};

const open = async () => {
  renderWithApp(
    <>
      <SearchButton />
      <Location />
    </>,
    "/",
  );
  await userEvent.click(screen.getByRole("button", { name: "Поиск" }));
  return await screen.findByRole("combobox", { name: "Поиск по конспектам" });
};

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(Response.json(INDEX)));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SearchButton", () => {
  it("finds a block by its number and opens it on Enter", async () => {
    const input = await open();
    await userEvent.type(input, "4.3");
    expect(await screen.findByRole("option")).toHaveTextContent("Алгебра · Лекция 4");
    await userEvent.keyboard("{Enter}");
    expect(screen.getByTestId("location")).toHaveTextContent(
      "/algebra/04_sep23_determinant_properties#thm:lec04:laplace",
    );
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("finds a word in the theory and highlights it", async () => {
    const input = await open();
    await userEvent.type(input, "миноры");
    const hits = await screen.findAllByRole("option");
    expect(hits.map((hit) => hit.textContent)).toStrictEqual([
      expect.stringContaining("Алгебра · Теория"),
    ]);
    expect(screen.getByText("Минор", { selector: "mark" })).toBeInTheDocument();
  });

  it("opens a test preparation page from a hit", async () => {
    const input = await open();
    await userEvent.type(input, "крамеру");
    expect(await screen.findByRole("option")).toHaveTextContent("Алгебра · Подготовка к КР-1");
    await userEvent.keyboard("{Enter}");
    expect(screen.getByTestId("location")).toHaveTextContent("/algebra/kr1#sec:kr1:cramer");
  });

  it("opens a colloquium preparation page from a hit", async () => {
    const input = await open();
    await userEvent.type(input, "гейне");
    expect(await screen.findByRole("option")).toHaveTextContent(
      "Матан · Подготовка к коллоквиуму 1",
    );
    await userEvent.keyboard("{Enter}");
    expect(screen.getByTestId("location")).toHaveTextContent(
      "/calculus/colloq1#sec:colloq1:cauchy-heine",
    );
  });

  it("stays open under StrictMode's double mount", async () => {
    renderWithApp(
      <StrictMode>
        <SearchButton />
      </StrictMode>,
      "/",
    );
    await userEvent.click(screen.getByRole("button", { name: "Поиск" }));
    await screen.findByRole("combobox");
    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });

  it("closes on Esc", async () => {
    await open();
    screen.getByRole<HTMLDialogElement>("dialog", { hidden: true }).close();
    await waitFor(() => {
      expect(screen.queryByRole("combobox")).toBeNull();
    });
  });

  it("opens with Ctrl+K in the Russian layout", async () => {
    renderWithApp(<SearchButton />, "/");
    fireEvent.keyDown(document, { code: "KeyK", ctrlKey: true, key: "л" });
    expect(await screen.findByRole("combobox")).toBeInTheDocument();
  });

  it("opens with Ctrl+K", async () => {
    renderWithApp(<SearchButton />, "/");
    await userEvent.keyboard("{Control>}k{/Control}");
    // Focus moves to the field via `showModal()`, which jsdom does not implement.
    expect(await screen.findByRole("combobox")).toBeInTheDocument();
  });
});
