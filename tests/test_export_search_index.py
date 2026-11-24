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
    vec_selected = sum(1 for b in blocks if b.vectorize_candidate)
    assert vec_selected <= esi.VECTORIZE_FREE_MAX_VECTORS
    assert vec_selected * 1024 < 5_000_000
