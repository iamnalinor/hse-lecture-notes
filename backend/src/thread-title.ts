export const MAX_THREAD_TITLE_LENGTH = 36;

export function shortenThreadTitle(text: string): string {
  const characters = Array.from(text);
  return characters.length > MAX_THREAD_TITLE_LENGTH
    ? characters.slice(0, MAX_THREAD_TITLE_LENGTH - 1).join("").trimEnd() + "…"
    : text;
}

// A metadata line can span chunks. Retain enough UTF-16 units for the title.
export class ThreadTitleStream {
  private pending = "";
  private reading = true;
  title: string | null = null;

  push(delta: string, end = false): string {
    if (!this.reading) return delta;
    const prefix = "Название:";
    const newline = delta.indexOf("\n");
    const line = this.pending + (newline < 0 ? delta : delta.slice(0, newline));
    if (!line.startsWith(prefix) && !prefix.startsWith(line)) {
      this.reading = false;
      return this.pending + delta;
    }
    if (newline < 0 && !end) {
      this.pending = line.slice(0, prefix.length + 1 + 2 * MAX_THREAD_TITLE_LENGTH);
      return "";
    }
    this.reading = false;
    if (!line.startsWith(prefix)) return this.pending + delta;
    this.title = Array.from(line.slice(prefix.length).trim()).slice(0, MAX_THREAD_TITLE_LENGTH).join("").trimEnd() || null;
    return newline < 0 ? "" : delta.slice(newline + 1);
  }
}
