import { afterEach, expect, it } from "vitest";

import { readStoredAuth, saveSessionAuth } from "./chat-storage.ts";

afterEach(() => {
  localStorage.clear();
});
it.each(["default", "student", "extended"] as const)(
  "restores the %s account after a reload",
  (tier) => {
    const user = { id: 42, name: "Student" };
    saveSessionAuth("session", tier, user);
    expect(readStoredAuth()).toMatchObject({ sessionToken: "session", tier, user });
  },
);
