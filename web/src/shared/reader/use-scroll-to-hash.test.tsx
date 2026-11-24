import { describe, expect, it, vi } from "vitest";

import { renderWithApp } from "#web/test/render.tsx";

import { useScrollToHash } from "./use-scroll-to-hash.ts";

const Probe = () => {
  useScrollToHash();
  return (
    <>
      <section id="sec:exam1:laplace">
        <details data-ticket="sec:exam1:laplace">
          <summary>1. Разложение Лапласа</summary>
          <div>
            <p id="rem:exam1:proof-laplace">Доказательство.</p>
          </div>
        </details>
      </section>
      <section id="sec:lec02:gauss">
        <h2>Метод Гаусса</h2>
        <details>
          <summary>Доказательство.</summary>
          <div>
            <p id="proof:lec02:step">Шаг доказательства.</p>
          </div>
        </details>
      </section>
    </>
  );
};

describe("useScrollToHash", () => {
  it("opens a ticket section's own details when jumping to the section anchor", () => {
    Element.prototype.scrollIntoView = vi.fn();
    renderWithApp(<Probe />, "/algebra/exam1#sec:exam1:laplace");

    const details = document.querySelector("details[data-ticket]");
    const summary = details?.querySelector("summary");
    expect((details as HTMLDetailsElement | null)?.open).toBe(true);
    expect(summary).toHaveClass("flash");
  });

  it("opens an enclosing details when jumping to an anchor inside a folded ticket", () => {
    Element.prototype.scrollIntoView = vi.fn();
    renderWithApp(<Probe />, "/algebra/exam1#rem:exam1:proof-laplace");

    const details = document.querySelector("details[data-ticket]");
    const target = document.querySelector('[id="rem:exam1:proof-laplace"]');
    expect((details as HTMLDetailsElement | null)?.open).toBe(true);
    expect(target).toHaveClass("flash");
  });

  it("does not open a folded proof when jumping to a regular lecture section heading", () => {
    Element.prototype.scrollIntoView = vi.fn();
    renderWithApp(<Probe />, "/algebra/02#sec:lec02:gauss");

    const section = document.querySelector('[id="sec:lec02:gauss"]');
    const proof = section?.querySelector<HTMLDetailsElement>("details");
    const heading = section?.querySelector("h2");
    expect(proof?.open).toBe(false);
    expect(heading).toHaveClass("flash");
  });

  it("still opens a folded proof when jumping to an anchor inside it", () => {
    Element.prototype.scrollIntoView = vi.fn();
    renderWithApp(<Probe />, "/algebra/02#proof:lec02:step");

    const proof = document
      .querySelector('[id="sec:lec02:gauss"]')
      ?.querySelector<HTMLDetailsElement>("details");
    expect(proof?.open).toBe(true);
  });
});
