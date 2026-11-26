import { plainChannel, tlsChannel, type AppChannel } from "./proxy/app-channel";
import { createChunkedBodyStream, createRawBodyStream } from "./proxy/body-streams";
import { BufferedReader } from "./proxy/buffered-reader";
import { ProxyConnectError } from "./proxy/errors";
import { performHttpConnectHandshake, performSocks5Handshake } from "./proxy/handshake";
import { encodeHttpRequest, mergeRequestInit, readResponseHead } from "./proxy/http-wire";

export { ProxyConnectError, ResponseEofError } from "./proxy/errors";

export interface SocketHandle {
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;
  close(): Promise<void>;
}

export type SocketConnector = (
  address: { hostname: string; port: number },
  options?: { secureTransport?: "on" | "off" | "starttls"; allowHalfOpen?: boolean },
) => SocketHandle;

async function defaultConnector(
  address: { hostname: string; port: number },
  options?: { secureTransport?: "on" | "off" | "starttls"; allowHalfOpen?: boolean },
): Promise<SocketHandle> {
  const mod = (await import("cloudflare:sockets")) as {
    connect: SocketConnector;
  };
  return mod.connect(address, options);
}

interface ProxyEndpoint {
  scheme: string;
  host: string;
  port: number;
  user: string;
  pass: string;
}

/** Splits `socks5://user:pass@host:port` (or `http://...`); the port defaults per scheme. */
function parseProxyUrl(raw: string): ProxyEndpoint {
  const proxyUrl = new URL(raw);
  const scheme = proxyUrl.protocol.replace(/:$/, "").toLowerCase();
  return {
    scheme,
    host: proxyUrl.hostname,
    port: proxyUrl.port ? Number(proxyUrl.port) : scheme.startsWith("socks") ? 1080 : 8080,
    user: decodeURIComponent(proxyUrl.username),
    pass: decodeURIComponent(proxyUrl.password),
  };
}

/** Asks the proxy for a tunnel to the target; fails for an unsupported proxy scheme. */
async function openTunnel(
  proxy: ProxyEndpoint,
  target: { host: string; port: number },
  rawBr: BufferedReader,
  rawWriter: WritableStreamDefaultWriter<Uint8Array>,
): Promise<void> {
  if (proxy.scheme === "socks5" || proxy.scheme === "socks5h") {
    await performSocks5Handshake(
      rawBr,
      rawWriter,
      target.host,
      target.port,
      proxy.user,
      proxy.pass,
    );
  } else if (proxy.scheme === "http") {
    await performHttpConnectHandshake(
      rawBr,
      rawWriter,
      target.host,
      target.port,
      proxy.user,
      proxy.pass,
    );
  } else {
    throw new Error(`Unsupported proxy scheme: ${proxy.scheme}`);
  }
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
  const init = await mergeRequestInit(input, initArg);
  const proxy = parseProxyUrl(proxyUrlRaw);

  const targetUrl =
    typeof input === "string" ? new URL(input) : input instanceof URL ? input : new URL(input.url);
  const isHttps = targetUrl.protocol === "https:";
  const targetHost = targetUrl.hostname;
  const targetPort = targetUrl.port ? Number(targetUrl.port) : isHttps ? 443 : 80;
  const method = (init.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();

  let rawSocket: SocketHandle;
  try {
    rawSocket = await (connector ?? defaultConnector)(
      { hostname: proxy.host, port: proxy.port },
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

    await openTunnel(proxy, { host: targetHost, port: targetPort }, rawBr, rawWriter);

    const channel: AppChannel = isHttps
      ? await tlsChannel(targetHost, rawWriter, rawBr)
      : plainChannel(rawWriter, rawBr);
    const { writeAppData, appBr } = channel;

    const request = await encodeHttpRequest(targetUrl, method, init);

    requestStarted = true;
    await writeAppData(request.head);
    if (request.body.length > 0) {
      await writeAppData(request.body);
    }

    const { status, statusText, headers, isChunked, contentLength } = await readResponseHead(appBr);

    const noBody = method === "HEAD" || status === 204 || status === 205 || status === 304;
    if (noBody) {
      closeActive();
      return new Response(null, { status, statusText, headers });
    }

    const bodyStream = isChunked
      ? createChunkedBodyStream(appBr, closeActive)
      : createRawBodyStream(appBr, contentLength, closeActive);

    return new Response(bodyStream, { status, statusText, headers });
  } catch (err) {
    closeActive();
    if (!requestStarted && !init.signal?.aborted && !(err instanceof ProxyConnectError)) {
      throw new ProxyConnectError(null, err);
    }
    throw err;
  }
}
