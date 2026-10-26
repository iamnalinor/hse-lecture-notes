/**
After `vite build`: hashes everything in dist/, writes `dist/offline-manifest.json` and bundles the
service worker (`sw/service-worker.ts` → `dist/sw.js`) with the manifest's version inlined.
Lecture notes, theory, the course program, glossaries and preps become documents that are cached on first open; the shell and
the shared data (catalog, label index, macros) are precached. PDFs stay network-only.
*/
import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { isCourseDoc } from "../src/domain/course-docs.ts";
import {
  contentHash,
  MANIFEST_PATH,
  type OfflineDoc,
  type OfflineDocKind,
  type OfflineManifest,
} from "../src/domain/offline.ts";
import { isPrepId } from "../src/domain/preps.ts";

const DIST = fileURLToPath(new URL("../dist/", import.meta.url));
const WORKER = fileURLToPath(new URL("../sw/service-worker.ts", import.meta.url));

const SKIPPED = new Set(["404.html", "sw.js", MANIFEST_PATH]);
// Per-page copies of the shell (`algebra/…/index.html`) for static hosting: navigations get the one shell.
const PAGE_SHELL = /^(?!data\/).+\/index\.html$/u;
const SHARED_DATA = new Set(["data/courses.json", "data/index.json", "data/katex-macros.json"]);
// Browsers that run service workers all take woff2: the woff/ttf fallbacks of KaTeX are not precached.
const PRECACHED_ASSET = /^assets\/.+\.(?:css|js|woff2)$/u;
// data/<course>/<doc>/… (a lecture, the theory, the program, a prep) and data/<course>/glossary.json
const DOC_FILE = /^data\/(?<course>[^/]+)\/(?:(?<doc>[^/]+)\/.+|glossary\.json)$/u;

const encode = (text: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(text);

const allFiles = async (): Promise<string[]> => {
  const entries = await readdir(DIST, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) =>
      path.relative(DIST, path.join(entry.parentPath, entry.name)).split(path.sep).join("/"),
    )
    .filter((file) => !SKIPPED.has(file) && !PAGE_SHELL.test(file) && !file.startsWith("pdf/"))
    .toSorted((a, b) => a.localeCompare(b));
};

const kindOf = (doc: string): OfflineDocKind => {
  if (doc === "glossary") {
    return "glossary";
  }
  if (isPrepId(doc)) {
    return "prep";
  }
  return isCourseDoc(doc) ? doc : "notes";
};

const docsOf = (paths: readonly string[]): OfflineDoc[] => {
  const byId = new Map<string, { files: string[]; kind: OfflineDocKind }>();
  for (const file of paths) {
    const groups = DOC_FILE.exec(file)?.groups;
    if (groups?.["course"] === undefined) {
      continue;
    }
    const doc = groups["doc"] ?? "glossary";
    const id = `${groups["course"]}/${doc}`;
    const entry = byId.get(id) ?? { files: [], kind: kindOf(doc) };
    entry.files.push(file);
    byId.set(id, entry);
  }
  return [...byId].map(([id, { files, kind }]) => ({ files, id, kind }));
};

const isPrecached = (file: string): boolean =>
  file === "index.html" ||
  file === "favicon.svg" ||
  SHARED_DATA.has(file) ||
  PRECACHED_ASSET.test(file);

const paths = await allFiles();
const hashes = await Promise.all(
  paths.map(async (file) => await contentHash(await Bun.file(path.join(DIST, file)).bytes())),
);
const files: Record<string, string> = Object.fromEntries(
  paths.map((file, index): [string, string] => [file, hashes[index] ?? ""]),
);
const manifest: OfflineManifest = {
  docs: docsOf(paths),
  files,
  precache: paths.filter((file) => isPrecached(file)),
  version: await contentHash(encode(JSON.stringify(files))),
};
await Bun.write(path.join(DIST, MANIFEST_PATH), JSON.stringify(manifest));

const result = await Bun.build({
  define: { VERSION: JSON.stringify(manifest.version) },
  entrypoints: [WORKER],
  minify: true,
  naming: "sw.js",
  outdir: DIST,
  target: "browser",
});
if (!result.success) {
  console.error(result.logs);
  process.exit(1);
}
console.log(
  `dist/sw.js: ${String(manifest.precache.length)} precached files, ${String(manifest.docs.length)} documents, version ${manifest.version}`,
);
