/**
`sample_problems`: random problems from the variant generators' banks (`prep/<course>/<id>-bank.yaml`,
built into `data/<course>/<id>/bank.json` on the site). The Worker reads the published JSON, so a bank
reaches the chat as soon as Pages deploys it: no D1 or Vectorize sync.
*/
import type { ChatStep, CodexFunctionTool } from "../../types";

export const BANK_DATA_URL = "https://hse.nalinor.dev/data/";
/** The banks that exist: course → prep ids. A new `*-bank.yaml` goes here too. */
export const BANKS: Readonly<Record<string, readonly string[]>> = {
  algebra: ["kr1", "exam1"],
  calculus: ["colloq1", "kr2"],
  discrete: ["kr2"],
};
const MAX_COUNT = 10;
const DEFAULT_COUNT = 3;

export interface BankQuestion {
  id: string;
  kind: string;
  topic?: string;
  text: string;
  answer?: string;
  refs?: Array<string | { id: string; doc: string }>;
}
export interface TicketPart {
  kind: string;
  title: string;
  count: number;
}
/** A ticket item is a part, or `one_of`: alternative lists of parts, of which one is taken. */
export type TicketItem = TicketPart | { one_of: TicketPart[][] };
export interface Bank {
  about?: string;
  ticket: TicketItem[];
  questions: BankQuestion[];
}

const bankList = (): string =>
  Object.entries(BANKS)
    .map(([course, ids]) => ids.map((id) => `${course}/${id}`).join(", "))
    .join(", ");

export const SAMPLE_PROBLEMS_TOOL: CodexFunctionTool = {
  type: "function",
  name: "sample_problems",
  description:
    "Случайные задачи из банка генератора вариантов к КР, коллоквиуму или экзамену (тот же банк, что в «Генераторе вариантов» на странице подготовки). Для «проверь меня», тренировки и пробного варианта. Возвращает условия (LaTeX), ответ или ключевой шаг (answer) и ссылки на разборы (передай строку из refs в read_block как id). mode=variant без kind — по задаче на каждый номер варианта. Банки: " +
    bankList() +
    ".",
  parameters: {
    type: "object",
    properties: {
      course: { type: "string", enum: Object.keys(BANKS), description: "Курс банка." },
      prep_id: { type: "string", description: "ID подготовки: kr1, kr2, colloq1, exam1." },
      mode: {
        type: "string",
        enum: ["random", "variant"],
        description:
          "random — count случайных задач (с фильтрами); variant — целый вариант, как в генераторе.",
      },
      kind: {
        type: "string",
        description:
          "Тип задачи (номер варианта): kind из ticket банка. Неизвестный kind вернет список доступных.",
      },
      topic: { type: "string", description: "Тема (topic) задач банка." },
      count: {
        type: "integer",
        description: `Сколько задач для mode=random, 1–${String(MAX_COUNT)} (по умолчанию ${String(DEFAULT_COUNT)}).`,
      },
      exclude_ids: {
        type: "array",
        items: { type: "string" },
        description: "ID задач, которые уже давали в этом диалоге: их не повторять.",
      },
    },
    required: ["course", "prep_id"],
    additionalProperties: false,
  },
};

/** Bank HTML (Pandoc) back to text with `$…$`: the model reads and writes TeX. */
export function bankHtmlToTex(html: string): string {
  return (
    html
      .replace(
        /<span\s+class="math display">([\s\S]*?)<\/span>/g,
        (_m, tex: string) => `$$${tex}$$`,
      )
      .replace(/<span\s+class="math inline">([\s\S]*?)<\/span>/g, (_m, tex: string) => `$${tex}$`)
      .replace(/<\/p>\s*<p>/g, "\n\n")
      .replace(/<li>/g, "\n- ")
      .replace(/<[^>]+>/g, "")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, "&")
      .split("\n\n")
      // Pandoc wraps lines inside a paragraph; list items keep their own lines.
      .map((para) => para.replace(/[ \t]*\n(?!- )[ \t]*/g, " "))
      .join("\n\n")
      .trim()
  );
}

/** Random order: sort by a random key per item (fine for a few hundred problems). */
function shuffled<T>(items: readonly T[], random: () => number): T[] {
  return items
    .map((item) => ({ item, key: random() }))
    .sort((a, b) => a.key - b.key)
    .map(({ item }) => item);
}

export interface SampleArgs {
  course: string;
  prepId: string;
  mode: "random" | "variant";
  kind?: string;
  topic?: string;
  count: number;
  exclude: ReadonlySet<string>;
}

