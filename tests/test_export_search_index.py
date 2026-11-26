from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

import export_search_index as esi  # noqa: E402


def test_python_ts_stemmer_parity() -> None:
    words = [
        "делимости",
        "делимость",
        "простыми",
        "простых",
        "теорема",
        "теоремы",
        "арифметики",
        "доказательство",
        "матрицами",
        "индукцией",
        "непрерывность",
        "определением",
    ]
    py_stems = [esi.stem_russian_word(w) for w in words]

    # Invoke backend/src/stemmer.ts via bun to guarantee 100% parity
    js_code = (
        "import { stemRussianWord } from './backend/src/stemmer.ts';\n"
        f"const words = {words!r};\n"
        "console.log(JSON.stringify(words.map(stemRussianWord)));\n"
    )
    proc = subprocess.run(
        ["bun", "-e", js_code],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=True,
    )
    import json

    ts_stems = json.loads(proc.stdout)
    assert py_stems == ts_stems


def test_parse_markdown_document_merges_proofs_and_extracts_refs(tmp_path: Path) -> None:
    md = tmp_path / "07_oct16_primes.md"
    md.write_text(
        """---
course: discrete
lecture: 7
date: 2026-10-16
title: Простые числа
---

# Теория

## Основная теорема {#sec:lec07:fta}

Вводный абзац секции с достаточным количеством текста, чтобы секция попала в поисковый индекс и содержала контекст.

::: {.theorem #thm:lec07:fta title="Основная теорема арифметики"}
Всякое $n \\ge 2$ раскладывается на простые по [лемме](#lem:lec07:euclid).

::: {.proof}
Доказательство по сильной индукции.
:::
:::
""",
        encoding="utf-8",
    )

    doc, blocks, refs = esi.parse_markdown_document(md, "lecture", "discrete", "07_oct16_primes")
    assert doc.id == "discrete:lecture:07_oct16_primes"
    assert doc.order_index == 7
    assert doc.title == "Простые числа"

    thm = next(b for b in blocks if b.id == "thm:lec07:fta")
    assert thm.block_kind == "theorem"
    assert "Доказательство по сильной индукции." in thm.proof_tex
    assert ("thm:lec07:fta", "lem:lec07:euclid") in refs


def test_collect_corpus_respects_vectorize_free_budget() -> None:
    docs, blocks, refs = esi.collect_corpus(ROOT)
    assert len(docs) > 20
    assert len(blocks) > 500
    assert len(refs) > 50
    powerset = next(b for b in blocks if b.anchor_id == "lem:lec18:powerset")
    assert r"\mathbf{2}" in powerset.title
    assert powerset.proof_tex
    assert next(b for b in blocks if b.anchor_id == "prob:kr1:branch").proof_tex
    vec_selected = sum(1 for b in blocks if b.vectorize_candidate)
    assert vec_selected <= esi.VECTORIZE_FREE_MAX_VECTORS
    assert vec_selected * 1024 < 5_000_000


@pytest.mark.parametrize("count", [1, 2, 3])
def test_strict_export_reports_blocks_left_out_of_semantic_search(tmp_path, monkeypatch, capsys, count):
    course = tmp_path / "notes" / "algebra"
    course.mkdir(parents=True)
    (course / "lecture.md").write_text(
        "".join(f"::: {{.lemma #lem:{i}}}\nЛемма.\n:::\n" for i in range(count))
    )
    monkeypatch.setattr(esi, "VECTORIZE_FREE_MAX_VECTORS", 2)
    command = ["export_search_index", "--root", str(tmp_path), "--dry-run"]
    monkeypatch.setattr(sys, "argv", command)
    esi.main()
    summary = json.loads(capsys.readouterr().out)
    assert summary["blocks"] == count
    assert summary["vectorize_selected"] == min(count, 2)
    assert summary["vectorize_omitted"] == max(0, count - 2)

    monkeypatch.setattr(sys, "argv", [*command, "--fail-on-vectorize-overflow"])
    if count <= 2:
        esi.main()
    else:
        with pytest.raises(SystemExit) as error:
            esi.main()
        assert error.value.code == 2


