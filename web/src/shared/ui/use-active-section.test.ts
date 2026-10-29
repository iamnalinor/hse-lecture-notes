import { act, renderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { MemoryRouter, useNavigate } from "react-router";
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

const fire = (type: string) => {
  act(() => {
    globalThis.dispatchEvent(new Event(type));
  });
};

/** The page scrolls to a new layout, and the hook hears `scroll`. */
const scroll = (tops: Readonly<Record<string, number>>) => {
  layout(tops);
  fire("scroll");
};

/** The hook and the router's `navigate`, which a tap in the table of contents calls. */
const render = (url = "/") => {
  const wrapper = ({ children }: { readonly children: ReactNode }) =>
    createElement(MemoryRouter, { initialEntries: [url] }, children);
  return renderHook(
    ({ ids }: { readonly ids: readonly string[] }) => ({
      active: useActiveSection([...ids]),
      navigate: useNavigate(),
    }),
    { initialProps: { ids: IDS }, wrapper },
  );
};

/** Nothing has been read yet: every section starts below the reading line. */
const BELOW = { context: 300, practice: 1800, sarrus: 900, skew: 1200, theory: 800 };

/** Read up to «Кососимметричность»; «Практика» is short and sits on screen below it. */
const AT_SKEW = { context: -900, practice: 500, sarrus: -500, skew: -100, theory: -600 };

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
    vi.restoreAllMocks();
  });

  it("stays on the section while its heading is on screen", () => {
    const { result } = render();
    // «Теория» near the top, «Саррюс» right under it and already past the line.
    scroll({ ...BELOW, context: -500, sarrus: 145, theory: 80 });
    expect(result.current.active).toBe("theory");
  });

  it("moves to the subsection once the section heading has left the screen", () => {
    const { result } = render();
    scroll({ ...BELOW, context: -600, sarrus: 50, theory: -10 });
    expect(result.current.active).toBe("sarrus");
    scroll({ ...BELOW, context: -900, sarrus: -400, skew: 150, theory: -500 });
    expect(result.current.active).toBe("skew");
  });

  it("keeps the previous section until the next one crosses the line", () => {
    const { result } = render();
    scroll({ ...BELOW, context: -300, theory: 500 });
    expect(result.current.active).toBe("context");
  });

  it("highlights the section tapped in the table of contents", () => {
    const { result } = render();
    scroll(AT_SKEW);
    expect(result.current.active).toBe("skew");
    act(() => {
      void result.current.navigate({ hash: "#practice" });
    });
    expect(result.current.active).toBe("practice");
  });

  it("highlights the section jumped to even if it cannot reach the line", () => {
    // The end of the page: the jump to «Практика» could only bring it up to 500px.
    layout(AT_SKEW);
    const { result } = render("/#practice");
    expect(result.current.active).toBe("practice");
    scroll({ ...AT_SKEW, practice: 450 });
    expect(result.current.active).toBe("practice");
  });

  it("follows the reading line again once the user scrolls", () => {
    const { result } = render("/#practice");
    fire("wheel");
    scroll(AT_SKEW);
    expect(result.current.active).toBe("skew");
  });

  it("lets go of the section jumped to once it leaves the screen", () => {
    layout(AT_SKEW);
    const { result } = render("/#practice");
    // Dragging the scrollbar: only `scroll` events, no wheel or touch.
    scroll({ ...BELOW, context: -1500, practice: -100, sarrus: -1100, skew: -700, theory: -1200 });
    expect(result.current.active).toBe("practice");
    scroll({ context: 0, practice: 1500, sarrus: 600, skew: 900, theory: 500 });
    expect(result.current.active).toBe("context");
  });

  it("does not pin the old jump again when the list changes", () => {
    const { rerender, result } = render("/#practice");
    fire("wheel");
    scroll(AT_SKEW);
    expect(result.current.active).toBe("skew");
    // The glossary filter narrows the list: the URL still says #practice.
    rerender({ ids: ["context", "theory", "skew", "practice"] });
    expect(result.current.active).toBe("skew");
  });

  it("ignores a jump to something that is not a section", () => {
    const { result } = render("/#thm:lec04:laplace");
    expect(result.current.active).toBeUndefined();
    scroll({ ...BELOW, context: 0 });
    expect(result.current.active).toBe("context");
  });

  it("subscribes once while the page re-renders with an equal list", () => {
    const subscribe = vi.spyOn(globalThis, "addEventListener");
    const { rerender } = render();
    rerender({ ids: [...IDS] });
    rerender({ ids: [...IDS] });
    expect(subscribe.mock.calls.filter(([type]) => type === "scroll")).toHaveLength(1);
  });

  it("measures the layout once per frame, however many scroll events come", () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (run: FrameRequestCallback) => {
      frames.push(run);
      return frames.length;
    });
    render();
    act(() => {
      frames.shift()?.(0);
    });
    fire("scroll");
    fire("scroll");
    fire("scroll");
    expect(frames).toHaveLength(1);
  });
});
