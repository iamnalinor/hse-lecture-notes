import {
  LazyReadFunctionReadQueue,
  startTls as subtlsStartTls,
  TrustedCert,
  type RootCertsDatabase,
} from "subtls";
import { ROOT_CERTS_PEM } from "../root-certs";
import { BufferedReader } from "./buffered-reader";

let cachedRootCertsDbPromise: Promise<RootCertsDatabase> | null = null;

function getRootCertsDb(): Promise<RootCertsDatabase> {
  if (!cachedRootCertsDbPromise) {
    cachedRootCertsDbPromise = TrustedCert.databaseFromPEM(ROOT_CERTS_PEM);
  }
  return cachedRootCertsDbPromise;
}

/** Where the HTTP/1.1 conversation with the target happens, once the tunnel is up. */
export interface AppChannel {
  writeAppData: (data: Uint8Array) => Promise<void>;
  appBr: BufferedReader;
}

/** HTTP over the raw tunnel as is (no TLS). */
export function plainChannel(
  rawWriter: WritableStreamDefaultWriter<Uint8Array>,
  rawBr: BufferedReader,
): AppChannel {
  return {
    writeAppData: async (data) => {
      await rawWriter.write(data);
    },
    appBr: rawBr,
  };
}

/** TLS 1.3 handshake with the target through the tunnel (pure-JS `subtls`, SNI and certificate verification). */
export async function tlsChannel(
  targetHost: string,
  rawWriter: WritableStreamDefaultWriter<Uint8Array>,
  rawBr: BufferedReader,
): Promise<AppChannel> {
  const rootCertsDb = await getRootCertsDb();
  let writeQueue = Promise.resolve();
  const networkWrite = (data: Uint8Array): void => {
    const copy = new Uint8Array(data);
    writeQueue = writeQueue.then(() => rawWriter.write(copy));
  };
  const rq = new LazyReadFunctionReadQueue(async () => {
    const chunk = await rawBr.readNextChunk();
    return chunk ?? undefined;
  });
  const tls = await subtlsStartTls(targetHost, rootCertsDb, rq.read.bind(rq), networkWrite, {
    useSNI: true,
  });
  return {
    writeAppData: async (data) => {
      const CHUNK_SIZE = 8192;
      for (let offset = 0; offset < data.length; offset += CHUNK_SIZE) {
        await tls.write(data.subarray(offset, offset + CHUNK_SIZE));
      }
      await writeQueue;
    },
    appBr: new BufferedReader(async () => {
      const chunk = await tls.read();
      return chunk === undefined ? null : chunk;
    }),
  };
}
