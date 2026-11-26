import type { BufferedReader } from "./buffered-reader";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const CRLFCRLF = new Uint8Array([13, 10, 13, 10]);

/** Merge a Request input with `init` the way fetch() does: init wins, Request supplies the rest. */
export async function mergeRequestInit(
  input: string | URL | Request,
  initArg: RequestInit,
): Promise<RequestInit> {
  if (!(input instanceof Request)) return initArg;
  const headers = new Headers(input.headers);
  new Headers(initArg.headers).forEach((value, key) => headers.set(key, value));
  const hasBody = input.body !== null && initArg.body === undefined;
  return {
    ...initArg,
    method: initArg.method ?? input.method,
    headers,
    signal: initArg.signal ?? input.signal,
    body: hasBody ? await input.arrayBuffer() : initArg.body,
  };
}

/** Serializes a request as an HTTP/1.1 head and body (`connection: close`, no content coding). */
export async function encodeHttpRequest(
  targetUrl: URL,
  method: string,
  init: RequestInit,
): Promise<{ head: Uint8Array; body: Uint8Array }> {
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

  const targetHost = targetUrl.hostname;
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

  const pathAndQuery = `${targetUrl.pathname || "/"}${targetUrl.search}`;
  const headLines: string[] = [`${method} ${pathAndQuery} HTTP/1.1`];
  reqHeaders.forEach((value, key) => {
    headLines.push(`${key}: ${value}`);
  });
  headLines.push("", "");
  return { head: encoder.encode(headLines.join("\r\n")), body: bodyBytes };
}

export interface ResponseHead {
  status: number;
  statusText: string;
  headers: Headers;
  isChunked: boolean;
  contentLength: number | null;
}

/** Reads the status line and headers of an HTTP/1.1 response. */
export async function readResponseHead(appBr: BufferedReader): Promise<ResponseHead> {
  const rawHead = await appBr.readUntil(CRLFCRLF);
  const headText = decoder.decode(rawHead);
  const lines = headText.split("\r\n");
  const statusLine = lines[0] ?? "";
  const statusMatch = /^HTTP\/\d\.\d\s+(\d{3})(?:\s+(.*))?$/.exec(statusLine);
  if (!statusMatch) {
    throw new Error(`Malformed HTTP response status line: ${statusLine.slice(0, 120)}`);
  }

  const headers = new Headers();
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i]!;
    const colon = line.indexOf(":");
    if (colon > 0) {
      headers.append(line.slice(0, colon).trim(), line.slice(colon + 1).trim());
    }
  }

  const te = (headers.get("transfer-encoding") ?? "").toLowerCase();
  const clRaw = headers.get("content-length");
  return {
    status: Number(statusMatch[1]),
    statusText: statusMatch[2] ?? "",
    headers,
    isChunked: te.includes("chunked"),
    contentLength: clRaw && /^\d+$/.test(clRaw.trim()) ? Number(clRaw.trim()) : null,
  };
}
