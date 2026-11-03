import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { findById } from "./dom.ts";
import { TocSheet } from "./toc-sheet.tsx";

const TOC = [
  { id: "context", level: 1, text: "Контекст" },
  { id: "theory", level: 1, text: "Теория" },
  { id: "practice", level: 1, text: "Практика" },
];

/** Read up to «Теория»; the short «Практика» sits on screen below the reading line (200px). */
const TOPS: Readonly<Record<string, number>> = { context: -900, practice: 500, theory: -300 };

const open = () =>
  render(
    <MemoryRouter>
      <TocSheet caption="Лекция 3" minutes={20} toc={TOC} />
    </MemoryRouter>,
  );

const pill = () => screen.getByRole("button", { name: /%/u });

describe("TocSheet", () => {
  beforeEach(() => {
    document.body.innerHTML = TOC.map((item) => `<section id="${item.id}"></section>`).join("");
    for (const [id, top] of Object.entries(TOPS)) {
      const element = findById(document, id);
      if (element !== null) {
        element.getBoundingClientRect = () => ({ top }) as DOMRect;
      }
    }
    vi.stubGlobal("innerHeight", 800);
    vi.stubGlobal("requestAnimationFrame", (run: FrameRequestCallback) => {
      run(0);
      return 0;
    });
    // A phone: the sheet is shown only below the wide breakpoint.
    vi.stubGlobal("matchMedia", () => ({
      addEventListener: () => undefined,
      matches: false,
      removeEventListener: () => undefined,
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("names the section being read on the pill", () => {
    open();
    act(() => {
      globalThis.dispatchEvent(new Event("scroll"));
    });
    expect(pill()).toHaveTextContent("Теория");
  });

  it("opens the sheet on the section being read and closes it after a pick", () => {
    open();
    act(() => {
      globalThis.dispatchEvent(new Event("scroll"));
    });
    fireEvent.click(pill());
    const sheet = screen.getByRole("dialog", { hidden: true });
    expect(sheet).toHaveProperty("open", true);
    expect(pill()).toHaveAttribute("aria-expanded", "true");
    expect(document.activeElement).toHaveTextContent("Теория");

    fireEvent.click(within(sheet).getByRole("link", { hidden: true, name: "Практика" }));
    expect(sheet).toHaveProperty("open", false);
    // The jump pins the short last section, which never reaches the reading line.
    expect(pill()).toHaveTextContent("Практика");
    // Reopened, the sheet marks the same section as the pill.
    fireEvent.click(pill());
    expect(
      within(sheet).getByRole("link", { current: "location", hidden: true }),
    ).toHaveTextContent("Практика");
  });

  it("is not there on a wide screen, where the side column shows the contents", () => {
    vi.stubGlobal("matchMedia", () => ({
      addEventListener: () => undefined,
      matches: true,
      removeEventListener: () => undefined,
    }));
    open();
    expect(screen.queryByRole("button", { name: /%/u })).toBeNull();
  });
});
