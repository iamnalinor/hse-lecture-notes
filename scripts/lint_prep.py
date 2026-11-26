"""Проверки подготовки к КР, коллоквиуму, экзамену или квизу и банка билетов рядом с ней."""

from __future__ import annotations

import datetime as dt
import re
from pathlib import Path
from typing import Any

import build
import ticket_bank
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
    headings,
    is_h1,
    text_of_block,
    walk,
)

# средняя часть — id страницы: kr1, colloq1, quiz-o-symbols (дефисы в ней однозначны: разделитель — «:»)
PREP_LABEL_RE = re.compile(
    r"^(ex|rem|prob|fig|eq|sec):((?:kr|colloq|exam)\d+|quiz-[a-z0-9][a-z0-9-]*):[a-z0-9][a-z0-9-]*$"
)
TYPE_OF_PREFIX = {v: k for k, v in PREFIX.items()} | {"fig": "figure", "eq": "equation", "sec": "section"}
ISO_DATE_RE = re.compile(r"\d{4}-\d{2}-\d{2}")
PREP_GONE = re.compile(r"(Вопросы для самопроверки|Самопроверка|Блиц)", re.IGNORECASE)
EVENT_GENITIVE = {"colloq": "коллоквиума", "exam": "экзамена", "quiz": "квиза"}  # по умолчанию — КР
FIRST_SECTION = {"colloq": "О коллоквиуме", "exam": "Об экзамене", "quiz": "О квизе"}  # по умолчанию — КР


def _blank(value: object) -> bool:
    return value in (None, "")


def _parse_dates(rep: Report, rel: str, meta: Meta) -> dict[str, dt.date]:
    dates: dict[str, dt.date] = {}
    for k in ("date", "active_until", "highlight_from"):
        value = meta.get(k)
        if _blank(value):
            continue
        # сайт сравнивает даты как строки, поэтому только YYYY-MM-DD: ни 20261023, ни время
        if type(value) is dt.date:
            dates[k] = value
        elif isinstance(value, str) and ISO_DATE_RE.fullmatch(value):
            try:
                dates[k] = dt.date.fromisoformat(value)
            except ValueError:
                rep.err(rel, f"{k}={value!r}: такой даты нет")
        else:
            rep.err(rel, f"{k}={value!r} не в формате YYYY-MM-DD")
    return dates


def _check_dates(rep: Report, rel: str, meta: Meta, event: str) -> None:
    dates = _parse_dates(rep, rel, meta)
    if _blank(meta.get("date")):
        for k in ("active_until", "highlight_from"):
            if not _blank(meta.get(k)):
                rep.err(rel, f"{k} без date: у неактивной подготовки (без даты) дней активности нет")
    if "date" in dates and "active_until" in dates and dates["active_until"] < dates["date"]:
        rep.err(rel, f"active_until={dates['active_until']} раньше даты {event} {dates['date']}")
    # выделение цветом на сайте идет с highlight_from до последнего активного дня включительно
    last_day = dates.get("active_until") or dates.get("date")
    if "highlight_from" in dates and last_day is not None and dates["highlight_from"] > last_day:
        rep.err(
            rel,
            f"highlight_from={dates['highlight_from']} позже последнего дня {event} {last_day}"
            " (active_until, по умолчанию date)",
        )


def _check_quiz_fields(rep: Report, rel: str, meta: Meta, kind: str) -> None:
    # номер квиза — из таблицы планирования курса, его имя на сайте («Квиз 4»); тема — в скобках
    if kind == "quiz" and _blank(meta.get("quiz_topic")):
        rep.err(rel, "в front matter нет поля quiz_topic (тема квиза: на сайте «Квиз 4 (<тема>)»)")
    elif kind != "quiz" and not _blank(meta.get("quiz_topic")):
        rep.err(rel, "поле quiz_topic — только у квиза (prep/<course>/quiz-<slug>.md)")
    number = meta.get("quiz_number")
    if kind == "quiz":
        if type(number) is not int or number < 1:
            rep.err(
                rel,
                "quiz_number — обязательное целое число > 0 (номер квиза из таблицы планирования context/courses/<курс>.md)",
            )
    elif not _blank(number):
        rep.err(rel, "поле quiz_number — только у квиза (prep/<course>/quiz-<slug>.md)")


