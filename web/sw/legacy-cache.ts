import { HASH_HEADER, MANIFEST_PATH, type OfflineManifest } from "../src/domain/offline.ts";

/** Preserve the installed root site's downloads on its first scoped upgrade. Old preview
workers can still own entries in the legacy cache, so leave it intact. */
export const importLegacyRoot = async (
  main: Cache,
  scope: URL,
  manifest: OfflineManifest,
): Promise<void> => {
  if (
    scope.pathname !== "/" ||
    (await main.match(new URL(MANIFEST_PATH, scope))) !== undefined ||
    !(await caches.has("hse-notes"))
  ) {
    return;
  }
  const legacy = await caches.open("hse-notes");
  const expectedByUrl = new Map(
    Object.entries(manifest.files).map(([path, hash]) => [new URL(path, scope).href, hash]),
  );
  const requests = await legacy.keys();
  for (const request of requests) {
    const expected = expectedByUrl.get(request.url);
    if (expected === undefined) {
      continue;
    }
    const response = await legacy.match(request);
    if (response?.headers.get(HASH_HEADER) === expected) {
      await main.put(request, response);
    }
  }
};
