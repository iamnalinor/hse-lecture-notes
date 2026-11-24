# Chat Metadata, Bounded Context and OpenAI Rollout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Реализация последовательно в текущей рабочей ветке; независимое ревью — по [процессу репозитория](../../../context/process.md). Не запускать исполнителей параллельно.

**Goal:** Добавить названия и саджесты через скрытый `end_turn`, сохранять агентный контекст в ограниченном окне, переводить длинные чаты на low и перевести production на прямой OpenAI API с бюджетом $15 за скользящие 7 дней.

**Architecture:** Постоянные инструкции и определения инструментов; изменяемый контекст хранится рядом с соответствующим вопросом. Harness выбирает ограниченную последовательность истории, модель/квоту/резерв до запуска и принимает завершение только после ответа и валидного `end_turn`. Ответ, метаданные и пригодная для replay последовательность сохраняются атомарно; production переключается после проверок и установки секрета.

**Tech Stack:** Cloudflare Workers / SQLite-backed Durable Objects, D1, Bun, TypeScript, Responses API, React, Vitest, Playwright.

**Spec:** Раздел «Итоговые решения» этого документа — самостоятельная спецификация по беседе. Документ полностью заменяет [предыдущий план](./2026-11-24-chat-end-turn-and-openai-rollout.md); старые варианты поведения из него не исполнять.

**Статус:** Реализация разрешена пользователем 24 ноября: выполнить план, финальное ревью Astra, затем deploy, commit и push. Текущее исполнение и результаты проверок фиксируются отдельно; незавершённые checkbox не означают готовый результат.

## Global Constraints

- Обрезаем отправляемый модели контекст; сохранённая переписка пользователя остаётся в D1 и интерфейсе. Обязательного нового чата и автоматического закрытия на пороге нет.
- `maxHistoryMessages: 15`, `maxHistoryChars: 50_000`, `maxToolRounds: 6`, `maxToolCalls: 12`, `maxRunDurationMs: 60_000`; не повышать другие лимиты ради восстановления протокола.
- После достижения первого предела истории этот thread остаётся на low; обычный выбор модели в других/новых чатах сохраняется.
- Ровно два аргумента `end_turn`: `title` и `suggestion`. Оба required и `string | null`; одна неизменяемая strict-схема для всех ходов.
- Параллельные вызовы поиска и чтения разрешены (`parallel_tool_calls: true`). В завершающем ответе единственный function call — `end_turn`, после текста ответа; смешивать его с вызовами поиска/чтения нельзя.
- Первое успешное завершение требует непустой title по инструкции и проверке harness. Позднее `title: null` сохраняет название; `suggestion: null` означает отсутствие предложения и обычный placeholder.
- Контекст страницы, оглавление, время вопроса и состояние названия не встраивать в изменяемый системный промпт; прежние снимки не пересобирать из текущей навигации.
- Сохранять совместимые reasoning и целые цепочки инструментов в пределах окна. `end_turn` — внутренний протокол: имя, аргументы, подтверждение и ошибки его проверки не попадают в пользовательские content/steps/WS/history, в том числе при сбоях и reconnect. Служебный контекст и raw reasoning также не публичны.
- Саджест появляется после ответа в placeholder; Tab вставляет без отправки. На touch только placeholder, без кнопки «Вставить» и вставки по касанию.
- Саджест пишется как обычная реплика пользователя: без Markdown и TeX/LaTeX, включая разметку ссылок, кодовые блоки и формулы в delimiters. Математику выразить словами или простой текстовой записью.
- Production: `LLM_PROVIDER=openai`, ключ именно из корневого `.env`, прямой `https://api.openai.com/v1/responses`, без Codex proxy и автоматического fallback на Codex.
- Бюджет `15_000_000` микродолларов за скользящие 7 дней; сохранять расходы, резервы, квоты, модельные маршруты, effort и версии цен уже начатых запусков.
- Не печатать ключ, не передавать его аргументом команды, не коммитить. Не создавать новый ключ; источник существующего согласован.
- Существующие правки UI в рабочем дереве сохранить. Поведенческие изменения — с regression tests; перед выпуском обязательные проверки репозитория.

## Review Focus

1. Обрезка на границе user/assistant и call/output: нет orphan tool output, оборванного reasoning item, двойного ответа, превышения окна или бесконтрольного чтения всей длинной переписки.
2. Переход на low при доступном high: выбранные модель, quota bucket и резерв совпадают; warning относится к одному thread и сохраняется после reload/retry.
3. Нет `end_turn`, нет текста перед ним, неверный первый title, EOF/stop/timeout: конечный цикл, сохранённый текст, отсутствие частичных метаданных, учёт всех оплаченных раундов.
4. Одновременные admission/finalize/retry, reconnect и переключение чата/аккаунта: ровно одно сохранение/списание, неизменяемый контекст старого вопроса, поздний саджест не заменяет draft.
5. Rollout и следующий CI deploy: секрет установлен до переключения, provider задан явно, OpenAI не использует proxy; откат сохраняет D1, бюджет $15 и новые лимиты.

## Итоговые решения

### 1. История, reasoning и кэш

Сохраняем ограниченное скользящее окно, а не бесконечную историю. Кэш используем внутри этого ограничения; потерю части попаданий после сдвига окна на Luna принимаем. Не отменять обрезку ради hit rate и не обещать сохранения кэша после изменения начала переписки.

Точные правила учёта для реализации:

- 15 — число логических user/assistant сообщений в выбранной переписке **включая текущий вопрос до генерации ответа**; developer context, reasoning и function items не увеличивают этот счётчик. Историю выбираем целыми предыдущими обменами «вопрос + ответ», поэтому при необходимости допустимо сохранить меньше 15 сообщений.
- 50 000 — технический предел `JSON.stringify(inputItems).length` для выбранного стартового контекста: включает снимки вопросов, цитаты, tool calls/results и encrypted reasoning. Это JS-длина сериализации, не байты, не число токенов и не длина только видимых пузырей. Постоянные `instructions` и `tools` учитываются в цене отдельно.
- Брать наиболее свежие целые обмены по порядку; старейшие исключать, пока соблюдены оба предела. Нельзя отрезать кусок JSON, opaque encrypted reasoning либо одну сторону call/output. Последовательность начинается с вопроса, а не с чужого результата инструмента.
- Текущий вопрос с цитатой не обрезать. Если даже его обязательный контекст не помещается, сначала исключить необязательное оглавление: полный каталог доступен через `read_document`. Если обязательный input всё ещё превышает предел, не отправлять превышение upstream; вернуть отдельную ошибку размера контекста с сохранением draft.
- Лимиты окна применяются в начале хода. Новые output items и результаты инструментов в его 6 раундах имеют существующие отдельные пределы output/tool output и времени; 50k не объявляется потолком каждого полного upstream request.
- При достижении `>= 15` логических сообщений до обрезки или `>= 50_000` символов, а также если обрезка необходима для соблюдения предела, ставить sticky-признак `contextLimited` у thread и выбирать low. На точной границе history может ещё помещаться, но модель уже low.
- Старые сообщения без полной replay-записи и stopped/incomplete обмены читаются как сохранённый видимый текст; обрезанные legacy agent items не выдавать за полную цепочку. Переходный cache miss здесь допустим, повреждённый replay — нет.
- В envelope записывать происхождение: provider/model/effort, версии постоянного prompt/tools и отпечаток исходного input-префикса обмена. Совместимые items сохранять без переписывания. Смена high → low, provider/model/effort, неизвестное происхождение либо сдвиг префикса требуют проверки совместимости opaque reasoning; её нельзя выводить только из одинакового формата JSON.
- Если совместимость не установлена, для отправки восстановить **весь соответствующий обмен** из исходного snapshot вопроса и видимого ответа; не удалять одиночный reasoning item из связанной цепочки. Исходный envelope в D1 сохранить. После преобразования снова проверить окно. Внутри уже начатого хода только добавлять новые элементы в конец. Реальную совместимость подтверждает preflight Task 8; до него действует консервативный fallback.

