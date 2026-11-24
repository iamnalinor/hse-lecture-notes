/** Accept standard TeX delimiters without changing examples inside code. */
export const normalizeChatMath = (source: string): string =>
  source
    .split(/(```[\s\S]*?(?:```|$)|`[^`]*(?:`|$))/u)
    .map((part, index) =>
      index % 2 === 1
        ? part
        : part.replaceAll(/(?<!\\)\\[()[\]]/gu, (delimiter) =>
            delimiter === "\\(" || delimiter === "\\)" ? "$" : "$$",
          ),
    )
    .join("");
