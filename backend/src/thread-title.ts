export const MAX_THREAD_TITLE_LENGTH = 48;

export function shortenThreadTitle(text: string): string {
  const characters = Array.from(text);
  return characters.length > MAX_THREAD_TITLE_LENGTH
    ? characters.slice(0, MAX_THREAD_TITLE_LENGTH - 1).join("").trimEnd() + "…"
    : text;
}