Нужна неизменяемая запись **всего** нового агентного обмена, а не нынешний `slice(-24)`. Допустимая история ограничивается при загрузке; размер одного создаваемого обмена ограничивают policy и время. В интерфейс и обычный thread GET raw items не возвращаются.

Под полем ввода показывать точно: **«Чат слишком длинный, качество снижено. Рекомендуем создать новый чат»**. Это thread state, отдельно от account-level снижения по квотам и его таймера. В новом чате обычный выбор high/low; если low-квота исчерпана, обычная блокировка, не возврат в high.

Один основной статус выбирается централизованно: **блокирующая plate → rate limit → длинный чат → снижение по квоте → обычная подпись default-аккаунта**. При блокировке caption не дублирует plate. Если default-пользователь одновременно видит более приоритетный статус, длинный текст о студенческом лимите скрывается, но отдельная компактная строка «Вы вошли как … · Сменить аккаунт» остаётся доступной; смена аккаунта disabled во время busy. Таким образом, предупреждение не теряется из-за early return default-подписи и не появляются два конкурирующих информационных баннера. После окончания таймера показывается следующий актуальный статус; смена чата снимает только thread warning.

### 2. Постоянный промпт и контекст вопроса

Базовые правила одинаковы при навигации и после генерации/смены названия. Рядом с текущим вопросом добавляются доверенные служебные данные: страница и каталог, сохранённое время вопроса, актуальное название, `title_required`. Сам вопрос и цитата остаются пользовательским содержимым и не могут переопределять служебные поля. Снимок **фактически отправленных** input items сохраняется вместе с вопросом при admission и повторно используется при replay/retry; если оглавление исключено из-за размера, сохраняется именно сокращённый snapshot. Обновление каталога или смена страницы не переписывает прежний вопрос. Для нового вопроса берём новый снимок. Старым сообщениям исторический каталог не придумывать.

### 3. Завершение хода

`end_turn` — нативная функция, `strict: true`, `additionalProperties: false`, оба поля required с типом `["string", "null"]`. В обычном раунде `tool_choice: "required"`, в завершающем/metadata-only раунде forced `{ type: "function", name: "end_turn" }`. Массив `tools`, порядок и схемы остаются прежними во всех раундах; меняется выбор, не определения.

Параллельные вызовы поиска и чтения разрешены: `parallel_tool_calls: true`, один обычный раунд может вернуть несколько вызовов. Лимит 12 относится к сумме исполненных вызовов поиска/чтения за ход, а не к числу пакетов; 6 — общий предел раундов, включая завершение/исправление. `end_turn` не расходует лимит вызовов поиска/чтения и не создаёт UI step; стоимость и раунд учитываются полностью.

В завершающем ответе после текста должен быть **ровно один function call — `end_turn`**. Обычный пакет из нескольких вызовов поиска/чтения валиден; пакет «вызов поиска/чтения + end» либо несколько end невалиден. В принудительно завершающем раунде `tool_choice` разрешает только `end_turn`, при этом определения `tools` остаются прежними для стабильного префикса. Точное количество и положение вызова дополнительно проверяет harness; параллельные вызовы глобально не запрещаем.

Перед исполнением проверить весь пакет. Для разрешённых вызовов поиска/чтения сохранять соответствие call ID → output и исходный порядок в replay. Если пакет превышает оставшийся лимит, выполнить только помещающиеся вызовы по исходному порядку, остальным дать скрытый результат о лимите без исполнения и UI step; ни один вызов не остаётся без результата. После исчерпания 12 следующий допустимый раунд принудительно завершающий. Нового запроса сверх раундов/времени/резерва это не разрешает.

- Модель сначала пишет ответ, затем вызывает `end_turn`. Только `response.completed`, без усечения, валидные аргументы и правильный порядок дают успешное `done`. Reasoning, пробелы и поисковая преамбула до учебного инструмента не заменяют ответ. Сервер проверяет структуру/порядок, а не смысловую полноту текста регуляркой.
- Если title ещё не сгенерирован, инструкция требует его; `title: null` даёт скрытую ошибку `first_title_required`. Первым считается первый **успешный** ход, включая старые чаты без названия после прерванной генерации. Название нормализуется существующим способом, максимум 48 Unicode-символов. Позднее обновлять только при существенной смене цели/темы.
- Саджест — одна следующая реплика от лица пользователя по уже написанному ответу, с учётом его манеры переписки. Предпочесть полезный конкретный или общий следующий шаг; `null` только когда осмысленного продолжения нет. Параметр реализации: до 160 Unicode-символов, обычный однострочный текст **без Markdown и TeX/LaTeX**. Без оформленного жирного/курсива, списков, обратных кавычек, разметки ссылок, `$…$`, `\(…\)`, `\[…\]` и команд вроде `\frac`. Например: «Почему производная x в квадрате равна 2x?» вместо реплики с размеченной формулой. Пустую строку, управляющие символы, превышение и явную разметку отвергать как невалидные метаданные; не рендерить и не пытаться молча чинить их во frontend. Обычные знаки в текстовой записи, например `x * y`, сами по себе не означают Markdown. Это требование к suggestion; формат учебного ответа им не ограничивается. Raw arguments end ограничить 4096 JS-символами ещё при накоплении: небольшой JSON не должен обходить лимиты памяти через бесконечный поток аргументов. Превышение — нарушение, не усечение до случайно валидного JSON.
- Текст после `end_turn`, смешанный пакет с учебными инструментами и повторный `end_turn` — нарушение протокола. Сохранять порядок/поддерживаемый `phase` сообщений; отсутствующий phase сам по себе не отвергает ответ. Не публиковать неверные метаданные.
- Фильтрация происходит **во время стриминга**, по item type/id/output index: только текст assistant `output_text` допустимого участка ответа идёт в delta. С начала function item `end_turn` последующий текст не показывается, даже если аргументы ещё не дочитаны; metadata-only раунд вообще не публикует текст. После полного ответа провайдера отдельно проверяется весь порядок. Проверка только перед finalize не защищает от уже показанного хвоста.
- Parser не приводит произвольные значения к строкам и не извлекает ответ из неизвестного content type. Неизвестный output item/tool, пустой/дублирующийся call ID, некорректные arguments и противоречивые terminal status дают типизированное нарушение; не запускают generic tool step. Разрешены только зарегистрированные учебные функции и `end_turn`. Неизвестные незначимые SSE-события можно игнорировать, неизвестные output items — нельзя молча превращать в успех. Первый terminal закрывает поток; хвост после него игнорируется.
- Структурированный отказ провайдера показывается как безопасный отказ и не запускает repair с требованием всё-таки ответить. `failed`/`incomplete`/EOF не становятся `completed`; при несогласованных event/status результат не успешен. Аргументы, schema и raw provider error никогда не используются как пользовательский текст. Обычные строки ответа не парсим регуляркой или тегами в поисках метаданных.

