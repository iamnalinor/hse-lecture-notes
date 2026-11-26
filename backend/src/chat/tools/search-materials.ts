import { findBlockByExactId, type BlockScope, type SearchBlockRow } from "../../course-repo";
import type { CodexFunctionTool } from "../../types";
import { courseArg, optionalStringArg } from "./args";
import { classifyChronology } from "./chronology";
import { fuseRankings, searchFts, searchPreparationPages, searchVectors } from "./search-retrieval";
import type { ToolArgs, ToolExecutionContext, ToolResult } from "./types";

export const SEARCH_MATERIALS_TOOL: CodexFunctionTool = {
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
        description:
          "Алгебра — algebra, матанализ (матан) — calculus, дискретная математика — discrete, алгоритмы — aiya. all — все курсы.",
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
};

function isExactBlockIdQuery(q: string): boolean {
  return /^[a-z]+:[a-z0-9_:-]+$/i.test(q.trim());
}

function materialLink(row: { course: string; doc_id: string; anchor_id: string }): string {
  return `/${row.course}/${row.doc_id}#${row.anchor_id}`;
}

function formatSearchItem(ctx: ToolExecutionContext, row: SearchBlockRow) {
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
    chronology: classifyChronology(ctx, row.course, row.doc_id, row.doc_order),
  };
}

/** Fast path: exact block ID lookup without Vectorize or FTS. Null when the query is not an id in scope. */
async function findExactIdMatch(
  ctx: ToolExecutionContext,
  query: string,
  args: ToolArgs,
  scope: BlockScope,
): Promise<ToolResult | null> {
  const exact = await findBlockByExactId(ctx.db, query, scope.course, ctx.currentDocId);
  const explicitCourse = optionalStringArg(args, "course") ? scope.course : null;
  const inScope =
    exact &&
    (!explicitCourse || explicitCourse === "all" || exact.course === explicitCourse) &&
    (!scope.docKind || exact.doc_kind === scope.docKind) &&
    (!scope.blockKind || exact.block_kind === scope.blockKind);
  if (!exact || !inScope) return null;
  return {
    output: JSON.stringify({
      results: [formatSearchItem(ctx, exact)],
      source: "exact_id",
    }),
    step: {
      kind: "search",
      q: query,
      state: "done",
      res: [exact.title || exact.id],
      links: [materialLink(exact)],
    },
  };
}

export async function runSearchMaterials(
  ctx: ToolExecutionContext,
  args: ToolArgs,
): Promise<ToolResult> {
  const query = String(args.query ?? "").trim();
  const scope: BlockScope = {
    course: courseArg(args, ctx),
    docKind: optionalStringArg(args, "doc_kind"),
    blockKind: optionalStringArg(args, "block_kind"),
  };

  if (!query) {
    return {
      output: JSON.stringify({ results: [] }),
      step: { kind: "search", q: "", state: "done", res: [] },
    };
  }

  if (isExactBlockIdQuery(query)) {
    const exact = await findExactIdMatch(ctx, query, args, scope);
    if (exact) return exact;
  }

  const ftsRows = await searchFts(ctx, query, scope);
  const vecRows = await searchVectors(ctx, query, scope, ftsRows);
  const merged = fuseRankings(ftsRows, vecRows).map((row) => formatSearchItem(ctx, row));

  ctx.signal?.throwIfAborted();
  const pages =
    !scope.blockKind && (!scope.docKind || scope.docKind === "prep")
      ? await searchPreparationPages(ctx, scope.course, query)
      : [];
  const hits = [
    ...pages.map((page) => ({ label: page.title, url: page.url })),
    ...merged.map((block) => ({ label: block.title || block.id, url: materialLink(block) })),
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
      res: visible.map((hit) => hit.label),
      links: visible.map((hit) => hit.url),
      ...(more > 0 ? { more } : {}),
    },
  };
}
