import {
  LazyReadFunctionReadQueue,
  startTls as subtlsStartTls,
  TrustedCert,
  type RootCertsDatabase,
} from "subtls";
import { ROOT_CERTS_PEM } from "./root-certs";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export interface SocketHandle {
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;
  close(): Promise<void>;
}

export type SocketConnector = (
  address: { hostname: string; port: number },
  options?: { secureTransport?: "on" | "off" | "starttls"; allowHalfOpen?: boolean },
) => SocketHandle;

let cachedRootCertsDbPromise: Promise<RootCertsDatabase> | null = null;

function getRootCertsDb(): Promise<RootCertsDatabase> {
  if (!cachedRootCertsDbPromise) {
    cachedRootCertsDbPromise = TrustedCert.databaseFromPEM(ROOT_CERTS_PEM);
  }
  return cachedRootCertsDbPromise;
}

/** Buffered byte reader over an async chunk source without losing leftover bytes. */
class BufferedReader {
  private readonly nextChunkFn: () => Promise<Uint8Array | null>;
  private buf: Uint8Array = new Uint8Array(0);

  constructor(nextChunkFn: () => Promise<Uint8Array | null>) {
    this.nextChunkFn = nextChunkFn;
  }

  private append(chunk: Uint8Array): void {
    if (this.buf.length === 0) {
      this.buf = chunk;
      return;
    }
    const merged = new Uint8Array(this.buf.length + chunk.length);
    merged.set(this.buf, 0);
    merged.set(chunk, this.buf.length);
    this.buf = merged;
  }

  async readExact(n: number): Promise<Uint8Array> {
    while (this.buf.length < n) {
      const chunk = await this.nextChunkFn();
      if (chunk === null) {
        throw new Error(`Unexpected EOF while reading ${n} bytes (got ${this.buf.length})`);
      }
      if (chunk.length > 0) {
        this.append(chunk);
      }
    }
    const out = this.buf.slice(0, n);
    this.buf = this.buf.slice(n);
    return out;
  }

  async readUntil(
    delimiter: Uint8Array,
    maxBytes = 65_536,
    stage: "headers" | "body" = "headers",
  ): Promise<Uint8Array> {
    while (true) {
      const idx = indexOfBytes(this.buf, delimiter);
      if (idx !== -1) {
        const out = this.buf.slice(0, idx);
        this.buf = this.buf.slice(idx + delimiter.length);
        return out;
      }
      if (this.buf.length > maxBytes) {
        throw new Error(`Exceeded ${maxBytes} bytes searching for header delimiter`);
      }
      const chunk = await this.nextChunkFn();
      if (chunk === null) {
        throw new ResponseEofError(stage);
      }
      if (chunk.length > 0) {
        this.append(chunk);
      }
    }
  }

  async readNextChunk(): Promise<Uint8Array | null> {
    if (this.buf.length > 0) {
      const out = this.buf;
      this.buf = new Uint8Array(0);
      return out;
    }
    return this.nextChunkFn();
  }
}

