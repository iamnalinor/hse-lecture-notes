import { SYSTEM_PROMPT } from "./system-prompt";
import type { TrackedD1 } from "../db";
import { buildFtsMatchQuery, tokenizeAndStem } from "../stemmer";
import type {
  ChatStep,
  CodexFunctionTool,
  Env,
  QuotePayload,
} from "../types";

// =============================================================================
// Quote canonicalization & validation against D1 course materials
// =============================================================================

/**
 * Canonicalizes Russian + LaTeX quote strings so selections across KaTeX formulas,
 * newlines, typography dashes/quotes, and block boundaries match the source TeX reliably.
 */
export function normalizeQuoteText(input: string): string {
  return input
    .normalize("NFKC")
    .replace(/\r\n?/g, "\n")
    .replace(/[«»„“”]/g, '"')
    .replace(/[‘’`]/g, "'")
    .replace(/[—–−]/g, "-")
    .replace(/\u00a0/g, " ")
    .replace(/\$\$/g, "$")
    .replace(/\\\(|\\\)|\\\[|\\\]/g, "$")
    .replace(/\s+/g, " ")
    .replace(/\s*([.,;:!?()[\]{}])\s*/g, "$1")
    .replace(/\$\s+/g, "$")
    .replace(/\s+\$/g, "$")
    .trim()
    .toLowerCase();
}

function stripTexMarkupForFallback(input: string): string {
  return normalizeQuoteText(
    input
      .replace(/\\(?:N|Z|Q|R|C|F)\b/g, (m) => m.slice(1))
      .replace(/\\(?:Id|sgn|rk|tr|Mat)\b/g, (m) => m.slice(1))
      .replace(/\\(?:varepsilon|eps)\b/g, "eps")
      .replace(/\\(?:leqslant|leq|le)\b/g, "<=")
      .replace(/\\(?:geqslant|geq|ge)\b/g, ">=")
      .replace(/\\(?:rwv|rw)\{([^{}]*)\}/g, "$1")
      .replace(
        /\\(?:textbf|textit|emph|text|mathrm|mathbf|mathcal|mathbb|operatorname)\{([^{}]*)\}/g,
        "$1",
      )
      .replace(/\[([^\]]+)\]\(#[^)]+\)/g, "$1")
      .replace(/\[-?@[^\]]+\]/g, " ")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/\*([^*]+)\*/g, "$1")
      .replace(/(^|\s)_([^_]+)_(?=\s|[.,;:!?)]|$)/g, "$1$2")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/\$/g, ""),
  );
}

function hasOrderedWordCoverage(haystack: string, needle: string): boolean {
  const words = needle.match(/[a-zа-яё0-9]{3,}/gi) ?? [];
  if (words.length < 3) return false;
  let pos = 0;
  let matched = 0;
  for (const w of words) {
    const idx = haystack.indexOf(w, pos);
    if (idx !== -1) {
      matched += 1;
      pos = idx + w.length;
    }
  }
  return matched / words.length >= 0.8;
}

function containsNormalized(haystack: string, needle: string): boolean {
  if (!needle) return false;
  const normNeedle = normalizeQuoteText(needle);
  if (normNeedle.length < 2) return false;
  const normHaystack = normalizeQuoteText(haystack);
  if (normHaystack.includes(normNeedle)) return true;

  // Fallback for selections that cross KaTeX macro expansions (\N -> \mathbb{N}) or Markdown *emphasis*
  const plainNeedle = stripTexMarkupForFallback(needle);
  const plainHaystack = stripTexMarkupForFallback(haystack);
  if (plainNeedle.length >= 2 && plainHaystack.includes(plainNeedle)) {
    return true;
  }
  if (hasOrderedWordCoverage(plainHaystack, plainNeedle)) {
    return true;
  }
  return false;
}

export async function validateAssistantQuote(
  db: TrackedD1,
  threadId: string | null,
  quote: QuotePayload,
  browserId: string,
  telegramId?: number,
): Promise<boolean> {
  if (!threadId || typeof quote.messageId !== "string" || !quote.messageId || quote.blockId || quote.sectionId) return false;
  const owner = telegramId === undefined ? "t.telegram_id IS NULL AND t.browser_id = ?" : "t.telegram_id = ?";
  const row = await db.first<{ content_tex: string }>(
    db.prepare(`SELECT m.content_tex FROM chat_messages m JOIN chat_threads t ON t.id = m.thread_id
      WHERE m.id = ? AND t.id = ? AND m.role = 'assistant' AND m.status IN ('done','stopped','incomplete')
      AND ${owner}`).bind(quote.messageId, threadId, telegramId ?? browserId),
  );
  if (!row) return false;
  const normalize = (s: string) => s.replace(/\s+/gu, " ").trim();
  const needle = normalize(quote.tex);
  if (needle.length < 2) return false;
  if (normalize(row.content_tex).includes(needle)) return true;
  const visible = row.content_tex.split("```").map((part, index) => {
    if (index % 2) return part.slice(part.indexOf("\n") + 1);
    const blocks = part.replace(/^ {0,3}#{1,6}[ \t]+|^\s*(?:[-*•]|\d+\.)[ \t]+/gmu, "");
    return blocks.replace(/\$\$([^$]+)\$\$|(\$[^$]+\$)|`([^`]+)`|\[([^\]]+)\]\((?:#|\/)[^)]*\)|\[\[[^|\]]+\|([^\]]+)\]\]|\*\*([^*]+)\*\*|\*(\S(?:[^*]*?\S)?)\*|(?<![\p{L}\p{N}_])_(?!\s)([^_\n]+)(?<!\s)_(?![\p{L}\p{N}_])/gu,
      (_match, display, math, code, link, wiki, bold, italic, underscore) =>
        display !== undefined ? `$${display.trim()}$` : math ?? code ?? link ?? wiki ?? bold ?? italic ?? underscore);
  }).join(" ");
  return normalize(visible).includes(needle);
}

export async function validateQuoteAgainstCourse(
  db: TrackedD1,
  course: string,
  docId: string,
  quote: QuotePayload,
): Promise<boolean> {
  if (!quote.tex || !quote.tex.trim()) return false;

  // 1. If a specific blockId is provided, check that block first (1 PK read)
  if (quote.blockId) {
    const block = await db.first<{
      course: string;
      doc_id: string;
      title: string;
      statement_tex: string;
      proof_tex: string;
    }>(
      db
        .prepare(
          "SELECT course, doc_id, title, statement_tex, proof_tex FROM course_blocks WHERE course = ? AND doc_id = ? AND (anchor_id = ? OR id = ?) LIMIT 1",
        )
        .bind(course, docId, quote.blockId, quote.blockId),
    );
    if (block && block.course === course && block.doc_id === docId) {
      const combined = `${block.title}\n${block.statement_tex}\n${block.proof_tex}`;
      if (containsNormalized(combined, quote.tex)) return true;
    }
  }

  // 2. Check the full source document body (covers cross-block selections & plain prose)
  const doc = await db.first<{ body_tex: string }>(
    db
      .prepare(
        "SELECT body_tex FROM course_documents WHERE course = ? AND doc_id = ? LIMIT 1",
      )
      .bind(course, docId),
  );
  if (!doc) return false;
  return containsNormalized(doc.body_tex, quote.tex);
}

// =============================================================================
// System prompt builder (with course outline & "← МЫ ЗДЕСЬ" marker)
// =============================================================================

export async function buildSystemPrompt(
  db: TrackedD1,
  course: string,
  docId: string,
): Promise<{ instructions: string; context: string; outline: string; currentDocOrder: number; currentDocTitle: string }> {
  const docsRes = course === "" ? { results: [] } : await db.all<{
    doc_kind: string;
    doc_id: string;
    order_index: number;
    title: string;
    date: string | null;
  }>(
    db
      .prepare(
        "SELECT doc_kind, doc_id, order_index, title, date FROM course_documents WHERE course = ? ORDER BY doc_kind, order_index",
      )
      .bind(course),
  );

  let currentDocOrder = 0;
  let currentDocTitle = docId;

  const outlineLines: string[] = [];
  for (const d of docsRes.results) {
    const isCurrent = d.doc_id === docId;
    if (isCurrent) {
      currentDocOrder = d.order_index;
      currentDocTitle = d.title;
    }
    const marker = isCurrent ? "  ← МЫ ЗДЕСЬ" : "";
    outlineLines.push(`- [${d.doc_kind}] ${d.doc_id}: ${d.title}${marker}`);
  }

  const outlineSection = outlineLines.length ? `\n\nПЛАН КУРСА (${course}):\n${outlineLines.join("\n")}` : "";
  let pageContext = "Студент на главной странице. Курс и документ не выбраны. По умолчанию поиск охватывает все курсы. Для read_document указывай курс из результатов поиска.";
  if (docId) {
    pageContext = `Студент открыл документ «${currentDocTitle}» (${course}/${docId}). Отдавай приоритет текущей и более ранним лекциям. Если блок помечен later_in_course, предупреди, что это будет позже в курсе.`;
  } else if (course) {
    pageContext = `Студент на странице курса ${course}. Конкретный документ не выбран. Не предполагай, какие темы уже пройдены.`;
  }

  const instructions = SYSTEM_PROMPT;

  return { instructions, context: pageContext, outline: outlineSection, currentDocOrder, currentDocTitle };
}

// =============================================================================
// 3 Agent Tools: search_materials, read_block, read_document
// =============================================================================

export const AGENT_TOOLS: CodexFunctionTool[] = [
  {
    type: "function",
    name: "search_materials",
    description:
      "Гибридный поиск (FTS5 + семантика) по определениям, теоремам, леммам, задачам, примерам и разделам конспектов. Для квизов и других проверочных работ также ищет страницы подготовки по каталогу, возвращая дату, ссылку и doc_id для read_document. Возвращает список подходящих блоков с ID, заголовком, фрагментом и меткой chronology.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Поисковый запрос на русском или точный ID блока (например, thm:lec07:fta).",
        },
        course: {
          type: "string",
          description: "Алгебра — algebra, матанализ (матан) — calculus, дискретная математика — discrete, алгоритмы — aiya. all — все курсы.",
        },
        doc_kind: {
          type: "string",
          enum: ["lecture", "theory", "prep", "program"],
          description: "Опциональный фильтр по типу документа.",
        },
        block_kind: {
          type: "string",
          enum: [
            "theorem",
            "lemma",
            "proposition",
            "corollary",
            "definition",
            "axiom",
            "problem",
            "example",
            "remark",
            "ticket",
            "section",
          ],
          description: "Опциональный фильтр по типу блока.",
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "read_block",
    description:
      "Прочитать полный текст конкретного блока конспекта по его ID, включая доказательство (если include_proof=true) и исходящие/входящие ссылки на другие блоки.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Точный ID блока (например, thm:lec07:fta)." },
        include_proof: {
          type: "boolean",
          description: "Включить ли доказательство/решение блока (по умолчанию true).",
        },
      },
      required: ["id"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "read_document",
    description:
      "Прочитать структуру или блоки конкретного документа (лекции/теории/подготовки). Если doc_id не передан — возвращает оглавление курса.",
    parameters: {
      type: "object",
      properties: {
        course: { type: "string", enum: ["algebra", "calculus", "discrete", "aiya"], description: "Код курса: calculus — математический анализ (матан), algebra — алгебра, discrete — дискретная математика, aiya — алгоритмы." },
        doc_id: { type: "string", description: "ID документа (например, 07_oct16_primes_fta)." },
        section_id: { type: "string", description: "Опциональный ID раздела внутри документа." },
      },
      required: ["course"],
      additionalProperties: false,
    },
  },
];

export interface ToolExecutionContext {
  env: Pick<Env, "VECTORIZE" | "AI">;
  db: TrackedD1;
  currentCourse: string;
  currentDocId: string;
  currentDocOrder: number;
  maxToolOutputChars: number;
  maxTotalToolOutputChars: number;
}

interface SearchBlockRow {
  anchor_id: string;
  id: string;
  course: string;
  doc_kind: string;
  doc_id: string;
  doc_order: number;
  block_kind: string;
  title: string;
  statement_tex: string;
}

function classifyChronology(
  blockCourse: string,
  blockDocId: string,
  blockDocOrder: number,
  currentCourse: string,
  currentDocId: string,
  currentDocOrder: number,
): "earlier" | "current" | "later_in_course" | "other_course" | "unspecified" {
  if (!currentDocId) return "unspecified";
  if (blockCourse !== currentCourse) return "other_course";
  if (blockDocId === currentDocId) return "current";
  if (blockDocOrder > currentDocOrder && currentDocOrder > 0) return "later_in_course";
  return "earlier";
}

function isExactBlockIdQuery(q: string): boolean {
  return /^[a-z]+:[a-z0-9_:-]+$/i.test(q.trim());
}

function materialLink(row: { course: string; doc_id: string; anchor_id: string }): string {
  return `/${row.course}/${row.doc_id}#${row.anchor_id}`;
}

function courseCode(value: string): string {
  const name = value.toLowerCase().trim();
  if (/^(?:матан(?:ализ)?[а-я]*|математическ[а-я]* анализ[а-я]*)$/u.test(name)) return "calculus";
  return name === "linalg" ? "algebra" : name;
}

type PreparationPage = {
  course: string;
  doc_id: string;
  title: string;
  date: string | null;
};

function titleTerms(text: string): Set<string> {
  return new Set([...tokenizeAndStem(text).filter(word => word.length > 2), ...(text.match(/\d+/g) ?? [])]);
}

async function searchPreparationPages(db: TrackedD1, course: string, query: string) {
  const words = titleTerms(query);
  const rows = await db.all<PreparationPage>(
    db.prepare(`SELECT course, doc_id, title, date FROM course_documents
      WHERE doc_kind = 'prep' AND (? IN ('', 'all') OR course = ?)
      ORDER BY date, course, doc_id`).bind(course, course),
  );
  return rows.results.map(page => {
    const titleWords = titleTerms(page.title);
    const score = [...words].filter(word => titleWords.has(word)).length;
    return { page, score };
  }).filter(hit => hit.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(({ page }) => ({ ...page, url: `/${page.course}/${page.doc_id}` }));
}

export class AgentToolRunner {
  private readonly ctx: ToolExecutionContext;
  private readonly cache = new Map<string, { output: string; step: ChatStep }>();
  private totalOutputChars = 0;

  constructor(ctx: ToolExecutionContext) {
    this.ctx = ctx;
  }

  get isOutputBudgetExhausted(): boolean {
    return this.totalOutputChars >= this.ctx.maxTotalToolOutputChars;
  }

  async execute(
    name: string,
    rawArgs: string,
  ): Promise<{ output: string; step: ChatStep; fromCache: boolean }> {
    const limit = Math.min(
      this.ctx.maxToolOutputChars,
      this.ctx.maxTotalToolOutputChars - this.totalOutputChars,
    );
    if (limit <= 0) {
      return { output: "", step: { kind: "note", state: "error", note: "Лимит инструментов" }, fromCache: false };
    }
    const capped = (output: string): string => {
      const suffix = "\n...[truncated]";
      const text = output.length <= limit
        ? output
        : output.slice(0, Math.max(0, limit - suffix.length)) + suffix.slice(0, limit);
      this.totalOutputChars += text.length;
      return text;
    };
    let args: Record<string, unknown> = {};
    try {
      args = rawArgs ? (JSON.parse(rawArgs) as Record<string, unknown>) : {};
    } catch {
      return {
        output: capped(JSON.stringify({ error: "Invalid JSON arguments" })),
        step: { kind: "note", note: `Ошибка аргументов ${name}`, state: "error" },
        fromCache: false,
      };
    }

    const cacheKey = `${name}:${JSON.stringify(args)}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return { output: capped(cached.output), step: cached.step, fromCache: true };
    }

    let result: { output: string; step: ChatStep };
    if (name === "search_materials") {
      result = await this.runSearchMaterials(args);
    } else if (name === "read_block") {
      result = await this.runReadBlock(args);
    } else if (name === "read_document") {
      result = await this.runReadDocument(args);
    } else {
      result = {
        output: JSON.stringify({ error: `Unknown tool: ${name}` }),
        step: { kind: "note", note: `Неизвестный инструмент ${name}`, state: "error" },
      };
    }

    this.cache.set(cacheKey, result);
    return { ...result, output: capped(result.output), fromCache: false };
  }

  private async runSearchMaterials(
    args: Record<string, unknown>,
  ): Promise<{ output: string; step: ChatStep }> {
    const query = String(args.query ?? "").trim();
    const course = typeof args.course === "string" && args.course.trim()
      ? courseCode(args.course)
      : this.ctx.currentCourse;
    const docKind = typeof args.doc_kind === "string" ? args.doc_kind.trim() : null;
    const blockKind = typeof args.block_kind === "string" ? args.block_kind.trim() : null;

    if (!query) {
      return {
        output: JSON.stringify({ results: [] }),
        step: { kind: "search", q: "", state: "done", res: [] },
      };
    }

    // Fast path: exact block ID lookup without Vectorize or FTS
    if (isExactBlockIdQuery(query)) {
      const exact = await this.ctx.db.first<SearchBlockRow>(
        this.ctx.db
          .prepare(
            "SELECT id, anchor_id, course, doc_kind, doc_id, doc_order, block_kind, title, statement_tex FROM course_blocks WHERE id = ? OR (course = ? AND anchor_id = ?) ORDER BY (doc_id = ?) DESC, id LIMIT 1",
          )
          .bind(query, course, query, this.ctx.currentDocId),
      );
      if (exact) {
        const item = this.formatSearchItem(exact);
        return {
          output: JSON.stringify({ results: [item], source: "exact_id" }),
          step: { kind: "search", q: query, state: "done", res: [exact.title || exact.id], links: [materialLink(exact)] },
        };
      }
    }

    // 1. FTS5 search with corrected BM25 column weights:
    // columns = (id, course, doc_kind, block_kind [all UNINDEXED], title, statement_tex, proof_tex, lemmas)
    const ftsQuery = buildFtsMatchQuery(query);
    const ftsRows: SearchBlockRow[] = [];

    if (ftsQuery) {
      const filters: string[] = ["course_blocks_fts MATCH ?"];
      const binds: unknown[] = [ftsQuery];
      if (course && course !== "all") {
        filters.push("b.course = ?");
        binds.push(course);
      }
      if (docKind) {
        filters.push("b.doc_kind = ?");
        binds.push(docKind);
      }
      if (blockKind) {
        filters.push("b.block_kind = ?");
        binds.push(blockKind);
      }
      binds.push(12);

      try {
        const statement = this.ctx.db.prepare(
          `SELECT b.id, b.anchor_id, b.course, b.doc_kind, b.doc_id, b.doc_order, b.block_kind, b.title, b.statement_tex
           FROM course_blocks_fts
           JOIN course_blocks b ON b.id = course_blocks_fts.id
           WHERE ${filters.join(" AND ")}
           ORDER BY bm25(course_blocks_fts, 0, 0, 0, 0, 10.0, 5.0, 2.0, 4.0)
           LIMIT ?`,
        );
        const res = await this.ctx.db.all<SearchBlockRow>(statement.bind(...binds));
        ftsRows.push(...res.results);
        if (!ftsRows.length && ftsQuery.includes(" AND ")) {
          const broader = await this.ctx.db.all<SearchBlockRow>(
            statement.bind(buildFtsMatchQuery(query, "OR"), ...binds.slice(1)),
          );
          ftsRows.push(...broader.results);
        }
      } catch {
        // Malformed FTS query fallback: continue cleanly
      }
    }

    // Check if FTS5 already found a strong exact title match (skip Vectorize to save Free quota)
    const normQ = query.toLowerCase();
    const hasExactTitleMatch = ftsRows.some((r) => r.title.toLowerCase().includes(normQ));

    // 2. Optional Vectorize semantic search (graceful fallback to FTS5 on quota/error)
    const vecRows: SearchBlockRow[] = [];
    if (!hasExactTitleMatch && this.ctx.env.VECTORIZE && this.ctx.env.AI) {
      try {
        const emb = (await this.ctx.env.AI.run("@cf/baai/bge-m3" as keyof AiModels, {
          text: [query],
        } as Record<string, unknown>)) as { data?: number[][] };
        const vector = emb?.data?.[0];
        if (vector && vector.length > 0) {
          const vecRes = await this.ctx.env.VECTORIZE.query(vector, {
            topK: 10,
            returnMetadata: "none",
          });
          const candidateIds = vecRes.matches
            .map((m) => m.id)
            .filter((id) => typeof id === "string" && id.length > 0)
            .slice(0, 10);

          // Single WHERE id IN (...) verification against D1 (no N+1!)
          if (candidateIds.length > 0) {
            const placeholders = candidateIds.map(() => "?").join(", ");
            const filters = [`id IN (${placeholders})`];
            const binds: unknown[] = [...candidateIds];
            if (course && course !== "all") {
              filters.push("course = ?");
              binds.push(course);
            }
            if (docKind) {
              filters.push("doc_kind = ?");
              binds.push(docKind);
            }
            if (blockKind) {
              filters.push("block_kind = ?");
              binds.push(blockKind);
            }
            const verified = await this.ctx.db.all<SearchBlockRow>(
              this.ctx.db
                .prepare(
                  `SELECT id, anchor_id, course, doc_kind, doc_id, doc_order, block_kind, title, statement_tex
                   FROM course_blocks
                   WHERE ${filters.join(" AND ")}`,
                )
                .bind(...binds),
            );
            const byId = new Map(verified.results.map((r) => [r.id, r]));
            for (const cid of candidateIds) {
              const row = byId.get(cid);
              if (row) vecRows.push(row);
            }
          }
        }
      } catch {
        // Automatic fallback to FTS5 if Vectorize or Workers AI quota is exhausted
      }
    }

    // 3. Reciprocal Rank Fusion (RRF) merge
    const RRF_K = 60;
    const scoreById = new Map<string, { score: number; row: SearchBlockRow }>();
    ftsRows.forEach((row, i) => {
      const prev = scoreById.get(row.id);
      const add = 1 / (RRF_K + i + 1);
      scoreById.set(row.id, { score: (prev?.score ?? 0) + add, row });
    });
    vecRows.forEach((row, i) => {
      const prev = scoreById.get(row.id);
      const add = 1 / (RRF_K + i + 1);
      scoreById.set(row.id, { score: (prev?.score ?? 0) + add, row });
    });

    const merged = Array.from(scoreById.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((entry) => this.formatSearchItem(entry.row));

    const pages = !blockKind && (!docKind || docKind === "prep")
      ? await searchPreparationPages(this.ctx.db, course, query) : [];
    const hits = [
      ...pages.map(page => ({ label: page.title, url: page.url })),
      ...merged.map(block => ({ label: block.title || block.id, url: materialLink(block) })),
    ];
    const visible = hits.slice(0, 3);
    const more = hits.length - visible.length;

    return {
      output: JSON.stringify({
        documents: pages,
        results: merged,
        usedSemantic: vecRows.length > 0,
      }),
      step: {
        kind: "search",
        q: query,
        state: "done",
        res: visible.map(hit => hit.label),
        links: visible.map(hit => hit.url),
        ...(more > 0 ? { more } : {}),
      },
    };
  }

  private formatSearchItem(row: SearchBlockRow) {
    const snippet =
      row.statement_tex.length > 420
        ? `${row.statement_tex.slice(0, 419).trimEnd()}…`
        : row.statement_tex;
    return {
      id: row.id,
      anchor_id: row.anchor_id,
      course: row.course,
      doc_kind: row.doc_kind,
      doc_id: row.doc_id,
      block_kind: row.block_kind,
      title: row.title,
      snippet,
      chronology: classifyChronology(
        row.course,
        row.doc_id,
        row.doc_order,
        this.ctx.currentCourse,
        this.ctx.currentDocId,
        this.ctx.currentDocOrder,
      ),
    };
  }

  private async runReadBlock(
    args: Record<string, unknown>,
  ): Promise<{ output: string; step: ChatStep }> {
    let id = String(args.id ?? "").trim();
    const includeProof = args.include_proof !== false;
    if (!id) {
      return {
        output: JSON.stringify({ error: "Missing block id" }),
        step: { kind: "read", target: "", state: "error" },
      };
    }

    if (!id.startsWith("block:")) {
      const legacy = await this.ctx.db.first<{id: string}>(
        this.ctx.db.prepare("SELECT id FROM course_blocks WHERE course = ? AND anchor_id = ? ORDER BY (doc_id = ?) DESC, id LIMIT 1")
          .bind(this.ctx.currentCourse, id, this.ctx.currentDocId),
      );
      id = legacy?.id ?? id;
    }
    // 1 batch with 3 independent bounded queries (avoids double JOIN row multiplication!)
    const [blockRes, outRes, inRes] = await this.ctx.db.batch<Record<string, unknown>>([
      this.ctx.db
        .prepare(
          `SELECT id, anchor_id, course, doc_kind, doc_id, doc_order, block_kind, section_id, title, statement_tex, proof_tex
           FROM course_blocks WHERE id = ?`,
        )
        .bind(id),
      this.ctx.db
        .prepare(
          `SELECT r.to_block_id AS id, b.title, b.block_kind
           FROM block_references r
           LEFT JOIN course_blocks b ON b.id = r.to_block_id
           WHERE r.from_block_id = ?
           LIMIT 12`,
        )
        .bind(id),
      this.ctx.db
        .prepare(
          `SELECT r.from_block_id AS id, b.title, b.block_kind
           FROM block_references r
           LEFT JOIN course_blocks b ON b.id = r.from_block_id
           WHERE r.to_block_id = ?
           LIMIT 12`,
        )
        .bind(id),
    ]);

    const block = blockRes?.results[0] as
      | {
          id: string;
          course: string;
          anchor_id: string;
          doc_kind: string;
          doc_id: string;
          doc_order: number;
          block_kind: string;
          section_id: string | null;
          title: string;
          statement_tex: string;
          proof_tex: string;
        }
      | undefined;

    if (!block) {
      return {
        output: JSON.stringify({ error: `Block not found: ${id}` }),
        step: { kind: "read", target: id, state: "error" },
      };
    }

    const payload = {
      id: block.id,
      anchor_id: block.anchor_id,
      course: block.course,
      doc_kind: block.doc_kind,
      doc_id: block.doc_id,
      block_kind: block.block_kind,
      section_id: block.section_id,
      title: block.title,
      chronology: classifyChronology(
        block.course,
        block.doc_id,
        block.doc_order,
        this.ctx.currentCourse,
        this.ctx.currentDocId,
        this.ctx.currentDocOrder,
      ),
      statement_tex: block.statement_tex,
      ...(includeProof && block.proof_tex ? { proof_tex: block.proof_tex } : {}),
      outgoing_refs: outRes?.results ?? [],
      incoming_refs: inRes?.results ?? [],
    };

    return {
      output: JSON.stringify(payload),
      step: { kind: "read", target: block.title || block.id, state: "done" },
    };
  }

  private async runReadDocument(
    args: Record<string, unknown>,
  ): Promise<{ output: string; step: ChatStep }> {
    const course =
      typeof args.course === "string" && args.course.trim()
        ? courseCode(args.course)
        : this.ctx.currentCourse;
    const docId = typeof args.doc_id === "string" && args.doc_id.trim() ? args.doc_id.trim() : null;
    const sectionId =
      typeof args.section_id === "string" && args.section_id.trim() ? args.section_id.trim() : null;

    // Without doc_id: return compact course outline (bounded LIMIT 60), never the whole course body
    if (!docId) {
      const docs = await this.ctx.db.all<{
        doc_kind: string;
        doc_id: string;
        order_index: number;
        title: string;
        date: string | null;
      }>(
        this.ctx.db
          .prepare(
            "SELECT doc_kind, doc_id, order_index, title, date FROM course_documents WHERE course = ? ORDER BY doc_kind, order_index LIMIT 60",
          )
          .bind(course),
      );
      return {
        output: JSON.stringify({ course, documents: docs.results }),
        step: { kind: "read", target: `Оглавление ${course}`, state: "done" },
      };
    }

    const doc = await this.ctx.db.first<{
      doc_kind: string;
      doc_id: string;
      order_index: number;
      title: string;
      outline_json: string;
      date: string | null;
      introduction: string;
    }>(
      this.ctx.db
        .prepare(
          "SELECT doc_kind, doc_id, order_index, title, date, substr(body_tex, 1, 800) AS introduction, outline_json FROM course_documents WHERE course = ? AND doc_id = ? LIMIT 1",
        )
        .bind(course, docId),
    );

    if (!doc) {
      return {
        output: JSON.stringify({ error: `Document not found: ${course}/${docId}` }),
        step: { kind: "read", target: docId, state: "error" },
      };
    }

    const outline = JSON.parse(doc.outline_json) as Array<{id: string; level: number}>;
    const sectionIds = [sectionId];
    const index = outline.findIndex(heading => heading.id === sectionId);
    if (index >= 0) {
      const level = outline[index]!.level;
      for (const heading of outline.slice(index + 1)) {
        if (heading.level <= level) break;
        sectionIds.push(heading.id);
      }
    }
    // Bounded block read (LIMIT 30)
    const blocks = sectionId
      ? await this.ctx.db.all<{
          id: string;
          anchor_id: string;
          block_kind: string;
          title: string;
          statement_tex: string;
        }>(
          this.ctx.db
            .prepare(
              `SELECT id, anchor_id, block_kind, title, statement_tex
               FROM course_blocks
               WHERE course = ? AND doc_id = ? AND (section_id IN (SELECT value FROM json_each(?)) OR id = ?)
               ORDER BY block_order
               LIMIT 30`,
            )
            .bind(course, docId, JSON.stringify(sectionIds), sectionId),
        )
      : await this.ctx.db.all<{
          id: string;
          anchor_id: string;
          block_kind: string;
          title: string;
          statement_tex: string;
        }>(
          this.ctx.db
            .prepare(
              `SELECT id, anchor_id, block_kind, title, statement_tex
               FROM course_blocks
               WHERE course = ? AND doc_id = ?
               ORDER BY block_order
               LIMIT 30`,
            )
            .bind(course, docId),
        );

    const compactBlocks = blocks.results.map((b) => ({
      id: b.id,
      anchor_id: b.anchor_id,
      block_kind: b.block_kind,
      title: b.title,
      statement_tex:
        b.statement_tex.length > 600 ? `${b.statement_tex.slice(0, 599).trimEnd()}…` : b.statement_tex,
    }));

    return {
      output: JSON.stringify({
        course,
        doc_kind: doc.doc_kind,
        doc_id: doc.doc_id,
        title: doc.title,
        date: doc.date,
        introduction: doc.introduction,
        chronology: classifyChronology(
          course,
          doc.doc_id,
          doc.order_index,
          this.ctx.currentCourse,
          this.ctx.currentDocId,
          this.ctx.currentDocOrder,
        ),
        outline,
        blocks: compactBlocks,
      }),
      step: { kind: "read", target: sectionId ? `${doc.title} (${sectionId})` : doc.title, state: "done" },
    };
  }
}
