export const MAX_THREAD_TITLE_LENGTH = 48;

export function shortenThreadTitle(text: string): string {
  const characters = Array.from(text);
  return characters.length > MAX_THREAD_TITLE_LENGTH
    ? characters.slice(0, MAX_THREAD_TITLE_LENGTH - 1).join("").trimEnd() + "…"
    : text;
}

// The first question is a display fallback only. The indexed lookup adds no API round trip.
export const firstQuestionSql = `(SELECT substr(content_tex, 1, 240) FROM chat_messages
  WHERE thread_id = chat_threads.id AND role = 'user' ORDER BY seq LIMIT 1)`;

export function displayThreadTitle(generated: string | null, firstQuestion: string | null): string {
  return generated ?? shortenThreadTitle(firstQuestion?.replace(/\s+/g, " ").trim() || "Новый чат");
}
