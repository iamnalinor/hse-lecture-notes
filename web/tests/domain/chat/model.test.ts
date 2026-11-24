import { describe, expect, it } from "vitest";

import {
  blockPlateCopy,
  formatDegradedCaption,
  formatRemainingDuration,
  nextRunPollDelayMs,
  parseDocContext,
  toPlainCopyText,
} from "#web/domain/chat/model.ts";

describe("chat domain helpers", () => {
  it("distinguishes home, course and material contexts", () => {
    expect(parseDocContext("/")).toEqual({ course: "", docId: "" });
    expect(parseDocContext("/discrete")).toEqual({ course: "discrete", docId: "" });
    expect(parseDocContext("/discrete/07_oct16_primes_fta")).toEqual({
      course: "discrete",
      docId: "07_oct16_primes_fta",
    });
    expect(parseDocContext("/calculus/theory/")).toEqual({
      course: "calculus",
      docId: "theory",
    });
  });

  it("formats Russian durations and degraded banner", () => {
    const now = 1_700_000_000_000;
    const plus12h37m = now + (12 * 60 + 37) * 60_000;
    expect(formatRemainingDuration(plus12h37m, now)).toBe("12 часов 37 минут");
    expect(formatDegradedCaption({ active: true, restoresAt: plus12h37m }, now)).toBe(
      "Повышенное число запросов. Качество ответов снижено — вернётся через 12 часов 37 минут",
    );
    expect(formatDegradedCaption({ active: false }, now)).toBeNull();
    expect(formatDegradedCaption({ active: true, restoresAt: now }, now)).toBeNull();
  });

  it("converts LaTeX/Markdown answer to readable Unicode plain text", () => {
    const src =
      "По **[Теореме 7.1](#thm:lec07:fta)** для всех $\\forall n \\ge 2, n \\in \\mathbb{N}$: $\\frac{a}{b} \\ne 0$.";
    expect(toPlainCopyText(src)).toBe("По Теореме 7.1 для всех ∀ n ≥ 2, n ∈ ℕ: (a)/(b) ≠ 0.");
  });

  it("uses backoff schedule 2s -> 4s -> 6s", () => {
    expect(nextRunPollDelayMs(0)).toBe(2000);
    expect(nextRunPollDelayMs(2)).toBe(4000);
    expect(nextRunPollDelayMs(5)).toBe(6000);
  });

  it("produces login CTA on guest blocks", () => {
    const plate = blockPlateCopy({ code: "auth_required" }, "guest", Date.now());
    expect(plate.showLogin).toBe(true);
    expect(plate.title).toContain("Войдите");
  });
});
