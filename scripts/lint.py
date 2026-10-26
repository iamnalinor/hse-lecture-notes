"""Линтер конспектов и теории курсов (разметка — context/markup.md, скелет — context/recommendations.md).

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
AUX_DIVS = {"proof", "solution", "answer", "answers", "course-glossary"}
TAGS = {"корнер-кейс", "подводный камень", "частое заблуждение", "соглашение курса", "напоминание"}
LABEL_RE = re.compile(r"^(def|ax|thm|lem|prop|cor|ex|rem|prob|fig|eq|sec):lec(\d{2}):[a-z0-9][a-z0-9-]*$")
REQUIRED_META = ["course", "lecture", "date", "title"]
PREP_LABEL_RE = re.compile(r"^(ex|rem|prob|fig|eq|sec):(kr\d+):[a-z0-9][a-z0-9-]*$")
ISO_DATE_RE = re.compile(r"\d{4}-\d{2}-\d{2}")
PREP_FILE_RE = re.compile(r"^kr[1-3]$")  # = PREP_IDS в web/src/domain/preps.ts (маршруты сайта)

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


def stringify(inlines) -> str:
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


def text_of_block(b) -> str:
    parts = []

    def fn(n):
        if n["t"] in ("Para", "Plain", "Header"):
            inl = n["c"][2] if n["t"] == "Header" else n["c"]
            parts.append(stringify(inl))

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
    required += ["Итоги", "Глоссарий", "Самопроверка"]
    sections = split_sections(blocks)
    names = [s[0] for s in sections]
    for r in required:
        if r not in names:
            rep.err(rel, f"нет раздела «# {r}»")
    order = [n for n in names if n in required]
    if order != [r for r in required if r in names]:
        rep.err(rel, f"разделы не в порядке скелета: {order}")
    sec = dict(sections)

    if "Итоги" in sec:
        lists = [b for b in sec["Итоги"] if b["t"] == "BulletList"]
        n = len(lists[0]["c"]) if lists else 0
        if not 3 <= n <= 8:
            rep.warn(rel, f"в итогах {n} пунктов, нужно 3–8")
    if "Глоссарий" in sec:
        dls = [b for b in sec["Глоссарий"] if b["t"] == "DefinitionList"]
        if not dls:
            rep.err(rel, "глоссарий должен быть definition list (Термин\\n:   определение)")
        for dl in dls:
            for term, defs in dl["c"]:
                cites = [n for n in iter_nodes(defs) if n["t"] == "Cite"]
                if not cites:
                    rep.warn(rel, f"в глоссарии у «{stringify(term)}» нет ссылки на номер определения")
    skills = 0
    if "После прочтения ты сможешь" in sec:
        lists = [b for b in sec["После прочтения ты сможешь"] if b["t"] in ("BulletList", "OrderedList")]
        skills = len(lists[0]["c"] if lists[0]["t"] == "BulletList" else lists[0]["c"][1]) if lists else 0
        if skills == 0:
            rep.err(rel, "«После прочтения ты сможешь» — нужен список навыков")
    if "Самопроверка" in sec:
        body = sec["Самопроверка"]
        olists = [b for b in body if b["t"] == "OrderedList"]
        answers = [b for b in body if b["t"] == "Div" and "answers" in b["c"][0][1]]
        if not olists:
            rep.err(rel, "в самопроверке нет нумерованного списка задач")
        if not answers:
            rep.err(rel, "в самопроверке нет блока ::: answers")
        if olists and answers:
            n_q = len(olists[0]["c"][1])
            alists = [b for b in answers[0]["c"][1] if b["t"] == "OrderedList"]
            n_a = len(alists[0]["c"][1]) if alists else 0
            if n_q != n_a:
                rep.err(rel, f"задач в самопроверке {n_q}, ответов {n_a}")
            if n_q < skills:
                rep.warn(rel, f"навыков {skills}, а задач самопроверки {n_q}: на каждый навык нужна задача")
    return sec


def check_texts(rep: Report, rel: str, blocks: list) -> None:
    """Тексты: служебные слова пайплайна, «очевидно», символы без глифа в шрифте, «!»."""
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
        if "!" in no_math:
            rep.warn(
                rel,
                f"восклицательный знак вне формулы: «{no_math[max(0, no_math.find('!') - 40) : no_math.find('!') + 1]}»",
            )


def check_practice(rep: Report, rel: str, body: list) -> None:
    """В практике за каждой задачей идут ::: answer и ::: solution."""
    flat = [n for n in iter_nodes(body) if n["t"] == "Div"]
    for i, d in enumerate(flat):
        if "problem" in d["c"][0][1]:
            nxt = [x["c"][0][1] for x in flat[i + 1 : i + 3]]
            if len(nxt) < 2 or "answer" not in nxt[0] or "solution" not in nxt[1]:
                rep.err(
                    rel,
                    f"после задачи {d['c'][0][0] or '(без метки)'} должны идти ::: answer и ::: solution",
                )


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


def lint_theory(path: Path, rel: str, labels: dict, rep: Report) -> None:
    meta = build.read_front_matter(path)
    course = path.stem
    if meta.get("course") != course:
        rep.err(rel, f"course={meta.get('course')!r}, а файл theory/{course}.md")
    doc = ast_of(path)

    def on_node(n):
        if n["t"] == "Div":
            attrs = dict(n["c"][0][2])
            ref = attrs.get("ref")
            if ref and ref not in labels.get(course, {}):
                rep.err(rel, f"ref={ref} не найден в конспектах курса")
        elif n["t"] == "Cite":
            check_cite(rep, rel, n, labels.get(course, {}))
        elif n["t"] == "Math":
            check_math(rep, rel, n["c"][1])

    walk(doc["blocks"], on_node)


def lint_prep(path: Path, rel: str, cfg: dict, labels: dict, rep: Report) -> None:
    """Подготовка к КР (prep/<course>/krN.md): свои метки prob:krN:…, ref= на блоки конспектов."""
    meta = build.read_front_matter(path)
    course, exam = path.parent.name, path.stem
    for k in ("course", "title", "date"):
        if meta.get(k) in (None, ""):
            rep.err(rel, f"в front matter нет поля {k}")
    if meta.get("course") != course:
        rep.err(rel, f"course={meta.get('course')!r}, а файл лежит в prep/{course}/")
    if course not in cfg["courses"]:
        rep.err(rel, f"неизвестный курс {course}")
        return
    if not PREP_FILE_RE.match(exam):
        rep.err(rel, "имя файла подготовки — kr1.md, kr2.md или kr3.md (маршруты сайта)")
    dates: dict[str, dt.date] = {}
    for k in ("date", "active_until"):
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
    if "date" in dates and "active_until" in dates and dates["active_until"] < dates["date"]:
        rep.err(rel, f"active_until={dates['active_until']} раньше даты КР {dates['date']}")
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
    if not h1 or h1[0] != "О контрольной":
        rep.err(rel, "первый раздел — «# О контрольной»")
    h2 = [text_of_block(b).strip() for b in blocks if b["t"] == "Header" and b["c"][0] == 2]
    if "Прототипы" not in h2:
        rep.err(rel, "нет ни одного подраздела «## Прототипы»")


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
    wanted = {p.resolve() for p in args.files}
    for d in docs:
        if wanted and d.path.resolve() not in wanted:
            continue
        if d.kind == "notes":
            lint_notes(d.path, d.rel, cfg, labels, rep)
        elif d.kind == "prep":
            lint_prep(d.path, d.rel, cfg, labels, rep)
        else:
            lint_theory(d.path, d.rel, labels, rep)

    for line in rep.errors + rep.warnings:
        print(line)
    print(f"\n{len(rep.errors)} ошибок, {len(rep.warnings)} предупреждений")
    if rep.errors or (args.strict and rep.warnings):
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
