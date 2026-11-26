export const MAX_CHAT_BODY_BYTES = 40_960;

export async function readBoundedText(
  request: Request,
  maxBytes: number,
): Promise<{ text: string; bytes: number } | null> {
  const cl = Number(request.headers.get("Content-Length") ?? "0");
  if (cl > maxBytes) {
    void request.body?.cancel().catch(() => {});
    return null;
  }
  if (!request.body) return { text: "", bytes: 0 };
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        void reader.cancel().catch(() => {});
        return null;
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } finally {
    reader.releaseLock();
  }
  return { text, bytes: total };
}

export async function readBoundedJson(
  request: Request,
  maxBytes = 32_768,
): Promise<Record<string, unknown> | null> {
  const body = await readBoundedText(request, maxBytes);
  if (!body) return null;
  const { text } = body;
  if (!text.trim()) return {};
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
