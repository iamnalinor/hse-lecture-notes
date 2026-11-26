import {
  findBlocksByIds,
  listPreparationPages,
  prepareFtsSearch,
  type BlockScope,
  type SearchBlockRow,
} from "../../course-repo";
import { buildFtsMatchQuery, tokenizeAndStem } from "../../stemmer";
import type { ToolExecutionContext } from "./types";

/** Candidate retrieval for `search_materials`: full-text, vector, their rank fusion, preparation pages. */

const FTS_LIMIT = 12;
const VECTOR_TOP_K = 10;
const RRF_K = 60;
const MERGED_LIMIT = 8;

/** FTS5 search; a malformed query yields no rows. Retries with OR when AND matches nothing. */
export async function searchFts(
  ctx: ToolExecutionContext,
  query: string,
  scope: BlockScope,
): Promise<SearchBlockRow[]> {
  const ftsQuery = buildFtsMatchQuery(query);
  const rows: SearchBlockRow[] = [];
  if (!ftsQuery) return rows;
  try {
    const search = prepareFtsSearch(ctx.db, scope, FTS_LIMIT);
    rows.push(...(await search(ftsQuery)));
    ctx.signal?.throwIfAborted();
    if (!rows.length && ftsQuery.includes(" AND ")) {
      rows.push(...(await search(buildFtsMatchQuery(query, "OR"))));
    }
  } catch {
    // Malformed FTS query fallback: continue cleanly
  }
  return rows;
}

/**
 * Optional Vectorize semantic search (graceful fallback to FTS5 on quota/error).
 * Skipped when FTS5 already found a strong exact title match, to save Free quota.
 */
export async function searchVectors(
  ctx: ToolExecutionContext,
  query: string,
  scope: BlockScope,
  ftsRows: SearchBlockRow[],
): Promise<SearchBlockRow[]> {
  const normQ = query.toLowerCase();
  const hasExactTitleMatch = ftsRows.some((r) => r.title.toLowerCase().includes(normQ));
  const rows: SearchBlockRow[] = [];
  if (hasExactTitleMatch || !ctx.env.VECTORIZE || !ctx.env.AI) return rows;

  ctx.signal?.throwIfAborted();
  try {
    const emb = (await ctx.env.AI.run(
      "@cf/baai/bge-m3" as keyof AiModels,
      {
        text: [query],
      } as Record<string, unknown>,
      { signal: ctx.signal },
    )) as { data?: number[][] };
    ctx.signal?.throwIfAborted();
    const vector = emb?.data?.[0];
    if (vector && vector.length > 0) {
      const filter: Record<string, string> = {};
      if (scope.course && scope.course !== "all") filter.course = scope.course;
      if (scope.docKind) filter.doc_kind = scope.docKind;
      if (scope.blockKind) filter.block_kind = scope.blockKind;
      const vecRes = await ctx.env.VECTORIZE.query(vector, {
        topK: VECTOR_TOP_K,
        ...(Object.keys(filter).length ? { filter } : {}),
        returnMetadata: "none",
      });
      ctx.signal?.throwIfAborted();
      const candidateIds = vecRes.matches
        .map((m) => m.id)
        .filter((id) => typeof id === "string" && id.length > 0)
        .slice(0, VECTOR_TOP_K);

      if (candidateIds.length > 0) {
        const byId = new Map(
          (await findBlocksByIds(ctx.db, candidateIds, scope)).map((r) => [r.id, r]),
        );
        for (const cid of candidateIds) {
          const row = byId.get(cid);
          if (row) rows.push(row);
        }
      }
    }
  } catch {
    // Automatic fallback to FTS5 if Vectorize or Workers AI quota is exhausted
  }
  return rows;
}

/** Reciprocal Rank Fusion (RRF) of the two rankings, best first. */
export function fuseRankings(
  ftsRows: SearchBlockRow[],
  vecRows: SearchBlockRow[],
): SearchBlockRow[] {
  const scoreById = new Map<string, { score: number; row: SearchBlockRow }>();
  for (const rows of [ftsRows, vecRows]) {
    rows.forEach((row, i) => {
      const prev = scoreById.get(row.id);
      const add = 1 / (RRF_K + i + 1);
      scoreById.set(row.id, { score: (prev?.score ?? 0) + add, row });
    });
  }
  return Array.from(scoreById.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, MERGED_LIMIT)
    .map((entry) => entry.row);
}

function titleTerms(text: string): Set<string> {
  return new Set([
    ...tokenizeAndStem(text).filter((word) => word.length > 2),
    ...(text.match(/\d+/g) ?? []),
  ]);
}

/** Preparation pages whose title shares words with the query (quizzes and other checks), best five. */
export async function searchPreparationPages(
  ctx: ToolExecutionContext,
  course: string,
  query: string,
) {
  const words = titleTerms(query);
  const rows = await listPreparationPages(ctx.db, course);
  return rows
    .map((page) => {
      const titleWords = titleTerms(page.title);
      const score = [...words].filter((word) => titleWords.has(word)).length;
      return { page, score };
    })
    .filter((hit) => hit.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(({ page }) => ({ ...page, url: `/${page.course}/${page.doc_id}` }));
}
