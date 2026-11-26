import type { TrackedD1 } from "./db";

/**
 * SQL and row types of the course content tables the chat reads: `course_blocks` (with its FTS5
 * mirror `course_blocks_fts`), `course_documents` and `block_references`. The agent tools, quote
 * validation and the page context all go through here.
 */

/** The columns the search tool reports for a block. */
export interface SearchBlockRow {
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

export interface BlockDetailRow {
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

export interface BlockRefRow {
  id: string;
  title: string | null;
  block_kind: string | null;
}

export interface DocumentOutlineRow {
  doc_kind: string;
  doc_id: string;
  order_index: number;
  title: string;
  date: string | null;
}

export interface DocumentRow extends DocumentOutlineRow {
  outline_json: string;
  introduction: string;
}

export interface DocumentBlockRow {
  id: string;
  anchor_id: string;
  block_kind: string;
  title: string;
  statement_tex: string;
}

export interface PreparationPageRow {
  course: string;
  doc_id: string;
  title: string;
  date: string | null;
}

/** Optional filters shared by the full-text and vector searches; "all" and "" mean no course filter. */
export interface BlockScope {
  course: string;
  docKind: string | null;
  blockKind: string | null;
}

const SEARCH_COLUMNS =
  "id, anchor_id, course, doc_kind, doc_id, doc_order, block_kind, title, statement_tex";

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

/** Fast path for a block id typed as the query: the id itself or an anchor in the course. */
export function findBlockByExactId(
  db: TrackedD1,
  query: string,
  course: string,
  currentDocId: string,
): Promise<SearchBlockRow | null> {
  return db.first<SearchBlockRow>(
    db
      .prepare(
        `SELECT ${SEARCH_COLUMNS} FROM course_blocks WHERE id = ? OR (course = ? AND anchor_id = ?) ORDER BY (doc_id = ?) DESC, id LIMIT 1`,
      )
      .bind(query, course, query, currentDocId),
  );
}

/**
 * FTS5 search with corrected BM25 column weights:
 * columns = (id, course, doc_kind, block_kind [all UNINDEXED], title, statement_tex, proof_tex, lemmas).
 * The returned function runs the prepared statement for a MATCH query, so the caller can retry
 * with a broader one.
 */
export function prepareFtsSearch(
  db: TrackedD1,
  scope: BlockScope,
  limit: number,
): (matchQuery: string) => Promise<SearchBlockRow[]> {
  const filters: string[] = ["course_blocks_fts MATCH ?"];
  const binds: unknown[] = [];
  if (scope.course && scope.course !== "all") {
    filters.push("b.course = ?");
    binds.push(scope.course);
  }
  if (scope.docKind) {
    filters.push("b.doc_kind = ?");
    binds.push(scope.docKind);
  }
  if (scope.blockKind) {
    filters.push("b.block_kind = ?");
    binds.push(scope.blockKind);
  }
  binds.push(limit);

  const statement = db.prepare(
    `SELECT b.id, b.anchor_id, b.course, b.doc_kind, b.doc_id, b.doc_order, b.block_kind, b.title, b.statement_tex
           FROM course_blocks_fts
           JOIN course_blocks b ON b.id = course_blocks_fts.id
           WHERE ${filters.join(" AND ")}
           ORDER BY bm25(course_blocks_fts, 0, 0, 0, 0, 10.0, 5.0, 2.0, 4.0)
           LIMIT ?`,
  );
  return async (matchQuery) =>
    (await db.all<SearchBlockRow>(statement.bind(matchQuery, ...binds))).results;
}

/** Single WHERE id IN (...) verification of vector candidates against D1 (no N+1). */
export async function findBlocksByIds(
  db: TrackedD1,
  ids: string[],
  scope: BlockScope,
): Promise<SearchBlockRow[]> {
  const placeholders = ids.map(() => "?").join(", ");
  const filters = [`id IN (${placeholders})`];
  const binds: unknown[] = [...ids];
  if (scope.course && scope.course !== "all") {
    filters.push("course = ?");
    binds.push(scope.course);
  }
  if (scope.docKind) {
    filters.push("doc_kind = ?");
    binds.push(scope.docKind);
  }
  if (scope.blockKind) {
    filters.push("block_kind = ?");
    binds.push(scope.blockKind);
  }
  const verified = await db.all<SearchBlockRow>(
    db
      .prepare(
        `SELECT ${SEARCH_COLUMNS}
                   FROM course_blocks
                   WHERE ${filters.join(" AND ")}`,
      )
      .bind(...binds),
  );
  return verified.results;
}

/** Resolves an anchor label (as written in the notes) to a block id. */
export async function findBlockIdByAnchor(
  db: TrackedD1,
  course: string,
  anchorId: string,
  docId: string | null,
  currentDocId: string,
): Promise<string | null> {
  const match = await db.first<{ id: string }>(
    db
      .prepare(`SELECT id FROM course_blocks
          WHERE course = ? AND anchor_id = ? AND (? IS NULL OR doc_id = ?)
          ORDER BY (doc_id = ?) DESC, id LIMIT 1`)
      .bind(course, anchorId, docId, docId, currentDocId),
  );
  return match?.id ?? null;
}

/** 1 batch with 3 independent bounded queries (avoids double JOIN row multiplication!). */
export async function readBlockWithRefs(
  db: TrackedD1,
  id: string,
): Promise<{
  block: BlockDetailRow | undefined;
  outgoing: BlockRefRow[];
  incoming: BlockRefRow[];
}> {
  const [blockRes, outRes, inRes] = await db.batch<Record<string, unknown>>([
    db
      .prepare(
        `SELECT id, anchor_id, course, doc_kind, doc_id, doc_order, block_kind, section_id, title, statement_tex, proof_tex
           FROM course_blocks WHERE id = ?`,
      )
      .bind(id),
    db
      .prepare(
        `SELECT r.to_block_id AS id, b.title, b.block_kind
           FROM block_references r
           LEFT JOIN course_blocks b ON b.id = r.to_block_id
           WHERE r.from_block_id = ?
           LIMIT 12`,
      )
      .bind(id),
    db
      .prepare(
        `SELECT r.from_block_id AS id, b.title, b.block_kind
           FROM block_references r
           LEFT JOIN course_blocks b ON b.id = r.from_block_id
           WHERE r.to_block_id = ?
           LIMIT 12`,
      )
      .bind(id),
  ]);
  return {
    block: blockRes?.results[0] as BlockDetailRow | undefined,
    outgoing: (outRes?.results ?? []) as unknown as BlockRefRow[],
    incoming: (inRes?.results ?? []) as unknown as BlockRefRow[],
  };
}

/** A single block's text for checking a quote; matches by anchor or id inside the document. */
export function findBlockTextForQuote(
  db: TrackedD1,
  course: string,
  docId: string,
  blockId: string,
) {
  return db.first<{
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
      .bind(course, docId, blockId, blockId),
  );
}

/** Bounded block read (LIMIT 30) of a document, optionally limited to some sections. */
export async function listDocumentBlocks(
  db: TrackedD1,
  course: string,
  docId: string,
  section: { id: string; sectionIds: string[] } | null,
): Promise<DocumentBlockRow[]> {
  const blocks = section
    ? await db.all<DocumentBlockRow>(
        db
          .prepare(
            `SELECT id, anchor_id, block_kind, title, statement_tex
               FROM course_blocks
               WHERE course = ? AND doc_id = ? AND (section_id IN (SELECT value FROM json_each(?)) OR id = ?)
               ORDER BY block_order
               LIMIT 30`,
          )
          .bind(course, docId, JSON.stringify(section.sectionIds), section.id),
      )
    : await db.all<DocumentBlockRow>(
        db
          .prepare(
            `SELECT id, anchor_id, block_kind, title, statement_tex
               FROM course_blocks
               WHERE course = ? AND doc_id = ?
               ORDER BY block_order
               LIMIT 30`,
          )
          .bind(course, docId),
      );
  return blocks.results;
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

/** The whole course outline for the system prompt. */
export async function listCourseDocuments(
  db: TrackedD1,
  course: string,
): Promise<DocumentOutlineRow[]> {
  const res = await db.all<DocumentOutlineRow>(
    db
      .prepare(
        "SELECT doc_kind, doc_id, order_index, title, date FROM course_documents WHERE course = ? ORDER BY doc_kind, order_index",
      )
      .bind(course),
  );
  return res.results;
}

/** Compact course outline for the read tool (bounded LIMIT 60), never the whole course body. */
export async function listCourseDocumentsCompact(
  db: TrackedD1,
  course: string,
): Promise<DocumentOutlineRow[]> {
  const res = await db.all<DocumentOutlineRow>(
    db
      .prepare(
        "SELECT doc_kind, doc_id, order_index, title, date FROM course_documents WHERE course = ? ORDER BY doc_kind, order_index LIMIT 60",
      )
      .bind(course),
  );
  return res.results;
}

export function readDocumentWithIntro(db: TrackedD1, course: string, docId: string) {
  return db.first<DocumentRow>(
    db
      .prepare(
        "SELECT doc_kind, doc_id, order_index, title, date, substr(body_tex, 1, 800) AS introduction, outline_json FROM course_documents WHERE course = ? AND doc_id = ? LIMIT 1",
      )
      .bind(course, docId),
  );
}

export function readDocumentBody(db: TrackedD1, course: string, docId: string) {
  return db.first<{ body_tex: string }>(
    db
      .prepare("SELECT body_tex FROM course_documents WHERE course = ? AND doc_id = ? LIMIT 1")
      .bind(course, docId),
  );
}

/** Preparation pages (`doc_kind = 'prep'`) of one course or, for ''/'all', of every course. */
export async function listPreparationPages(
  db: TrackedD1,
  course: string,
): Promise<PreparationPageRow[]> {
  const rows = await db.all<PreparationPageRow>(
    db
      .prepare(`SELECT course, doc_id, title, date FROM course_documents
      WHERE doc_kind = 'prep' AND (? IN ('', 'all') OR course = ?)
      ORDER BY date, course, doc_id`)
      .bind(course, course),
  );
  return rows.results;
}

/** The course (and, when given, the document) exists in the synced materials. */
export async function courseContextExists(
  db: TrackedD1,
  course: string,
  docId: string,
): Promise<boolean> {
  const statement = docId
    ? db
        .prepare("SELECT 1 FROM course_documents WHERE course = ? AND doc_id = ? LIMIT 1")
        .bind(course, docId)
    : db.prepare("SELECT 1 FROM course_documents WHERE course = ? LIMIT 1").bind(course);
  return Boolean(await db.first(statement));
}
