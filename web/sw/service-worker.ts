/// <reference lib="webworker" />
/**
Offline support. `scripts/build-sw.ts` bundles this into `dist/sw.js` with the build's VERSION
inlined (the manifest itself is a separate file, so the worker that browsers re-check every
minute stays tiny). Any change of any file changes VERSION → the page offers to reload.

- install: fetch the manifest of this version; download the shell and shared data whose content
  changed since the cached copy into a staging cache (the old worker keeps serving meanwhile);
- activate: drop cached files whose content changed or that are gone, move the staged files in;
- fetch: navigations get the cached app shell; known files are served from the cache and cached
  on first use (lecture notes are never downloaded until opened); PDFs and the rest go to network.
*/
import {
  CACHE_NAME,
  type CachedHashes,
  contentHash,
  HASH_HEADER,
  MANIFEST_PATH,
  type OfflineManifest,
  STAGE_PREFIX,
  stalePaths,
} from "../src/domain/offline.ts";

declare const self: ServiceWorkerGlobalScope;
declare const VERSION: string;

const STAGE = `${STAGE_PREFIX}${VERSION}`;
const SCOPE = new URL(self.registration.scope);
const SHELL = "index.html";

const urlOf = (path: string): string => new URL(path, SCOPE).href;

type Known = {
  /** Every file of a document → all files of that document. */
  readonly docOf: ReadonlyMap<string, readonly string[]>;
  readonly manifest: OfflineManifest;
  readonly pathByUrl: ReadonlyMap<string, string>;
};

const index = (manifest: OfflineManifest): Known => ({
  docOf: new Map(manifest.docs.flatMap((doc) => doc.files.map((file) => [file, doc.files]))),
  manifest,
  pathByUrl: new Map(Object.keys(manifest.files).map((path) => [urlOf(path), path])),
});

/** Fetches past the HTTP cache and labels the copy with the hash of what actually arrived. */
const fetchLabelled = async (url: string): Promise<Response> => {
  const response = await fetch(url, { cache: "no-cache" });
  if (!response.ok) {
    throw new Error(`${url}: ${String(response.status)}`);
  }
  const body = await response.arrayBuffer();
  const headers = new Headers(response.headers);
  headers.set(HASH_HEADER, await contentHash(body));
  return new Response(body, { headers, status: response.status, statusText: response.statusText });
};

const labelOf = (response: Response | undefined): string | undefined =>
  response?.headers.get(HASH_HEADER) ?? undefined;

const readManifest = async (cacheName: string): Promise<OfflineManifest | undefined> => {
  const cache = await caches.open(cacheName);
  const response = await cache.match(urlOf(MANIFEST_PATH));
  const manifest = (await response?.json()) as OfflineManifest | undefined;
  return manifest?.version === VERSION ? manifest : undefined;
};

/** The manifest of this worker's version, read once from the cache. */
const known: { promise: Promise<Known | undefined> | undefined } = { promise: undefined };
const loadKnown = async (): Promise<Known | undefined> => {
  const manifest = await readManifest(CACHE_NAME);
  return manifest === undefined ? undefined : index(manifest);
};
const getKnown = async (): Promise<Known | undefined> => {
  known.promise ??= loadKnown();
  return await known.promise;
};

const install = async (): Promise<void> => {
  const response = await fetchLabelled(urlOf(MANIFEST_PATH));
  const manifest = (await response.clone().json()) as OfflineManifest;
  if (manifest.version !== VERSION) {
    // The CDN still serves the previous deploy: fail, the browser retries later.
    throw new Error(`manifest ${manifest.version}, worker ${VERSION}`);
  }
  const [main, stage] = await Promise.all([caches.open(CACHE_NAME), caches.open(STAGE)]);
  await stage.put(urlOf(MANIFEST_PATH), response);
  await Promise.all(
    manifest.precache.map(async (path) => {
      const url = urlOf(path);
      if (labelOf(await main.match(url)) !== manifest.files[path]) {
        await stage.put(url, await fetchLabelled(url));
      }
    }),
  );
};

const cachedHashes = async (cache: Cache, pathByUrl: ReadonlyMap<string, string>) => {
  const requests = await cache.keys();
  const labels = await Promise.all(
    requests.map(async (request) => labelOf(await cache.match(request))),
  );
  const entries = requests.map((request, at): [string, string | undefined] => [
    pathByUrl.get(request.url) ?? request.url,
    labels[at],
  ]);
  return new Map(entries) satisfies CachedHashes;
};

