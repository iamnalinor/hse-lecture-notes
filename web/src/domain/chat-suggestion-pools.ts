import type { ChatDocContext } from "./chat.ts";

import chatSuggestionsData from "./chat-suggestions.json";

export const SUGGESTIONS_SHOWN = 3;
const SUGGESTIONS_POOL_SIZE = 6;

export const HOME_CHAT_SUGGESTIONS: readonly string[] = [
  "В каких курсах разбирают индукцию?",
  "Где найти примеры работы с указателями на C?",
  "С какого курса и темы лучше начать повторение к сессии?",
  "Составь план подготовки к экзаменам на неделю по всем курсам",
  "Какие темы пересекаются между алгеброй, матанализом и дискретной математикой?",
  "Где в конспектах разбирают метод Гаусса и ранг матрицы?",
];

export const COURSE_CHAT_SUGGESTIONS: readonly string[] = [
  "Какие темы входят в курс?",
  "С какой лекции начать?",
  "Какие материалы помогут подготовиться к контрольной?",
  "Какие темы курса самые важные для экзамена?",
  "Составь план повторения курса на 5 дней",
  "Какие определения и теоремы курса нужно знать наизусть?",
];

const LECTURE_CHAT_SUGGESTIONS: readonly string[] = [
  "Объясни ключевую идею этого материала простыми словами",
  "Разбери главное доказательство по шагам",
  "Приведи наглядный пример и контрпример по теме",
  "Какие типичные ошибки студентов по этой теме?",
  "Дай три задачи по теме от простой к сложной, без решений",
  "Проверь меня: задай 5 коротких вопросов по этой лекции",
];

const THEORY_CHAT_SUGGESTIONS: readonly string[] = [
  "Выстрой карту зависимостей между главными теоремами курса",
  "Какие доказательства из списка чаще всего просят на экзамене?",
  "Как быстро выучить доказательства: с чего начать и что можно пропустить?",
  "Спроси меня формулировку случайной теоремы и проверь ответ",
  "Какие теоремы легко перепутать и чем они отличаются?",
  "Какие определения здесь самые коварные и почему?",
];

const PROGRAM_CHAT_SUGGESTIONS: readonly string[] = [
  "Какие темы программы самые важные для экзамена?",
  "Как основные разделы программы логически связаны между собой?",
  "С каких определений и теорем лучше начать повторение?",
  "Составь расписание повторения программы за 7 дней",
  "Какие темы программы обычно вызывают больше всего вопросов?",
  "Какие темы можно учить параллельно, а какие строго по порядку?",
];

const PREP_CHAT_SUGGESTIONS: readonly string[] = [
  "Какие типовые приёмы нужны для задач этой работы?",
  "На какие частые ошибки в решениях стоит обратить внимание?",
  "Собери короткий чек-лист формул и теорем перед работой",
  "Дай похожую тренировочную задачу и подскажи только первый шаг",
  "Как распределить время на работе и с каких задач начинать?",
  "Проверь моё решение: я пришлю его, а ты найдёшь пробелы",
];

const SUGGESTIONS_MAP: Readonly<Record<string, readonly string[]>> = chatSuggestionsData;

const genericPoolFor = (docId: string): readonly string[] => {
  if (docId === "theory") {
    return THEORY_CHAT_SUGGESTIONS;
  }
  if (docId === "program") {
    return PROGRAM_CHAT_SUGGESTIONS;
  }
  if (/^(?:colloq|exam|kr|quiz)/u.test(docId)) {
    return PREP_CHAT_SUGGESTIONS;
  }
  return LECTURE_CHAT_SUGGESTIONS;
};

/** Returns the pool (up to 6) of study prompts for the page; tailored ones go first. */
export const getLectureSuggestionPool = (docContext: ChatDocContext): readonly string[] => {
  if (docContext.course === "") {
    return HOME_CHAT_SUGGESTIONS;
  }
  if (docContext.docId === "") {
    return COURSE_CHAT_SUGGESTIONS;
  }
  const tailored = SUGGESTIONS_MAP[`${docContext.course}/${docContext.docId}`] ?? [];
  const generic = genericPoolFor(docContext.docId).filter((q) => !tailored.includes(q));
  return [...tailored, ...generic].slice(0, SUGGESTIONS_POOL_SIZE);
};

/** Picks `count` distinct random prompts from the pool. */
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

/** Returns 3 random study prompts for the current page. */
export const getLectureSuggestions = (docContext: ChatDocContext): readonly string[] =>
  pickRandomSuggestions(getLectureSuggestionPool(docContext));
