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


def _fill(primary: list[str], fallback: list[str], size: int = 6) -> list[str]:
    """Returns `size` distinct questions: tailored ones first, then generic fallbacks."""
    out: list[str] = []
    for q in [*primary, *fallback]:
        if q not in out:
            out.append(q)
        if len(out) == size:
            break
    return out


_LECTURE_FALLBACK = [
    "Объясни ключевую идею этого материала простыми словами",
    "Какие типичные ошибки студентов по этой теме?",
    "Дай три задачи по теме от простой к сложной, без решений",
    "Проверь меня: задай 5 коротких вопросов по этой лекции",
    "Как эта лекция связана с предыдущими и следующими темами курса?",
    "Что из этой лекции чаще всего спрашивают на экзамене?",
]
_THEORY_FALLBACK = [
    "Какие доказательства из списка чаще всего просят на экзамене?",
    "Как быстро выучить доказательства: с чего начать и что можно пропустить?",
    "Спроси меня формулировку случайной теоремы и проверь ответ",
    "Какие теоремы легко перепутать и чем они отличаются?",
    "Какие определения здесь самые коварные и почему?",
    "Выстрой карту зависимостей между главными теоремами курса",
]
_PROGRAM_FALLBACK = [
    "Как основные разделы программы логически связаны между собой?",
    "С каких определений и теорем лучше начать повторение?",
    "Составь расписание повторения программы за 7 дней",
    "Какие темы программы обычно вызывают больше всего вопросов?",
    "Какие темы можно учить параллельно, а какие строго по порядку?",
    "Какие темы самые важные для экзамена?",
]
_PREP_FALLBACK = [
    "Какие типовые приёмы нужны для задач этой работы?",
    "На какие частые ошибки в решениях стоит обратить внимание?",
    "Собери короткий чек-лист формул и теорем перед работой",
    "Дай похожую тренировочную задачу и подскажи только первый шаг",
    "Как распределить время на работе и с каких задач начинать?",
    "Проверь моё решение: я пришлю его, а ты найдёшь пробелы",
]


def _nth(items: list[str], i: int) -> str | None:
    return items[i] if len(items) > i else None


def _questions_for_doc(doc: IndexedDocument, blocks: list[IndexedBlock]) -> list[str]:
    doc_title = _clean_topic(doc.title)
    thm_kinds = ["theorem", "lemma", "proposition", "corollary"]
    proofs = _pick_distinct(blocks, thm_kinds, doc_title=doc_title, require_proof=True)
    thms = _pick_distinct(blocks, thm_kinds, doc_title=doc_title)
    defs = _pick_distinct(blocks, ["definition"], doc_title=doc_title)
    problems = _pick_distinct(blocks, ["problem"], doc_title=doc_title)
    sections = _pick_distinct(blocks, ["section"], doc_title=doc_title)

    def tpl(items: list[str], i: int, fmt: str) -> list[str]:
        t = _nth(items, i)
        return [fmt.format(t)] if t else []

    if doc.doc_kind == "program":
        primary = [f"Какие темы курса «{doc_title}» самые важные для экзамена?"]
        primary += tpl(sections, 0, "Что нужно знать по теме «{}» на экзамене?")
        primary += tpl(defs, 0, "Какие определения по теме «{}» нужно знать наизусть?")
        return _fill(primary, _PROGRAM_FALLBACK)

    if doc.doc_kind == "theory":
        primary = tpl(thms, 0, "Как связаны ключевые теоремы по теме «{}» и соседние результаты?")
        primary += tpl(proofs, 0, "Разбери по шагам доказательство: «{}»")
        primary += tpl(defs, 0, "Объясни на простом примере понятие «{}»")
        primary += tpl(proofs, 1, "Какая главная идея в доказательстве «{}»?")
        primary += tpl(thms, 2, "Где применяется «{}» и какие условия нельзя убирать?")
        return _fill(primary, _THEORY_FALLBACK)

    if doc.doc_kind == "prep":
        primary = tpl(problems, 0, "Разбери идею решения задачи: «{}»")
        primary += tpl(problems, 1, "Какие теоремы чаще всего применяются в задачах типа «{}»?")
        primary += tpl(sections, 0, "Дай похожую тренировочную задачу по теме «{}» и подскажи первый шаг")
        primary += tpl(problems, 2, "Какие типичные ошибки бывают в задаче «{}»?")
        primary += tpl(defs, 0, "Какие факты про «{}» пригодятся в этой работе?")
        return _fill(primary, _PREP_FALLBACK)

    # Standard lecture
    primary = []
    if proofs:
        primary.append(f"Разбери по шагам доказательство: «{proofs[0]}»")
    elif thms:
        primary.append(f"Объясни смысл и применение: «{thms[0]}»")
    elif sections:
        primary.append(f"Объясни ключевую идею раздела «{sections[0]}» простыми словами")
    else:
        primary.append(f"Объясни главную идею лекции «{doc_title}» простыми словами")
    primary += tpl(defs, 0, "Приведи наглядный пример и контрпример для «{}»")
    primary += tpl(proofs, 1, "Почему в «{}» важны именно такие условия?")
    primary += tpl(defs, 1, "В чём интуиция определения «{}»?")
    primary += tpl(problems, 0, "Подскажи идею решения задачи «{}»")
    primary += tpl(thms, 1, "Зачем нужна «{}» и где она используется дальше?")
    primary += tpl(sections, 1, "Приведи наглядный пример по теме «{}»")
    primary += tpl(sections, 2, "Как тема «{}» связана с предыдущими лекциями?")
    primary += tpl(defs, 2, "Какие частые ошибки в понимании «{}»?")
    primary += tpl(problems, 1, "Дай подсказку, с чего начать задачу «{}», не раскрывая решения")
    return _fill(primary, _LECTURE_FALLBACK)


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
