import { describe, expect, it } from "vitest";

import { backLabel, BackStateSchema } from "./navigation.ts";

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
