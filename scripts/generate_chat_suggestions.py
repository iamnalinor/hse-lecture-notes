#!/usr/bin/env python3
"""Generate tailored Russian starter chat questions for every lecture/document.

Reads the Markdown corpus via `export_search_index.collect_corpus` and writes
`web/src/domain/chat-suggestions.json` keyed by `<course>/<doc_id>`.
Frontend falls back to generic defaults if a document is not present in the JSON.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

from export_search_index import IndexedBlock, IndexedDocument, collect_corpus  # noqa: E402

OUTPUT_PATH = ROOT / "web" / "src" / "domain" / "chat-suggestions.json"

_GENERIC_TITLE_RE = re.compile(
    r"^(?:theorem|lemma|definition|proposition|corollary|problem|example|remark|section)\b",
    re.IGNORECASE,
)
_NUM_PREFIX_RE = re.compile(
    r"^(?:Теорема|Лемма|Определение|Утверждение|Следствие|Задача|Пример|Замечание)\s+[\d.]+\s*[-—:()]*\s*",
    re.IGNORECASE,
)
_PAREN_TAG_RE = re.compile(r"\s*\([^)]{1,24}\)\s*$")


def _clean_topic(raw: str) -> str:
    text = raw.strip()
    text = _NUM_PREFIX_RE.sub("", text).strip()
    text = text.replace("$", "").strip(" .,:;—-")
    text = re.sub(r"\s+", " ", text)
    if not text or _GENERIC_TITLE_RE.match(text):
        return ""
    if len(text) > 72:
        # Try dropping trailing parenthetical or trimming cleanly on word boundary
        shorter = _PAREN_TAG_RE.sub("", text).strip()
        if len(shorter) <= 72:
            text = shorter
        else:
            text = text[:68].rsplit(" ", 1)[0].rstrip(" ,;:-")
    return text


def _pick_distinct(
    blocks: list[IndexedBlock],
    kinds: list[str],
    *,
    doc_title: str = "",
    require_proof: bool = False,
) -> list[str]:
    title_words = {w for w in re.findall(r"[а-яёa-z]{4,}", doc_title.lower())}
    kind_rank = {k: i for i, k in enumerate(kinds)}
    candidates: list[tuple[int, int, int, str]] = []
    seen: set[str] = set()
    for order, b in enumerate(blocks):
        if b.block_kind not in kind_rank:
            continue
        if require_proof and not b.proof_tex.strip():
            continue
        topic = _clean_topic(b.title)
        if not topic or len(topic) < 4:
            continue
        key = topic.lower()
        if key in seen:
            continue
        seen.add(key)
        topic_words = set(re.findall(r"[а-яёa-z]{4,}", key))
        overlap = len(title_words & topic_words)
        candidates.append((kind_rank[b.block_kind], -overlap, order, topic))
    candidates.sort()
    return [c[3] for c in candidates]


def _questions_for_doc(doc: IndexedDocument, blocks: list[IndexedBlock]) -> list[str]:
    doc_title = _clean_topic(doc.title)
    theorems_with_proof = _pick_distinct(
        blocks,
        ["theorem", "lemma", "proposition", "corollary"],
        doc_title=doc_title,
        require_proof=True,
    )
    theorems_any = _pick_distinct(
        blocks,
        ["theorem", "lemma", "proposition", "corollary"],
        doc_title=doc_title,
    )
    definitions = _pick_distinct(blocks, ["definition"], doc_title=doc_title)
    problems = _pick_distinct(blocks, ["problem"], doc_title=doc_title)
    sections = _pick_distinct(blocks, ["section"], doc_title=doc_title)

    if doc.doc_kind == "program":
        return [
            f"Какие темы курса «{doc_title}» самые важные для экзамена?",
            "Как основные разделы программы логически связаны между собой?",
            "С каких определений и теорем лучше начать повторение?",
        ]

    if doc.doc_kind == "theory":
        q1 = (
            f"Как связаны между собой ключевые теоремы по теме «{theorems_any[0]}» и соседние результаты?"
            if theorems_any
            else "Выстрой карту зависимостей между главными теоремами этого курса"
        )
        q2 = (
            f"Разбери по шагам доказательство: «{theorems_with_proof[0]}»"
            if theorems_with_proof
            else "Какие доказательства в этом списке теорем самые частые на экзамене?"
        )
        q3 = (
            f"Объясни на простом примере понятие «{definitions[0]}»"
            if definitions
            else "На какие типовые ловушки в формулировках определений стоит обратить внимание?"
        )
        return [q1, q2, q3]

    if doc.doc_kind == "prep":
        q1 = (
            f"Разбери идею решения задачи: «{problems[0]}»"
            if problems
            else f"Какие типовые приёмы решения задач нужны для «{doc_title}»?"
        )
        q2 = (
            f"Какие теоремы чаще всего применяются в задачах типа «{problems[1]}»?"
            if len(problems) > 1
            else "На какие частые ошибки в решениях стоит обратить внимание?"
        )
        q3 = (
            f"Дай похожую тренировочную задачу по теме «{sections[0]}» и подскажи первый шаг"
            if sections
            else "Собери короткий чек-лист формул и теорем перед работой"
        )
        return [q1, q2, q3]

    # Standard lecture
    questions: list[str] = []

    if theorems_with_proof:
        questions.append(f"Разбери по шагам доказательство: «{theorems_with_proof[0]}»")
    elif theorems_any:
        questions.append(f"Объясни смысл и применение: «{theorems_any[0]}»")
    elif sections:
        questions.append(f"Объясни ключевую идею раздела «{sections[0]}» простыми словами")
    else:
        questions.append(f"Объясни главную идею лекции «{doc_title}» простыми словами")

    if definitions:
        questions.append(f"Приведи наглядный пример и контрпример для «{definitions[0]}»")
    elif len(theorems_any) > 1:
        questions.append(f"Зачем нужна «{theorems_any[1]}» и где она используется дальше?")
    elif len(sections) > 1:
        questions.append(f"Приведи наглядный пример по теме «{sections[1]}»")
    else:
        questions.append("Приведи наглядный пример и контрпример по теме лекции")

    if len(theorems_with_proof) > 1:
        questions.append(f"Почему в «{theorems_with_proof[1]}» важны именно такие условия?")
    elif len(definitions) > 1:
        questions.append(f"В чём интуиция определения «{definitions[1]}»?")
    elif problems:
        questions.append(f"Подскажи идею решения задачи «{problems[0]}»")
    elif len(sections) > 2:
        questions.append(f"Как тема «{sections[2]}» связана с предыдущими лекциями?")
    else:
        questions.append("Как эта лекция связана с предыдущими и следующими темами курса?")

    return questions[:3]


def main() -> None:
    docs, blocks, _refs = collect_corpus(ROOT)
    by_doc: dict[str, list[IndexedBlock]] = {}
    for b in blocks:
        by_doc.setdefault(f"{b.course}/{b.doc_id}", []).append(b)

    result: dict[str, list[str]] = {}
    for doc in sorted(docs, key=lambda d: (d.course, d.doc_kind, d.order_index, d.doc_id)):
        key = f"{doc.course}/{doc.doc_id}"
        result[key] = _questions_for_doc(doc, by_doc.get(key, []))

    OUTPUT_PATH.write_text(
        json.dumps(result, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Wrote {len(result)} suggestion sets to {OUTPUT_PATH.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