Один корректирующий раунд на ход, внутри общих 6 раундов / 60 секунд / резерва:

| Сбой | Восстановление | Если не получилось |
| --- | --- | --- |
| Есть завершённый ответ, нет `end_turn` | Forced metadata-only вызов по уже сохранённому ответу; повторные текстовые delta не показывать и считать нарушением | `incomplete`, исходный текст доступен, без саджеста/переименования и автоматической генерации ответа заново |
| `end_turn` без ответа текущего хода | Скрытый `answer_required`; отбросить старые аргументы, потребовать ответ и **новый** вызов с новым саджестом | `incomplete`; пустой результат не выдавать за успешный ответ |
| Первый title null / другие невалидные аргументы | Скрытый результат с причиной, исправление без повторения уже готового ответа | Без частичных метаданных |
| Ответ уже был в предыдущем раунде этого же хода | В metadata-only режиме новый текст не требуется | Ответы прежних ходов не разрешают пустое завершение |
| Неизвестный output/tool, missing/duplicate call ID, mixed/duplicate end, текст после end или противоречивый terminal | Не исполнять инструменты этого невалидного раунда и не пытаться угадывать его структуру | `incomplete`, только уже разрешённый текст и стоимость; метаданные не публикуются, envelope не считается пригодным для replay |
| Stop, timeout, EOF, отказ/усечение upstream, нет резерва или нет раундов | Нового платного запроса не запускать | Сохранить полученный текст и стоимость; не подделывать `done` |

В шестом раунде принуждаем `end_turn`; если ответа ещё нет, инструкция требует сначала текст. Tool choice гарантии порядка не даёт: пустой вызов в последнем раунде остаётся `incomplete`. **Валидный end в последнем разрешённом раунде принимается без резерва на следующий запрос**: checkpoint ограничивает продолжение, а не отменяет уже состоявшийся успех. После валидного вызова harness добавляет скрытое подтверждение в replay items без ещё одного API-запроса. Все вызовы в сохраняемой пригодной цепочке имеют результат. Повторный call ID не выполняется второй раз.

### 4. Сохранение и UI

Ответ, suggestion, изменение generated title, replay envelope и учёт стоимости фиксируются существующим guarded `finalizeRunAtomic`. Метаданные применяет только выигравший `done`; stop/incomplete/error и поздний run их не записывают. `title: null` сохраняет нынешнее название. События названия и итоговые данные отправляются после commit: `title` до финального WS `done`, suggestion — в `done` и thread history. После terminal события клиент последующие кадры не обрабатывает.

Публичные ошибки формируются из allowlist безопасных кодов/сообщений; raw HTTP/SSE error провайдера не сохраняется в публичный `error_message` и не отправляется через catch в WS. Диагностика содержит безопасный код, HTTP status и response ID, без schema/arguments/текста запроса. Один и тот же безопасный результат возвращают live, history и reconnect. `stopped` подписывается «Ответ остановлен», `incomplete` — «Ответ не завершён»: сбой метаданных не изображает нажатие пользователем Stop. Уже показанный ответ остаётся доступным, автоматического повторного ответа нет.

Admission использует `expectedMaxSeq` **и монотонную context revision** thread: finalize и retry меняют содержимое прежнего сообщения, не увеличивая seq. Revision проверяется и обновляется атомарно при изменениях контекста; потерявший гонку запрос переподготавливается не более двух раз, затем получает безопасный retryable conflict без нового API-запроса. Проверка владения и поиск существующего `clientRequestId` идут до новой подготовки контекста: повтор возвращает исходный run даже после смены policy/каталога. Чужой аккаунт не получает результат по известному request ID.

Placeholder показывает саджест последнего успешного ответа активного чата только при пустом draft, без цитаты, генерации и загрузки. Tab без модификаторов вставляет в draft, не отправляя. Enter по одному placeholder ничего не отправляет. Shift+Tab, IME, непустой draft и отсутствие саджеста сохраняют стандартное поведение. При null обычный placeholder не превращается во вставляемую реплику.

Новый send/retry, смена чата/аккаунта/цитаты инвалидируют предложение; callback проверяет текущие thread/run. После принятия не предлагать тот же текст вновь в открытой сессии, даже если draft очищен. Reload восстанавливает сохранённый саджест последнего успешного ответа. На touch только отображение placeholder.

Клиент проверяет типы новых WS/history полей во время выполнения: suggestion — ограниченная строка либо null, contextLimited — boolean, идентификаторы соответствуют активному run/thread. Missing legacy поля получают null/false, невалидное новое поле игнорируется и не подменяет draft или название. Предыдущий успешный саджест не возвращается под новым failed/incomplete ответом.

### 5. OpenAI, цена и наблюдаемость

Прямой provider уже есть; он не использует `CODEX_PROXY_URL`. Codex credentials/proxy можно оставить для явного отката: запросы OpenAI к ним не обращаются. Выбор provider закрепить в versioned Worker config, чтобы следующий CI deploy не вернул Codex по умолчанию.

Учёт кэша использует реальные input/cached/write/output usage. Default TTL 30m; 12h без расширения тарификации не включать. Стоимость записи — отдельный тариф, не надбавка поверх обычной цены тех же токенов. Кэшированные токены не означают, что контекст можно удалить из запроса. Потери кэша от смены модели не являются целью этой работы.

