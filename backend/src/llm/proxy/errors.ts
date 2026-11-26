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