def _own_labels(blocks: list[Node]) -> set[str]:
    """Метки, объявленные на самой странице подготовки."""
    own: set[str] = set()

    def collect(n: Node) -> None:
        if n["t"] in ("Div", "CodeBlock", "Header"):
            ident = n["c"][0][0] if n["t"] != "Header" else n["c"][1][0]
            if ident:
                own.add(ident)
        elif n["t"] == "Str" and EQ_LABEL_RE.fullmatch(n["c"]):
            own.add(n["c"][2:-1])

    walk(blocks, collect)
    return own


class _PrepNodeChecker:
    """Проверки узлов страницы подготовки: метки вида тип:<exam>:slug, ref= на конспекты, формулы."""

    def __init__(
        self, rep: Report, rel: str, exam: str, course_labels: dict[str, Any], own: set[str]
    ) -> None:
        self.rep, self.rel, self.exam, self.course_labels = rep, rel, exam, course_labels
        self.known = {**course_labels, **dict.fromkeys(own, True)}

    def check_label(self, ident: str, kind: str | None = None) -> None:
        lm = PREP_LABEL_RE.match(ident)
        if not lm:
            self.rep.err(
                self.rel, f"метка {ident} не по схеме тип:{self.exam}:slug (тип: ex, rem, prob, fig, eq, sec)"
            )
        elif lm.group(2) != self.exam:
            self.rep.err(self.rel, f"метка {ident}: в файле {self.exam}.md метки вида тип:{self.exam}:slug")
        elif kind and lm.group(1) != PREFIX.get(kind):
            self.rep.err(self.rel, f"метка {ident}: для {kind} префикс {PREFIX.get(kind)}:")

    def check_block(self, n: Node) -> None:
        (ident, classes, kv), _ = n["c"]
        attrs = dict(kv)
        kinds = [c for c in classes if c in PREFIX]
        if not check_div_classes(self.rep, self.rel, classes):
            return
        ref = attrs.get("ref")
        if ref:
            if ref not in self.course_labels:
                self.rep.err(self.rel, f"ref={ref} не найден в конспектах курса")
        elif kinds and kinds[0] not in ("example", "remark", "problem"):
            self.rep.err(
                self.rel, f"блок {kinds[0]} без ref=: новые определения и теоремы — только в конспектах"
            )
        elif kinds and ident:
            self.check_label(ident, kinds[0])
        check_tag(self.rep, self.rel, attrs.get("tag"))

    def check_node(self, n: Node) -> None:
        t = n["t"]
        if t == "Div":
            self.check_block(n)
        elif t == "CodeBlock" and "tikz" in n["c"][0][1]:
            if not dict(n["c"][0][2]).get("caption"):
                self.rep.err(self.rel, "у рисунка нет caption=")
            if n["c"][0][0]:
                self.check_label(n["c"][0][0])
        elif t == "Header":
            ident = n["c"][1][0]
            if ident.startswith("sec:"):
                self.check_label(ident)
        elif t == "Math":
            check_math(self.rep, self.rel, n["c"][1])
        elif t == "Cite":
            check_cite(self.rep, self.rel, n, self.known)
        elif t == "Str" and "$" in n["c"] and not n["c"].startswith("{#eq:"):
            check_stray_dollar(self.rep, self.rel, n["c"])
        elif t == "Str" and EQ_LABEL_RE.fullmatch(n["c"]):
            self.check_label(n["c"][2:-1])
        elif t == "Image":
            self.rep.err(self.rel, "картинки-файлы запрещены: рисунки — только ```tikz")


def _has_ticket_subsection(blocks: list[Node]) -> bool:
    """В разделе «# Билеты» есть хотя бы один билет уровня «## »."""
    in_tickets = False
    for b in blocks:
        if is_h1(b):
            if in_tickets:
                return False
            in_tickets = text_of_block(b).strip() == "Билеты"
        elif in_tickets and b["t"] == "Header" and b["c"][0] == 2:
            return True
    return False