Usage извлекается и сохраняется **до** веток failed/incomplete/protocol error, даже когда завершение не принято. Счётчики проверяются на конечные неотрицательные целые значения и согласованность подмножеств input. Отсутствующий/повреждённый usage отмечается как uncertain и оценивается консервативно; известный расход не обнуляется и не прибавляется повторно поверх оценки тех же токенов. Отсутствие usage само по себе не отменяет структурно валидное завершение.

В диагностике нужны provider, response ID, model/effort, версия промпта, round, cached/write/input/output usage и задержка; без ключей, текста запросов и encrypted reasoning. Новые usage runs сохраняют provider, у старых он может быть неизвестен. Сравнивать расход до/после, а не смешивать Codex-оценки и API bill. Отдельные explicit breakpoints общего префикса и увеличение TTL в эту реализацию не входят: сначала измеряем обычный маршрут со стабильными instructions/tools.

## Исходное состояние для перепроверки перед исполнением

- Во время проверки 24 ноября production работал через неявный Codex, OpenAI secret binding отсутствовал, недельный бюджет был $30; активная версия — `91012da4-f56f-4fc7-9d84-1a7818e8e2ef`. Это снимок, не обещание текущего состояния.
- Текущие лимиты — 16 / 24k, 5 раундов / 10 вызовов. История собирается из видимого текста; agent items сохраняются обрезанным хвостом. Первый title разбирается из `Название:`. Саджеста и thread-specific ограничения нет.
- В проверенном 7-дневном срезе Codex учтено 60 032 cached из 652 341 input tokens (9,2%); cache writes — 0. Это не измерение экономии OpenAI. Графики в беседе — иллюстрации с тёплым кэшем, не основание для production-гарантий.
- Проверка Codex OAuth с forced strict function однажды вернула текст → функцию; auto пропустил функцию. Доступ ключа OpenAI к обеим production моделям и все параметры проверять отдельно.
- Назначенные маршруты были `gpt-6.1-terra` / `gpt-6-luna`, pricing version 1. Сохраняем модели/effort, проверяем актуальные Standard rates и доступность перед переключением.
- Ранее запрошенные UI-исправления уже в рабочем дереве: абзац по triple click, позиция/показ «Спросить ИИ», «Проверяю браузер», удаление надписи с главной. Не реализовывать их заново; сохранить diff и включить в регрессию перед PR.

## Task 1: Схема хранения и общие типы

**Files:** Create `backend/migrations/0002_chat_context_and_metadata.sql`, `backend/tests/chat-context-storage.test.ts`; modify `backend/src/types.ts`, `backend/src/archiver.ts`; use `backend/tests/d1-shim.ts` для применения всех миграций.

**Interfaces:** `EndTurnMetadata = { title: string | null; suggestion: string | null }`; `TurnContextSnapshot = { version: 1; contextItems: CodexInputItem[]; userItem: CodexInputItem; currentDocOrder: number }`; `ReplayProvenance = { provider: string; model: string; effort: string; promptVersion: string; toolsVersion: string; inputPrefixHash: string }`; `AgentReplayEnvelope = { version: 1; complete: boolean; provenance: ReplayProvenance | null; items: CodexInputItem[] }`. Provenance описывает фактический маршрут, без credentials; неизвестная версия/происхождение не считаются совместимыми. Новые поля: `chat_messages.prompt_context_json TEXT`, `chat_messages.suggestion TEXT`, `chat_threads.context_limited INTEGER NOT NULL DEFAULT 0`, `chat_threads.context_revision INTEGER NOT NULL DEFAULT 0`, `usage_runs.provider TEXT`. Replay envelope использует существующее `agent_items_json`; legacy array остаётся распознаваемым старым форматом.

- [ ] Написать тесты миграции с прежней базы: строки/владение/история сохранены, новые nullable поля null, thread flag/revision 0. Тест архива сохраняет новые поля, provenance и agent envelope, но HTTP history не раскрывает raw context.
- [ ] Запустить `cd backend && bun test tests/chat-context-storage.test.ts`; ожидается FAIL до миграции/типов. Добавить миграцию и типы, поддерживаемые developer messages/phase в `CodexInputItem`; уже применённую `0001_init.sql` не редактировать.
- [ ] Обновить архивирование снимков/саджестов/thread flag/replay; выполнить `bun run typecheck && bun test tests/chat-context-storage.test.ts tests/backend.test.ts` → PASS. Проверить совместимость с legacy записями; подготовить коммит `Add persistent chat context and metadata fields`.

## Task 2: Неизменяемый контекст вопроса и ограниченный replay

**Files:** Create `backend/src/chat-history.ts`, `backend/tests/chat-history.test.ts`; modify `backend/src/tools.ts`, `backend/src/system-prompt.ts`, `backend/src/agent-loop.ts`, `backend/src/quotas.ts`, `backend/src/chat-runner.ts`; update prompt/history tests в `backend/tests/backend.test.ts`.

**Interfaces:** `HistoryExchange = { logicalMessages: number; items: CodexInputItem[] }`; `HistoryWindow = { items: CodexInputItem[]; logicalMessages: number; serializedChars: number; limitReached: boolean; trimmed: boolean }`; `PreparedTurnContext = { snapshot: TurnContextSnapshot; history: HistoryWindow; expectedMaxSeq: number; expectedContextRevision: number; provenance: ReplayProvenance }`. Перед `selectHistoryWindow(exchanges: HistoryExchange[], current: TurnContextSnapshot, limits: Pick<ServicePolicy, "maxHistoryMessages" | "maxHistoryChars">): HistoryWindow` выполняется проверка совместимости обменов с выбранным маршрутом/префиксом. DB-loader читает ограниченный suffix и один sentinel на наличие старой истории. `history.items` — весь стартовый input, уже включающий текущие contextItems/userItem ровно один раз; цикл не добавляет вопрос повторно. Admission сохраняет фактический snapshot текущего вопроса; `AgentLoopParams` получает подготовленный input и currentDocOrder.

- [ ] Написать `keeps context unchanged after navigation, catalog update and retry`, `replays complete tool exchanges with encrypted reasoning`, `falls back for legacy tail and incomplete exchanges`, `never duplicates assistant text`, `counts question, quotes and hidden context in window`. Сравнивать порядок/items до и после смены страницы, а не только наличие текста.
- [ ] Пограничные тесты: до/ровно/сверх 15 сообщений и 50_000 символов; более раннее срабатывание каждого лимита; oversized старый обмен удаляется целиком; текущий вопрос/цитата сохраняются; неподходящий текущий snapshot даёт ошибку до fetch. Не читать миллион символов всех старых сообщений ради COUNT/SUM.
- [ ] RED compatibility matrix: high → low, изменение effort/provider/model/prompt/tools, rollout/rollback, legacy и удалённый префикс. При неизвестной совместимости весь обмен заменяется snapshot + visible text, исходный envelope остаётся в D1; повторная проверка размера обязательна. Удалённое из-за размера оглавление не возвращается при retry. Тесты не объявляют фактическую совместимость encrypted reasoning доказанной без Task 8.
- [ ] Запустить `bun test tests/chat-history.test.ts` → FAIL; реализовать snapshot рядом с вопросом, bounded loader и выбор целых обменов. Удалить пересборку старого page context из текущего каталога; зашифрованные items не менять. При retry использовать исходные дату/страницу/snapshot.
- [ ] Проверить, что сохранение новых полных envelopes не использует `slice(-24)`; malformed/незавершённые цепочки не replay. Постоянный prompt builder не зависит от страницы; оставшийся старый first-title протокол окончательно удаляется в Task 5.
- [ ] Выполнить `bun run typecheck && bun test tests/chat-history.test.ts tests/backend.test.ts tests/accounting.test.ts` → PASS; подготовить коммит `Preserve bounded agent context and stable question snapshots`.

