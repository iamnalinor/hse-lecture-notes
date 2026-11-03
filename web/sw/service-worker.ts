/// <reference lib="webworker" />
/**
Offline support. `scripts/build-sw.ts` bundles this into `dist/sw.js` with the build's VERSION
inlined (the manifest itself is a separate file, so the worker that browsers re-check every
minute stays tiny). Any change of any file changes VERSION → the page offers to reload.

- install: fetch the manifest of this version; download the shell and shared data whose content
  changed since the cached copy into a staging cache (the old worker keeps serving meanwhile);
- activate: drop cached files whose content changed or that are gone, move the staged files in;
- fetch: navigations to a page this version knows get the cached app shell, unless `sw.js` on the
  network has changed (checked for up to 1.5 s); then, and for a page this version does not know (a
  new lecture), the page comes from the network, and that tab gets everything from the network
  until it adopts the new worker (`sw-registration.ts`); known files are served from the cache and cached
  on first use (lecture notes are never downloaded until opened, or until the page downloads all of
  them: «Скачать все» or the background download on Wi-Fi, whose requests carry BACKGROUND_HEADER
  and go to the network at low priority); PDFs and the rest go to network.
*/
import {
  BACKGROUND_HEADER,
  CACHE_NAME,
  type CachedHashes,
  contentHash,
  HASH_HEADER,
  knownPages,
  MANIFEST_PATH,
  type OfflineManifest,
  pageOf,
  STAGE_PREFIX,
  stalePaths,
} from "../src/domain/offline.ts";
import { checkForUpdate, hasNewerDeploy } from "./update-check.ts";

declare const self: ServiceWorkerGlobalScope;
declare const VERSION: string;

const STAGE = `${STAGE_PREFIX}${VERSION}`;
const SCOPE = new URL(self.registration.scope);
const SHELL = "index.html";
/** How long a navigation waits for the page from the network before the cached shell. */
const NAVIGATION_TIMEOUT_MS = 4000;
/**
Tabs that loaded a page of a newer deploy from the network: their code expects the new data, so
their requests skip this version's cache. Lost when the browser stops the idle worker, by which
time the page has normally switched to the new worker.
*/
const freshClients = new Set<string>();

const urlOf = (path: string): string => new URL(path, SCOPE).href;

type Known = {
  /** Every file of a document → all files of that document. */
  readonly docOf: ReadonlyMap<string, readonly string[]>;
  readonly manifest: OfflineManifest;
  readonly pages: ReadonlySet<string>;
  readonly pathByUrl: ReadonlyMap<string, string>;
};

const index = (manifest: OfflineManifest): Known => ({
  docOf: new Map(manifest.docs.flatMap((doc) => doc.files.map((file) => [file, doc.files]))),
  manifest,
  pages: knownPages(manifest),
  pathByUrl: new Map(Object.keys(manifest.files).map((path) => [urlOf(path), path])),
});

/** Fetches past the HTTP cache and labels the copy with the hash of what actually arrived. */
const fetchLabelled = async (
  url: string,
  priority: RequestPriority = "auto",
): Promise<Response> => {
  const response = await fetch(url, { cache: "no-cache", priority });
  if (!response.ok) {
    throw new Error(`${url}: ${String(response.status)}`);
  }
  const body = await response.arrayBuffer();
  const headers = new Headers(response.headers);
  headers.set(HASH_HEADER, await contentHash(body));
  return new Response(body, { headers, status: response.status, statusText: response.statusText });
};

const isBackground = (request: Request): boolean => request.headers.has(BACKGROUND_HEADER);

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
const serveKnown = async (
  state: Known,
  path: string,
  priority: RequestPriority,
): Promise<Response> => {
  const key = urlOf(path);
  const expected = state.manifest.files[path];
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(key);
  if (cached !== undefined && labelOf(cached) === expected) {
    return cached;
  }
  try {
    const response = await fetchLabelled(key, priority);
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
  if (state === undefined || path === undefined) {
    return await fetch(request);
  }
  // The page's background download must not compete with what the reader opens.
  return await serveKnown(state, path, isBackground(request) ? "low" : "auto");
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

/**
The page from the network, for a page of a newer deploy (GitHub Pages serves its own copy of the
shell with 200, or a redirect to the address with a slash). Then the tab runs the new code, and the
newer worker is fetched at once. Anything else (offline, slow, `404.html`) → the cached shell,
whose router handles old addresses and shows «not found».
*/
const serveFromNetwork = async (event: FetchEvent): Promise<Response> => {
  // The timeout covers the wait for the headers only: a long page may keep streaming after it.
  const abort = new AbortController();
  const timer = setTimeout(() => {
    abort.abort();
  }, NAVIGATION_TIMEOUT_MS);
  try {
    const response = await fetch(event.request.url, {
      cache: "no-cache",
      redirect: "manual",
      signal: abort.signal,
    });
    clearTimeout(timer);
    if (response.ok || response.type === "opaqueredirect") {
      if (response.ok && event.resultingClientId !== "") {
        freshClients.add(event.resultingClientId);
        event.waitUntil(checkForUpdate());
      }
      return response;
    }
  } catch {
    // Offline or too slow.
  }
  clearTimeout(timer);
  return await serveShell(event.request);
};

/**
A page this version knows → the cached shell, unless a newer deploy is out: then the new version
from the network. A page it does not know (a new lecture) → the network first.
*/
const serveNavigation = async (event: FetchEvent): Promise<Response> => {
  const state = await getKnown();
  if (state === undefined) {
    return await serveShell(event.request);
  }
  const page = pageOf(SCOPE.pathname, new URL(event.request.url).pathname);
  const isCurrent = state.pages.has(page) && !(await hasNewerDeploy());
  return isCurrent ? await serveShell(event.request) : await serveFromNetwork(event);
};

/** Network first for a tab on a newer deploy; this version's cache only when offline. */
const serveFresh = async (request: Request, key: string): Promise<Response> => {
  try {
    return await fetch(request, { cache: "no-cache" });
  } catch {
    return await serveFile(request, key);
  }
};

const serveFileAndDoc = (event: FetchEvent, key: string): void => {
  const served = serveFile(event.request, key);
  event.respondWith(served);
  if (isBackground(event.request)) {
    // The background download asks for every file itself, one at a time.
    return;
  }
  const complete = async (): Promise<void> => {
    try {
      await served;
      await completeDoc(key);
    } catch {
      // Offline or a failed fetch: the document stays partly saved and does not count.
    }
  };
  event.waitUntil(complete());
};

const isFreshRequest = (event: FetchEvent): boolean =>
  freshClients.has(event.clientId) && !isBackground(event.request);

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
    event.respondWith(serveNavigation(event));
    return;
  }
  const key = `${url.origin}${url.pathname}`;
  if (isFreshRequest(event)) {
    event.respondWith(serveFresh(request, key));
    return;
  }
  serveFileAndDoc(event, key);
});

self.addEventListener("message", (event) => {
  const type = (event.data as null | { readonly type?: unknown })?.type;
  if (type === "skip-waiting") {
    void self.skipWaiting();
    return;
  }
  if (type !== "is-fresh") {
    return;
  }
  const source = event.source as Client | null;
  event.ports[0]?.postMessage(source !== null && freshClients.has(source.id));
});