const moveStaged = async (main: Cache): Promise<void> => {
  const stage = await caches.open(STAGE);
  const staged = await stage.keys();
  for (const request of staged) {
    const response = await stage.match(request);
    if (response !== undefined) {
      await main.put(request, response);
    }
  }
};

const activate = async (): Promise<void> => {
  const manifest = await readManifest(STAGE);
  const main = await caches.open(CACHE_NAME);
  if (manifest !== undefined) {
    const { pathByUrl } = index(manifest);
    const stale = stalePaths(manifest, await cachedHashes(main, pathByUrl));
    await Promise.all(stale.map(async (path) => await main.delete(urlOf(path))));
    await moveStaged(main);
  }
  const names = await caches.keys();
  await Promise.all(
    names
      .filter((name) => name.startsWith(STAGE_PREFIX))
      .map(async (name) => await caches.delete(name)),
  );
  await self.clients.claim();
};

/** Tells open pages that a document file landed in the cache (the footer counter updates). */
const announce = async (): Promise<void> => {
  const pages = await self.clients.matchAll({ type: "window" });
  for (const page of pages) {
    page.postMessage({ type: "doc-cached" });
  }
};

/** Cache first; a miss is fetched and kept if it is the content the manifest expects. */
const serveKnown = async (state: Known, key: string, path: string): Promise<Response> => {
  const expected = state.manifest.files[path];
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(key);
  if (cached !== undefined && labelOf(cached) === expected) {
    return cached;
  }
  try {
    const response = await fetchLabelled(key);
    if (labelOf(response) === expected) {
      await cache.put(key, response.clone());
      if (state.docOf.has(path)) {
        await announce();
      }
    }
    return response;
  } catch {
    return cached ?? Response.error();
  }
};

const serveFile = async (request: Request, key: string): Promise<Response> => {
  if (key === urlOf(MANIFEST_PATH)) {
    const cache = await caches.open(CACHE_NAME);
    return (await cache.match(key)) ?? (await fetch(request));
  }
  const state = await getKnown();
  const path = state?.pathByUrl.get(key);
  return state === undefined || path === undefined
    ? await fetch(request)
    : await serveKnown(state, key, path);
};

/**
Opening a document saves all of it: figures further down the page are fetched too, so a lecture
that was opened once works offline in full.
*/
const completeDoc = async (key: string): Promise<void> => {
  const state = await getKnown();
  const files = state?.docOf.get(state.pathByUrl.get(key) ?? "");
  if (state === undefined || files === undefined) {
    return;
  }
  const cache = await caches.open(CACHE_NAME);
  const saved = await Promise.all(
    files.map(async (file) => {
      const url = urlOf(file);
      if (labelOf(await cache.match(url)) === state.manifest.files[file]) {
        return false;
      }
      const response = await fetchLabelled(url);
      await cache.put(url, response);
      return true;
    }),
  );
  if (saved.includes(true)) {
    await announce();
  }
};

const serveShell = async (request: Request): Promise<Response> => {
  const cache = await caches.open(CACHE_NAME);
  const shell = await cache.match(urlOf(SHELL));
  if (shell !== undefined) {
    return shell;
  }
  try {
    return await fetch(request);
  } catch {
    return Response.error();
  }
};

self.addEventListener("install", (event) => {
  event.waitUntil(install());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(activate());
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  const isInScope = url.origin === SCOPE.origin && url.pathname.startsWith(SCOPE.pathname);
  if (!isInScope || request.method !== "GET" || url.pathname.endsWith(".pdf")) {
    return;
  }
  if (request.mode === "navigate") {
    event.respondWith(serveShell(request));
    return;
  }
  const key = `${url.origin}${url.pathname}`;
  const served = serveFile(request, key);
  event.respondWith(served);
  const complete = async (): Promise<void> => {
    try {
      await served;
      await completeDoc(key);
    } catch {
      // Offline or a failed fetch: the document stays partly saved and does not count.
    }
  };
  event.waitUntil(complete());
});

self.addEventListener("message", (event) => {
  if ((event.data as null | { readonly type?: unknown })?.type === "skip-waiting") {
    void self.skipWaiting();
  }
});
