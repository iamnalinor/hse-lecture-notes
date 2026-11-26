import { ResponseEofError } from "./errors";

/** Buffered byte reader over an async chunk source without losing leftover bytes. */
export class BufferedReader {
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
