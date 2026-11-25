import type { ChatDocContext } from "./model.ts";

import chatSuggestionsData from "./suggestions.json";

/** Сколько подсказок видно в пустом чате. */
export const SUGGESTIONS_SHOWN = 3;

/**
Вопросы лежат в `chat-suggestions/*.yaml`, JSON собирает
`scripts/build_chat_suggestions.py`. Ключи: `@home`, `<course>`, `<course>/<id>`.
*/
const SUGGESTIONS_MAP: Readonly<Record<string, readonly string[]>> = chatSuggestionsData;

/** Для страниц без своих вопросов: три универсальных, всегда в одном порядке. */
export const FALLBACK_CHAT_SUGGESTIONS: readonly string[] = [
  "Объясни ключевую идею простыми словами",
  "Какие здесь типичные ошибки и как их избежать?",
  "Проверь меня: задай несколько коротких вопросов по этому материалу",
];

const keyOf = ({ course, docId }: ChatDocContext): string => {
  if (course === "") {
    return "@home";
  }
  return docId === "" ? course : `${course}/${docId}`;
};

/** Пул страницы: 6 своих вопросов или три фиксированных универсальных. */
export const getChatSuggestionPool = (docContext: ChatDocContext): readonly string[] =>
  SUGGESTIONS_MAP[keyOf(docContext)] ?? FALLBACK_CHAT_SUGGESTIONS;

/** Берет `count` разных случайных вопросов из пула. */
export const pickRandomSuggestions = (
  pool: readonly string[],
  count: number = SUGGESTIONS_SHOWN,
  random: () => number = Math.random,
): readonly string[] =>
  pool
    .map((prompt) => ({ key: random(), prompt }))
    .toSorted((a, b) => a.key - b.key)
    .slice(0, count)
    .map((item) => item.prompt);

/** Подсказки для текущей страницы: 3 случайных из шести; у запасного набора порядок не меняется. */
export const getChatSuggestions = (docContext: ChatDocContext): readonly string[] => {
  const pool = getChatSuggestionPool(docContext);
  return pool === FALLBACK_CHAT_SUGGESTIONS ? pool : pickRandomSuggestions(pool);
};
