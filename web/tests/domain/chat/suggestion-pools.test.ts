import { describe, expect, it } from "vitest";

import {
  FALLBACK_CHAT_SUGGESTIONS,
  getChatSuggestionPool,
  getChatSuggestions,
  pickRandomSuggestions,
  SUGGESTIONS_SHOWN,
} from "#web/domain/chat/suggestion-pools.ts";

describe("getChatSuggestionPool", () => {
  it("returns six questions for home, course and a known page", () => {
    expect(getChatSuggestionPool({ course: "", docId: "" })).toHaveLength(6);
    expect(getChatSuggestionPool({ course: "algebra", docId: "" })).toHaveLength(6);
    expect(getChatSuggestionPool({ course: "algebra", docId: "01_sep03_matrices" })).toHaveLength(
      6,
    );
  });

  it("returns the fixed fallback for a page without questions", () => {
    const pool = getChatSuggestionPool({
      course: "algebra",
      docId: "12_nov25_polynomials_vectors",
    });
    expect(pool).toBe(FALLBACK_CHAT_SUGGESTIONS);
    expect(pool).toHaveLength(SUGGESTIONS_SHOWN);
  });
});

describe("getChatSuggestions", () => {
  it("shows three distinct questions from the pool", () => {
    const docContext = { course: "algebra", docId: "kr1" };
    const pool = getChatSuggestionPool(docContext);
    const shown = getChatSuggestions(docContext);
    expect(shown).toHaveLength(SUGGESTIONS_SHOWN);
    expect(new Set(shown).size).toBe(SUGGESTIONS_SHOWN);
    for (const question of shown) {
      expect(pool).toContain(question);
    }
  });

  it("does not shuffle the fallback", () => {
    expect(getChatSuggestions({ course: "calculus", docId: "no-such-page" })).toEqual(
      FALLBACK_CHAT_SUGGESTIONS,
    );
  });
});

describe("pickRandomSuggestions", () => {
  it("is deterministic for a given random source", () => {
    const pool = ["a", "b", "c", "d", "e", "f"];
    expect(pickRandomSuggestions(pool, 3, () => 0.5)).toEqual(
      pickRandomSuggestions(pool, 3, () => 0.5),
    );
  });
});
