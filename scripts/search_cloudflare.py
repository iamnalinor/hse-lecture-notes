"""Cloudflare side of the chat search index: REST client (D1, Workers AI bge-m3, Vectorize v2) and the
incremental sync of a corpus into D1 (SQLite + FTS5) and Vectorize.

The sync only rewrites rows whose `content_hash` changed, handles deletions in both stores and
journals every Vectorize mutation in D1 so an interrupted run can be rerun safely.
"""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from collections.abc import Iterator, Sequence
from typing import Any

from search_corpus import IndexedBlock, IndexedDocument, Reference, sha256_hex

CHUNKING_VERSION = 2
EMBEDDING_MODEL = "@cf/baai/bge-m3"
EMBEDDING_DIMENSIONS = 1024
# Vectorize get_by_ids rejects more ids per request (error 40007).
VECTORIZE_GET_MAX_IDS = 20
# Vectors per embedding call and Vectorize mutation: fewer mutations, fewer confirmation polls.
VECTOR_BATCH = 50
FTS_ROWID_MARKER = "fts_rowid_aligned_v1"

_REQUEST_ATTEMPTS = 7
_SERVER_ERRORS = {500, 502, 503, 504}
_MUTATION_TIMEOUT_S = 180

# D1 limits one statement to 100 bound parameters: batch sizes keep every statement under it.
_DOC_COLUMNS = (
    "id, course, doc_kind, doc_id, order_index, title, date, outline_json, body_tex, content_hash, updated_at"
)
_BLOCK_UPSERT_BATCH = 5  # 5 rows * 15 bound parameters (vectorized is the literal 0)
_BLOCK_DELETE_BATCH = 40
_REFERENCE_DELETE_BATCH = 50
_REFERENCE_INSERT_BATCH = 40
_HASH_PUBLISH_BATCH = 30
_VECTOR_DELETE_BATCH = 80

_FTS_INSERT_SELECT = """INSERT INTO course_blocks_fts
             (rowid, id, course, doc_kind, block_kind, title, statement_tex, proof_tex, lemmas)
           SELECT rowid, id, course, doc_kind, block_kind, title, statement_tex, proof_tex, lemmas
           FROM course_blocks"""
_UPSERT_CONFIG = "INSERT OR REPLACE INTO service_config (key, value_json, updated_at) VALUES "
_PENDING_KEY = "pending_vector_mutation"

PendingMutation = dict[str, Any]  # {"action": "upsert"|"delete", "mutation_id", "ids" | "blocks"}


class UnconfirmedMutation(RuntimeError):
    pass


def _marks(count: int) -> str:
    return ", ".join("?" for _ in range(count))


def _batches[T](items: Sequence[T], size: int) -> Iterator[Sequence[T]]:
    for start in range(0, len(items), size):
        yield items[start : start + size]


def _now_ms() -> int:
    return int(time.time() * 1000)


