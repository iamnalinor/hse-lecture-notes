import { describe, expect, it } from "vitest";

import { backLabel, BackStateSchema, documentBackLabel } from "#web/domain/navigation.ts";

describe("backLabel", () => {
  it("names the block the link stood in, with its lecture when it was another one", () => {
    expect(backLabel({ block: "Теорема 6.11", section: "2" }, 6)).toBe("Теорема 6.11, лекция 6");
  });

  it("falls back to the section, then to a bare link", () => {
    expect(backLabel({ block: undefined, section: "2" }, undefined)).toBe("§ 2");
    expect(backLabel({ block: undefined, section: undefined }, 3)).toBe("ссылка, лекция 3");
  });
});

describe("BackStateSchema", () => {
  it("accepts the state of a jump and rejects a plain navigation", () => {
    expect(BackStateSchema.safeParse({ backLabel: "§ 2" }).success).toBe(true);
    expect(BackStateSchema.safeParse(null).success).toBe(false);
  });
});

describe("documentBackLabel", () => {
  it("names the document left for another one", () => {
    expect(documentBackLabel("/algebra/03_sep16_permutations_determinant", "/algebra/04_x")).toBe(
      "Алгебра, лекция 3",
    );
    expect(documentBackLabel("/calculus/kr2", "/calculus/theory")).toBe("Матан, КР 2");
    expect(documentBackLabel("/discrete/theory", "/algebra/program")).toBe("Дискра, теория");
  });

  it("stays silent for lists and the home page", () => {
    expect(documentBackLabel("/algebra", "/algebra/theory")).toBeUndefined();
    expect(documentBackLabel("/algebra/theory", "/")).toBeUndefined();
    expect(documentBackLabel("/nope/theory", "/algebra/theory")).toBeUndefined();
  });
});