## Task 3: Закреплять длинный чат за low до admission

**Files:** Modify `backend/src/quotas.ts`, `backend/src/chat-runner.ts`, `backend/src/index.ts`, `backend/src/types.ts`, `backend/policy.json`; create `backend/tests/long-chat-routing.test.ts`; extend `backend/tests/accounting.test.ts`.

**Interfaces:** quota evaluation получает `forceLow` из `thread.context_limited || prepared.history.limitReached`; его нельзя подменить клиентским флагом. Admission возвращает `contextLimited: boolean`, фиксирует фактические provider/model/effort/bucket/price/reserve и snapshot. Существующий блок `degraded` остаётся account-level; `contextLimited` передаётся отдельно в WS meta/done и thread GET.

- [ ] RED: при доступном high длинный thread получает low и low reserve; низкая квота блокирует, даже если high доступен. Короткий новый thread того же пользователя выбирает обычный маршрут. Проверить пороги, retry, reload, guest/default и независимость account-level degradation.
- [ ] RED race tests: append, finalize и retry-reset между подготовкой истории и admission не допускают stale input/high route; последние два случая проверять при **неизменном max seq**. Повтор clientRequestId возвращает исходный run даже при новой policy/каталоге; чужому аккаунту отказ. Denied reserve не оставляет половину нового вопроса, snapshot или сброс retry.
- [ ] После ownership/idempotency lookup предварительно выбрать доступный маршрут и подготовить контекст **до окончательной** фиксации quota/model/reserve. При срабатывании предела закрепить forceLow в этой попытке; при high → low один раз пересобрать совместимый replay и повторно проверить размер. Уменьшение размера из-за fallback не возвращает high и не запускает колебание маршрутов. Guard admission проверяет `expectedMaxSeq`, `expectedContextRevision` и актуальное владение; при гонке не более двух переподготовок, далее retryable conflict. Sticky thread flag фиксируется в успешном admission независимо от последующего исхода ответа.
- [ ] Revision атомарно увеличивается при append, retry-reset, выигравшем finalize/sweep и изменении влияющих на контекст полей thread. Проигравший finalize, отказ admission и idempotent replay revision не увеличивают. Отдельный read перед незащищённым write не заменяет SQL guard.
- [ ] Bootstrap policy обновить на 15 / 50_000 и 6 / 12; production пока не менять. Выполнить `bun run typecheck && bun test tests/long-chat-routing.test.ts tests/accounting.test.ts tests/backend.test.ts` → PASS; подготовить коммит `Route long chat threads to the low quota bucket`.

## Task 4: Постоянная схема end_turn и параметры Responses

**Files:** Create `backend/src/end-turn.ts`, `backend/tests/end-turn.test.ts`; modify `backend/src/types.ts`, `backend/src/openai-provider.ts`, `backend/src/codex-provider.ts`, `backend/src/responses-stream.ts`; extend `backend/tests/openai-provider.test.ts`, parser tests в `backend/tests/backend.test.ts`.

**Interfaces:** `buildEndTurnTool(): CodexFunctionTool`; `parseEndTurnArguments(raw: string, requireTitle: boolean): EndTurnMetadata` с типизированной причиной отказа, в том числе `suggestion_format_invalid` для явной Markdown/TeX-разметки. `CodexFunctionTool.strict?: boolean`; `LlmRoundRequest.toolChoice?: "auto" | "required" | { type: "function"; name: string }`, `parallelToolCalls?: boolean` (для этого протокола true). `LlmRoundResult` сохраняет responseId, фактический terminal status, usage даже при неуспехе, порядок/phase items и типизированные `protocolViolations`/refusal. Streaming callback получает только разрешённый текст с учётом типа и позиции item; raw error наружу не передаётся.

- [ ] RED schema tests: definitions одинаковы для первого/следующих ходов; оба ключа required nullable; лишние/missing поля, whitespace, неправильный тип и suggestion >160 отвергаются. `title: null` при requireTitle даёт `first_title_required`, иначе принимается; title нормализуется до существующего предела 48.
- [ ] RED metadata boundaries: Unicode/emoji считаются согласованным способом на сервере и клиенте, newline/control suggestion отвергаются; HTML payload не исполняется, публичные метаданные выводятся текстом. Markdown/TeX в suggestion проверяется следующим тестом. Поток raw arguments свыше 4096 ограничивается до JSON parse без публикации содержимого и без бесконтрольного накопления.
- [ ] RED suggestion format: plain text с вопросом/математикой словами принимается; Markdown-выделение, списки, code/link markup, TeX delimiters/команды отвергаются с `suggestion_format_invalid`; `x * y` остаётся допустимой простой записью. Инструкция модели явно требует пользовательскую реплику без этой разметки.
- [ ] RED request/parser tests: required/forced и `parallel_tool_calls: true` реально передаются; tools definitions одинаковы, завершающий tool choice указывает только end. Несколько разных вызовов поиска/чтения в обычном раунде валидны; mixed end/поиск/чтение и повтор end отвергаются. Strict true сохраняется только там, где задан; обычные optional-инструменты OpenAI остаются strict false. `response.incomplete` и усечение не превращаются в successful completed. Порядок message/function и phase сохраняется.
- [ ] RED malformed stream: неизвестные item/content/tool, absent/duplicate call ID, неправильные arguments, refusal-only, completed с nested incomplete/failed, terminal + лишний хвост, SSE на произвольных границах чанков. Не приводить number/object к text или arguments. Input/cached/write/output проверяются; usage из incomplete/failed сохраняется, неизвестный остаток оценивается без двойного списания.
- [ ] RED visibility: answer → end → text, end → text, mixed/duplicate end и metadata-only repair не публикуют запрещённые delta. Ошибка HTTP/SSE с именем/аргументами end, schema или неизвестным tool не появляется в публичном error/content/steps. Проверить live, history и reconnect, а не только финальную строку ответа.
- [ ] Реализовать контракт и передачу параметров; OpenAI сохраняет `store: false` + encrypted reasoning include. Совместимость параметров Codex проверять отдельно, а не выводить из гарантий API; не добавлять `max_output_tokens` к Codex endpoint.
- [ ] Выполнить `bun run typecheck && bun test tests/end-turn.test.ts tests/openai-provider.test.ts tests/backend.test.ts` → PASS; подготовить коммит `Add strict end turn contracts and provider controls`.

