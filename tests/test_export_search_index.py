from __future__ import annotations

import subprocess
import sys
from pathlib import Path

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

        def vectorize_upsert(self, vectors):
            self.vectors.update(v["id"] for v in vectors)

        def vectorize_delete(self, ids):
            self.vectors.difference_update(ids)

    course = tmp_path / "notes/algebra"
    course.mkdir(parents=True)
    path = course / "lecture.md"
    path.write_text('::: {.lemma #lem:x}\nСвойство.\n:::\n')
    docs, blocks, refs = esi.collect_corpus(tmp_path)
    cf = Client()
    with pytest.raises(RuntimeError, match="FTS unavailable"):
        esi.sync_to_cloudflare(cf, docs, blocks, refs)
    assert esi.sync_to_cloudflare(cf, docs, blocks, refs)["blocks_upserted"] == 1
    assert cf.db.execute("SELECT count(*) FROM course_blocks_fts").fetchone()[0] == 1
    assert cf.vectors == {blocks[0].id}
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
