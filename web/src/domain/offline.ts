/**
Offline model shared by the service worker (`sw/service-worker.ts`), the build step that writes
the manifest (`scripts/build-sw.ts`) and the page. Paths are relative to the site base.

- `files`: every file the worker knows → content hash. A cached copy is valid only while its
  hash (stored in the `HASH_HEADER` of the cached response) equals the one in the manifest.
- `precache`: the shell and the shared data, downloaded when the worker installs.
- `docs`: lecture notes, theory, the course program, glossaries and test preparation; cached only once
  the reader opens them.
*/

export type OfflineDocKind = "glossary" | "notes" | "prep" | "program" | "theory";

export type OfflineDoc = {
  readonly files: readonly string[];
  /** `<course>/<week_id>`, `<course>/theory`, `<course>/program`, `<course>/glossary`, `<course>/kr1`. */
  readonly id: string;
  readonly kind: OfflineDocKind;
};

export type OfflineManifest = {
  readonly docs: readonly OfflineDoc[];
  readonly files: Readonly<Record<string, string>>;
  readonly precache: readonly string[];
  readonly version: string;
};

export const CACHE_NAME = "hse-notes";
export const STAGE_PREFIX = "hse-notes-stage-";
export const HASH_HEADER = "x-content-hash";
export const MANIFEST_PATH = "offline-manifest.json";
/**
Marks a request of the page's background download (`api/offline-cache.ts`): the worker fetches
such a file at low priority and does not fetch the rest of its document at once — the page asks
for every file itself, one at a time.
*/
export const BACKGROUND_HEADER = "x-offline-background";

const HASH_LENGTH = 16;

/** Short SHA-256 of the bytes, hex. Works in Bun, browsers and workers. */
export const contentHash = async (
  bytes: ArrayBuffer | Uint8Array<ArrayBuffer>,
): Promise<string> => {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return [...digest]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, HASH_LENGTH);
};

/** Hash stored with each cached file, by path; `undefined` = not cached. */
export type CachedHashes = ReadonlyMap<string, string | undefined>;

const isFresh = (manifest: OfflineManifest, cached: CachedHashes, path: string): boolean => {
  const expected = manifest.files[path];
  return expected !== undefined && cached.get(path) === expected;
};

export const isDocFresh = (
  manifest: OfflineManifest,
  cached: CachedHashes,
  doc: OfflineDoc,
): boolean => doc.files.every((path) => isFresh(manifest, cached, path));

/** Cached paths the manifest no longer vouches for: removed files or changed content. */
export const stalePaths = (manifest: OfflineManifest, cached: CachedHashes): readonly string[] =>
  cached
    .keys()
    .filter((path) => !isFresh(manifest, cached, path))
    .toArray();

/** Files still to download so that every document works offline. */
export const missingDocFiles = (
  manifest: OfflineManifest,
  cached: CachedHashes,
): readonly string[] =>
  manifest.docs.flatMap((doc) => doc.files).filter((path) => !isFresh(manifest, cached, path));

export type OfflineCount = { readonly saved: number; readonly total: number };

/** Lecture notes that are saved with their current content (outdated copies do not count). */
export const countSavedNotes = (manifest: OfflineManifest, cached: CachedHashes): OfflineCount => {
  const notes = manifest.docs.filter((doc) => doc.kind === "notes");
  return {
    saved: notes.filter((doc) => isDocFresh(manifest, cached, doc)).length,
    total: notes.length,
  };
};