class CloudflareClient:
    def __init__(self, account_id: str, api_token: str, d1_id: str, vec_index: str) -> None:
        self.account_id = account_id
        self.api_token = api_token
        self.d1_id = d1_id
        self.vec_index = vec_index
        self.base = f"https://api.cloudflare.com/client/v4/accounts/{account_id}"

    def _req(
        self,
        method: str,
        path: str,
        body: bytes | dict[str, Any] | None = None,
        content_type: str = "application/json",
    ) -> Any:
        data = json.dumps(body).encode("utf-8") if isinstance(body, dict) else body
        req = urllib.request.Request(
            f"{self.base}{path}",
            data=data,
            method=method,
            headers={"Authorization": f"Bearer {self.api_token}", "Content-Type": content_type},
        )
        for attempt in range(_REQUEST_ATTEMPTS):
            try:
                with urllib.request.urlopen(req, timeout=60) as resp:
                    result = json.loads(resp.read().decode("utf-8"))
            except urllib.error.HTTPError as exc:
                delay = self._retry_delay(method, exc, attempt)
                if delay is None:
                    detail = exc.read().decode("utf-8", errors="replace")
                    raise RuntimeError(f"Cloudflare API {method} {path} HTTP {exc.code}: {detail}") from exc
                time.sleep(delay)
            else:
                if not result.get("success"):
                    raise RuntimeError(f"Cloudflare API {method} {path}: {result.get('errors')}")
                return result
        raise AssertionError("unreachable: the last attempt either returns or raises")

    @staticmethod
    def _retry_delay(method: str, exc: urllib.error.HTTPError, attempt: int) -> float | None:
        """Seconds to wait before the next attempt, or None if this failure must not be retried."""
        # 429 is rejected before processing, so any method may retry it; a 5xx POST may
        # already have applied and is never replayed.
        rate_limited = exc.code == 429
        retryable = rate_limited or (method == "GET" and exc.code in _SERVER_ERRORS)
        if not retryable or attempt == _REQUEST_ATTEMPTS - 1 or (not rate_limited and attempt >= 3):
            return None
        retry_after = exc.headers.get("Retry-After", "") if exc.headers else ""
        if retry_after.isdigit():
            return int(retry_after)
        # The account-wide API limit is per 5 minutes: wait 15 s, 30 s, … up to 2 min.
        return min(15 * 2**attempt, 120) if rate_limited else 2**attempt

    def d1_query(self, sql: str, params: list[Any] | None = None) -> list[dict[str, Any]]:
        payload: dict[str, Any] = {"sql": sql}
        if params:
            payload["params"] = params
        res = self._req("POST", f"/d1/database/{self.d1_id}/query", payload)
        first = (res.get("result") or [{}])[0]
        return first.get("results") or []

    def embed_texts(self, texts: list[str]) -> list[list[float]]:
        res = self._req("POST", f"/ai/run/{EMBEDDING_MODEL}", {"text": texts})
        data = (res.get("result") or {}).get("data")
        if not isinstance(data, list) or len(data) != len(texts):
            raise RuntimeError(f"Unexpected Workers AI embedding response: {str(res)[:300]}")
        return data

    @property
    def vector_path(self) -> str:
        return f"/vectorize/v2/indexes/{self.vec_index}"

    def vector_ids(self) -> set[str]:
        ids: set[str] = set()
        cursor = ""
        while True:
            query = urllib.parse.urlencode({"count": 1000, "cursor": cursor} if cursor else {"count": 1000})
            page = self._req("GET", f"{self.vector_path}/list?{query}")["result"]
            ids.update(row["id"] for row in page["vectors"])
            if not page["isTruncated"]:
                return ids
            if not page.get("nextCursor") or page["nextCursor"] == cursor:
                raise RuntimeError("Incomplete Vectorize inventory")
            cursor = page["nextCursor"]

    def _vectors_by_ids(self, ids: list[str]) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        for part_ids in _batches(ids, VECTORIZE_GET_MAX_IDS):
            part = self._req("POST", f"{self.vector_path}/get_by_ids", {"ids": list(part_ids)})["result"]
            if not isinstance(part, list):
                raise RuntimeError("Invalid Vectorize get_by_ids response")
            rows.extend(part)
        return rows

    def wait_for_mutation(self, pending: PendingMutation) -> None:
        mutation_id = pending["mutation_id"]
        if not mutation_id:
            raise RuntimeError("Missing Vectorize mutation ID")
        deadline = time.monotonic() + _MUTATION_TIMEOUT_S
        expected = dict(pending.get("blocks", []))
        is_delete = pending["action"] == "delete"
        ids = pending["ids"] if is_delete else list(expected)
        delay = 2.0
        while time.monotonic() < deadline:
            info = self._req("GET", f"{self.vector_path}/info")["result"]
            if info.get("processedUpToMutation") == mutation_id:
                return
            # The index only exposes its latest processed mutation. Compare the actual
            # postcondition if unrelated work has already advanced the marker.
            rows = self._vectors_by_ids(ids)
            if is_delete:
                if not rows:
                    return
            elif {row["id"]: (row.get("metadata") or {}).get("content_hash") for row in rows} == expected:
                return
            # Back off: every poll is two API calls against the account-wide rate limit.
            time.sleep(delay)
            delay = min(delay * 1.5, 15.0)
        raise UnconfirmedMutation(f"Vectorize mutation {mutation_id} still unconfirmed; rerun the sync")

    def vectorize_upsert(self, vectors: list[dict[str, Any]]) -> str:
        boundary = uuid.uuid4().hex
        ndjson = "\n".join(json.dumps(v) for v in vectors)
        body = (
            f"--{boundary}\r\n"
            'Content-Disposition: form-data; name="vectors"; filename="vectors.ndjson"\r\n'
            f"Content-Type: application/x-ndjson\r\n\r\n{ndjson}\r\n--{boundary}--\r\n"
        ).encode()
        response = self._req(
            "POST", f"{self.vector_path}/upsert", body, f"multipart/form-data; boundary={boundary}"
        )
        return response["result"]["mutationId"]

    def vectorize_delete(self, ids: list[str]) -> str:
        response = self._req("POST", f"{self.vector_path}/delete_by_ids", {"ids": ids})
        return response["result"]["mutationId"]