function indexOfBytes(haystack: Uint8Array, needle: Uint8Array): number {
  outer: for (let i = 0; i <= haystack.length - needle.length; i += 1) {
    for (let j = 0; j < needle.length; j += 1) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}

export class ResponseEofError extends Error {
  constructor(readonly stage: "headers" | "before_event" | "body") {
    super(`Unexpected EOF while reading HTTP response ${stage}`);
  }
}

export class ProxyConnectError extends Error {
  constructor(
    readonly reply: number | null,
    cause?: unknown,
  ) {
    super(
      reply === null
        ? "Proxy connection failed before request"
        : `SOCKS5 CONNECT failed (rep=${reply})`,
      { cause },
    );
  }
}

async function performSocks5Handshake(
  br: BufferedReader,
  writer: WritableStreamDefaultWriter<Uint8Array>,
  targetHost: string,
  targetPort: number,
  username: string,
  password: string,
): Promise<void> {
  const hasAuth = username.length > 0 || password.length > 0;
  // 1. Greeting
  await writer.write(
    hasAuth ? new Uint8Array([0x05, 0x02, 0x00, 0x02]) : new Uint8Array([0x05, 0x01, 0x00]),
  );
  const greetResp = await br.readExact(2);
  if (greetResp[0] !== 0x05) {
    throw new Error(`SOCKS5 invalid version: ${greetResp[0]}`);
  }
  const method = greetResp[1];
  if (method === 0xff) {
    throw new Error("SOCKS5 proxy rejected all authentication methods");
  }

  // 2. RFC 1929 Username/Password Auth
  if (method === 0x02) {
    const uBytes = encoder.encode(username);
    const pBytes = encoder.encode(password);
    if (uBytes.length > 255 || pBytes.length > 255) {
      throw new Error("SOCKS5 username/password exceeds 255 bytes");
    }
    const authReq = new Uint8Array(3 + uBytes.length + pBytes.length);
    authReq[0] = 0x01;
    authReq[1] = uBytes.length;
    authReq.set(uBytes, 2);
    authReq[2 + uBytes.length] = pBytes.length;
    authReq.set(pBytes, 3 + uBytes.length);
    await writer.write(authReq);

    const authResp = await br.readExact(2);
    if (authResp[1] !== 0x00) {
      throw new Error(`SOCKS5 authentication failed (status=${authResp[1]})`);
    }
  } else if (method !== 0x00) {
    throw new Error(`SOCKS5 unsupported auth method: ${method}`);
  }

  // 3. CONNECT request (ATYP = 0x03 domain so DNS resolves on proxy)
  const hostBytes = encoder.encode(targetHost);
  if (hostBytes.length > 255) {
    throw new Error("Target hostname exceeds 255 bytes");
  }
  const req = new Uint8Array(7 + hostBytes.length);
  req[0] = 0x05; // VER
  req[1] = 0x01; // CMD = CONNECT
  req[2] = 0x00; // RSV
  req[3] = 0x03; // ATYP = DOMAINNAME
  req[4] = hostBytes.length;
  req.set(hostBytes, 5);
  req[5 + hostBytes.length] = (targetPort >> 8) & 0xff;
  req[6 + hostBytes.length] = targetPort & 0xff;
  await writer.write(req);

  // 4. Read CONNECT reply
  const replyHead = await br.readExact(4);
  if (replyHead[0] !== 0x05) throw new Error("Invalid SOCKS5 CONNECT reply");
  if (replyHead[1] !== 0x00) throw new ProxyConnectError(replyHead[1]!);
  const atyp = replyHead[3];
  if (atyp === 0x01) {
    await br.readExact(6);
  } else if (atyp === 0x04) {
    await br.readExact(18);
  } else if (atyp === 0x03) {
    const lenByte = await br.readExact(1);
    await br.readExact(lenByte[0]! + 2);
  } else {
    throw new Error(`SOCKS5 unknown reply ATYP: ${atyp}`);
  }
}

async function performHttpConnectHandshake(
  br: BufferedReader,
  writer: WritableStreamDefaultWriter<Uint8Array>,
  targetHost: string,
  targetPort: number,
  username: string,
  password: string,
): Promise<void> {
  const CRLFCRLF = new Uint8Array([13, 10, 13, 10]);
  const lines = [
    `CONNECT ${targetHost}:${targetPort} HTTP/1.1`,
    `Host: ${targetHost}:${targetPort}`,
  ];
  if (username || password) {
    lines.push(`Proxy-Authorization: Basic ${btoa(`${username}:${password}`)}`);
  }
  lines.push("", "");
  await writer.write(encoder.encode(lines.join("\r\n")));

  const headerBytes = await br.readUntil(CRLFCRLF);
  const statusLine = decoder.decode(headerBytes).split("\r\n")[0] ?? "";
  if (!/^HTTP\/1\.[01]\s+200\b/.test(statusLine)) {
    throw new Error(`HTTP CONNECT proxy failed: ${statusLine}`);
  }
}

function createChunkedBodyStream(
  br: BufferedReader,
  closeSocket: () => void,
): ReadableStream<Uint8Array> {
  const CRLF = new Uint8Array([13, 10]);
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        while (true) {
          const sizeLineBytes = await br.readUntil(CRLF, 1024, "body");
          const sizeLine = decoder.decode(sizeLineBytes).split(";")[0]!.trim();
          if (!sizeLine) continue;
          const chunkSize = parseInt(sizeLine, 16);
          if (!Number.isFinite(chunkSize) || chunkSize < 0) {
            throw new Error(`Invalid HTTP chunk size: ${sizeLine}`);
          }
          if (chunkSize === 0) {
            controller.close();
            closeSocket();
            return;
          }
          const data = await br.readExact(chunkSize);
          await br.readExact(2); // trailing \r\n
          if (data.length > 0) {
            controller.enqueue(data);
            return;
          }
        }
      } catch (err) {
        closeSocket();
        controller.error(err);
      }
    },
    cancel() {
      closeSocket();
    },
  });
}

