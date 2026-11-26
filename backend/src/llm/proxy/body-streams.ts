import type { BufferedReader } from "./buffered-reader";

const decoder = new TextDecoder();

/** Streams of an HTTP/1.1 response body. Both close the socket when the body ends, fails or is cancelled. */
export function createChunkedBodyStream(
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

export function createRawBodyStream(
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
