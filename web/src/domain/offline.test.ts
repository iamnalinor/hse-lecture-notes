import { describe, expect, it } from "vitest";

import {
  type CachedHashes,
  contentHash,
  countSavedNotes,
  isDocFresh,
  missingDocFiles,
  type OfflineManifest,
  stalePaths,
} from "./offline.ts";

const MANIFEST: OfflineManifest = {
  docs: [
    { files: ["data/a/01/fragment.html", "data/a/01/meta.json"], id: "a/01", kind: "notes" },
    { files: ["data/a/02/fragment.html", "data/a/02/meta.json"], id: "a/02", kind: "notes" },
    { files: ["data/a/glossary.json"], id: "a/glossary", kind: "glossary" },
  ],
  files: {
    "data/a/01/fragment.html": "h1",
    "data/a/01/meta.json": "m1",
    "data/a/02/fragment.html": "h2",
    "data/a/02/meta.json": "m2",
    "data/a/glossary.json": "g",
    "index.html": "i",
  },
  precache: ["index.html"],
  sizes: {
    "data/a/01/fragment.html": 100,
    "data/a/01/meta.json": 10,
    "data/a/02/fragment.html": 200,
    "data/a/02/meta.json": 20,
    "data/a/glossary.json": 5,
  },
  version: "v",
};

const cached = (entries: Record<string, string>): CachedHashes => new Map(Object.entries(entries));

describe("offline documents", () => {
  it("counts only notes whose every file has the current hash", () => {
    const state = cached({
      "data/a/01/fragment.html": "h1",
      "data/a/01/meta.json": "m1",
      "data/a/02/fragment.html": "old",
      "data/a/02/meta.json": "m2",
      "data/a/glossary.json": "g",
    });
    expect(countSavedNotes(MANIFEST, state)).toEqual({ missingBytes: 200, saved: 1, total: 2 });
  });

  it("leaves the size unknown for a manifest without sizes", () => {
    const { sizes: _sizes, ...withoutSizes } = MANIFEST;
    expect(countSavedNotes(withoutSizes, cached({})).missingBytes).toBeUndefined();
  });

  it("treats a half-saved document as not saved", () => {
    const [doc] = MANIFEST.docs;
    const state = cached({ "data/a/01/fragment.html": "h1" });
    expect(doc !== undefined && isDocFresh(MANIFEST, state, doc)).toBe(false);
  });

  it("lists the files to download for everything", () => {
    const state = cached({ "data/a/01/fragment.html": "h1", "data/a/01/meta.json": "m1" });
    expect(missingDocFiles(MANIFEST, state)).toEqual([
      "data/a/02/fragment.html",
      "data/a/02/meta.json",
      "data/a/glossary.json",
    ]);
  });
});

describe("cache invalidation", () => {
  it("drops changed and removed files and keeps unchanged ones", () => {
    const state = cached({
      "assets/old.js": "x",
      "data/a/01/fragment.html": "h1",
      "data/a/02/meta.json": "changed",
      "index.html": "i",
    });
    expect(stalePaths(MANIFEST, state)).toEqual(["assets/old.js", "data/a/02/meta.json"]);
  });
});

describe("contentHash", () => {
  it("is a stable short SHA-256", async () => {
    const hash = await contentHash(new TextEncoder().encode("abc"));
    expect(hash).toBe("ba7816bf8f01cfea");
  });
});