function createRawBodyStream(
  br: BufferedReader,
  contentLength: number | null,
  closeSocket: () => void,
): ReadableStream<Uint8Array> {
  let remaining = contentLength;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        if (remaining !== null && remaining <= 0) {
          controller.close();
          closeSocket();
          return;
        }
        const chunk = await br.readNextChunk();
        if (chunk === null) {
          controller.close();
          closeSocket();
          return;
        }
        if (remaining !== null && chunk.length > remaining) {
          controller.enqueue(chunk.slice(0, remaining));
          remaining = 0;
          controller.close();
          closeSocket();
          return;
        }
        if (remaining !== null) {
          remaining -= chunk.length;
        }
        if (chunk.length > 0) {
          controller.enqueue(chunk);
        }
      } catch (err) {
        closeSocket();
        controller.error(err);
      }
    },
    cancel() {
      closeSocket();
    },
  });
}

async function defaultConnector(
  address: { hostname: string; port: number },
  options?: { secureTransport?: "on" | "off" | "starttls"; allowHalfOpen?: boolean },
): Promise<SocketHandle> {
  const mod = (await import("cloudflare:sockets")) as {
    connect: SocketConnector;
  };
  return mod.connect(address, options);
}

/**
 * Performs an HTTPS/HTTP fetch over a SOCKS5 (`socks5://` / `socks5h://`) or HTTP CONNECT proxy
 * using plain TCP (`cloudflare:sockets` with `secureTransport: "off"`) + pure-JS TLS 1.3 (`subtls`)
 * so SNI (`server_name`) and X.509 certificate verification always work on Cloudflare's edge.
 */
