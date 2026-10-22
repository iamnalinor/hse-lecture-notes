import { describe, expect, it } from "vitest";

import { isNotFound } from "./not-found.ts";

describe("isNotFound", () => {
  it("recognises a Response thrown while rendering a page", () => {
    expect(isNotFound(new Response("Not Found", { status: 404 }))).toBe(true);
  });

  it("recognises a route error response of the router itself", () => {
    expect(
      isNotFound({ data: undefined, internal: true, status: 404, statusText: "Not Found" }),
    ).toBe(true);
  });

  it("does not take other failures for a missing page", () => {
    expect(isNotFound(new Response("boom", { status: 500 }))).toBe(false);
    expect(isNotFound(new Error("Not Found"))).toBe(false);
  });
});
