"""Проверки конспекта лекции (notes/<course>/NN_mmmDD_slug.md)."""

from __future__ import annotations

import datetime as dt
import re
from pathlib import Path
from typing import Any

import build
from lint_common import (
    EQ_LABEL_RE,
    PREFIX,
    Labels,
    Meta,
    Node,
    Report,
    ast_of,
    check_cite,
    check_div_classes,
    check_math,
    check_practice,
    check_stray_dollar,
    check_tag,
    check_texts,
    split_sections,
    walk,
)

MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
FILE_RE = re.compile(r"^(\d{2})_([a-z]{3})(\d{2})_([a-z0-9]+(?:_[a-z0-9]+){0,2})$")
LABEL_RE = re.compile(r"^(def|ax|thm|lem|prop|cor|ex|rem|prob|fig|eq|sec):lec(\d{2}):[a-z0-9][a-z0-9-]*$")
REQUIRED_META = ["course", "lecture", "date", "title"]
SUMMARY_ITEMS = range(3, 9)  # «Итоги»: 3–8 пунктов


def check_name_and_date(
    rep: Report, rel: str, path: Path, meta: Meta, cfg: dict[str, Any], course: str
) -> None:
    m = FILE_RE.match(path.stem)
    date = meta.get("date")
    if isinstance(date, str):
        try:
            date = dt.date.fromisoformat(date)
        except ValueError:
            rep.err(rel, f"date={date!r} не в формате YYYY-MM-DD")
            date = None
    lecture = meta.get("lecture")
    if not m:
        rep.err(rel, "имя файла не по схеме {NN}_{mmmDD}_{slug}.md (slug — 1–3 английских слова через _)")
    else:
        nn, mon, day, _ = m.groups()
        if lecture is not None and int(nn) != int(lecture):
            rep.err(rel, f"номер в имени файла {nn} ≠ lecture: {lecture}")
        if isinstance(date, dt.date) and (MONTHS[date.month - 1] != mon or date.day != int(day)):
            rep.err(rel, f"mmmDD в имени ({mon}{day}) не совпадает с date: {date}")
    if isinstance(date, dt.date):
        exc = cfg.get("date_exceptions", {}).get(course, {})
        if date.weekday() != cfg["courses"][course]["weekday"] and date.isoformat() not in exc:
            rep.err(
                rel,
                f"{date} — не день лекции курса (weekday={date.weekday()}); "
                "перенос оформи в templates/courses.json → date_exceptions",
            )


def check_sections(rep: Report, rel: str, blocks: list[Node], has_practice: bool) -> dict[str, list[Node]]:
    """Обязательные разделы и их содержимое; возвращает разделы верхнего уровня по названию."""
    required = ["Контекст", "После прочтения ты сможешь", "Теория"]
    if has_practice:
        required.append("Практика")
    required.append("Итоги")
    sections = split_sections(blocks)
    names = [s[0] for s in sections]
    for r in required:
        if r not in names:
            rep.err(rel, f"нет раздела «# {r}»")
    order = [n for n in names if n in required]
    if order != [r for r in required if r in names]:
        rep.err(rel, f"разделы не в порядке скелета: {order}")
    for gone in ("Глоссарий", "Самопроверка"):
        if gone in names:
            rep.err(
                rel,
                f"раздела «# {gone}» больше нет: термины находит поиск, себя проверяют задачами «Практики»",
            )
    sec = dict(sections)

    if "Итоги" in sec:
        lists = [b for b in sec["Итоги"] if b["t"] == "BulletList"]
        n = len(lists[0]["c"]) if lists else 0
        if n not in SUMMARY_ITEMS:
            rep.warn(rel, f"в итогах {n} пунктов, нужно 3–8")
    if "После прочтения ты сможешь" in sec:
        lists = [b for b in sec["После прочтения ты сможешь"] if b["t"] in ("BulletList", "OrderedList")]
        skills = len(lists[0]["c"] if lists[0]["t"] == "BulletList" else lists[0]["c"][1]) if lists else 0
        if skills == 0:
            rep.err(rel, "«После прочтения ты сможешь» — нужен список навыков")
    return sec


def _check_removed_fields(rep: Report, rel: str, meta: Meta) -> None:
    for k in ("basis", "based_on"):
        if k in meta:
            rep.err(rel, f"поле {k} больше не используется: убери его из front matter")


