import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { useCanonicalUrl } from "./canonical-url.ts";

const canonical = (): null | string =>
  document.querySelector('link[rel="canonical"]')?.getAttribute("href") ?? null;

describe("useCanonicalUrl", () => {
  afterEach(() => {
    document.head.replaceChildren();
  });

  it("points the shell served for any path to the open page", () => {
    document.head.innerHTML =
      '<link rel="canonical" href="https://hse.nalinor.dev/" /><meta property="og:url" content="https://hse.nalinor.dev/" />';
    const { rerender } = renderHook(
      ({ pathname }: { pathname: string }) => {
        useCanonicalUrl(pathname);
      },
      { initialProps: { pathname: "/algebra/04_sep23_determinant_properties" } },
    );
    expect(canonical()).toBe("https://hse.nalinor.dev/algebra/04_sep23_determinant_properties/");
    rerender({ pathname: "/" });
    expect(canonical()).toBe("https://hse.nalinor.dev/");
    expect(document.querySelector('meta[property="og:url"]')?.getAttribute("content")).toBe(
      "https://hse.nalinor.dev/",
    );
  });

  it("does nothing without the tags (dev server)", () => {
    renderHook(() => {
      useCanonicalUrl("/algebra");
    });
    expect(canonical()).toBeNull();
  });
});
