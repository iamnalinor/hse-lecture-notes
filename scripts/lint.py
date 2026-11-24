"""Линтер конспектов, теории и программ курсов, подготовок к КР (разметка — context/markup.md, скелет — context/recommendations.md).

    uv run scripts/lint.py                 # все файлы
    uv run scripts/lint.py notes/algebra/04_sep23_determinant_properties.md
    uv run scripts/lint.py --strict        # предупреждения тоже валят проверку

Ошибки (ERROR) — нарушения схемы, которые ломают сборку, сайт или правила из context/.
Предупреждения (WARN) — то, что ревьюер должен посмотреть глазами.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

import pypandoc

try:
    from fontTools.ttLib import TTFont
except ImportError:  # pragma: no cover
    TTFont = None

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build  # noqa: E402
import curriculum  # noqa: E402
import ticket_bank  # noqa: E402

MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
FILE_RE = re.compile(r"^(\d{2})_([a-z]{3})(\d{2})_([a-z0-9]+(?:_[a-z0-9]+){0,2})$")
PREFIX = {
    "definition": "def",
    "axiom": "ax",
    "theorem": "thm",
    "lemma": "lem",
    "proposition": "prop",
    "corollary": "cor",
    "example": "ex",
    "remark": "rem",
    "problem": "prob",
}
AUX_DIVS = {"proof", "solution", "answers"}
# Блока «Ответ» больше нет: ответ — последней строкой решения («*Ответ:* …»).
GONE_DIVS = {"answer": "блока ::: answer больше нет: ответ пишется в конце решения строкой «*Ответ:* …»"}
TAGS = {"корнер-кейс", "подводный камень", "частое заблуждение", "соглашение курса", "напоминание"}
LABEL_RE = re.compile(r"^(def|ax|thm|lem|prop|cor|ex|rem|prob|fig|eq|sec):lec(\d{2}):[a-z0-9][a-z0-9-]*$")
REQUIRED_META = ["course", "lecture", "date", "title"]
TYPE_OF_PREFIX = {v: k for k, v in PREFIX.items()} | {"fig": "figure", "eq": "equation", "sec": "section"}
# средняя часть — id страницы: kr1, colloq1, quiz-o-symbols (дефисы в ней однозначны: разделитель — «:»)
PREP_LABEL_RE = re.compile(
    r"^(ex|rem|prob|fig|eq|sec):((?:kr|colloq|exam)\d+|quiz-[a-z0-9][a-z0-9-]*):[a-z0-9][a-z0-9-]*$"
)
ISO_DATE_RE = re.compile(r"\d{4}-\d{2}-\d{2}")

PIPELINE_WORDS = re.compile(
    r"(рекомендаци|ревью|ревьюер|чек-?лист|промпт|прошлогодн|режим[а-я]* генерац|"
    r"\bР\d{1,2}\b|сгенерирован|нейросет|\bLLM\b|прогнозн[а-я]* конспект|инстанци)",
    re.I,
)
SOFT_WORDS = re.compile(r"(очевидно|несложно|нетрудно|как известно|легко видеть|легко показать)", re.I)
FORBIDDEN_MATH = [
    (re.compile(r"\\boxed"), r"\boxed не рендерится в html-версии"),
    (re.compile(r"\\xrightarrow"), r"\xrightarrow запрещён (html, мобильные)"),
    (
        re.compile(r"\\begin\{array\}\{[^}]*\|"),
        "array с чертой запрещён: расширенная матрица — pmatrix с | отдельным столбцом",
    ),
    (re.compile(r"\\left\s*\(\s*\\begin\{array\}"), r"\left( вокруг array запрещено: используй pmatrix"),
    (
        re.compile(r"\\(?:re)?newcommand|\\def\b"),
        "макросы в тексте запрещены: общие макросы — templates/macros.tex",
    ),
]
TEXT_CMDS = re.compile(
    r"\\(?:text|textbf|textit|mbox|textrm|textsf|texttt|operatorname)\s*\{(?:[^{}]|\{[^{}]*\})*\}"
)


FONT_DIR = Path.home() / ".TinyTeX" / "texmf-dist" / "fonts" / "opentype" / "public" / "cm-unicode"


def text_glyphs() -> set[int] | None:
    """Символы, которые есть во всех начертаниях основного шрифта (CMU Serif); None — шрифт не найден."""
    if TTFont is None or not (FONT_DIR / "cmunrm.otf").exists():
        return None
    common: set[int] | None = None
    for name in ("cmunrm", "cmunti", "cmunbx"):
        cmap = set(TTFont(FONT_DIR / f"{name}.otf").getBestCmap())
        common = cmap if common is None else common & cmap
    return common


GLYPHS = text_glyphs()


@dataclass
class Report:
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    def err(self, path: str, msg: str) -> None:
        self.errors.append(f"{path}: ERROR: {msg}")

    def warn(self, path: str, msg: str) -> None:
        self.warnings.append(f"{path}: WARN: {msg}")


def stringify(inlines, code: bool = True) -> str:
    """Текст инлайнов; code=False — без `кода` (в нём законны «!», «!=» и т. п.)."""
    out = []

    def go(x):
        if isinstance(x, list):
            for y in x:
                go(y)
        elif isinstance(x, dict):
            t = x.get("t")
            c = x.get("c")
            if t == "Str":
                out.append(c)
            elif t in ("Space", "SoftBreak", "LineBreak"):
                out.append(" ")
            elif t == "Math":
                out.append("$" + c[1] + "$")
            elif t == "Code":
                if code:
                    out.append(c[1])
            elif t == "Cite":
                go(c[1])
            elif c is not None:
                go(c)

    go(inlines)
    return "".join(out)


def walk(node, fn):
    """Обходит AST pandoc-json, вызывая fn(node) для каждого элемента с полем t."""
    if isinstance(node, list):
        for x in node:
            walk(x, fn)
    elif isinstance(node, dict):
        if "t" in node:
            fn(node)
        for v in node.values():
            if isinstance(v, (list, dict)):
                walk(v, fn)


def iter_nodes(node) -> list[dict]:
    found: list[dict] = []
    walk(node, found.append)
    return found


def ast_of(path: Path) -> dict:
    return json.loads(pypandoc.convert_file(str(path), "json", format=build.MARKDOWN, extra_args=["--quiet"]))


def split_sections(blocks: list) -> list[tuple[str, list]]:
    sections: list[tuple[str, list]] = []
    current: tuple[str, list] | None = None
    for b in blocks:
        if b["t"] == "Header" and b["c"][0] == 1:
            current = (stringify(b["c"][2]).strip(), [])
            sections.append(current)
        elif current is not None:
            current[1].append(b)
    return sections


def text_of_block(b, code: bool = True) -> str:
    parts = []

    def fn(n):
        if n["t"] in ("Para", "Plain", "Header"):
            inl = n["c"][2] if n["t"] == "Header" else n["c"]
            parts.append(stringify(inl, code))

    walk(b, fn)
    return "\n".join(parts)


def check_math(rep: Report, rel: str, tex: str) -> None:
    for rx, msg in FORBIDDEN_MATH:
        if rx.search(tex):
            rep.err(rel, f"{msg}: ${tex[:60]}$")
    if re.search(r"\[-?@[a-z]+:lec", tex) or re.search(r"(?<![\\\w])@[a-z]+:lec\d", tex):
        rep.err(rel, f"ссылка @метка внутри формулы не разрешается — вынеси её за $…$: ${tex[:60]}$")
    stripped = TEXT_CMDS.sub("", tex)
    bad = sorted({ch for ch in stripped if ord(ch) > 127})
    if bad:
        rep.err(
            rel,
            f"не-ASCII символы в формуле ({''.join(bad)}): кириллица — только в \\text{{}}, "
            f"греческие буквы и знаки — командами (\\varepsilon, \\le): ${tex[:60]}$",
        )


def check_cite(rep: Report, rel: str, cite: dict, course_labels: dict) -> None:
    for c in cite["c"][0]:
        if c["citationId"] not in course_labels:
            rep.err(rel, f"ссылка @{c['citationId']} никуда не ведёт")


def check_name_and_date(rep: Report, rel: str, path: Path, meta: dict, cfg: dict, course: str) -> None:
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
        if isinstance(date, dt.date):
            if MONTHS[date.month - 1] != mon or date.day != int(day):
                rep.err(rel, f"mmmDD в имени ({mon}{day}) не совпадает с date: {date}")
    if isinstance(date, dt.date):
        exc = cfg.get("date_exceptions", {}).get(course, {})
        if date.weekday() != cfg["courses"][course]["weekday"] and date.isoformat() not in exc:
            rep.err(
                rel,
                f"{date} — не день лекции курса (weekday={date.weekday()}); "
                "перенос оформи в templates/courses.json → date_exceptions",
            )


def check_sections(rep: Report, rel: str, blocks: list, has_practice: bool) -> dict[str, list]:
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
            rep.err(rel, f"раздела «# {gone}» больше нет: термины находит поиск, себя проверяют задачами «Практики»")
    sec = dict(sections)

    if "Итоги" in sec:
        lists = [b for b in sec["Итоги"] if b["t"] == "BulletList"]
        n = len(lists[0]["c"]) if lists else 0
        if not 3 <= n <= 8:
            rep.warn(rel, f"в итогах {n} пунктов, нужно 3–8")
    skills = 0
    if "После прочтения ты сможешь" in sec:
        lists = [b for b in sec["После прочтения ты сможешь"] if b["t"] in ("BulletList", "OrderedList")]
        skills = len(lists[0]["c"] if lists[0]["t"] == "BulletList" else lists[0]["c"][1]) if lists else 0
        if skills == 0:
            rep.err(rel, "«После прочтения ты сможешь» — нужен список навыков")
    return sec


def check_texts(rep: Report, rel: str, blocks: list) -> None:
    """Тексты: служебные слова пайплайна, «очевидно», символы без глифа в шрифте, «!»."""
    # заголовок уходит в оглавление и индекс как «текст $формула$»: литеральный $ там не отличить
    for h in (n for n in iter_nodes(blocks) if n["t"] == "Header"):
        literal = (n for n in iter_nodes(h["c"][2]) if n["t"] in ("Str", "Code", "RawInline"))
        if any("$" in (n["c"] if n["t"] == "Str" else n["c"][1]) for n in literal):
            rep.err(rel, f"литеральный знак $ в заголовке «{stringify(h['c'][2])}»: перефразируй без него")
    for b in blocks:
        text = text_of_block(b)
        no_math = re.sub(r"\$[^$]*\$", "", text)
        for mm in PIPELINE_WORDS.finditer(no_math):
            rep.err(rel, f"служебное слово «{mm.group(0)}» в тексте: конспект не знает о пайплайне")
        for mm in SOFT_WORDS.finditer(no_math):
            rep.warn(rel, f"«{mm.group(0)}» — нужна хотя бы фраза, почему")
        if GLYPHS is not None:
            missing = sorted(
                {ch for ch in no_math if ord(ch) > 127 and ord(ch) not in GLYPHS and ch != "\u00a0"}
            )
            if missing:
                rep.err(
                    rel,
                    f"символов {''.join(missing)} нет в шрифте PDF (будут квадраты): пиши их в формуле, например $\\Rightarrow$",
                )
        prose = re.sub(r"\$[^$]*\$", "", text_of_block(b, code=False))
        if "!" in prose:
            rep.warn(
                rel,
                f"восклицательный знак вне формулы: «{prose[max(0, prose.find('!') - 40) : prose.find('!') + 1]}»",
            )


def check_practice(rep: Report, rel: str, body: list) -> None:
    """В практике за каждой задачей идёт ::: solution (ответ — в его конце)."""
    flat = [n for n in iter_nodes(body) if n["t"] == "Div"]
    for i, d in enumerate(flat):
        if "problem" in d["c"][0][1]:
            nxt = [x["c"][0][1] for x in flat[i + 1 : i + 2]]
            if not nxt or "solution" not in nxt[0]:
                rep.err(rel, f"после задачи {d['c'][0][0] or '(без метки)'} должно идти ::: solution")


def lint_notes(path: Path, rel: str, cfg: dict, labels: dict, rep: Report) -> None:
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
    for k in ("basis", "based_on"):
        if k in meta:
            rep.err(rel, f"поле {k} больше не используется: убери его из front matter")
    check_name_and_date(rep, rel, path, meta, cfg, course)
    if "synced" in meta:
        synced = meta["synced"]
        if not (
            isinstance(synced, list)
            and synced
            and all(isinstance(v, str) and v in build.SYNCED_PARTS for v in synced)
            and len(set(synced)) == len(synced)
            and "lecture" in synced
        ):
            rep.err(
                rel,
                f"synced={synced!r}: допустимо synced: [lecture] или synced: [lecture, seminars] "
                "(сверка с семинарами — только вместе с лекцией); не сверено — убери поле",
            )

    lecture = meta.get("lecture")
    lec_nn = f"{int(lecture):02d}" if isinstance(lecture, int) else None
    blocks = ast_of(path)["blocks"]
    sec = check_sections(rep, rel, blocks, cfg["courses"][course]["has_practice"])

    # блоки, метки, ссылки, формулы
    def on_node(n):
        t = n["t"]
        if t == "Div":
            (ident, classes, kv), content = n["c"]
            attrs = dict(kv)
            kinds = [c for c in classes if c in PREFIX]
            gone = [GONE_DIVS[c] for c in classes if c in GONE_DIVS]
            if gone:
                rep.err(rel, gone[0])
                return
            unknown = [c for c in classes if c not in PREFIX and c not in AUX_DIVS and c != "unnumbered"]
            if unknown:
                rep.err(rel, f"неизвестный тип блока ::: {{.{unknown[0]}}} (см. context/markup.md)")
            if kinds and ident:
                lm = LABEL_RE.match(ident)
                if not lm:
                    rep.err(rel, f"метка {ident} не по схеме тип:lecNN:slug")
                else:
                    if lm.group(1) != PREFIX[kinds[0]]:
                        rep.err(rel, f"метка {ident}: для {kinds[0]} префикс {PREFIX[kinds[0]]}:")
                    if lec_nn and lm.group(2) != lec_nn:
                        rep.err(rel, f"метка {ident}: номер лекции lec{lm.group(2)}, а это лекция {lec_nn}")
            tag = attrs.get("tag")
            if tag is not None and (not kinds or kinds[0] != "remark"):
                rep.err(rel, "tag= бывает только у remark")
            if tag is not None and tag not in TAGS:
                rep.err(rel, f"неизвестная пометка замечания: {tag!r}; допустимо: {', '.join(sorted(TAGS))}")
        elif t == "CodeBlock":
            (ident, classes, kv), code = n["c"]
            if "tikz" in classes:
                attrs = dict(kv)
                if not attrs.get("caption"):
                    rep.err(rel, "у рисунка нет caption=")
                if not ident:
                    rep.warn(rel, "у рисунка нет метки #fig:lecNN:…: на него нельзя сослаться по номеру")
                elif not LABEL_RE.match(ident) or not ident.startswith("fig:"):
                    rep.err(rel, f"метка рисунка {ident} не по схеме fig:lecNN:slug")
                if "\\begin{tikzpicture}" not in code:
                    rep.err(rel, "блок tikz должен содержать \\begin{tikzpicture}…\\end{tikzpicture}")
        elif t == "Header":
            ident = n["c"][1][0]
            if ident.startswith("sec:") and not LABEL_RE.match(ident):
                rep.err(rel, f"метка раздела {ident} не по схеме sec:lecNN:slug")
        elif t == "Math":
            check_math(rep, rel, n["c"][1])
        elif t == "Cite":
            check_cite(rep, rel, n, labels.get(course, {}))
        elif t == "Str" and "$" in n["c"] and not n["c"].startswith("{#eq:"):
            rep.err(
                rel, f"знак $ в тексте — формула не распознана (пробел у $ внутри или непарный $): «{n['c']}»"
            )
        elif t == "Str" and re.fullmatch(r"\{#eq:[^}]*\}", n["c"]):
            if not LABEL_RE.match(n["c"][2:-1]):
                rep.err(rel, f"метка формулы {n['c']} не по схеме eq:lecNN:slug")
        elif t == "Image":
            rep.err(rel, "картинки-файлы в конспекте запрещены: рисунки — только ```tikz")

    walk(blocks, on_node)
    check_texts(rep, rel, blocks)
    if "Практика" in sec:
        check_practice(rep, rel, sec["Практика"])


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


def lint_theory(path: Path, rel: str, labels: dict, rep: Report) -> None:
    meta = build.read_front_matter(path)
    course = path.stem
    if meta.get("course") != course:
        rep.err(rel, f"course={meta.get('course')!r}, а файл theory/{course}.md")
    doc = ast_of(path)
    course_labels = labels.get(course, {})
    lecture = None  # номер из заголовка «# N. Тема», под которым идут блоки

    def on_node(n):
        if n["t"] == "Cite":
            rep.err(rel, "теория — без ссылок: номер блока уже совпадает с конспектом, лекцию видно по разделу")
        elif n["t"] == "Math":
            check_math(rep, rel, n["c"][1])

    for b in doc["blocks"]:
        if b["t"] == "Header" and b["c"][0] == 1:
            title = stringify(b["c"][2])
            m = THEORY_HEADING.match(title)
            if title == THEORY_FIRST:
                lecture = None
            elif not m:
                rep.err(rel, f"заголовок теории «{title}»: нужен вид «N. Тема», N — номер лекции")
            else:
                lecture = int(m.group(1))
                if len(title) > THEORY_HEADING_MAX:
                    rep.err(rel, f"заголовок «{title}» длиннее {THEORY_HEADING_MAX} символов: тема, а не оглавление лекции")
        elif b["t"] == "Div":
            classes, attrs = b["c"][0][1], dict(b["c"][0][2])
            ref = attrs.get("ref")
            if not ref or not set(classes) & THEORY_BLOCKS:
                rep.err(rel, f"блок {classes or attrs}: в теории только определения и утверждения с ref= — примеры и замечания живут в конспектах")
            if ref:
                if ref not in course_labels:
                    rep.err(rel, f"ref={ref} не найден в конспектах курса")
                m = re.search(r":lec(\d+):", ref)
                if m and lecture is not None and int(m.group(1)) != lecture:
                    rep.err(rel, f"ref={ref} из лекции {int(m.group(1))} стоит в разделе «{lecture}. …»")
                status = attrs.get("status")
                if status is not None and status not in THEORY_STATUSES:
                    allowed = ", ".join(f"«{x}»" for x in THEORY_STATUSES)
                    rep.err(rel, f"{ref}: status=«{status}» — доказано на лекции пишется без status=, иначе одно из: {allowed}")
                if "definition" in classes:
                    first = b["c"][1][0] if b["c"][1] else None
                    inl = first["c"] if first and first["t"] in ("Para", "Plain") else []
                    if not inl or inl[0]["t"] != "Strong":
                        rep.err(rel, f"{ref}: определение начинается с термина жирным: «**Термин** — …»")
        walk(b, on_node)


PROGRAM_META = {"course", "title"}
PROGRAM_BLOCKS = {"remark"}  # без примеров расчёта: страница — справочник (решение владельца)
PROGRAM_FIRST, PROGRAM_LAST, PROGRAM_SOURCES = "О курсе", "Содержание курса", "Источники"
# Страница программы — справочник, а не реферат о ПУД: без пометок источников, комментариев о самой
# программе и советов «уточнить у лектора» (context/prompts/program.md → «Как писать»)
PROGRAM_META_WORDS = re.compile(
    r"(уточн[а-я]* у лектора|в программе (?:прямо )?не|в программе сказано|по программе|судя по|"
    r"по wiki|на wiki|по каналу|по календарю|по таблице планирования|сумм[а-я]* весов|сноск|звёздочк)",
    re.I,
)


def lint_program(path: Path, rel: str, cfg: dict, labels: dict, rep: Report) -> None:
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

    def on_node(n):
        t = n["t"]
        if t == "Div":
            (ident, classes, kv), _ = n["c"]
            kinds = [c for c in classes if c in PROGRAM_BLOCKS]
            if not kinds:
                rep.err(
                    rel,
                    f"блок ::: {{.{classes[0] if classes else '?'}}} в программе курса: можно только "
                    f"{', '.join(sorted(PROGRAM_BLOCKS))}",
                )
            if ident or dict(kv).get("ref"):
                rep.err(
                    rel, f"у блока {ident or dict(kv).get('ref')} метка: в программе блоки без меток и ref="
                )
            tag = dict(kv).get("tag")
            if tag is not None and tag not in TAGS:
                rep.err(rel, f"неизвестная пометка замечания: {tag!r}; допустимо: {', '.join(sorted(TAGS))}")
        elif t == "CodeBlock":
            rep.err(rel, "блок кода или рисунок в программе курса: здесь только текст, таблицы и формулы")
        elif t == "Image":
            rep.err(rel, "картинки-файлы запрещены")
        elif t == "Header" and n["c"][1][0].startswith(("sec:", "def:", "thm:", "prob:", "rem:", "ex:")):
            rep.err(rel, f"метка {n['c'][1][0]} у заголовка: в программе своих меток нет")
        elif t == "Math":
            check_math(rep, rel, n["c"][1])
        elif t == "Cite":
            check_cite(rep, rel, n, labels.get(course, {}))
        elif t == "Str" and "$" in n["c"]:
            rep.err(rel, f"знак $ в тексте — формула не распознана: «{n['c']}»")

    walk(blocks, on_node)
    check_texts(rep, rel, blocks)
    texts = [text_of_block(b) for b in blocks]
    texts += [dict(n["c"][0][2]).get("title", "") for n in iter_nodes(blocks) if n["t"] == "Div"]
    for text in texts:
        for mm in PROGRAM_META_WORDS.finditer(re.sub(r"\$[^$]*\$", "", text)):
            rep.err(
                rel,
                f"«{mm.group(0)}»: на странице программы — только факты, без пометок источников "
                "и комментариев о самой программе (context/prompts/program.md)",
            )
    h1 = [text_of_block(b).strip() for b in blocks if b["t"] == "Header" and b["c"][0] == 1]
    if not h1 or h1[0] != PROGRAM_FIRST:
        rep.err(rel, f"первый раздел — «# {PROGRAM_FIRST}»")
    else:
        # «О курсе» — сводная таблица «параметр · значение» (лектор, объём, экзамен, порог, итог)
        first = next(i for i, b in enumerate(blocks) if b["t"] == "Header" and b["c"][0] == 1)
        nxt = next((b for b in blocks[first + 1 :] if b["t"] != "Para" or text_of_block(b).strip()), None)
        if nxt is None or nxt["t"] != "Table":
            rep.err(rel, f"раздел «# {PROGRAM_FIRST}» — сводная таблица курса сразу под заголовком")
    tail = h1[-2:] if h1 and h1[-1] == PROGRAM_SOURCES else h1[-1:]
    if not tail or tail[0] != PROGRAM_LAST:
        rep.err(
            rel, f"последний раздел — «# {PROGRAM_LAST}» (за ним может идти только «# {PROGRAM_SOURCES}»)"
        )
    # ссылки на первоисточники — только списком в «Источниках» (и профиль лектора в «О курсе»),
    # не в тексте (context/prompts/facts.md)
    section = ""
    for b in blocks:
        if b["t"] == "Header" and b["c"][0] == 1:
            section = text_of_block(b).strip()
        elif section not in (PROGRAM_FIRST, PROGRAM_SOURCES) and any(n["t"] == "Link" for n in iter_nodes(b)):
            rep.err(
                rel,
                f"ссылка в разделе «{section}»: ссылки на источники — только в «# {PROGRAM_SOURCES}» в конце",
            )
        elif section == PROGRAM_SOURCES and b["t"] != "BulletList":
            rep.err(rel, f"«# {PROGRAM_SOURCES}» — только список ссылок, по строке на источник")
    if not any(b["t"] == "Table" for b in blocks):
        rep.warn(rel, "в программе нет ни одной таблицы: веса элементов контроля удобнее читать таблицей")


PREP_GONE = re.compile(r"(Вопросы для самопроверки|Самопроверка|Блиц)", re.I)


def lint_prep(path: Path, rel: str, cfg: dict, labels: dict, rep: Report) -> None:
    """Подготовка к КР, коллоквиуму, экзамену или квизу (prep/<course>/krN.md, colloqN.md, examN.md, quiz-<slug>.md).

    Свои метки prob:krN:… (prob:colloqN:…, prob:examN:…, prob:quiz-<slug>:…), теория — ref= на блоки конспектов.
    """
    meta = build.read_front_matter(path)
    course, exam = path.parent.name, path.stem
    # date можно не ставить: событие ещё не объявлено — страница есть, но неактивна (сайт: без дня,
    # без цвета, не на главной); тогда active_until и highlight_from не к чему привязать
    for k in ("course", "title"):
        if meta.get(k) in (None, ""):
            rep.err(rel, f"в front matter нет поля {k}")
    if meta.get("course") != course:
        rep.err(rel, f"course={meta.get('course')!r}, а файл лежит в prep/{course}/")
    if course not in cfg["courses"]:
        rep.err(rel, f"неизвестный курс {course}")
        return
    if exam not in build.PREP_IDS:
        rep.err(rel, f"имя файла подготовки — {build.PREP_FILES} (маршруты сайта)")
    kind = build.prep_kind(exam)
    colloq = kind == "colloq"
    event = {"colloq": "коллоквиума", "exam": "экзамена", "quiz": "квиза"}.get(kind, "КР")
    # номер квиза — из таблицы планирования курса, его имя на сайте («Квиз 4»); тема — в скобках
    if kind == "quiz" and meta.get("quiz_topic") in (None, ""):
        rep.err(rel, "в front matter нет поля quiz_topic (тема квиза: на сайте «Квиз 4 (<тема>)»)")
    elif kind != "quiz" and meta.get("quiz_topic") not in (None, ""):
        rep.err(rel, "поле quiz_topic — только у квиза (prep/<course>/quiz-<slug>.md)")
    number = meta.get("quiz_number")
    if kind == "quiz":
        if type(number) is not int or number < 1:
            rep.err(rel, "quiz_number — обязательное целое число > 0 (номер квиза из таблицы планирования context/courses/<курс>.md)")
    elif number not in (None, ""):
        rep.err(rel, "поле quiz_number — только у квиза (prep/<course>/quiz-<slug>.md)")
    dates: dict[str, dt.date] = {}
    for k in ("date", "active_until", "highlight_from"):
        value = meta.get(k)
        if value in (None, ""):
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
    if meta.get("date") in (None, ""):
        for k in ("active_until", "highlight_from"):
            if meta.get(k) not in (None, ""):
                rep.err(rel, f"{k} без date: у неактивной подготовки (без даты) дней активности нет")
    if "date" in dates and "active_until" in dates and dates["active_until"] < dates["date"]:
        rep.err(rel, f"active_until={dates['active_until']} раньше даты {event} {dates['date']}")
    # выделение цветом на сайте идёт с highlight_from до последнего активного дня включительно
    last_day = dates.get("active_until") or dates.get("date")
    if "highlight_from" in dates and last_day is not None and dates["highlight_from"] > last_day:
        rep.err(
            rel,
            f"highlight_from={dates['highlight_from']} позже последнего дня {event} {last_day}"
            " (active_until, по умолчанию date)",
        )
    blocks = ast_of(path)["blocks"]
    own: set[str] = set()

    def collect(n):
        if n["t"] in ("Div", "CodeBlock", "Header"):
            ident = n["c"][0][0] if n["t"] != "Header" else n["c"][1][0]
            if ident:
                own.add(ident)
        elif n["t"] == "Str" and re.fullmatch(r"\{#eq:[^}]*\}", n["c"]):
            own.add(n["c"][2:-1])

    walk(blocks, collect)
    known = {**labels.get(course, {}), **dict.fromkeys(own, True)}

    def check_label(ident: str, kind: str | None = None) -> None:
        lm = PREP_LABEL_RE.match(ident)
        if not lm:
            rep.err(rel, f"метка {ident} не по схеме тип:{exam}:slug (тип: ex, rem, prob, fig, eq, sec)")
        elif lm.group(2) != exam:
            rep.err(rel, f"метка {ident}: в файле {exam}.md метки вида тип:{exam}:slug")
        elif kind and lm.group(1) != PREFIX.get(kind):
            rep.err(rel, f"метка {ident}: для {kind} префикс {PREFIX.get(kind)}:")

    def on_node(n):
        t = n["t"]
        if t == "Div":
            (ident, classes, kv), _ = n["c"]
            attrs = dict(kv)
            kinds = [c for c in classes if c in PREFIX]
            gone = [GONE_DIVS[c] for c in classes if c in GONE_DIVS]
            if gone:
                rep.err(rel, gone[0])
                return
            unknown = [c for c in classes if c not in PREFIX and c not in AUX_DIVS and c != "unnumbered"]
            if unknown:
                rep.err(rel, f"неизвестный тип блока ::: {{.{unknown[0]}}} (см. context/markup.md)")
            ref = attrs.get("ref")
            if ref:
                if ref not in labels.get(course, {}):
                    rep.err(rel, f"ref={ref} не найден в конспектах курса")
            elif kinds and kinds[0] not in ("example", "remark", "problem"):
                rep.err(rel, f"блок {kinds[0]} без ref=: новые определения и теоремы — только в конспектах")
            elif kinds and ident:
                check_label(ident, kinds[0])
            tag = attrs.get("tag")
            if tag is not None and tag not in TAGS:
                rep.err(rel, f"неизвестная пометка замечания: {tag!r}; допустимо: {', '.join(sorted(TAGS))}")
        elif t == "CodeBlock" and "tikz" in n["c"][0][1]:
            if not dict(n["c"][0][2]).get("caption"):
                rep.err(rel, "у рисунка нет caption=")
            if n["c"][0][0]:
                check_label(n["c"][0][0])
        elif t == "Header":
            ident = n["c"][1][0]
            if ident.startswith("sec:"):
                check_label(ident)
        elif t == "Math":
            check_math(rep, rel, n["c"][1])
        elif t == "Cite":
            check_cite(rep, rel, n, known)
        elif t == "Str" and "$" in n["c"] and not n["c"].startswith("{#eq:"):
            rep.err(rel, f"знак $ в тексте — формула не распознана: «{n['c']}»")
        elif t == "Str" and re.fullmatch(r"\{#eq:[^}]*\}", n["c"]):
            check_label(n["c"][2:-1])
        elif t == "Image":
            rep.err(rel, "картинки-файлы запрещены: рисунки — только ```tikz")

    walk(blocks, on_node)
    check_texts(rep, rel, blocks)
    check_practice(rep, rel, blocks)
    h1 = [text_of_block(b).strip() for b in blocks if b["t"] == "Header" and b["c"][0] == 1]
    first = {"colloq": "О коллоквиуме", "exam": "Об экзамене", "quiz": "О квизе"}.get(kind, "О контрольной")
    if not h1 or h1[0] != first:
        rep.err(rel, f"первый раздел — «# {first}»")
    h2 = [text_of_block(b).strip() for b in blocks if b["t"] == "Header" and b["c"][0] == 2]
    # себя проверяют генератором билетов (context/prompts/prep.md → «На странице нет»)
    for title in h1 + h2:
        if PREP_GONE.match(title):
            rep.err(rel, f"раздела «{title}» на странице подготовки нет: тренируются генератором билетов")
    # коллоквиум — устная теория: «# Билеты» (новая схема) или «## Что нужно знать» (старая)
    # экзамен — «# Билеты» и/или «# Задачи»; КР/квиз — «# Задачи» (новая схема) или «## Прототипы» (старая)
    if colloq and "Билеты" not in h1 and "Что нужно знать" not in h2:
        rep.err(rel, "нет ни раздела «# Билеты», ни подраздела «## Что нужно знать»")
    elif kind == "exam" and "Билеты" not in h1 and "Задачи" not in h1:
        rep.err(rel, "нет ни раздела «# Билеты», ни раздела «# Задачи»")
    elif kind not in ("colloq", "exam") and "Задачи" not in h1 and "Прототипы" not in h2:
        rep.err(rel, "нет задач: ни раздела «# Задачи», ни одного подраздела «## Прототипы»")
    if "Билеты" in h1:
        in_tickets = False
        has_ticket_h2 = False
        for b in blocks:
            if b["t"] == "Header" and b["c"][0] == 1:
                if in_tickets:
                    break
                in_tickets = text_of_block(b).strip() == "Билеты"
            elif in_tickets and b["t"] == "Header" and b["c"][0] == 2:
                has_ticket_h2 = True
                break
        if not has_ticket_h2:
            rep.err(rel, "в разделе «# Билеты» нет ни одного билета уровня «## »")
    lint_bank(path, course, exam, labels, own, rep)
    # на сайте генератор встаёт в раздел {#sec:<prep>:generator}; в PDF этот раздел — ссылка на сайт
    generator = f"sec:{exam}:{ticket_bank.GENERATOR_SECTION}"
    has_bank = ticket_bank.bank_path(path).exists()
    if has_bank and generator not in own:
        rep.err(
            rel, f"у страницы есть банк билетов, но нет раздела {{#{generator}}}: генератору негде встать"
        )
    elif has_bank:
        last_id = [b["c"][1][0] for b in blocks if b["t"] == "Header" and b["c"][0] == 1][-1]
        if last_id != generator:
            # «Источники» (context/prompts/facts.md, п. 7) — перед генератором: он последний и на сайте
            rep.warn(
                rel, f"раздел {{#{generator}}} — последний на странице; «Источники» и остальное — перед ним"
            )
    elif generator in own and not has_bank:
        rep.err(
            rel,
            f"раздел {{#{generator}}} без банка {ticket_bank.bank_path(path).name}: на сайте он будет пустым",
        )


class NotesProofs:
    """Идёт ли за блоком конспекта `::: proof` — сайт покажет его в ответе генератора билетов.

    Как `extractBlock` на сайте: после блока пропускаются абзацы, поиск останавливается на следующем
    нумерованном блоке или заголовке.
    """

    def __init__(self, course_labels: dict) -> None:
        self.labels = course_labels
        self.asts: dict[str, list] = {}

    def has_proof(self, label: str) -> bool:
        entry = self.labels.get(label)
        if entry is None:
            return False
        file = entry["file"]
        if file not in self.asts:
            self.asts[file] = ast_of(build.SRC / file)["blocks"]
        return bool(proof_after(self.asts[file], label))


def proof_after(blocks: list, label: str) -> bool | None:
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


def lint_bank(path: Path, course: str, exam: str, labels: dict, own: set[str], rep: Report) -> None:
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
        if snippet["t"] != "Div":
            continue
        where = f"{rel} ({snippet['c'][0][0].replace('--', ': ')})"

        def on_node(n, where=where):
            t = n["t"]
            if t == "Math":
                check_math(rep, where, n["c"][1])
            elif t == "Cite":
                check_cite(rep, where, n, known)
            elif t == "Str" and "$" in n["c"]:
                rep.err(where, f"знак $ в тексте — формула не распознана: «{n['c']}»")
            elif t in ("Header", "Div", "CodeBlock", "Image", "Table"):
                rep.err(where, f"{t} в тексте вопроса: здесь только абзацы, списки и формулы")

        walk(snippet["c"][1], on_node)
        check_texts(rep, where, snippet["c"][1])


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("files", nargs="*", type=Path)
    ap.add_argument("--strict", action="store_true")
    ap.add_argument("--src", type=Path, default=build.ROOT)
    args = ap.parse_args()
    build.set_dirs(args.src, args.src / "build")

    cfg = json.loads(build.CONFIG.read_text(encoding="utf-8"))
    rep = Report()
    try:
        docs = build.discover()
        index = build.build_index(docs, 8)
    except build.BuildError as e:
        print(f"ERROR: {e}")
        return 1
    labels = index["labels"]
    # банк билетов проверяется вместе со своей страницей: colloq1-bank.yaml → colloq1.md
    wanted = {
        p.with_name(p.name.removesuffix(ticket_bank.BANK_SUFFIX) + ".md").resolve()
        if p.name.endswith(ticket_bank.BANK_SUFFIX)
        else p.resolve()
        for p in args.files
    }
    for d in docs:
        if wanted and d.path.resolve() not in wanted:
            continue
        if d.kind == "notes":
            lint_notes(d.path, d.rel, cfg, labels, rep)
        elif d.kind == "prep":
            lint_prep(d.path, d.rel, cfg, labels, rep)
        elif d.kind == "program":
            lint_program(d.path, d.rel, cfg, labels, rep)
        else:
            lint_theory(d.path, d.rel, labels, rep)

    if not wanted:
        for p in sorted((build.SRC / "prep").glob(f"*/*{ticket_bank.BANK_SUFFIX}")):
            page = p.with_name(p.name.removesuffix(ticket_bank.BANK_SUFFIX) + ".md")
            if not page.exists():
                rep.err(p.relative_to(build.SRC).as_posix(), f"банк билетов без страницы {page.name}")

    plan = build.SRC / curriculum.FILE
    if not wanted and plan.exists():
        try:
            curriculum.export(plan)
        except curriculum.CurriculumError as e:
            rep.err(curriculum.FILE.as_posix(), str(e))

    for line in rep.errors + rep.warnings:
        print(line)
    print(f"\n{len(rep.errors)} ошибок, {len(rep.warnings)} предупреждений")
    if rep.errors or (args.strict and rep.warnings):
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