## Task 5: Конечный цикл ответа и восстановления протокола

**Files:** Modify `backend/src/agent-loop.ts`, `backend/src/system-prompt.ts`, `backend/src/thread-title.ts`, `backend/src/chat-runner.ts`; create `backend/tests/end-turn-loop.test.ts`; replace старые prefix-title tests в `backend/tests/backend.test.ts`.

**Interfaces:** `AgentLoopParams` получает generatedTitle и PreparedTurnContext; цикл хранит один принятый `EndTurnMetadata`, число corrective rounds и флаг наличия ответа после последнего учебного инструмента. Метаданные остаются в памяти до guarded finalize Task 6.

- [ ] RED: ответ + end за один запрос; search → read → ответ + end; готовый текст без end → один metadata-only repair без новых видимых delta; end без ответа → answer_required → ответ + новый end. Первый title null → корректировка; старый саджест до дописанного ответа не применяется.
- [ ] RED parallel batches: несколько учебных calls за один раунд дают результат для каждого call ID и стабильный replay; более 5 вызовов поиска/чтения за ход допустимы. При 11 уже исполненных и пакете из 3 исполняется ровно 1, остальные получают cap output без UI step; далее только end в пределах оставшихся раундов. Проверить ровно 12 и попытку 13-го, stop/timeout посреди пакета: незавершённый envelope не replay как полный.
- [ ] RED: повторное нарушение, смешанный end/учебные calls или дубликат end/call ID, текст после end, preamble, пустой шестой раунд, EOF, stop, отказ API, нет резерва, timeout и `maxResponseChars` на точной границе. Ни одного седьмого запроса или лишнего corrective round; оплаченный usage не теряется.
- [ ] RED: валидный end в шестом раунде принимается при невозможности зарезервировать седьмой; refusal и upstream incomplete не запускают metadata repair. Повтор call ID не исполняется; неизвестный tool не попадает в AgentToolRunner/видимые шаги. Raw provider error из всех catch заменяется безопасным публичным кодом/сообщением.
- [ ] Реализовать переходы из таблицы спецификации и обработку пакетов учебных calls с общим лимитом 12; tools definitions неизменны, parallel calls разрешены, в шестом/metadata-only/после исчерпания вызовов поиска/чтения — forced end. В завершающем ответе ровно один end после текста; разбирать meta tool вне AgentToolRunner. Ошибки/ack скрыты, но соответствующие call/output остаются целыми в replay envelope. Ошибочный формат suggestion исправляется тем же единственным разрешённым metadata repair, без повторного видимого ответа.
- [ ] Удалить `FIRST_TURN_TITLE_PROMPT` и извлечение строки `Название:`; нормализацию названия сохранить. Инструкция о неучебной просьбе запрещает учебные инструменты, но короткий ответ/уточнение тоже завершается end. Тест доказывает одинаковые instructions до/после title и при навигации.
- [ ] Сохранять полный новый replay envelope с complete flag и provenance; final status done требует принятого end. Usage фиксировать до веток отказа; checkpoint/reservation ограничивает новые запросы после проверки уже полученного завершения. Incomplete/оборванный usage учитывается консервативно. `bun run typecheck && bun test` → PASS; подготовить коммит `Finish chat turns through validated end turn calls`.

## Task 6: Атомарные метаданные и восстановление клиента

**Files:** Modify `backend/src/quotas.ts`, `backend/src/index.ts`, `backend/src/types.ts`, `backend/src/archiver.ts`; create `backend/tests/end-turn-persistence.test.ts`; extend `backend/tests/accounting.test.ts`.

**Interfaces:** `FinalizeRunInput.metadata?: EndTurnMetadata`; guarded batch сохраняет suggestion/title/replay вместе с ответом и бюджетом. WS done и thread history возвращают `suggestion: string | null`, thread payload — `contextLimited`; `title` frame остаётся и отправляется до done. Legacy значения: null / false.

- [ ] RED: done сохраняет всё вместе; title null сохраняет прежнее; stop/incomplete/error не публикуют metadata. Двойной finalize/stop/sweep не меняет данные и не списывает повторно; retry очищает прежний саджест, поздний run не перетирает новый.
- [ ] RED reconnect/idempotency/archive: потерянный done восстанавливает те же title/suggestion/contextLimited, call/ack/validation error end не видны в content/steps/публичных ошибках. Проигравший finalize не отправляет новые metadata frames. Revision меняется в том же guarded batch; чтение истории не возвращает raw provider errors.
- [ ] Реализовать расширение guarded finalize и API. Thread ownership проверки сохраняются; raw context/agent items не становятся публичным payload. `bun run typecheck && bun test` → PASS; подготовить коммит `Persist chat completion metadata atomically`.

## Task 7: Саджест по Tab и предупреждение длинного чата

**Files:** Modify `web/src/domain/chat.ts`, `web/src/api/chat-stream.ts`, `web/src/shared/chat/chat-context.tsx`, `web/src/shared/chat/chat-stream-types.ts`, `web/src/shared/chat/chat-stream-events.ts`, `web/src/shared/chat/chat-stream-helpers.ts`, `web/src/shared/chat/use-thread-state.ts`, `web/src/shared/chat/use-chat-send-actions.ts`, `web/src/shared/chat/chat-composer.tsx`, `web/src/shared/chat/chat-composer-plates.tsx`, `web/src/shared/chat/chat-message-view.tsx`; при необходимости `web/src/styles/chat.css`. Create `web/src/shared/chat/chat-composer.test.tsx`; extend session/panel tests.

**Interfaces:** `ChatMessage.suggestion?: string | null`; `ChatThread.contextLimited?: boolean`, `ChatThreadSummary.contextLimited?: boolean`; stream meta/done поддерживают thread flag. Активный thread state хранит предупреждение отдельно от auth.degraded; suggestion выводится из нужного завершённого сообщения, draft остаётся существующим.