def test_partial_sync_preserves_course_ids_proofs_references_and_vector_budget(tmp_path: Path) -> None:
    for course in ["algebra", "discrete"]:
        folder = tmp_path / "notes" / course
        folder.mkdir(parents=True)
        (folder / "lecture.md").write_text(
            '# 1. Свойства чисел\n\n'
            '::: {.lemma #lem:same title="Лемма"}\nЛемма.\n:::\n\n'
            '::: proof\nДоказательство.\n:::\n\n'
            '::: {.problem #prob:same}\nПримените [лемму](#lem:same).\n'
            '::: solution\nРешение.\n:::\n:::\n'
        )
    docs, full, refs = esi.collect_corpus(tmp_path, max_vectorize=1)
    _, subset, subset_refs = esi.collect_corpus(tmp_path, "discrete", max_vectorize=1)
    assert subset == [b for b in full if b.course == "discrete"]
    assert len({b.id for b in full}) == 4
    assert all(b.section_id == docs[0].outline[0]["id"] == "свойства-чисел" for b in full)
    lemma, problem = subset
    assert lemma.proof_tex == "Доказательство."
    assert problem.proof_tex == "Решение."
    assert subset_refs == [(problem.id, lemma.id)]
    assert set(subset_refs) <= set(refs)


def test_sync_recovers_fts_and_vector_deletions(tmp_path: Path) -> None:
    import sqlite3

    import pytest

    class Client:
        def __init__(self) -> None:
            self.db = sqlite3.connect(":memory:")
            self.db.row_factory = sqlite3.Row
            self.db.executescript((ROOT / "backend/migrations/0001_init.sql").read_text())
            self.fail_fts = True
            self.vectors = set()

        def d1_query(self, sql, params=None):
            if self.fail_fts and "INSERT INTO course_blocks_fts" in sql:
                self.fail_fts = False
                raise RuntimeError("FTS unavailable")
            return [dict(r) for r in self.db.execute(sql, params or [])]

        def embed_texts(self, texts):
            return [[0.1] for _ in texts]

        def vector_ids(self):
            return set(self.vectors)

        def wait_for_mutation(self, pending):
            assert pending["mutation_id"] == "change"

        def vectorize_upsert(self, vectors):
            assert all(set(v["metadata"]) == {"course", "doc_kind", "block_kind", "content_hash"} for v in vectors)
            self.vectors.update(v["id"] for v in vectors)
            return "change"

        def vectorize_delete(self, ids):
            self.vectors.difference_update(ids)
            return "change"

    course = tmp_path / "notes/algebra"
    course.mkdir(parents=True)
    path = course / "lecture.md"
    path.write_text('::: {.lemma #lem:x}\nСвойство.\n:::\n')
    docs, blocks, refs = esi.collect_corpus(tmp_path)
    cf = Client()
    with pytest.raises(RuntimeError, match="FTS unavailable"):
        esi.sync_to_cloudflare(cf, docs, blocks, refs)
    confirm = cf.wait_for_mutation
    def timeout(mutation_id):
        raise RuntimeError("not confirmed")
    cf.wait_for_mutation = timeout
    with pytest.raises(RuntimeError, match="not confirmed"):
        esi.sync_to_cloudflare(cf, docs, blocks, refs)
    assert cf.db.execute("SELECT vectorized FROM course_blocks").fetchone()[0] == 0
    assert cf.db.execute("SELECT count(*) FROM service_config WHERE key='index_meta'").fetchone()[0] == 0
    cf.wait_for_mutation = confirm
    assert esi.sync_to_cloudflare(cf, docs, blocks, refs)["vectors_upserted"] == 0
    assert cf.db.execute("SELECT vectorized FROM course_blocks").fetchone()[0] == 1
    assert cf.db.execute("SELECT count(*) FROM course_blocks_fts").fetchone()[0] == 1
    assert cf.vectors == {blocks[0].id}
    # Old-format or failed pending upsert: an advanced marker and stale payload
    # must lead to a new confirmed mutation, even with the same text in D1.
    cf.db.execute("INSERT INTO service_config VALUES ('pending_vector_mutation', ?, 0)",
                  [esi.json.dumps({"action": "upsert", "mutation_id": "lost", "blocks": [[blocks[0].id, blocks[0].content_hash]]})])
    def lost_marker(pending):
        if pending["mutation_id"] == "lost":
            raise esi.UnconfirmedMutation("never applied")
        confirm(pending)
    cf.wait_for_mutation = lost_marker
    assert esi.sync_to_cloudflare(cf, docs, blocks, refs)["vectors_upserted"] == 1
    assert cf.db.execute("SELECT vectorized FROM course_blocks").fetchone()[0] == 1
    path.unlink()
    esi.sync_to_cloudflare(cf, [], [], [], skip_vectorize=True)
    esi.sync_to_cloudflare(cf, [], [], [])
    assert not cf.vectors
    assert cf.db.execute("SELECT count(*) FROM course_blocks_fts").fetchone()[0] == 0

    # A newly prioritized block can displace a vector from a different course.
    path.write_text('::: {.remark #rem:x}\nСвойство.\n:::\n')
    initial = esi.collect_corpus(tmp_path, max_vectorize=1)
    esi.sync_to_cloudflare(cf, *initial)
    other = tmp_path / "notes/discrete"
    other.mkdir(parents=True)
    (other / "lecture.md").write_text('::: {.theorem #thm:y}\nТеорема.\n:::\n')
    full = esi.collect_corpus(tmp_path, max_vectorize=1)
    scoped = esi.scope_corpus(*full, "discrete")
    esi.sync_to_cloudflare(cf, *scoped, only_course="discrete", global_blocks=full[1])
    assert cf.vectors == {b.id for b in full[1] if b.vectorize_candidate}
    assert cf.db.execute("SELECT COUNT(*) FROM course_blocks WHERE course = 'algebra'").fetchone()[0] == 1


