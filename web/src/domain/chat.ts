import { findCourse } from "./courses.ts";

export type ChatTier = "external" | "guest" | "internal";

export type ChatBlockCode =
  | "auth_required"
  | "concurrent_run"
  | "global_budget_exceeded"
  | "guest_budget_exceeded"
  | "oauth_unavailable"
  | "rate_limited"
  | "service_unavailable"
  | "tier_quota_exceeded";

export type ChatBlock = {
  readonly code: ChatBlockCode;
  readonly nextAvailableAt?: null | number;
  readonly retryAfterSec?: null | number;
};

export type ChatDegraded = {
  readonly active: boolean;
  readonly restoresAt?: null | number;
};

export type ChatUser = {
  readonly id: number;
  readonly name: string;
};

export type ChatQuote = {
  readonly messageId?: string;
  readonly blockId?: string;
  readonly label: string;
  readonly sectionId?: string;
  readonly tex: string;
};

export type ChatStep = {
  readonly kind: "note" | "read" | "search";
  readonly more?: number;
  readonly note?: string;
  readonly q?: string;
  readonly res?: readonly string[];
  readonly links?: readonly string[];
  readonly state: "done" | "error" | "running";
  readonly target?: string;
};

export type ChatMessageStatus = "done" | "error" | "incomplete" | "running" | "stopped";

export type ChatMessage = {
  readonly page: ChatDocContext;
  readonly contentTex: string;
  readonly createdAt: number;
  readonly errorMessage: null | string;
  readonly id: string;
  readonly quote: ChatQuote | null;
  readonly renderKey?: string;
  readonly pendingRequestId?: null | string;
  readonly role: "assistant" | "user";
  readonly runId: null | string;
  readonly seq: number;
  readonly status: ChatMessageStatus;
  readonly steps: readonly ChatStep[];
};

export type ChatThreadSummary = {
  readonly id: string;
  readonly generatedTitle?: null | string;
  readonly title: string;
  readonly updatedAt: number;
};

export type ChatThread = {
  readonly createdAt: number;
  readonly id: string;
  readonly messages: readonly ChatMessage[];
  readonly generatedTitle?: null | string;
  readonly title: string;
  readonly updatedAt: number;
};

export type ChatDocContext = {
  readonly course: string;
  readonly docId: string;
};

export type ChatPlateCopy = {
  readonly body: string;
  readonly showLogin: boolean;
  readonly title: string;
};

/** Extracts `{ course, docId }` on document routes (`/<course>/<docId>`), else `null`. */
export const parseDocContext = (pathname: string): ChatDocContext => {
  const [slug, docId = "", ...rest] = pathname.split("/").filter(Boolean);
  const course = findCourse(slug);
  return course === undefined || rest.length > 0
    ? { course: "", docId: "" }
    : { course: course.id, docId };
};

const russianPlural = (n: number, forms: readonly [string, string, string]): string => {
  const abs = Math.abs(n) % 100;
  if (abs >= 11 && abs <= 19) {
    return forms[2];
  }
  const last = abs % 10;
  if (last === 1) {
    return forms[0];
  }
  if (last >= 2 && last <= 4) {
    return forms[1];
  }
  return forms[2];
};

/** Formats remaining time until `targetMs` in Russian, e.g. «12 часов 37 минут». */
export const formatRemainingDuration = (targetMs: number, nowMs: number): string => {
  const diffMin = Math.max(1, Math.ceil((targetMs - nowMs) / 60_000));
  const hours = Math.floor(diffMin / 60);
  const mins = diffMin % 60;
  const hWord = russianPlural(hours, ["час", "часа", "часов"]);
  const mWord = russianPlural(mins, ["минуту", "минуты", "минут"]);
  if (hours > 0 && mins > 0) {
    return `${hours} ${hWord} ${mins} ${mWord}`;
  }
  if (hours > 0) {
    return `${hours} ${hWord}`;
  }
  return `${mins} ${mWord}`;
};

/** Formats degraded quality banner text matching the approved prototype copy. */
export const formatDegradedCaption = (degraded: ChatDegraded, nowMs: number): null | string => {
  if (!degraded.active) {
    return null;
  }
  if (degraded.restoresAt !== undefined && degraded.restoresAt !== null) {
    const dur = formatRemainingDuration(degraded.restoresAt, nowMs);
    return `Повышенное число запросов. Качество ответов снижено — вернётся через ${dur}`;
  }
  return "Повышенное число запросов. Качество ответов временно снижено";
};