export async function fetchViaProxy(
  proxyUrlRaw: string,
  input: string | URL | Request,
  initArg: RequestInit = {},
  connector?: SocketConnector,
): Promise<Response> {
  // Merge a Request input with `init` the way fetch() does: init wins, Request supplies the rest.
  let init: RequestInit = initArg;
  if (input instanceof Request) {
    const headers = new Headers(input.headers);
    new Headers(initArg.headers).forEach((value, key) => headers.set(key, value));
    const hasBody = input.body !== null && initArg.body === undefined;
    init = {
      ...initArg,
      method: initArg.method ?? input.method,
      headers,
      signal: initArg.signal ?? input.signal,
      body: hasBody ? await input.arrayBuffer() : initArg.body,
    };
  }
  const proxyUrl = new URL(proxyUrlRaw);
  const proxyScheme = proxyUrl.protocol.replace(/:$/, "").toLowerCase();
  const proxyHost = proxyUrl.hostname;
  const proxyPort = proxyUrl.port
    ? Number(proxyUrl.port)
    : proxyScheme.startsWith("socks")
      ? 1080
      : 8080;
  const proxyUser = decodeURIComponent(proxyUrl.username);
  const proxyPass = decodeURIComponent(proxyUrl.password);

  const targetUrl =
    typeof input === "string" ? new URL(input) : input instanceof URL ? input : new URL(input.url);
  const isHttps = targetUrl.protocol === "https:";
  const targetHost = targetUrl.hostname;
  const targetPort = targetUrl.port ? Number(targetUrl.port) : isHttps ? 443 : 80;
  const method = (init.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  const pathAndQuery = `${targetUrl.pathname || "/"}${targetUrl.search}`;

  let rawSocket: SocketHandle;
  try {
    rawSocket = await (connector ?? defaultConnector)(
      { hostname: proxyHost, port: proxyPort },
      { secureTransport: "off", allowHalfOpen: false },
    );
  } catch (error) {
    throw new ProxyConnectError(null, error);
  }

  const onAbort = () => {
    void rawSocket.close().catch(() => {});
  };
  if (init.signal?.aborted) {
    onAbort();
    throw new DOMException("Aborted", "AbortError");
  }
  init.signal?.addEventListener("abort", onAbort, { once: true });

  const closeActive = () => {
    init.signal?.removeEventListener("abort", onAbort);
    void rawSocket.close().catch(() => {});
  };

  let requestStarted = false;
  try {
    const rawWriter = rawSocket.writable.getWriter();
    const rawReader = rawSocket.readable.getReader();
    const rawBr = new BufferedReader(async () => {
      const { value, done } = await rawReader.read();
      return done ? null : (value ?? new Uint8Array(0));
    });

    if (proxyScheme === "socks5" || proxyScheme === "socks5h") {
      await performSocks5Handshake(rawBr, rawWriter, targetHost, targetPort, proxyUser, proxyPass);
    } else if (proxyScheme === "http") {
      await performHttpConnectHandshake(
        rawBr,
        rawWriter,
        targetHost,
        targetPort,
        proxyUser,
        proxyPass,
      );
    } else {
      throw new Error(`Unsupported proxy scheme: ${proxyScheme}`);
    }

    let writeAppData: (data: Uint8Array) => Promise<void>;
    let appBr: BufferedReader;

    if (isHttps) {
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
      writeAppData = async (data: Uint8Array) => {
        const CHUNK_SIZE = 8192;
        for (let offset = 0; offset < data.length; offset += CHUNK_SIZE) {
          await tls.write(data.subarray(offset, offset + CHUNK_SIZE));
        }
        await writeQueue;
      };
      appBr = new BufferedReader(async () => {
        const chunk = await tls.read();
        return chunk === undefined ? null : chunk;
      });
    } else {
      writeAppData = async (data: Uint8Array) => {
        await rawWriter.write(data);
      };
      appBr = rawBr;
    }

    // Prepare HTTP/1.1 request body & headers
    let bodyBytes: Uint8Array = new Uint8Array(0);
    let encodedContentType: string | null = null;
    if (typeof init.body === "string") {
      bodyBytes = encoder.encode(init.body);
    } else if (init.body instanceof Uint8Array) {
      bodyBytes = init.body;
    } else if (init.body instanceof ArrayBuffer) {
      bodyBytes = new Uint8Array(init.body);
    } else if (ArrayBuffer.isView(init.body)) {
      bodyBytes = new Uint8Array(init.body.buffer, init.body.byteOffset, init.body.byteLength);
    } else if (init.body != null) {
      // FormData, Blob, URLSearchParams, streams: let the platform serialize them.
      const encoded = new Request(targetUrl, { method: "POST", body: init.body });
      bodyBytes = new Uint8Array(await encoded.arrayBuffer());
      encodedContentType = encoded.headers.get("content-type");
    }

    const reqHeaders = new Headers(init.headers);
    if (encodedContentType && !reqHeaders.has("content-type")) {
      reqHeaders.set("content-type", encodedContentType);
    }
    if (!reqHeaders.has("host")) {
      reqHeaders.set("host", targetUrl.port ? `${targetHost}:${targetUrl.port}` : targetHost);
    }
    if (!reqHeaders.has("accept-encoding")) {
      reqHeaders.set("accept-encoding", "identity");
    }
    reqHeaders.set("connection", "close");
    if (bodyBytes.length > 0 || method === "POST" || method === "PUT" || method === "PATCH") {
      reqHeaders.set("content-length", String(bodyBytes.length));
    }

    const headLines: string[] = [`${method} ${pathAndQuery} HTTP/1.1`];
    reqHeaders.forEach((value, key) => {
      headLines.push(`${key}: ${value}`);
    });
    headLines.push("", "");
    const headBytes = encoder.encode(headLines.join("\r\n"));

    requestStarted = true;
    await writeAppData(headBytes);
    if (bodyBytes.length > 0) {
      await writeAppData(bodyBytes);
    }

    // Read HTTP/1.1 response status & headers
    const CRLFCRLF = new Uint8Array([13, 10, 13, 10]);
    const rawHead = await appBr.readUntil(CRLFCRLF);
    const headText = decoder.decode(rawHead);
    const lines = headText.split("\r\n");
    const statusLine = lines[0] ?? "";
    const statusMatch = /^HTTP\/\d\.\d\s+(\d{3})(?:\s+(.*))?$/.exec(statusLine);
    if (!statusMatch) {
      throw new Error(`Malformed HTTP response status line: ${statusLine.slice(0, 120)}`);
    }
    const status = Number(statusMatch[1]);
    const statusText = statusMatch[2] ?? "";

    const respHeaders = new Headers();
    for (let i = 1; i < lines.length; i += 1) {
      const line = lines[i]!;
      const colon = line.indexOf(":");
      if (colon > 0) {
        respHeaders.append(line.slice(0, colon).trim(), line.slice(colon + 1).trim());
      }
    }

    const te = (respHeaders.get("transfer-encoding") ?? "").toLowerCase();
    const isChunked = te.includes("chunked");
    const clRaw = respHeaders.get("content-length");
    const contentLength = clRaw && /^\d+$/.test(clRaw.trim()) ? Number(clRaw.trim()) : null;

    const noBody = method === "HEAD" || status === 204 || status === 205 || status === 304;
    if (noBody) {
      closeActive();
      return new Response(null, { status, statusText, headers: respHeaders });
    }

    const bodyStream = isChunked
      ? createChunkedBodyStream(appBr, closeActive)
      : createRawBodyStream(appBr, contentLength, closeActive);

    return new Response(bodyStream, {
      status,
      statusText,
      headers: respHeaders,
    });
  } catch (err) {
    closeActive();
    if (!requestStarted && !init.signal?.aborted && !(err instanceof ProxyConnectError)) {
      throw new ProxyConnectError(null, err);
    }
    throw err;
  }
}