def test_vectorize_confirmation_checks_actual_hashes_and_deletions(monkeypatch):
    cf = esi.CloudflareClient("account", "token", "db", "index")
    rows = []
    def request(method, path, body=None):
        if path.endswith("/info"):
            return {"result": {"processedUpToMutation": "unrelated"}}
        assert method == "POST" and body == {"ids": ["a", "b"]}
        if path.endswith("/delete_by_ids"):
            return {"result": {"mutationId": "delete"}}
        assert path.endswith("/get_by_ids")
        return {"result": rows.pop(0)}
    monkeypatch.setattr(cf, "_req", request)
    monkeypatch.setattr(esi.time, "sleep", lambda _: None)
    good = [{"id": "b", "metadata": {"content_hash": "2"}}, {"id": "a", "metadata": {"content_hash": "1"}}]
    rows.extend([good[:1], [{"id": "a"}, good[0]], good])
    cf.wait_for_mutation({"action": "upsert", "mutation_id": "upsert", "blocks": [["a", "1"], ["b", "2"]]})
    assert not rows
    rows.extend([good[:1], []])
    cf.wait_for_mutation({"action": "delete", "mutation_id": cf.vectorize_delete(["a", "b"]), "ids": ["a", "b"]})
    assert not rows


def test_ambiguous_post_failure_is_not_replayed(monkeypatch):
    import io

    import pytest

    client = esi.CloudflareClient("account", "token", "db", "index")
    writes = []
    def ambiguous_response(req, timeout):
        writes.append(req.data)
        raise esi.urllib.error.HTTPError(req.full_url, 503, "ambiguous", {}, io.BytesIO(b""))
    monkeypatch.setattr(esi.urllib.request, "urlopen", ambiguous_response)
    with pytest.raises(RuntimeError, match="HTTP 503"):
        client.d1_query("INSERT INTO course_blocks_fts (id) VALUES (?)", ["applied"])
    assert len(writes) == 1


def test_fts_rows_share_block_rowid_and_deletes_never_scan_fts(tmp_path: Path) -> None:
    """FTS deletes by UNINDEXED id full-scan the table (6.8M D1 reads per sync, 2026-11-25)."""
    import sqlite3

    class Client:
        def __init__(self) -> None:
            self.db = sqlite3.connect(":memory:")
            self.db.row_factory = sqlite3.Row
            for name in sorted((ROOT / "backend/migrations").glob("*.sql")):
                self.db.executescript(name.read_text())
            self.sql: list[str] = []

        def d1_query(self, sql, params=None):
            self.sql.append(" ".join(sql.split()))
            return [dict(r) for r in self.db.execute(sql, params or [])]

    course = tmp_path / "notes/algebra"
    course.mkdir(parents=True)
    path = course / "lecture.md"
    path.write_text('::: {.lemma #lem:x}\nА.\n:::\n\n::: {.lemma #lem:y}\nБ.\n:::\n')
    cf = Client()
    esi.sync_to_cloudflare(cf, *esi.collect_corpus(tmp_path), skip_vectorize=True)
    path.write_text('::: {.lemma #lem:x}\nА изменено.\n:::\n')
    esi.sync_to_cloudflare(cf, *esi.collect_corpus(tmp_path), skip_vectorize=True)

    fts_deletes = [s for s in cf.sql if s.startswith("DELETE FROM course_blocks_fts WHERE")]
    assert fts_deletes and all("WHERE rowid IN (SELECT rowid FROM course_blocks" in s for s in fts_deletes)
    pairs = cf.db.execute(
        "SELECT f.rowid, b.rowid, f.statement_tex FROM course_blocks_fts f JOIN course_blocks b ON b.id = f.id"
    ).fetchall()
    assert [(r[0] == r[1], r[2]) for r in pairs] == [(True, "А изменено.")]
    assert cf.db.execute("SELECT count(*) FROM course_blocks_fts").fetchone()[0] == 1


