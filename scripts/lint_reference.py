"""Проверки справочных страниц курса: теория (theory/<course>.md) и план учебной дисциплины (program/<course>.md)."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

import build
from lint_common import (
    Labels,
    Node,
    Report,
    ast_of,
    check_cite,
    check_math,
    check_stray_dollar,
    check_tag,
    check_texts,
    headings,
    is_h1,
    iter_nodes,
    stringify,
    text_of_block,
    walk,
    without_math,
)

# Теория курса — справочник для повторения (context/prompts/theory.md): разделы «# N. Тема» по
# лекциям, определения абзацем с термином в начале, без ссылок в конспекты и «доказано в лекции N»
THEORY_HEADING = re.compile(r"(\d+)\. \S")
THEORY_HEADING_MAX = 60
THEORY_FIRST = "Соглашения курса"
THEORY_BLOCKS = {"definition", "axiom", "theorem", "lemma", "proposition", "corollary"}
THEORY_STATUSES = (
    "без доказательства",
    "доказательство — на семинаре",
    "на лекции не доказывалось",
    "на лекции — только идея",
    "набросок доказательства",
)


def _check_theory_heading(rep: Report, rel: str, block: Node, lecture: int | None) -> int | None:
    """Номер лекции, под которым идут следующие блоки."""
    title = stringify(block["c"][2])
    if title == THEORY_FIRST:
        return None
    m = THEORY_HEADING.match(title)
    if not m:
        rep.err(rel, f"заголовок теории «{title}»: нужен вид «N. Тема», N — номер лекции")
        return lecture
    if len(title) > THEORY_HEADING_MAX:
        rep.err(
            rel,
            f"заголовок «{title}» длиннее {THEORY_HEADING_MAX} символов: тема, а не оглавление лекции",
        )
    return int(m.group(1))


def _check_theory_block(
    rep: Report, rel: str, block: Node, course_labels: dict[str, Any], lecture: int | None
) -> None:
    classes, attrs = block["c"][0][1], dict(block["c"][0][2])
    ref = attrs.get("ref")
    if not ref or not set(classes) & THEORY_BLOCKS:
        rep.err(
            rel,
            f"блок {classes or attrs}: в теории только определения и утверждения с ref= — примеры и замечания живут в конспектах",
        )
    if not ref:
        return
    if ref not in course_labels:
        rep.err(rel, f"ref={ref} не найден в конспектах курса")
    m = re.search(r":lec(\d+):", ref)
    if m and lecture is not None and int(m.group(1)) != lecture:
        rep.err(rel, f"ref={ref} из лекции {int(m.group(1))} стоит в разделе «{lecture}. …»")
    status = attrs.get("status")
    if status is not None and status not in THEORY_STATUSES:
        allowed = ", ".join(f"«{x}»" for x in THEORY_STATUSES)
        rep.err(
            rel,
            f"{ref}: status=«{status}» — доказано на лекции пишется без status=, иначе одно из: {allowed}",
        )
    if "definition" in classes:
        first = block["c"][1][0] if block["c"][1] else None
        inl = first["c"] if first and first["t"] in ("Para", "Plain") else []
        if not inl or inl[0]["t"] != "Strong":
            rep.err(rel, f"{ref}: определение начинается с термина жирным: «**Термин** — …»")


def lint_theory(path: Path, rel: str, labels: Labels, rep: Report) -> None:
    meta = build.read_front_matter(path)
    course = path.stem
    if meta.get("course") != course:
        rep.err(rel, f"course={meta.get('course')!r}, а файл theory/{course}.md")
    course_labels = labels.get(course, {})
    lecture = None  # номер из заголовка «# N. Тема», под которым идут блоки

    def check_inline(n: Node) -> None:
        if n["t"] == "Cite":
            rep.err(
                rel, "теория — без ссылок: номер блока уже совпадает с конспектом, лекцию видно по разделу"
            )
        elif n["t"] == "Math":
            check_math(rep, rel, n["c"][1])

    for b in ast_of(path)["blocks"]:
        if is_h1(b):
            lecture = _check_theory_heading(rep, rel, b, lecture)
        elif b["t"] == "Div":
            _check_theory_block(rep, rel, b, course_labels, lecture)
        walk(b, check_inline)


PROGRAM_META = {"course", "title"}
PROGRAM_BLOCKS = {"remark"}  # без примеров расчета: страница — справочник (решение владельца)
PROGRAM_FIRST, PROGRAM_LAST, PROGRAM_SOURCES = "О курсе", "Содержание курса", "Источники"
# Страница программы — справочник, а не реферат о ПУД: без пометок источников, комментариев о самой
# программе и советов «уточнить у лектора» (context/prompts/program.md → «Как писать»)
PROGRAM_META_WORDS = re.compile(
    r"(уточн[а-я]* у лектора|в программе (?:прямо )?не|в программе сказано|по программе|судя по|"
    r"по wiki|на wiki|по каналу|по календарю|по таблице планирования|сумм[а-я]* весов|сноск|звездочк)",
    re.IGNORECASE,
)
PROGRAM_LABEL_PREFIXES = ("sec:", "def:", "thm:", "prob:", "rem:", "ex:")


def _check_program_block(rep: Report, rel: str, n: Node) -> None:
    (ident, classes, kv), _ = n["c"]
    kinds = [c for c in classes if c in PROGRAM_BLOCKS]
    if not kinds:
        rep.err(
            rel,
            f"блок ::: {{.{classes[0] if classes else '?'}}} в программе курса: можно только "
            f"{', '.join(sorted(PROGRAM_BLOCKS))}",
        )
    if ident or dict(kv).get("ref"):
        rep.err(rel, f"у блока {ident or dict(kv).get('ref')} метка: в программе блоки без меток и ref=")
    check_tag(rep, rel, dict(kv).get("tag"))


def _check_program_node(rep: Report, rel: str, n: Node, course_labels: dict[str, Any]) -> None:
    t = n["t"]
    if t == "Div":
        _check_program_block(rep, rel, n)
    elif t == "CodeBlock":
        rep.err(rel, "блок кода или рисунок в программе курса: здесь только текст, таблицы и формулы")
    elif t == "Image":
        rep.err(rel, "картинки-файлы запрещены")
    elif t == "Header" and n["c"][1][0].startswith(PROGRAM_LABEL_PREFIXES):
        rep.err(rel, f"метка {n['c'][1][0]} у заголовка: в программе своих меток нет")
    elif t == "Math":
        check_math(rep, rel, n["c"][1])
    elif t == "Cite":
        check_cite(rep, rel, n, course_labels)
    elif t == "Str" and "$" in n["c"]:
        check_stray_dollar(rep, rel, n["c"])


def _check_program_meta_words(rep: Report, rel: str, blocks: list[Node]) -> None:
    texts = [text_of_block(b) for b in blocks]
    texts += [dict(n["c"][0][2]).get("title", "") for n in iter_nodes(blocks) if n["t"] == "Div"]
    for text in texts:
        for mm in PROGRAM_META_WORDS.finditer(without_math(text)):
            rep.err(
                rel,
                f"«{mm.group(0)}»: на странице программы — только факты, без пометок источников "
                "и комментариев о самой программе (context/prompts/program.md)",
            )


def _check_program_outline(rep: Report, rel: str, blocks: list[Node]) -> None:
    h1 = headings(blocks, 1)
    if not h1 or h1[0] != PROGRAM_FIRST:
        rep.err(rel, f"первый раздел — «# {PROGRAM_FIRST}»")
    else:
        # «О курсе» — сводная таблица «параметр · значение» (лектор, объем, экзамен, порог, итог)
        first = next(i for i, b in enumerate(blocks) if is_h1(b))
        nxt = next((b for b in blocks[first + 1 :] if b["t"] != "Para" or text_of_block(b).strip()), None)
        if nxt is None or nxt["t"] != "Table":
            rep.err(rel, f"раздел «# {PROGRAM_FIRST}» — сводная таблица курса сразу под заголовком")
    tail = h1[-2:] if h1 and h1[-1] == PROGRAM_SOURCES else h1[-1:]
    if not tail or tail[0] != PROGRAM_LAST:
        rep.err(
            rel, f"последний раздел — «# {PROGRAM_LAST}» (за ним может идти только «# {PROGRAM_SOURCES}»)"
        )


def _check_program_links(rep: Report, rel: str, blocks: list[Node]) -> None:
    """Ссылки на первоисточники — только списком в «Источниках» (и профиль лектора в «О курсе»),
    не в тексте (context/prompts/facts.md)."""
    section = ""
    for b in blocks:
        if is_h1(b):
            section = text_of_block(b).strip()
        elif section not in (PROGRAM_FIRST, PROGRAM_SOURCES) and any(n["t"] == "Link" for n in iter_nodes(b)):
            rep.err(
                rel,
                f"ссылка в разделе «{section}»: ссылки на источники — только в «# {PROGRAM_SOURCES}» в конце",
            )
        elif section == PROGRAM_SOURCES and b["t"] != "BulletList":
            rep.err(rel, f"«# {PROGRAM_SOURCES}» — только список ссылок, по строке на источник")


def lint_program(path: Path, rel: str, cfg: dict[str, Any], labels: Labels, rep: Report) -> None:
    """План учебной дисциплины курса (program/<course>.md, context/markup.md §12).

    Справочная страница из ПУД: заголовки, абзацы, списки, таблицы, формулы, замечания
    без номеров и меток. Ни определений, ни задач, ни рисунков; ссылки — только на блоки конспектов.
    """
    meta = build.read_front_matter(path)
    course = path.stem
    for k in sorted(PROGRAM_META):
        if meta.get(k) in (None, ""):
            rep.err(rel, f"в front matter нет поля {k}")
    for k in sorted(set(meta) - PROGRAM_META):
        rep.err(
            rel, f"лишнее поле {k} в front matter: у программы курса только {', '.join(sorted(PROGRAM_META))}"
        )
    if course not in cfg["courses"]:
        rep.err(rel, f"неизвестный курс {course}: файл называется program/<course>.md")
        return
    if meta.get("course") != course:
        rep.err(rel, f"course={meta.get('course')!r}, а файл program/{course}.md")
    blocks = ast_of(path)["blocks"]

    course_labels = labels.get(course, {})
    walk(blocks, lambda n: _check_program_node(rep, rel, n, course_labels))
    check_texts(rep, rel, blocks)
    _check_program_meta_words(rep, rel, blocks)
    _check_program_outline(rep, rel, blocks)
    _check_program_links(rep, rel, blocks)
    if not any(b["t"] == "Table" for b in blocks):
        rep.warn(rel, "в программе нет ни одной таблицы: веса элементов контроля удобнее читать таблицей")