/** Backoff schedule for compact `GET /v1/runs/:runId/status` polling after WS drop. */
export const nextRunPollDelayMs = (attempt: number): number => {
  if (attempt <= 1) {
    return 2000;
  }
  if (attempt <= 4) {
    return 4000;
  }
  return 6000;
};

const TEX_COMMANDS: Readonly<Record<string, string>> = {
  alpha: "α",
  beta: "β",
  cdot: "·",
  delta: "δ",
  epsilon: "ε",
  exists: "∃",
  forall: "∀",
  gamma: "γ",
  ge: "≥",
  geq: "≥",
  in: "∈",
  infty: "∞",
  lambda: "λ",
  le: "≤",
  Leftrightarrow: "⇔",
  leq: "≤",
  ne: "≠",
  neq: "≠",
  notin: "∉",
  phi: "φ",
  pi: "π",
  pm: "±",
  Rightarrow: "⇒",
  sigma: "σ",
  subset: "⊆",
  subseteq: "⊆",
  times: "×",
  to: "→",
  varepsilon: "ε",
  varphi: "φ",
};

const BLACKBOARD_LETTERS: Readonly<Record<string, string>> = {
  C: "ℂ",
  N: "ℕ",
  Q: "ℚ",
  R: "ℝ",
  Z: "ℤ",
};

/** Converts LaTeX/Markdown assistant text into clean readable plain text for clipboard copy. */
export const toPlainCopyText = (source: string): string =>
  source
    .replaceAll(/\[([^\]]{1,200})\]\(#[^)]{1,120}\)/g, "$1")
    .replaceAll(/\*\*([^*]{1,400})\*\*/g, "$1")
    .replaceAll(/\\(?:text|mathrm|mathbf|operatorname)\{([^{}]{1,200})\}/g, "$1")
    .replaceAll(/\\frac\{([^{}]{1,120})\}\{([^{}]{1,120})\}/g, "($1)/($2)")
    .replaceAll(
      /\\mathbb\{([CNQRZ])\}/g,
      (_m, letter: string) => BLACKBOARD_LETTERS[letter] ?? letter,
    )
    .replaceAll(/\\([a-z]+)/gi, (match, cmd: string) => TEX_COMMANDS[cmd] ?? match)
    .replaceAll("$", "")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();

const waitCopy = (block: ChatBlock, nowMs: number): string =>
  block.nextAvailableAt === undefined || block.nextAvailableAt === null
    ? "Попробуйте снова позже."
    : `Новые сообщения появятся через ${formatRemainingDuration(block.nextAvailableAt, nowMs)}.`;

const quotaPlate = (block: ChatBlock, tier: ChatTier, nowMs: number): ChatPlateCopy => {
  const wait = waitCopy(block, nowMs);
  return {
    body:
      tier === "external"
        ? `${wait} У студентов 1 курса ПИ лимиты выше — войдите с аккаунта из чата потока.`
        : wait,
    showLogin: tier === "external",
    title: "Дневной лимит сообщений исчерпан",
  };
};

/** Returns user-facing plate text for every limit / service block code. */
export const blockPlateCopy = (block: ChatBlock, tier: ChatTier, nowMs: number): ChatPlateCopy => {
  switch (block.code) {
    case "auth_required": {
      return {
        body: "Гостевые сообщения закончились. Войдите через Telegram — у студентов 1 курса ПИ лимиты выше.",
        showLogin: true,
        title: "Войдите, чтобы продолжить",
      };
    }
    case "guest_budget_exceeded": {
      return {
        body: "Суточный бюджет для гостей исчерпан. Войдите через Telegram, чтобы продолжить общение.",
        showLogin: true,
        title: "Гостевой доступ временно ограничен",
      };
    }
    case "tier_quota_exceeded": {
      return quotaPlate(block, tier, nowMs);
    }
    case "global_budget_exceeded": {
      return {
        body: "Недельный бюджет сервиса временно исчерпан. Доступ восстановится автоматически.",
        showLogin: false,
        title: "Чат временно на паузе",
      };
    }
    case "rate_limited": {
      const sec = block.retryAfterSec ?? 15;
      return {
        body: `Слишком много запросов подряд. Подождите ${sec} сек. и отправьте снова.`,
        showLogin: false,
        title: "Не так быстро",
      };
    }
    case "concurrent_run": {
      return {
        body: "Дождитесь завершения текущего ответа, прежде чем отправлять новый вопрос.",
        showLogin: false,
        title: "Ответ ещё готовится",
      };
    }
    case "oauth_unavailable":
    case "service_unavailable": {
      return {
        body: "ИИ-сервис сейчас недоступен. Черновик сохранён — попробуйте чуть позже.",
        showLogin: false,
        title: "Сервис временно недоступен",
      };
    }
  }
};