def finish_vector_mutation(cf: CloudflareClient, pending: PendingMutation) -> None:
    cf.wait_for_mutation(pending)
    if pending["action"] == "delete":
        ids = pending["ids"]
        cf.d1_query(f"UPDATE course_blocks SET vectorized = 0 WHERE id IN ({_marks(len(ids))})", ids)
    else:
        # A text-only sync may have changed the block while the mutation was pending.
        pairs = pending["blocks"]
        cf.d1_query(
            "UPDATE course_blocks SET vectorized = 1 "
            f"WHERE (id, content_hash) IN ({', '.join('(?, ?)' for _ in pairs)})",
            [v for pair in pairs for v in pair],
        )
    cf.d1_query(f"DELETE FROM service_config WHERE key = '{_PENDING_KEY}'")


def record_vector_mutation(cf: CloudflareClient, pending: PendingMutation) -> None:
    cf.d1_query(f"{_UPSERT_CONFIG}('{_PENDING_KEY}', ?, ?)", [json.dumps(pending), _now_ms()])
    finish_vector_mutation(cf, pending)


def submit_vector_blocks(cf: CloudflareClient, chunk: Sequence[IndexedBlock]) -> None:
    embeddings = cf.embed_texts([f"{b.title}\n{b.statement_tex[:1200]}" for b in chunk])
    vectors = [
        {
            "id": b.id,
            "values": emb,
            "metadata": {
                "course": b.course,
                "doc_kind": b.doc_kind,
                "block_kind": b.block_kind,
                "content_hash": b.content_hash,
            },
        }
        for b, emb in zip(chunk, embeddings, strict=True)
    ]
    record_vector_mutation(
        cf,
        {
            "mutation_id": cf.vectorize_upsert(vectors),
            "action": "upsert",
            "blocks": [(b.id, b.content_hash) for b in chunk],
        },
    )


def _ensure_fts_rowid_alignment(cf: CloudflareClient) -> None:
    """Rebuild FTS once so its rowids equal course_blocks.rowid (deletes go by rowid)."""
    if cf.d1_query("SELECT 1 FROM service_config WHERE key = ?", [FTS_ROWID_MARKER]):
        return
    cf.d1_query("DELETE FROM course_blocks_fts")
    cf.d1_query(_FTS_INSERT_SELECT)
    cf.d1_query(f"{_UPSERT_CONFIG}(?, 'true', ?)", [FTS_ROWID_MARKER, _now_ms()])


def _fts_delete_by_block_ids(cf: CloudflareClient, ids: Sequence[str]) -> None:
    # FTS rows share course_blocks.rowid: delete by rowid (an UNINDEXED id filter
    # scans the whole FTS table and burned the D1 free-tier read quota).
    cf.d1_query(
        "DELETE FROM course_blocks_fts WHERE rowid IN "
        f"(SELECT rowid FROM course_blocks WHERE id IN ({_marks(len(ids))}))",
        list(ids),
    )