def test_misaligned_legacy_fts_is_rebuilt_before_rowid_deletes(tmp_path: Path) -> None:
    import sqlite3

    class Client:
        def __init__(self) -> None:
            self.db = sqlite3.connect(":memory:")
            self.db.row_factory = sqlite3.Row
            for name in sorted((ROOT / "backend/migrations").glob("*.sql")):
                self.db.executescript(name.read_text())

        def d1_query(self, sql, params=None):
            return [dict(r) for r in self.db.execute(sql, params or [])]

    course = tmp_path / "notes/algebra"
    course.mkdir(parents=True)
    path = course / "lecture.md"
    path.write_text('::: {.lemma #lem:x}\nА.\n:::\n\n::: {.lemma #lem:y}\nБ.\n:::\n')
    cf = Client()
    esi.sync_to_cloudflare(cf, *esi.collect_corpus(tmp_path), skip_vectorize=True)
    # Simulate the legacy layout: FTS rowids unrelated to course_blocks rowids.
    cf.db.execute("DELETE FROM service_config WHERE key = ?", [esi.FTS_ROWID_MARKER])
    cf.db.execute("DELETE FROM course_blocks_fts")
    cf.db.execute("INSERT INTO course_blocks_fts (rowid, id, statement_tex) SELECT rowid + 100, id, statement_tex FROM course_blocks ORDER BY id DESC")
    path.write_text('::: {.lemma #lem:x}\nА изменено.\n:::\n\n::: {.lemma #lem:y}\nБ.\n:::\n')
    esi.sync_to_cloudflare(cf, *esi.collect_corpus(tmp_path), skip_vectorize=True)
    rows = cf.db.execute(
        "SELECT f.rowid = b.rowid, f.statement_tex FROM course_blocks_fts f JOIN course_blocks b ON b.id = f.id ORDER BY b.id"
    ).fetchall()
    assert [tuple(r) for r in rows] == [(1, "А изменено."), (1, "Б.")]


def test_vectorize_confirmation_reads_at_most_twenty_ids_per_request(monkeypatch):
    """Vectorize get_by_ids rejects more than 20 ids (error 40007, 2026-11-25)."""
    cf = esi.CloudflareClient("account", "token", "db", "index")
    blocks = [[f"b{i}", str(i)] for i in range(25)]
    sizes = []
    def request(method, path, body=None):
        if path.endswith("/info"):
            return {"result": {"processedUpToMutation": "unrelated"}}
        assert path.endswith("/get_by_ids")
        sizes.append(len(body["ids"]))
        assert len(body["ids"]) <= 20
        return {"result": [{"id": i, "metadata": {"content_hash": dict(blocks)[i]}} for i in body["ids"]]}
    monkeypatch.setattr(cf, "_req", request)
    monkeypatch.setattr(esi.time, "sleep", lambda _: None)
    cf.wait_for_mutation({"action": "upsert", "mutation_id": "m", "blocks": blocks})
    assert sizes == [20, 5]


def test_vectorize_confirmation_backs_off_to_spare_the_api_rate_limit(monkeypatch):
    """Polling every 2 s hit Cloudflare's API rate limit (error 971) on a full sync, 2026-11-25."""
    cf = esi.CloudflareClient("account", "token", "db", "index")
    polls = {"n": 0}
    def request(method, path, body=None):
        if path.endswith("/info"):
            polls["n"] += 1
            return {"result": {"processedUpToMutation": "m" if polls["n"] > 6 else "older"}}
        return {"result": []}
    sleeps = []
    monkeypatch.setattr(cf, "_req", request)
    monkeypatch.setattr(esi.time, "sleep", sleeps.append)
    cf.wait_for_mutation({"action": "upsert", "mutation_id": "m", "blocks": [["a", "1"]]})
    assert sleeps == sorted(sleeps) and sleeps[0] == 2 and max(sleeps) <= 15 and sleeps[-1] > 5
    assert esi.VECTOR_BATCH >= 50


def test_rate_limited_post_is_retried_after_waiting(monkeypatch):
    """A 429 (error 971) means Cloudflare rejected the request unprocessed: safe to retry, even a POST."""
    import io
    client = esi.CloudflareClient("account", "token", "db", "index")
    calls, sleeps = [], []
    def rate_limited_then_ok(req, timeout):
        calls.append(req.data)
        if len(calls) < 3:
            raise esi.urllib.error.HTTPError(req.full_url, 429, "slow down", {}, io.BytesIO(b'{"errors":[{"code":971}]}'))
        return io.BytesIO(b'{"success": true, "result": [{"results": [{"n": 1}]}]}')
    monkeypatch.setattr(esi.urllib.request, "urlopen", rate_limited_then_ok)
    monkeypatch.setattr(esi.time, "sleep", sleeps.append)
    assert client.d1_query("SELECT 1 AS n") == [{"n": 1}]
    assert len(calls) == 3 and all(s >= 15 for s in sleeps)
