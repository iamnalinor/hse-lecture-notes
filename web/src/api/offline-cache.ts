import {
  CACHE_NAME,
  type CachedHashes,
  HASH_HEADER,
  MANIFEST_PATH,
  missingDocFiles,
  type OfflineManifest,
} from "#web/domain/offline.ts";
import { OfflineManifestSchema } from "#web/domain/schemas.ts";

/** What the service worker caches; see `sw/service-worker.ts`. */
const BASE = import.meta.env.BASE_URL;
const PARALLEL_DOWNLOADS = 4;

const urlOf = (path: string): string => `${BASE}${path}`;

export const isOfflineSupported = (): boolean =>
  import.meta.env.PROD && "serviceWorker" in navigator && "caches" in globalThis;

/** `undefined` when the site was built without the worker (dev server). */
export const fetchOfflineManifest = async (): Promise<OfflineManifest | undefined> => {
  const response = await fetch(urlOf(MANIFEST_PATH));
  return response.ok ? OfflineManifestSchema.parse(await response.json()) : undefined;
};

/** Hash of every cached document file, by path. */
export const readCachedHashes = async (manifest: OfflineManifest): Promise<CachedHashes> => {
  const cache = await caches.open(CACHE_NAME);
  const paths = manifest.docs.flatMap((doc) => doc.files);
  const hashes = await Promise.all(
    paths.map(async (path) => {
      const response = await cache.match(urlOf(path));
      return response?.headers.get(HASH_HEADER);
    }),
  );
  return new Map(paths.map((path, index) => [path, hashes[index] ?? undefined]));
};

/**
Downloads every document that is missing or outdated. The requests go through the service worker,
which stores them; without a controlling worker nothing would be saved, so the caller checks first.
*/
export const downloadAll = async (
  manifest: OfflineManifest,
  onProgress: (done: number, total: number) => void,
): Promise<void> => {
  const queue = [...missingDocFiles(manifest, await readCachedHashes(manifest))];
  const total = queue.length;
  let done = 0;
  const worker = async (): Promise<void> => {
    for (let path = queue.shift(); path !== undefined; path = queue.shift()) {
      const response = await fetch(urlOf(path));
      if (!response.ok) {
        throw new Error(`Не удалось скачать ${path}: ${String(response.status)}`);
      }
      await response.arrayBuffer();
      done += 1;
      onProgress(done, total);
    }
  };
  onProgress(0, total);
  await Promise.all(Array.from({ length: PARALLEL_DOWNLOADS }, worker));
};