def _check_outline(rep: Report, rel: str, blocks: list[Node], kind: str) -> None:
    h1, h2 = headings(blocks, 1), headings(blocks, 2)
    first = FIRST_SECTION.get(kind, "О контрольной")
    if not h1 or h1[0] != first:
        rep.err(rel, f"первый раздел — «# {first}»")
    # себя проверяют генератором билетов (context/prompts/prep.md → «На странице нет»)
    for title in h1 + h2:
        if PREP_GONE.match(title):
            rep.err(rel, f"раздела «{title}» на странице подготовки нет: тренируются генератором билетов")
    # коллоквиум — устная теория: «# Билеты» (новая схема) или «## Что нужно знать» (старая)
    # экзамен — «# Билеты» и/или «# Задачи»; КР/квиз — «# Задачи» (новая схема) или «## Прототипы» (старая)
    if kind == "colloq" and "Билеты" not in h1 and "Что нужно знать" not in h2:
        rep.err(rel, "нет ни раздела «# Билеты», ни подраздела «## Что нужно знать»")
    elif kind == "exam" and "Билеты" not in h1 and "Задачи" not in h1:
        rep.err(rel, "нет ни раздела «# Билеты», ни раздела «# Задачи»")
    elif kind not in ("colloq", "exam") and "Задачи" not in h1 and "Прототипы" not in h2:
        rep.err(rel, "нет задач: ни раздела «# Задачи», ни одного подраздела «## Прототипы»")
    if "Билеты" in h1 and not _has_ticket_subsection(blocks):
        rep.err(rel, "в разделе «# Билеты» нет ни одного билета уровня «## »")


def _check_generator_section(
    rep: Report, rel: str, path: Path, exam: str, blocks: list[Node], own: set[str]
) -> None:
    """На сайте генератор встает в раздел {#sec:<prep>:generator}; в PDF этот раздел — ссылка на сайт."""
    generator = f"sec:{exam}:{ticket_bank.GENERATOR_SECTION}"
    has_bank = ticket_bank.bank_path(path).exists()
    if has_bank and generator not in own:
        rep.err(
            rel, f"у страницы есть банк билетов, но нет раздела {{#{generator}}}: генератору негде встать"
        )
    elif has_bank:
        last_id = [b["c"][1][0] for b in blocks if is_h1(b)][-1]
        if last_id != generator:
            # «Источники» (context/prompts/facts.md, п. 7) — перед генератором: он последний и на сайте
            rep.warn(
                rel, f"раздел {{#{generator}}} — последний на странице; «Источники» и остальное — перед ним"
            )
    elif generator in own:
        rep.err(
            rel,
            f"раздел {{#{generator}}} без банка {ticket_bank.bank_path(path).name}: на сайте он будет пустым",
        )


def lint_prep(path: Path, rel: str, cfg: dict[str, Any], labels: Labels, rep: Report) -> None:
    """Подготовка к КР, коллоквиуму, экзамену или квизу (prep/<course>/krN.md, colloqN.md, examN.md, quiz-<slug>.md).

    Свои метки prob:krN:… (prob:colloqN:…, prob:examN:…, prob:quiz-<slug>:…), теория — ref= на блоки конспектов.
    """
    meta = build.read_front_matter(path)
    course, exam = path.parent.name, path.stem
    # date можно не ставить: событие еще не объявлено — страница есть, но неактивна (сайт: без дня,
    # без цвета, не на главной); тогда active_until и highlight_from не к чему привязать
    for k in ("course", "title"):
        if _blank(meta.get(k)):
            rep.err(rel, f"в front matter нет поля {k}")
    if meta.get("course") != course:
        rep.err(rel, f"course={meta.get('course')!r}, а файл лежит в prep/{course}/")
    if course not in cfg["courses"]:
        rep.err(rel, f"неизвестный курс {course}")
        return
    if exam not in build.PREP_IDS:
        rep.err(rel, f"имя файла подготовки — {build.PREP_FILES} (маршруты сайта)")
    kind = build.prep_kind(exam)
    _check_quiz_fields(rep, rel, meta, kind)
    _check_dates(rep, rel, meta, EVENT_GENITIVE.get(kind, "КР"))

    blocks = ast_of(path)["blocks"]
    own = _own_labels(blocks)
    course_labels = labels.get(course, {})
    walk(blocks, _PrepNodeChecker(rep, rel, exam, course_labels, own).check_node)
    check_texts(rep, rel, blocks)
    check_practice(rep, rel, blocks)
    _check_outline(rep, rel, blocks, kind)
    lint_bank(path, course, exam, labels, own, rep)
    _check_generator_section(rep, rel, path, exam, blocks, own)


