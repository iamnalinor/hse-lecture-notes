import { act, renderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { findById } from "./dom.ts";
import { useActiveSection } from "./use-active-section.ts";

/** «Теория» holds its subsections, as pandoc's `--section-divs` nests them. */
const IDS = ["context", "theory", "sarrus", "skew", "practice"];

/** Viewport 800px high: the reading line is at 200px. */
const HEIGHT = 800;

/** Lays the sections out: each id gets its top relative to the viewport. */
const layout = (tops: Readonly<Record<string, number>>) => {
  for (const [id, top] of Object.entries(tops)) {
    const element = findById(document, id);
    if (element !== null) {
      element.getBoundingClientRect = () => ({ top }) as DOMRect;
    }
  }
};

/** The page scrolls to a new layout, and the hook hears `scroll`. */
const scroll = (tops: Readonly<Record<string, number>>) => {
  layout(tops);
  act(() => {
    globalThis.dispatchEvent(new Event("scroll"));
  });
};

const render = (url = "/") => {
  const wrapper = ({ children }: { readonly children: ReactNode }) =>
    createElement(MemoryRouter, { initialEntries: [url] }, children);
  return renderHook(() => useActiveSection([...IDS]), { wrapper });
};

/** Nothing has been read yet: every section starts below the reading line. */
const BELOW = { context: 300, practice: 1800, sarrus: 900, skew: 1200, theory: 800 };

describe("useActiveSection", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <section id="context"></section>
      <section id="theory"><section id="sarrus"></section><section id="skew"></section></section>
      <section id="practice"></section>`;
    layout(BELOW);
    vi.stubGlobal("innerHeight", HEIGHT);
    vi.stubGlobal("requestAnimationFrame", (run: FrameRequestCallback) => {
      run(0);
      return 0;
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("stays on the section while its heading is on screen", () => {
    const { result } = render();
    // «Теория» near the top, «Саррюс» right under it and already past the line.
    scroll({ ...BELOW, context: -500, sarrus: 145, theory: 80 });
    expect(result.current).toBe("theory");
  });

  it("moves to the subsection once the section heading has left the screen", () => {
    const { result } = render();
    scroll({ ...BELOW, context: -600, sarrus: 50, theory: -10 });
    expect(result.current).toBe("sarrus");
    scroll({ ...BELOW, context: -900, sarrus: -400, skew: 150, theory: -500 });
    expect(result.current).toBe("skew");
  });

  it("keeps the previous section until the next one crosses the line", () => {
    const { result } = render();
    scroll({ ...BELOW, context: -300, theory: 500 });
    expect(result.current).toBe("context");
  });

  it("highlights the section jumped to even if it cannot reach the line", () => {
    const { result } = render("/#practice");
    expect(result.current).toBe("practice");
    scroll({ ...BELOW, context: -900, practice: 500, sarrus: -500, skew: -100, theory: -600 });
    expect(result.current).toBe("practice");
  });

  it("follows the reading line again once the user scrolls", () => {
    const { result } = render("/#practice");
    act(() => {
      globalThis.dispatchEvent(new Event("wheel"));
    });
    scroll({ ...BELOW, context: -900, practice: 500, sarrus: -500, skew: -100, theory: -600 });
    expect(result.current).toBe("skew");
  });

  it("ignores a jump to something that is not a section", () => {
    const { result } = render("/#thm:lec04:laplace");
    expect(result.current).toBeUndefined();
    scroll({ ...BELOW, context: 0 });
    expect(result.current).toBe("context");
  });
});