- [ ] RED: placeholder после done; Tab вставляет без send; Enter по placeholder не отправляет; null показывает обычную подсказку; Shift+Tab/IME/непустой draft не перехватываются. Touch не получает кнопку или принятие касанием.
- [ ] RED: loading/running/quote/error/stopped и принятый suggestion скрыты; send/retry/quote change инвалидируют его. Поздние callback после другого thread/account не меняют draft/название/саджест чужого чата; history restore возвращает нужные данные.
- [ ] RED notice matrix: default + long, default + rate, default + blocked, long + quota degradation, истечение rate countdown, переход в новый чат, busy/not busy. Один основной статус по приоритету спецификации, имя/смена аккаунта доступны без второго большого баннера. Точный текст предупреждения после порога; reload/reconnect сохраняет, новый/другой чат снимает; account-level local storage не заражается.
- [ ] RED malformed client payload: suggestion object/number/oversized, contextLimited не boolean, missing legacy fields, поздний terminal чужого run. Невалидные поля не роняют UI и не заменяют draft. Нет возврата старого саджеста после нового incomplete; подписи stopped/incomplete различаются и не раскрывают внутренний протокол.
- [ ] Реализовать через существующие setters/guards/onTitle, без смены архитектуры draft. `cd web && bun run lint && bun run test && bun run build` → PASS. Браузер 390/1280 px в обеих темах: Tab/Shift+Tab, ввод, цитата, переключение, длинный чат, reconnect; сохранить и посмотреть screenshots. Подготовить коммит `Add contextual suggestions and long chat warnings`.

## Task 8: Проверить прямой OpenAI маршрут, стоимость и весь результат

**Files:** Modify `backend/wrangler.jsonc`, `backend/README.md`, provider-neutral logging в `backend/src/agent-loop.ts`; extend `backend/tests/openai-provider.test.ts`, `backend/tests/openai-live.test.ts`, `backend/tests/accounting.test.ts`. При изменении актуальных тарифов — новая версия `backend/src/pricing.ts`, старую не переписывать.

- [ ] Тест `OpenAI ignores Codex proxy and credentials`: direct fetch работает при заданном неработающем proxy; OAuth не вызывается. Тесты бюджета $15 учитывают actual + reserved, concurrency и предупреждение 80% ($12). Provider/response ID/usage диагностируются без содержимого сообщений и секретов.
- [ ] После разрешения исполнения безопасно использовать ключ именно из корневого `.env`, исключив подмену унаследованными OPENAI_API_KEY / BASE_URL. Live preflight обеих production моделей/effort: короткий стрим, tool exchange, end после ответа, nullable title и first-title validation; отдельно проверить encrypted reasoning с неизменным префиксом, после обрезки и при смене маршрута. Неподтверждённые сочетания используют fallback всего обмена из Task 2. Сохранить только безопасный usage; доступность моделей, параметры и стоимость не считать уже проверенными этим планом.
- [ ] Измерить cold/warm, несколько раундов и следующий вопрос до/после сдвига окна. Считать ordinary/read/write/output по Standard, не объявлять иллюстрации графиков измеренной экономией. Unit-тесты не требуют недетерминированного cache hit; отсутствие reuse расследуется диагностикой.
- [ ] Закрепить прямой OpenAI provider в versioned config и описать rollout/rollback. В CI production deploy происходит после merge в main: не выпускать переключающий config до установки секрета из Task 9.
- [ ] Финальные команды: `cd backend && bun run typecheck && bun test`; `cd web && bun run lint && bun run test && bun run build`; перед PR также `uv run scripts/lint.py`, `uv run pytest -q`, `uv run scripts/build.py --strict` по процессу репозитория. Прочитать результаты, не выдавать прежние проверки за новые.
- [ ] Свежий последовательный reviewer проверяет весь diff и Review Focus; исправить существенные находки с тестами. Проверить ранее сделанные UI-фиксы. Подготовить PR только в рамках разрешённого исполнения; merge/deploy не следует из создания плана.

## Task 9: Production rollout и проверяемый откат

**Configuration:** Worker secret `OPENAI_API_KEY`, D1 migrations, active Worker version и `service_config.policy`; используем существующий admin CLI и CI. Приватные patch-файлы вне checkout.

- [ ] Перед разрешённым rollout получить свежие version ID, policy и baseline расходов; проверить отсутствие активных старых запусков. Проверить доступность нового кода/миграций и путь отката. Не считать снимок выше актуальным.
- [ ] Сначала записать ключ из корневого `.env` в Worker secret через stdin, пока активный маршрут ещё Codex. Секрет должен существовать **до** merge/deploy config с `LLM_PROVIDER=openai`.
- [ ] Разделить выпуск на **два последовательных merge/release**: A — миграция и совместимый backend, B — frontend после подтверждённого production smoke A. Текущий Pages workflow ждёт Build notes, но не Backend API; один общий merge не обеспечивает нужный порядок. В A не включать новый frontend. Миграция применяется обычным backend CI до deploy; проверить сохранность данных, успешный job и фактически активную Worker version, а не только зелёный Build notes. Зафиксировать время смены provider.
- [ ] До B проверить старый frontend + новый backend, затем новый frontend + backend A; отсутствующие новые поля обрабатываются безопасно и при откате. Если backend CI A упал/задержался, B не merge. В B не добавлять новые backend-изменения без повторного прохождения этого барьера. Не переносить существующие незакоммиченные UI-фиксы в A случайным staging всего дерева. Изменение CI-графа в этот план не требуется.
- [ ] Применить только частичный production patch через `bun run scripts/admin.ts set-policy <private-file> --remote`: `{"maxHistoryMessages":15,"maxHistoryChars":50000,"maxToolRounds":6,"maxToolCalls":12,"budgets":{"weeklyGlobalUsdMicros":15000000}}`. Bootstrap файл не заменяет этот patch. Модели, effort, квоты, warn ratio и накопленные расходы не сбрасывать.
- [ ] Если Task 8 выявил изменение опубликованных тарифов, после выпуска кода с новой pricing version отдельным точечным patch выбрать её для новых запусков; старые runs рассчитывать по зафиксированной прежней версии. При совпадении тарифов version не менять.
- [ ] Прочитать policy обратно: 15 / 50k, 6 / 12, 60 секунд, $15, warn ratio 0.8; прочие настройки прежние. Проверить активный provider/standard base URL и наличие secret binding без чтения значения. При уже превышенном новом бюджете ожидать блокировку новых запросов.
- [ ] Production smoke A/B: первый title, nullable title, смена темы, ответ с чтением конспекта, suggestion/Tab/null, stop/retry/reconnect, достижение каждого порога окна, sticky low и чистый новый чат; default + длинный чат/rate/block проверяются в B. End и raw ошибки не видны ни в live, ни в восстановленной истории; реальный usage увеличивает правильные счётчики; Codex OAuth/proxy на OpenAI маршруте не вызываются.
- [ ] Откат: совместимая предыдущая Worker version либо явный Codex route; additive D1 migration не откатывать удалением данных, расходы и бюджет $15 сохранять. Повторный CI deploy не возвращает провайдера случайно; при невозможности безопасного запуска явная недоступность, а не скрытый Codex fallback.

## Условия готовности

