import { describe, expect, it } from "bun:test";

import { isPreviewHost, isPreviewOrigin } from "../src/preview-origin";

const SUFFIX = "-hse-lecture-notes.nalinor.workers.dev";

describe("preview origins", () => {
  it("allows numbered PR aliases of the preview Worker over https", () => {
    expect(isPreviewOrigin("https://pr-45-hse-lecture-notes.nalinor.workers.dev", SUFFIX)).toBe(true);
    expect(isPreviewHost("pr-7-hse-lecture-notes.nalinor.workers.dev", SUFFIX)).toBe(true);
  });

  it("rejects other workers.dev pages, http and look-alikes", () => {
    expect(isPreviewOrigin("http://pr-45-hse-lecture-notes.nalinor.workers.dev", SUFFIX)).toBe(false);
    expect(isPreviewOrigin("https://evil-hse-lecture-notes.nalinor.workers.dev", SUFFIX)).toBe(false);
    expect(isPreviewOrigin("https://x.pr-45-hse-lecture-notes.nalinor.workers.dev", SUFFIX)).toBe(false);
    expect(isPreviewOrigin("https://pr-45-hse-lecture-notes.nalinor.workers.dev.evil.com", SUFFIX)).toBe(false);
    expect(isPreviewOrigin("https://pr-45-hse-lecture-notes.nalinor.workers.dev", undefined)).toBe(false);
  });
});