export function parseSampleArgs(args: Record<string, unknown>): SampleArgs | { error: string } {
  const course = String(args.course ?? "").trim();
  const prepId = String(args.prep_id ?? "").trim();
  if (!BANKS[course]?.includes(prepId)) {
    return { error: `Нет банка ${course}/${prepId}. Есть: ${bankList()}` };
  }
  const rawCount = Number(args.count ?? DEFAULT_COUNT);
  const count = Number.isFinite(rawCount)
    ? Math.min(MAX_COUNT, Math.max(1, Math.round(rawCount)))
    : DEFAULT_COUNT;
  const text = (key: string): string | undefined =>
    typeof args[key] === "string" && args[key] !== "" ? String(args[key]) : undefined;
  const exclude = new Set(Array.isArray(args.exclude_ids) ? args.exclude_ids.map(String) : []);
  return {
    course,
    prepId,
    mode: args.mode === "variant" ? "variant" : "random",
    kind: text("kind"),
    topic: text("topic"),
    count,
    exclude,
  };
}

/** Picks problems; pure, so tests pass their own `random`. */
export function sampleFromBank(bank: Bank, a: SampleArgs, random: () => number = Math.random) {
  const allParts = bank.ticket.flatMap((t) => ("one_of" in t ? t.one_of.flat() : [t]));
  const kinds = allParts.map((t) => ({ kind: t.kind, title: t.title }));
  if (a.kind !== undefined && !kinds.some((k) => k.kind === a.kind)) {
    return { error: `Нет типа задач ${a.kind}`, kinds };
  }
  const pool = bank.questions.filter(
    (q) =>
      !a.exclude.has(q.id) &&
      (a.kind === undefined || q.kind === a.kind) &&
      (a.topic === undefined || q.topic === a.topic),
  );
  const picked =
    a.mode === "variant" && a.kind === undefined
      ? bank.ticket
          .flatMap((t) =>
            "one_of" in t
              ? (t.one_of[Math.min(Math.floor(random() * t.one_of.length), t.one_of.length - 1)] ??
                [])
              : [t],
          )
          .flatMap((t) =>
            shuffled(
              pool.filter((q) => q.kind === t.kind),
              random,
            ).slice(0, t.count),
          )
      : shuffled(pool, random).slice(0, a.count);
  const titles = new Map(allParts.map((t) => [t.kind, t.title]));
  const sourceLink = (ref: NonNullable<BankQuestion["refs"]>[number]): string => {
    if (typeof ref === "string") return ref.startsWith("block:") ? ref : `/${a.course}#${ref}`;
    return `/${a.course}/${ref.doc}#${ref.id}`;
  };
  return {
    about: bank.about,
    left_after_filters: pool.length - picked.length,
    problems: picked.map((q) => ({
      id: q.id,
      kind: q.kind,
      kind_title: titles.get(q.kind),
      topic: q.topic,
      text: bankHtmlToTex(q.text),
      ...(q.answer === undefined ? {} : { answer: bankHtmlToTex(q.answer) }),
      ...(q.refs === undefined || q.refs.length === 0 ? {} : { refs: q.refs.map(sourceLink) }),
    })),
    page: `/${a.course}/${a.prepId}`,
    note: "Дай студенту решить сам: answer и refs не показывай до его попытки, потом сверь и разбери.",
  };
}

const COURSE_DATIVE: Readonly<Record<string, string>> = {
  algebra: "алгебре",
  calculus: "матанализу",
  discrete: "дискре",
};
const PREP_GENITIVE: Readonly<Record<string, string>> = {
  kr: "КР",
  colloq: "коллоквиума",
  exam: "экзамена",
};

/** «КР 1 по алгебре»: what the chat shows next to the generated problems. */
export function bankTitle(course: string, prepId: string): string {
  const match = /^([a-z]+)(\d*)$/.exec(prepId);
  const kind = match === null ? undefined : PREP_GENITIVE[match[1] ?? ""];
  const prep = kind === undefined ? prepId : `${kind}${match?.[2] ? ` ${match[2]}` : ""}`;
  const subject = COURSE_DATIVE[course];
  return subject === undefined ? prep : `${prep} по ${subject}`;
}

export async function runSampleProblems(
  args: Record<string, unknown>,
  fetcher: typeof fetch = fetch,
): Promise<{ output: string; step: ChatStep }> {
  const parsed = parseSampleArgs(args);
  if ("error" in parsed) {
    return {
      output: JSON.stringify(parsed),
      step: { kind: "sample", target: "генератор вариантов", state: "error" },
    };
  }
  const target = bankTitle(parsed.course, parsed.prepId);
  try {
    const res = await fetcher(`${BANK_DATA_URL}${parsed.course}/${parsed.prepId}/bank.json`, {
      cf: { cacheTtl: 300, cacheEverything: true },
    } as RequestInit);
    if (!res.ok) throw new Error(`HTTP ${String(res.status)}`);
    const bank = (await res.json()) as Bank;
    const sample = sampleFromBank(bank, parsed);
    return {
      output: JSON.stringify(sample),
      step: {
        kind: "sample",
        target,
        state: "done",
        ...(sample.problems === undefined ? {} : { count: sample.problems.length }),
      },
    };
  } catch (error) {
    return {
      output: JSON.stringify({
        error: `Банк задач недоступен: ${error instanceof Error ? error.message : String(error)}`,
      }),
      step: { kind: "sample", target, state: "error" },
    };
  }
}
