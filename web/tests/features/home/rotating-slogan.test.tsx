import { act, fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RotatingSlogan } from "#web/features/home/rotating-slogan.tsx";

const HOLD_MS = 10_000;
const WORDS_GAP_MS = 220;
const FADE_MS = 650;

const FIRST = /^Конспекты\sлекций,\sкоторые\sинтересно\sчитать$/u;
/** With a constant Math.random the shuffled round keeps its order, so the second slogan comes next. */
const SECOND = /^Читай\sконспект,\sа\sне\sфотографии\sдоски$/u;

const states = (container: HTMLElement) =>
  Array.from(
    container.querySelectorAll<HTMLElement>("[data-state]"),
    (layer) => layer.dataset["state"],
  );

const setHidden = (isHidden: boolean) => {
  vi.spyOn(document, "hidden", "get").mockReturnValue(isHidden);
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
};

const stubReducedMotion = (isReduced: boolean) => {
  vi.stubGlobal("matchMedia", () => ({ matches: isReduced }));
};

const elapse = (ms: number) => {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(Math, "random").mockReturnValue(0);
  stubReducedMotion(false);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("RotatingSlogan", () => {
  it("shows the first slogan on load: one h1, one visible layer, no transition", () => {
    const { container } = render(<RotatingSlogan />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 })).toHaveAccessibleName(FIRST);
    const layers = states(container);
    expect(layers.filter((state) => state === "on")).toHaveLength(1);
    expect(layers.filter((state) => state === "off")).toHaveLength(0);
    expect(container.querySelectorAll("[aria-hidden=true]")).toHaveLength(layers.length - 1);
  });

  it("keeps the first slogan as visible text in the prerendered HTML", () => {
    const html = renderToStaticMarkup(<RotatingSlogan />);
    expect(html).toContain('data-state="on"');
    expect(html).toContain("которые");
  });

  it("changes the heading after HOLD_MS: the old words leave, then the new ones come in", () => {
    const { container } = render(<RotatingSlogan />);
    elapse(HOLD_MS - 1);
    expect(screen.getByRole("heading", { level: 1 })).toHaveAccessibleName(FIRST);

    elapse(1);
    expect(states(container).filter((state) => state === "off")).toHaveLength(1);
    expect(states(container)).not.toContain("on");

    elapse(WORDS_GAP_MS);
    expect(screen.getByRole("heading", { level: 1 })).toHaveAccessibleName(SECOND);
    expect(states(container).filter((state) => state === "on")).toHaveLength(1);
    expect(states(container)).not.toContain("off");
  });

  it("cross-fades in fade mode: the new slogan is on while the old one is still off", () => {
    const { container } = render(<RotatingSlogan effect="fade" />);
    elapse(HOLD_MS);
    expect(states(container).filter((state) => state === "on")).toHaveLength(1);
    expect(states(container).filter((state) => state === "off")).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 })).toHaveAccessibleName(SECOND);

    elapse(FADE_MS);
    expect(states(container)).not.toContain("off");
  });

  it("does not change while the tab is hidden and goes on when it is shown again", () => {
    render(<RotatingSlogan />);
    setHidden(true);
    elapse(3 * HOLD_MS);
    expect(screen.getByRole("heading", { level: 1 })).toHaveAccessibleName(FIRST);

    setHidden(false);
    elapse(HOLD_MS + WORDS_GAP_MS);
    expect(screen.getByRole("heading", { level: 1 })).toHaveAccessibleName(SECOND);
  });

  it("pauses while the mouse is over the slogan", () => {
    const { container } = render(<RotatingSlogan />);
    const root = container.firstElementChild;
    if (root === null) {
      throw new Error("no slogan");
    }
    fireEvent.pointerEnter(root, { pointerType: "mouse" });
    elapse(3 * HOLD_MS);
    expect(screen.getByRole("heading", { level: 1 })).toHaveAccessibleName(FIRST);

    fireEvent.pointerLeave(root, { pointerType: "mouse" });
    elapse(HOLD_MS + WORDS_GAP_MS);
    expect(screen.getByRole("heading", { level: 1 })).toHaveAccessibleName(SECOND);
  });

  it("switches on click; a click in the middle of a transition is ignored", () => {
    const { container } = render(<RotatingSlogan />);
    const root = container.firstElementChild;
    if (root === null) {
      throw new Error("no slogan");
    }
    fireEvent.click(root);
    fireEvent.click(root);
    elapse(WORDS_GAP_MS);
    expect(screen.getByRole("heading", { level: 1 })).toHaveAccessibleName(SECOND);
  });

  it("swaps instantly with prefers-reduced-motion", () => {
    stubReducedMotion(true);
    const { container } = render(<RotatingSlogan />);
    elapse(HOLD_MS);
    expect(screen.getByRole("heading", { level: 1 })).toHaveAccessibleName(SECOND);
    expect(states(container).filter((state) => state === "on")).toHaveLength(1);
    expect(states(container)).not.toContain("off");
  });

  it("never repeats a slogan twice in a row", () => {
    vi.mocked(Math.random).mockRestore();
    const { container } = render(<RotatingSlogan />);
    const shown = () => container.querySelector("[data-state=on]")?.textContent;
    let previous = shown();
    for (let i = 0; i < 40; i++) {
      elapse(HOLD_MS);
      elapse(WORDS_GAP_MS);
      const layer = shown();
      expect(layer).toBeTruthy();
      expect(layer).not.toBe(previous);
      previous = layer;
    }
  });
});
