import type { ClientChatCommand } from "../types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseClientFrame(raw: string): ClientChatCommand {
  const frame: unknown = JSON.parse(raw);
  if (!isRecord(frame)) throw new Error("Сообщение должно быть объектом JSON.");
  if (frame.type === "stop") return { type: "stop" };
  if (frame.type !== "send") throw new Error("Неизвестная команда чата.");
  for (const field of ["allowanceToken", "browserToken", "clientRequestId"]) {
    if (typeof frame[field] !== "string" || !frame[field].trim())
      throw new Error(`Отсутствует или некорректно поле ${field}.`);
  }
  if ((frame.clientRequestId as string).trim().length > 128)
    throw new Error("Слишком длинный идентификатор запроса.");
  for (const field of ["text", "course", "docId"]) {
    if (typeof frame[field] !== "string") throw new Error(`Некорректно поле ${field}.`);
  }
  for (const field of ["threadId", "retryAssistantMessageId", "sessionToken"]) {
    if (frame[field] != null && typeof frame[field] !== "string")
      throw new Error(`Некорректно поле ${field}.`);
  }
  if (frame.docId && !String(frame.course).trim()) throw new Error("Для страницы требуется курс.");
  const quote = frame.quote;
  if (quote != null) {
    if (!isRecord(quote) || typeof quote.tex !== "string" || typeof quote.label !== "string" ||
      ["messageId", "blockId", "sectionId"].some(k => quote[k] !== undefined && typeof quote[k] !== "string"))
      throw new Error("Не удалось прочитать цитату.");
  } else if (!String(frame.text).trim()) {
    throw new Error("Введи вопрос или выбери цитату.");
  }
  return frame as Extract<ClientChatCommand, { type: "send" }>;
}