- История для модели ограничена выбранными 15 / 50k и обрезается целыми обменами; полная пользовательская переписка сохранена. Новый reasoning/tool replay не является старым хвостом из 24 items.
- Системный промпт/tools постоянны; снимок прежнего вопроса не меняется из-за навигации, каталога, нового названия или retry.
- Длинный thread использует low с правильной квотой и предупреждением; новый thread имеет обычный выбор модели. У default-пользователя один основной статус, компактная смена аккаунта остаётся доступной.
- Успешное завершение имеет ответ и ровно один валидный скрытый end как единственный function call завершающего ответа, первый непустой title, уместный suggestion обычным пользовательским текстом без Markdown/TeX либо null. Параллельные учебные вызовы разрешены, суммарно не более 12 исполненных. Сбой сохраняет текст и стоимость, но не публикует частичные metadata и не запускает бесконечный цикл.
- Frontend не отправляет placeholder, не заменяет draft поздним callback и корректно восстанавливает данные после reconnect. Негативные тесты подтверждают отсутствие служебного tool/args/ack/errors во всех публичных каналах.
- Production использует согласованный ключ OpenAI напрямую; изменения policy проверены чтением. $15 ограничивает admission по учтённым расходам/резервам, но не выдаётся за банковскую гарантию точного счёта уже выполняющегося запроса.
- Проверки, браузерная регрессия и независимое ревью подтверждены новым выводом. До разрешения реализации все checkbox остаются незавершёнными.

## Независимое ревью плана — Astra, 24 ноября

Проведено отдельным `gpt-6-astra` по процессу `superpowers:requesting-code-review`, с проверкой выводов по исходникам перед изменением плана. Исходная версия: **0 Critical, 7 Important; к реализации ещё не готова**. По итогам в план внесены следующие требования; это исправления автора, а не утверждение, что Astra уже одобрила обновлённый документ.

| Находка | Уточнение и проверка |
| --- | --- |
| Default-подпись скрывает long warning | Один основной статус + компактная строка аккаунта; notice matrix Task 7 |
| Проверка порядка после стриминга опаздывает | Item-aware фильтр delta, запрет хвоста после end; Tasks 4–5 |
| Raw provider errors раскрывают служебный протокол | Безопасные публичные коды во всех путях, отрицательные тесты live/history/reconnect; Tasks 4–6 |
| Parser молча нормализует неожиданный output в успех | Типизированные нарушения/refusal/terminal, сохранение usage при отказе, валидный последний раунд; Tasks 4–5 |
| Совместимость opaque replay при смене маршрута не определена | Provenance и fallback всего обмена без потери исходных записей; Tasks 1–2, preflight Task 8 |
| Проверка только max seq пропускает finalize/retry | Context revision и ранний idempotency lookup; Tasks 1, 3, 6 |
| Backend-before-frontend не обеспечен текущим CI | Последовательные releases A/B с production барьером; Task 9 |

Дополнительно закреплены предел аргументов, строгая клиентская валидация, сохранение фактически сокращённого snapshot, отсутствие колебания high/low при fallback и разные подписи stopped/incomplete. Непроверенные production secret/policy/доступ моделей/тарифы и фактическая совместимость reasoning остаются явными release gates Tasks 8–9; ревью исходников их не подтверждает. Продуктовый код в рамках этой правки не меняется.

## Источники

- [Архитектура и управление backend](../../../backend/README.md), [процесс работы](../../../context/process.md), [прямой provider](../../../backend/src/openai-provider.ts), [agent loop](../../../backend/src/agent-loop.ts), [admission и учёт](../../../backend/src/quotas.ts).
- [OpenAI Function calling](https://developers.openai.com/api/docs/guides/function-calling): tool choice, strict schema; порядок текста проверяет harness.
- [OpenAI Prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching) и [Keep the prefix unchanged](https://developers.openai.com/api/docs/guides/keep-prefix-unchanged): reuse префикса, цена writes, совместимость reasoning при изменении контекста.
- [OpenAI Pricing](https://developers.openai.com/api/docs/pricing): перед rollout сверить Standard read/write/input/output текущих маршрутов; данные Codex не считать API bill.


## Результат реализации и ревью — 24 ноября

Задачи 1–8 реализованы в ветке `ai-chat`; подробные исходные checkbox выше оставлены как спецификация проверок, а фактически выполненные проверки перечислены здесь. Production release A выполнен перед публикацией frontend: Worker `5d2480ec-df47-4b75-a51c-9284ac013327`, additive migration 0002, прямой OpenAI route и secret binding. Частичный policy patch прочитан обратно: 15 / 50k, 6 / 12, $15; остальные поля и накопленный учёт сохранены.

Свежий независимый `gpt-6-astra` выполнил финальное ревью по `superpowers:requesting-code-review`: **0 Critical, 2 Important, 0 Minor**. Обе находки автор воспроизвёл и исправил до release A:

1. Предварительный high-резерв мог блокировать длинный чат до выбора low. Окончательные block/alerts перенесены после подготовки контекста и forced-low evaluation. Регрессии: достижение порога и уже sticky thread при бюджете, вмещающем только low; ложного exceeded alert нет.
2. Большой replay envelope удалял небольшой видимый ответ до fallback. SQL по-прежнему не загружает ciphertext сверх окна; недоступный envelope преобразуется в целый snapshot + видимый ответ, затем применяется обрезка. Проверены stopped/incomplete/unknown и oversized compatible replay. Это уточняет первоначальную оптимизацию: размер недоступного raw envelope сам по себе не удаляет видимую историю.

Fix pass подтверждён RED → GREEN; повторного платного ревью не заявляем. Полный backend suite: 105 pass, 3 opt-in live skips; typecheck pass. Frontend: 454 pass; полный lint (format/eslint/typecheck/knip/dup/architecture) и build pass. Python: 173 pass, notes lint без ошибок/предупреждений, strict notes build pass. Browser regression: 390/1280, light/dark — history restore, long warning + default identity, Tab без отправки, consumed suggestion, reload.

Live API: обе production модели/effort — 3/3 preflight, включая текст перед строгим end и encrypted replay следующего вопроса. Full-prompt cache: cold input 2185, cache write 2053; повторные запросы cached 2053; следующий вопрос cached 2053 + write 102. При сдвиге окна cached 0 + write 2033: потеря reuse ожидаема и не отменяет выбранное ограничение истории. Тарифы Standard перепроверены, pricingVersion 1 сохранена.

Release B выполняется через squash PR в main после барьера A: GitHub Pages environment разрешает main. Отдельный проверенный Worker release A обеспечивает нужный порядок при независимых CI workflows; автоматический backend redeploy в B содержит тот же backend. Инструкции ручной production-проверки — [chat-production-checks](../../chat-production-checks.md). Фактические результаты production smoke и итоговые commit/deploy IDs — в отчёте выпуска.
