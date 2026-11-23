import { describe, expect, it, vi } from "vitest";

import { renderWithApp } from "#web/test/render.tsx";

import { useScrollToHash } from "./use-scroll-to-hash.ts";

const Probe = () => {
  useScrollToHash();
  return (
    <section id="sec:exam1:laplace">
      <details>
        <summary>1. Разложение Лапласа</summary>
        <div>
          <p id="rem:exam1:proof-laplace">Доказательство.</p>
        </div>
      </details>
    </section>
  );
};

describe("useScrollToHash", () => {
  it("opens a ticket section's own details when jumping to the section anchor", () => {
    Element.prototype.scrollIntoView = vi.fn();
    renderWithApp(<Probe />, "/algebra/exam1#sec:exam1:laplace");

    const details = document.querySelector("details");
    const summary = document.querySelector("summary");
    expect(details?.open).toBe(true);
    expect(summary).toHaveClass("flash");
  });

  it("opens an enclosing details when jumping to an anchor inside a folded ticket", () => {
    Element.prototype.scrollIntoView = vi.fn();
    renderWithApp(<Probe />, "/algebra/exam1#rem:exam1:proof-laplace");

    const details = document.querySelector("details");
    const target = document.querySelector('[id="rem:exam1:proof-laplace"]');
    expect(details?.open).toBe(true);
    expect(target).toHaveClass("flash");
  });
});
