export interface ArchiveStoragePort {
  putIfAbsent(key: string, body: Uint8Array): Promise<boolean>;
  getBytes(key: string): Promise<Uint8Array | null>;
}

export function r2ToArchiveStorage(bucket: R2Bucket): ArchiveStoragePort {
  return {
    async putIfAbsent(key, body) {
      return (
        (await bucket.put(key, body, {
          onlyIf: new Headers({ "If-None-Match": "*" }),
          httpMetadata: { contentType: "application/gzip" },
        })) !== null
      );
    },
    async getBytes(key) {
      const obj = await bucket.get(key);
      if (!obj) return null;
      return new Uint8Array(await obj.arrayBuffer());
    },
  };
}

async function gzipBytes(raw: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream("gzip");
  const writer = cs.writable.getWriter();
  const writePromise = writer.write(raw).then(() => writer.close());
  const out = new Uint8Array(await new Response(cs.readable).arrayBuffer());
  await writePromise;
  return out;
}

async function sha256HexBytes(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const arr = new Uint8Array(digest);
  let hex = "";
  for (let i = 0; i < arr.length; i += 1) {
    hex += arr[i]!.toString(16).padStart(2, "0");
  }
  return hex;
}

/**
 * Writes records as gzipped JSON lines under a content-addressed key and reads them back to
 * verify the checksum. Returns the key.
 */
export async function writeVerified(
  storage: ArchiveStoragePort,
  directory: string,
  records: unknown[],
): Promise<string> {
  const raw = new TextEncoder().encode(
    records.map((record) => JSON.stringify(record)).join("\n") + "\n",
  );
  const compressed = await gzipBytes(raw);
  const digest = await sha256HexBytes(compressed);
  const key = `${directory}/${digest}.jsonl.gz`;
  await storage.putIfAbsent(key, compressed);
  const copy = await storage.getBytes(key);
  if (!copy || (await sha256HexBytes(copy)) !== digest) {
    throw new Error(`Archive checksum verification failed for ${key}`);
  }
  return key;
}