def _check_synced(rep: Report, rel: str, meta: Meta) -> None:
    if "synced" not in meta:
        return
    synced = meta["synced"]
    valid = (
        isinstance(synced, list)
        and synced
        and all(isinstance(v, str) and v in build.SYNCED_PARTS for v in synced)
        and len(set(synced)) == len(synced)
        and "lecture" in synced
    )
    if not valid:
        rep.err(
            rel,
            f"synced={synced!r}: допустимо synced: [lecture] или synced: [lecture, seminars] "
            "(сверка с семинарами — только вместе с лекцией); не сверено — убери поле",
        )


def _check_block(rep: Report, rel: str, n: Node, lec_nn: str | None) -> None:
    (ident, classes, kv), _ = n["c"]
    kinds = [c for c in classes if c in PREFIX]
    if not check_div_classes(rep, rel, classes):
        return
    if kinds and ident:
        lm = LABEL_RE.match(ident)
        if not lm:
            rep.err(rel, f"метка {ident} не по схеме тип:lecNN:slug")
        else:
            if lm.group(1) != PREFIX[kinds[0]]:
                rep.err(rel, f"метка {ident}: для {kinds[0]} префикс {PREFIX[kinds[0]]}:")
            if lec_nn and lm.group(2) != lec_nn:
                rep.err(rel, f"метка {ident}: номер лекции lec{lm.group(2)}, а это лекция {lec_nn}")
    tag = dict(kv).get("tag")
    if tag is not None and (not kinds or kinds[0] != "remark"):
        rep.err(rel, "tag= бывает только у remark")
    check_tag(rep, rel, tag)


def _check_tikz(rep: Report, rel: str, n: Node) -> None:
    (ident, classes, kv), code = n["c"]
    if "tikz" not in classes:
        return
    if not dict(kv).get("caption"):
        rep.err(rel, "у рисунка нет caption=")
    if not ident:
        rep.warn(rel, "у рисунка нет метки #fig:lecNN:…: на него нельзя сослаться по номеру")
    elif not LABEL_RE.match(ident) or not ident.startswith("fig:"):
        rep.err(rel, f"метка рисунка {ident} не по схеме fig:lecNN:slug")
    if "\\begin{tikzpicture}" not in code:
        rep.err(rel, "блок tikz должен содержать \\begin{tikzpicture}…\\end{tikzpicture}")


def _check_node(rep: Report, rel: str, n: Node, course_labels: dict[str, Any], lec_nn: str | None) -> None:
    t = n["t"]
    if t == "Div":
        _check_block(rep, rel, n, lec_nn)
    elif t == "CodeBlock":
        _check_tikz(rep, rel, n)
    elif t == "Header":
        ident = n["c"][1][0]
        if ident.startswith("sec:") and not LABEL_RE.match(ident):
            rep.err(rel, f"метка раздела {ident} не по схеме sec:lecNN:slug")
    elif t == "Math":
        check_math(rep, rel, n["c"][1])
    elif t == "Cite":
        check_cite(rep, rel, n, course_labels)
    elif t == "Str" and "$" in n["c"] and not n["c"].startswith("{#eq:"):
        check_stray_dollar(rep, rel, n["c"], " (пробел у $ внутри или непарный $)")
    elif t == "Str" and EQ_LABEL_RE.fullmatch(n["c"]):
        if not LABEL_RE.match(n["c"][2:-1]):
            rep.err(rel, f"метка формулы {n['c']} не по схеме eq:lecNN:slug")
    elif t == "Image":
        rep.err(rel, "картинки-файлы в конспекте запрещены: рисунки — только ```tikz")


def lint_notes(path: Path, rel: str, cfg: dict[str, Any], labels: Labels, rep: Report) -> None:
    meta = build.read_front_matter(path)
    course = path.parent.name
    for k in REQUIRED_META:
        if meta.get(k) in (None, ""):
            rep.err(rel, f"в front matter нет поля {k}")
    if meta.get("course") != course:
        rep.err(rel, f"course={meta.get('course')!r}, а файл лежит в notes/{course}/")
    if course not in cfg["courses"]:
        rep.err(rel, f"неизвестный курс {course}")
        return
    _check_removed_fields(rep, rel, meta)
    check_name_and_date(rep, rel, path, meta, cfg, course)
    _check_synced(rep, rel, meta)

    lecture = meta.get("lecture")
    lec_nn = f"{int(lecture):02d}" if isinstance(lecture, int) else None
    blocks = ast_of(path)["blocks"]
    sec = check_sections(rep, rel, blocks, cfg["courses"][course]["has_practice"])

    course_labels = labels.get(course, {})
    walk(blocks, lambda n: _check_node(rep, rel, n, course_labels, lec_nn))
    check_texts(rep, rel, blocks)
    if "Практика" in sec:
        check_practice(rep, rel, sec["Практика"])