class IndexSync:
    """One incremental sync of a corpus (whole, or a single course) into D1 and Vectorize."""

    def __init__(
        self,
        cf: CloudflareClient,
        docs: list[IndexedDocument],
        blocks: list[IndexedBlock],
        refs: list[Reference],
        *,
        skip_vectorize: bool,
        only_course: str | None,
        global_blocks: list[IndexedBlock] | None,
    ) -> None:
        # The text sync is course-local. Vector capacity is shared by all courses.
        if only_course and global_blocks is None and not skip_vectorize:
            raise ValueError("Partial vector sync needs the global selection")
        self.cf, self.docs, self.blocks, self.refs = cf, docs, blocks, refs
        self.skip_vectorize, self.only_course, self.global_blocks = skip_vectorize, only_course, global_blocks
        self.now_ms = _now_ms()
        self.stats = {
            "docs_upserted": 0,
            "docs_skipped": 0,
            "docs_deleted": 0,
            "blocks_upserted": 0,
            "blocks_skipped": 0,
            "blocks_deleted": 0,
            "vectors_upserted": 0,
            "vectors_deleted": 0,
            "refs_updated": 0,
        }

    def run(self) -> dict[str, int]:
        _ensure_fts_rowid_alignment(self.cf)
        existing_docs, existing_blocks = self._existing_hashes()
        self._sync_documents(existing_docs)
        changed, needing_vec = self._classify_blocks(existing_blocks)
        self._upsert_blocks(changed)
        self._delete_blocks(sorted(set(existing_blocks) - {b.id for b in self.blocks}))
        self._update_references({b.id for b in changed})
        self._publish_block_hashes(changed)
        if not self.skip_vectorize:
            needing_vec = self._reconcile_vectors(needing_vec)
            for chunk in _batches(needing_vec, VECTOR_BATCH):
                submit_vector_blocks(self.cf, chunk)
                self.stats["vectors_upserted"] += len(chunk)
        # Only publish a global version after reconciling the entire semantic index.
        if not (self.skip_vectorize or self.only_course):
            self._publish_index_version()
        return self.stats

    def _existing_hashes(self) -> tuple[dict[str, str], dict[str, tuple[str, int]]]:
        scope, params = ("", []) if not self.only_course else (" WHERE course = ?", [self.only_course])
        docs = self.cf.d1_query(f"SELECT id, content_hash FROM course_documents{scope}", params)
        blocks = self.cf.d1_query(f"SELECT id, content_hash, vectorized FROM course_blocks{scope}", params)
        return (
            {r["id"]: r["content_hash"] for r in docs},
            {r["id"]: (r["content_hash"], int(r.get("vectorized") or 0)) for r in blocks},
        )

    def _sync_documents(self, existing: dict[str, str]) -> None:
        for d in self.docs:
            if existing.get(d.id) == d.content_hash:
                self.stats["docs_skipped"] += 1
                continue
            columns = _DOC_COLUMNS.split(", ")
            self.cf.d1_query(
                f"INSERT INTO course_documents ({_DOC_COLUMNS}) VALUES ({_marks(len(columns))}) "
                "ON CONFLICT(id) DO UPDATE SET " + ", ".join(f"{c}=excluded.{c}" for c in columns[1:]),
                [
                    d.id,
                    d.course,
                    d.doc_kind,
                    d.doc_id,
                    d.order_index,
                    d.title,
                    d.date,
                    json.dumps(d.outline, ensure_ascii=False),
                    d.body_tex,
                    d.content_hash,
                    self.now_ms,
                ],
            )
            self.stats["docs_upserted"] += 1
        for old_id in set(existing) - {d.id for d in self.docs}:
            self.cf.d1_query("DELETE FROM course_documents WHERE id = ?", [old_id])
            self.stats["docs_deleted"] += 1

    def _classify_blocks(
        self, existing: dict[str, tuple[str, int]]
    ) -> tuple[list[IndexedBlock], list[IndexedBlock]]:
        """(blocks whose text changed, blocks that must be (re-)embedded)."""
        changed: list[IndexedBlock] = []
        needing_vec: list[IndexedBlock] = []
        wants_vector = not self.skip_vectorize
        for b in self.blocks:
            prev = existing.get(b.id)
            if prev and prev[0] == b.content_hash:
                self.stats["blocks_skipped"] += 1
                if wants_vector and b.vectorize_candidate and prev[1] == 0:
                    needing_vec.append(b)
                continue
            changed.append(b)
            if wants_vector and b.vectorize_candidate:
                needing_vec.append(b)
        return changed, needing_vec

    def _upsert_blocks(self, changed: list[IndexedBlock]) -> None:
        for chunk in _batches(changed, _BLOCK_UPSERT_BATCH):
            params: list[Any] = []
            for b in chunk:
                params.extend(
                    [
                        b.id,
                        b.course,
                        b.doc_kind,
                        b.doc_id,
                        b.doc_order,
                        b.block_order,
                        b.block_kind,
                        b.anchor_id,
                        b.section_id,
                        b.title,
                        b.statement_tex,
                        b.proof_tex,
                        b.lemmas,
                        "",  # publish hash after FTS and references are consistent
                        self.now_ms,
                    ]
                )
            ids = [b.id for b in chunk]
            _fts_delete_by_block_ids(self.cf, ids)
            self.cf.d1_query(
                f"""INSERT INTO course_blocks
               (id, course, doc_kind, doc_id, doc_order, block_order, block_kind, anchor_id, section_id,
                title, statement_tex, proof_tex, lemmas, content_hash, vectorized, updated_at)
               VALUES {", ".join(["(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)"] * len(chunk))}
               ON CONFLICT(id) DO UPDATE SET
                 course=excluded.course, doc_kind=excluded.doc_kind, doc_id=excluded.doc_id,
                 doc_order=excluded.doc_order, block_order=excluded.block_order,
                 block_kind=excluded.block_kind, anchor_id=excluded.anchor_id,
                 section_id=excluded.section_id, title=excluded.title,
                 statement_tex=excluded.statement_tex, proof_tex=excluded.proof_tex,
                 lemmas=excluded.lemmas, content_hash=excluded.content_hash,
                 vectorized=0, updated_at=excluded.updated_at""",
                params,
            )
            self.cf.d1_query(f"{_FTS_INSERT_SELECT} WHERE id IN ({_marks(len(ids))})", ids)
            self.stats["blocks_upserted"] += len(chunk)

    def _delete_blocks(self, removed_ids: list[str]) -> None:
        for chunk in _batches(removed_ids, _BLOCK_DELETE_BATCH):
            ids = list(chunk)
            marks = _marks(len(ids))
            _fts_delete_by_block_ids(self.cf, ids)
            self.cf.d1_query(
                f"DELETE FROM block_references WHERE from_block_id IN ({marks}) OR to_block_id IN ({marks})",
                ids + ids,
            )
            self.cf.d1_query(f"DELETE FROM course_blocks WHERE id IN ({marks})", ids)
            self.stats["blocks_deleted"] += len(ids)

    def _update_references(self, changed_ids: set[str]) -> None:
        """Replace the outgoing references of changed blocks only."""
        if not changed_ids:
            return
        for chunk in _batches(sorted(changed_ids), _REFERENCE_DELETE_BATCH):
            self.cf.d1_query(
                f"DELETE FROM block_references WHERE from_block_id IN ({_marks(len(chunk))})", list(chunk)
            )
        changed_refs = [(src, dst) for src, dst in self.refs if src in changed_ids]
        for chunk in _batches(changed_refs, _REFERENCE_INSERT_BATCH):
            self.cf.d1_query(
                "INSERT OR IGNORE INTO block_references (from_block_id, to_block_id, ref_kind) VALUES "
                + ", ".join("(?, ?, 'ref')" for _ in chunk),
                [value for pair in chunk for value in pair],
            )
            self.stats["refs_updated"] += len(chunk)

    def _publish_block_hashes(self, changed: list[IndexedBlock]) -> None:
        for chunk in _batches(changed, _HASH_PUBLISH_BATCH):
            cases = " ".join("WHEN ? THEN ?" for _ in chunk)
            self.cf.d1_query(
                f"UPDATE course_blocks SET content_hash = CASE id {cases} END WHERE id IN ({_marks(len(chunk))})",
                [value for b in chunk for value in (b.id, b.content_hash)] + [b.id for b in chunk],
            )

    def _reconcile_vectors(self, needing_vec: list[IndexedBlock]) -> list[IndexedBlock]:
        """Settle the journalled mutation, drop obsolete vectors, and return the blocks to embed."""
        needing_vec = self._recover_pending_mutation(needing_vec)
        inventory = self.cf.vector_ids()
        eligible = {
            b.id
            for b in (self.global_blocks if self.global_blocks is not None else self.blocks)
            if b.vectorize_candidate
        }
        obsolete = sorted(inventory - eligible)
        for chunk in _batches(obsolete, _VECTOR_DELETE_BATCH):
            ids = list(chunk)
            record_vector_mutation(
                self.cf, {"mutation_id": self.cf.vectorize_delete(ids), "action": "delete", "ids": ids}
            )
            self.stats["vectors_deleted"] += len(ids)
        # Recover missing vectors even if an old D1 flag still claims they exist.
        queued = {b.id for b in needing_vec}
        needing_vec.extend(
            b for b in self.blocks if b.vectorize_candidate and b.id not in inventory and b.id not in queued
        )
        return needing_vec

    def _recover_pending_mutation(self, needing_vec: list[IndexedBlock]) -> list[IndexedBlock]:
        rows = self.cf.d1_query(f"SELECT value_json FROM service_config WHERE key = '{_PENDING_KEY}'")
        if not rows:
            return needing_vec
        pending: PendingMutation = json.loads(rows[0]["value_json"])
        try:
            finish_vector_mutation(self.cf, pending)
        except UnconfirmedMutation:
            # A rejected/superseded write cannot be observed on any later retry.
            # Reassert a deletion for the affected IDs, journal its new mutation
            # before waiting, then rebuild eligible vectors from the current corpus.
            ids = pending["ids"] if pending["action"] == "delete" else [pair[0] for pair in pending["blocks"]]
            pending = {"action": "delete", "ids": ids, "mutation_id": self.cf.vectorize_delete(ids)}
            record_vector_mutation(self.cf, pending)
        if pending["action"] == "upsert":
            confirmed = dict(pending["blocks"])
            return [b for b in needing_vec if confirmed.get(b.id) != b.content_hash]
        deleted_ids = set(pending["ids"])
        queued_ids = {b.id for b in needing_vec}
        needing_vec.extend(
            b for b in self.blocks if b.vectorize_candidate and b.id in deleted_ids and b.id not in queued_ids
        )
        if self.only_course:
            needing_vec.extend(self._other_course_blocks_to_restore(deleted_ids))
        return needing_vec

    def _other_course_blocks_to_restore(self, affected: set[str]) -> list[IndexedBlock]:
        """Recover a previously interrupted full sync even on a scoped retry."""
        others = [
            b
            for b in self.global_blocks or []
            if b.course != self.only_course and b.vectorize_candidate and b.id in affected
        ]
        if not others:
            return []
        stored = {
            row["id"]: row["content_hash"]
            for row in self.cf.d1_query(
                f"SELECT id, content_hash FROM course_blocks WHERE id IN ({_marks(len(others))})",
                [b.id for b in others],
            )
        }
        return [b for b in others if stored.get(b.id) == b.content_hash]

    def _publish_index_version(self) -> None:
        index_version = sha256_hex("|".join(sorted(f"{b.id}:{b.content_hash}" for b in self.blocks)))
        meta_json = json.dumps(
            {
                "indexVersion": index_version,
                "embeddingModel": EMBEDDING_MODEL,
                "chunkingVersion": CHUNKING_VERSION,
                "updatedAt": self.now_ms,
            }
        )
        self.cf.d1_query(
            """INSERT INTO service_config (key, value_json, updated_at)
               VALUES ('index_meta', ?, ?)
               ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json, updated_at=excluded.updated_at""",
            [meta_json, self.now_ms],
        )


def sync_to_cloudflare(
    cf: CloudflareClient,
    docs: list[IndexedDocument],
    blocks: list[IndexedBlock],
    refs: list[Reference],
    skip_vectorize: bool = False,
    only_course: str | None = None,
    global_blocks: list[IndexedBlock] | None = None,
) -> dict[str, int]:
    return IndexSync(
        cf,
        docs,
        blocks,
        refs,
        skip_vectorize=skip_vectorize,
        only_course=only_course,
        global_blocks=global_blocks,
    ).run()
