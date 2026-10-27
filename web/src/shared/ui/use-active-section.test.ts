import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useActiveSection } from "./use-active-section.ts";

/** A stand-in for the browser's observer: the test decides what enters and leaves the band. */
class FakeObserver {
  static readonly live = new Set<FakeObserver>();
  static readonly counter = { created: 0 };
  private readonly notify: IntersectionObserverCallback;
  readonly targets: Element[] = [];

  constructor(notify: IntersectionObserverCallback) {
    this.notify = notify;
    FakeObserver.live.add(this);
    FakeObserver.counter.created += 1;
  }

  disconnect() {
    FakeObserver.live.delete(this);
  }

  observe(target: Element) {
    this.targets.push(target);
  }

  report(changes: Readonly<Record<string, boolean>>) {
    const entries = this.targets
      .filter((target) => Object.hasOwn(changes, target.id))
      .map((target) => ({ isIntersecting: changes[target.id], target }));
    this.notify(entries as unknown as IntersectionObserverEntry[], this as never);
  }
}

const report = (changes: Readonly<Record<string, boolean>>) => {
  act(() => {
    for (const observer of FakeObserver.live) {
      observer.report(changes);
    }
  });
};

/** «Теория» holds its subsections, as pandoc's `--section-divs` nests them. */
const IDS = ["context", "theory", "sarrus", "skew", "practice"];

describe("useActiveSection", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <section id="context"></section>
      <section id="theory"><section id="sarrus"></section><section id="skew"></section></section>
      <section id="practice"></section>`;
    FakeObserver.counter.created = 0;
    vi.stubGlobal("IntersectionObserver", FakeObserver);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("picks the subsection, not the section that holds it", () => {
    const { result } = renderHook(() => useActiveSection([...IDS]));
    report({ sarrus: true, theory: true });
    expect(result.current).toBe("sarrus");
    report({ sarrus: false, skew: true });
    expect(result.current).toBe("skew");
  });

  it("falls back to the section while the band is in its own text", () => {
    const { result } = renderHook(() => useActiveSection([...IDS]));
    report({ theory: true });
    expect(result.current).toBe("theory");
  });

  it("keeps one observer while the page re-renders with an equal list", () => {
    const { rerender } = renderHook(() => useActiveSection([...IDS]));
    rerender();
    rerender();
    expect(FakeObserver.counter.created).toBe(1);
  });
});