class NotesProofs:
    """Идет ли за блоком конспекта `::: proof` — сайт покажет его в ответе генератора билетов.

    Как `extractBlock` на сайте: после блока пропускаются абзацы, поиск останавливается на следующем
    нумерованном блоке или заголовке.
    """

    def __init__(self, course_labels: dict[str, Any]) -> None:
        self.labels = course_labels
        self.asts: dict[str, list[Node]] = {}

    def has_proof(self, label: str) -> bool:
        entry = self.labels.get(label)
        if entry is None:
            return False
        file = entry["file"]
        if file not in self.asts:
            self.asts[file] = ast_of(build.SRC / file)["blocks"]
        return bool(proof_after(self.asts[file], label))


def proof_after(blocks: list[Node], label: str) -> bool | None:
    for i, b in enumerate(blocks):
        if b["t"] != "Div":
            continue
        (ident, _, _), content = b["c"]
        if ident == label:
            for nxt in blocks[i + 1 :]:
                if nxt["t"] == "Header":
                    return False
                if nxt["t"] == "Div":
                    classes = nxt["c"][0][1]
                    if "proof" in classes:
                        return True
                    if any(c in PREFIX for c in classes):
                        return False
            return False
        found = proof_after(content, label)
        if found is not None:
            return found
    return None


def _check_bank_snippet(rep: Report, where: str, snippet: Node, known: dict[str, Any]) -> None:
    def check_node(n: Node) -> None:
        t = n["t"]
        if t == "Math":
            check_math(rep, where, n["c"][1])
        elif t == "Cite":
            check_cite(rep, where, n, known)
        elif t == "Str" and "$" in n["c"]:
            check_stray_dollar(rep, where, n["c"])
        elif t in ("Header", "Div", "CodeBlock", "Image", "Table"):
            rep.err(where, f"{t} в тексте вопроса: здесь только абзацы, списки и формулы")

    walk(snippet["c"][1], check_node)
    check_texts(rep, where, snippet["c"][1])


def lint_bank(path: Path, course: str, exam: str, labels: Labels, own: set[str], rep: Report) -> None:
    """Банк билетов `<prep>-bank.yaml` рядом со страницей (context/markup.md §11): схема, метки, формулы."""
    bank_file = ticket_bank.bank_path(path)
    if not bank_file.exists():
        return
    rel = bank_file.relative_to(build.SRC).as_posix()
    try:
        bank = ticket_bank.load(bank_file)
    except ticket_bank.BankError as e:
        rep.err(rel, str(e))
        return
    own_types = {i: TYPE_OF_PREFIX[i.split(":")[0]] for i in own if PREP_LABEL_RE.match(i)}
    course_labels = labels.get(course, {})
    errors, warnings = ticket_bank.check_schema(bank, exam, ticket_bank.Labels(course_labels, own_types))
    for e in errors:
        rep.err(rel, e)
    for w in warnings:
        rep.warn(rel, w)
    known = {**course_labels, **dict.fromkeys(own_types, True)}
    ast = ticket_bank.snippet_ast(ticket_bank.snippets_markdown(bank), build.MARKDOWN)
    for e in ticket_bank.check_snippets(ast):
        rep.err(rel, e)
    if not errors:
        for e in ticket_bank.missing_proofs(bank, exam, NotesProofs(course_labels).has_proof):
            rep.err(rel, e)
    for snippet in ast["blocks"]:
        if snippet["t"] == "Div":
            where = f"{rel} ({snippet['c'][0][0].replace('--', ': ')})"
            _check_bank_snippet(rep, where, snippet, known)
