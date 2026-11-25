/** Public explanations use fixed strings; upstream payloads and internal exceptions stay private. */
export function runErrorMessage(code: string | null, hasText: boolean): string {
  const reasons: Record<string, string> = {
    run_timeout: "Истекло время ожидания ответа.",
    upstream_error: "Сервис модели вернул ошибку.",
    upstream_eof: "Соединение с моделью оборвалось.",
    upstream_incomplete: "Модель не завершила ответ.",
    upstream_empty_answer: "Модель не прислала текст ответа.",
    response_protocol_invalid: "Модель вернула ответ в неожиданном формате.",
    topic_required: "Модель не установила тему чата.",
    topic_invalid: "Модель вернула некорректную тему чата.",
    oauth_unavailable: "Авторизация сервиса модели недоступна.",
    internal_error: "Внутренняя ошибка сервера.",
  };
  const reason = reasons[code ?? ""] ?? "Ответ не удалось завершить.";
  return `${reason} ${hasText ? "Полученный текст сохранён. " : ""}Попробуй ещё раз.${code && code in reasons ? ` Код: ${code}.` : ""}`;
}
