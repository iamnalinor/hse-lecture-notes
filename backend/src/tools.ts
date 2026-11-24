import type { TrackedD1 } from "./db";
import { buildFtsMatchQuery } from "./stemmer";
import type {
  ChatStep,
  CodexFunctionTool,
  Env,
  QuotePayload,
} from "./types";

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
          "SELECT course, doc_id, title, statement_tex, proof_tex FROM course_blocks WHERE id = ?",
        )
        .bind(quote.blockId),
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
): Promise<{ instructions: string; currentDocOrder: number; currentDocTitle: string }> {
  const docsRes = await db.all<{
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

  const outlineSection =
    outlineLines.length > 0
      ? outlineLines.join("\n")
      : `- Текущий документ: ${course}/${docId}  ← МЫ ЗДЕСЬ`;

  const instructions = `Ты — учебный ИИ-ассистент по конспектам 1 курса ПИ ВШЭ на сайте hse.nalinor.dev.
Отвечай строго на русском языке, лаконично, точно и математически корректно.

ПРАВИЛА:
1. Опирайся на материалы курса через инструменты search_materials, read_block и read_document. Не выдумывай номера, формулировки теорем или определения, которых нет в конспектах.
2. Хронология курса: студент сейчас открыл документ «${currentDocTitle}» (${course}/${docId}).
   - Если в результатах поиска блок помечен \`chronology: "later_in_course"\`, НЕ опирайся на него как на уже пройденный факт без явной оговорки («это будет позже в курсе»).
   - Отдавай приоритет материалу из текущей и более ранних лекций.
3. Ссылки на блоки конспекта оформляй ровно в формате Markdown-ссылки на ID блока, например: [теорема о делении с остатком](#thm:lec06:divmod) или [определение](#def:lec01:statement). Используй только реальные \`id\` блоков, которые вернули инструменты.
4. Формулы пиши в LaTeX: инлайн \`$...$\`, выключные \`$$...$$\`. Не оборачивай LaTeX-формулы в бэктики.
5. Если студент задаёт задачу, помогай понять идею и шаги доказательства в стиле конспекта, ссылаясь на нужные определения и теоремы курса.
6. Если нужного факта нет в конспектах, честно скажи об этом.

ПЛАН КУРСА (${course}):
${outlineSection}`;

  return { instructions, currentDocOrder, currentDocTitle };
}

// =============================================================================
// 3 Agent Tools: search_materials, read_block, read_document
// =============================================================================

export const AGENT_TOOLS: CodexFunctionTool[] = [
  {
    type: "function",
    name: "search_materials",
    description:
      "Гибридный поиск (FTS5 + семантика) по определениям, теоремам, леммам, задачам, примерам и разделам конспектов. Возвращает список подходящих блоков с ID, заголовком, фрагментом и меткой chronology.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Поисковый запрос на русском или точный ID блока (например, thm:lec07:fta).",
        },
        course: {
          type: "string",
          description: "Код курса (например, discrete, linalg, calculus). По умолчанию — текущий курс.",
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
        course: { type: "string", description: "Код курса." },
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
): "earlier" | "current" | "later_in_course" | "other_course" {
  if (blockCourse !== currentCourse) return "other_course";
  if (blockDocId === currentDocId) return "current";
  if (blockDocOrder > currentDocOrder && currentDocOrder > 0) return "later_in_course";
  return "earlier";
}

function isExactBlockIdQuery(q: string): boolean {
  return /^[a-z]+:[a-z0-9_:-]+$/i.test(q.trim());
}

export class AgentToolRunner {
  private readonly ctx: ToolExecutionContext;
  private readonly cache = new Map<string, { output: string; step: ChatStep }>();
  private totalOutputChars = 0;

  constructor(ctx: ToolExecutionContext) {
    this.ctx = ctx;
  }

  async execute(
    name: string,
    rawArgs: string,
  ): Promise<{ output: string; step: ChatStep; fromCache: boolean }> {
    let args: Record<string, unknown> = {};
    try {
      args = rawArgs ? (JSON.parse(rawArgs) as Record<string, unknown>) : {};
    } catch {
      return {
        output: JSON.stringify({ error: "Invalid JSON arguments" }),
        step: { kind: "note", note: `Ошибка аргументов ${name}`, state: "error" },
        fromCache: false,
      };
    }

    const cacheKey = `${name}:${JSON.stringify(args)}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return { output: cached.output, step: cached.step, fromCache: true };
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

    // Enforce per-tool and cumulative output caps
    const remaining = Math.max(256, this.ctx.maxTotalToolOutputChars - this.totalOutputChars);
    const limit = Math.min(this.ctx.maxToolOutputChars, remaining);
    if (result.output.length > limit) {
      result.output = `${result.output.slice(0, limit - 40)}\n...[truncated]`;
    }
    this.totalOutputChars += result.output.length;

    this.cache.set(cacheKey, result);
    return { ...result, fromCache: false };
  }

  private async runSearchMaterials(
    args: Record<string, unknown>,
  ): Promise<{ output: string; step: ChatStep }> {
    const query = String(args.query ?? "").trim();
    const course = typeof args.course === "string" && args.course.trim()
      ? args.course.trim()
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
            "SELECT id, course, doc_kind, doc_id, doc_order, block_kind, title, statement_tex FROM course_blocks WHERE id = ?",
          )
          .bind(query),
      );
      if (exact) {
        const item = this.formatSearchItem(exact);
        return {
          output: JSON.stringify({ results: [item], source: "exact_id" }),
          step: { kind: "search", q: query, state: "done", res: [exact.title || exact.id] },
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
        const res = await this.ctx.db.all<SearchBlockRow>(
          this.ctx.db
            .prepare(
              `SELECT b.id, b.course, b.doc_kind, b.doc_id, b.doc_order, b.block_kind, b.title, b.statement_tex
               FROM course_blocks_fts
               JOIN course_blocks b ON b.id = course_blocks_fts.id
               WHERE ${filters.join(" AND ")}
               ORDER BY bm25(course_blocks_fts, 0, 0, 0, 0, 10.0, 5.0, 2.0, 4.0)
               LIMIT ?`,
            )
            .bind(...binds),
        );
        ftsRows.push(...res.results);
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
                  `SELECT id, course, doc_kind, doc_id, doc_order, block_kind, title, statement_tex
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

    const labels = merged.slice(0, 3).map((m) => m.title || m.id);
    const more = Math.max(0, merged.length - labels.length);

    return {
      output: JSON.stringify({
        results: merged,
        usedSemantic: vecRows.length > 0,
      }),
      step: {
        kind: "search",
        q: query,
        state: "done",
        res: labels,
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
    const id = String(args.id ?? "").trim();
    const includeProof = args.include_proof !== false;
    if (!id) {
      return {
        output: JSON.stringify({ error: "Missing block id" }),
        step: { kind: "read", target: "", state: "error" },
      };
    }

    // 1 batch with 3 independent bounded queries (avoids double JOIN row multiplication!)
    const [blockRes, outRes, inRes] = await this.ctx.db.batch<Record<string, unknown>>([
      this.ctx.db
        .prepare(
          `SELECT id, course, doc_kind, doc_id, doc_order, block_kind, section_id, title, statement_tex, proof_tex
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
        ? args.course.trim()
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
    }>(
      this.ctx.db
        .prepare(
          "SELECT doc_kind, doc_id, order_index, title, outline_json FROM course_documents WHERE course = ? AND doc_id = ? LIMIT 1",
        )
        .bind(course, docId),
    );

    if (!doc) {
      return {
        output: JSON.stringify({ error: `Document not found: ${course}/${docId}` }),
        step: { kind: "read", target: docId, state: "error" },
      };
    }

    // Bounded block read (LIMIT 30)
    const blocks = sectionId
      ? await this.ctx.db.all<{
          id: string;
          block_kind: string;
          title: string;
          statement_tex: string;
        }>(
          this.ctx.db
            .prepare(
              `SELECT id, block_kind, title, statement_tex
               FROM course_blocks
               WHERE course = ? AND doc_id = ? AND (section_id = ? OR id = ?)
               ORDER BY block_order
               LIMIT 30`,
            )
            .bind(course, docId, sectionId, sectionId),
        )
      : await this.ctx.db.all<{
          id: string;
          block_kind: string;
          title: string;
          statement_tex: string;
        }>(
          this.ctx.db
            .prepare(
              `SELECT id, block_kind, title, statement_tex
               FROM course_blocks
               WHERE course = ? AND doc_id = ?
               ORDER BY block_order
               LIMIT 30`,
            )
            .bind(course, docId),
        );

    const compactBlocks = blocks.results.map((b) => ({
      id: b.id,
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
        chronology: classifyChronology(
          course,
          doc.doc_id,
          doc.order_index,
          this.ctx.currentCourse,
          this.ctx.currentDocId,
          this.ctx.currentDocOrder,
        ),
        outline: JSON.parse(doc.outline_json),
        blocks: compactBlocks,
      }),
      step: { kind: "read", target: sectionId ? `${doc.title} (${sectionId})` : doc.title, state: "done" },
    };
  }
}
