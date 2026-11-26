"""Общее для проверок линтера: отчет, обход AST pandoc, правила формул и текста, метки и блоки."""

from __future__ import annotations

import json
import re
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import pypandoc
from fontTools.ttLib import TTFont

import build

Node = dict[str, Any]  # узел pandoc-json: {"t": тип, "c": содержимое}
Meta = dict[str, Any]  # front matter
Labels = dict[str, dict[str, Any]]  # курс → метка → запись индекса

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
EQ_LABEL_RE = re.compile(r"\{#eq:[^}]*\}")

PIPELINE_WORDS = re.compile(
    r"(рекомендаци|ревью|ревьюер|чек-?лист|промпт|прошлогодн|режим[а-я]* генерац|"
    r"\bР\d{1,2}\b|сгенерирован|нейросет|\bLLM\b|прогнозн[а-я]* конспект|инстанци)",
    re.IGNORECASE,
)
SOFT_WORDS = re.compile(
    r"(очевидно|несложно|нетрудно|как известно|легко видеть|легко показать)", re.IGNORECASE
)
FORBIDDEN_MATH = [
    (re.compile(r"\\boxed"), r"\boxed не рендерится в html-версии"),
    (re.compile(r"\\xrightarrow"), r"\xrightarrow запрещен (html, мобильные)"),
    (
        re.compile(r"\\begin\{array\}\{[^}]*\|"),
        "array с чертой запрещен: расширенная матрица — pmatrix с | отдельным столбцом",
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
MATH_SNIPPET_CHARS = 60  # сколько символов формулы показать в сообщении об ошибке

FONT_DIR = Path.home() / ".TinyTeX" / "texmf-dist" / "fonts" / "opentype" / "public" / "cm-unicode"


def text_glyphs() -> set[int] | None:
    """Символы, которые есть во всех начертаниях основного шрифта (CMU Serif); None — шрифт не найден."""
    if not (FONT_DIR / "cmunrm.otf").exists():
        return None
    common: set[int] | None = None
    for name in ("cmunrm", "cmunti", "cmunbx"):
        cmap = set(TTFont(FONT_DIR / f"{name}.otf").getBestCmap() or ())
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


def stringify(inlines: Any, code: bool = True) -> str:
    """Текст инлайнов; code=False — без `кода` (в нём законны «!», «!=» и т. п.)."""
    out = []

    def go(x: Any) -> None:
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


def walk(node: Any, fn: Callable[[Node], None]) -> None:
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


def iter_nodes(node: Any) -> list[Node]:
    found: list[Node] = []
    walk(node, found.append)
    return found


def ast_of(path: Path) -> Node:
    return json.loads(pypandoc.convert_file(str(path), "json", format=build.MARKDOWN, extra_args=["--quiet"]))


def is_h1(block: Node) -> bool:
    return block["t"] == "Header" and block["c"][0] == 1


def split_sections(blocks: list[Node]) -> list[tuple[str, list[Node]]]:
    sections: list[tuple[str, list[Node]]] = []
    current: tuple[str, list[Node]] | None = None
    for b in blocks:
        if is_h1(b):
            current = (stringify(b["c"][2]).strip(), [])
            sections.append(current)
        elif current is not None:
            current[1].append(b)
    return sections


def text_of_block(b: Node, code: bool = True) -> str:
    parts = []

    def collect(n: Node) -> None:
        if n["t"] in ("Para", "Plain", "Header"):
            inl = n["c"][2] if n["t"] == "Header" else n["c"]
            parts.append(stringify(inl, code))

    walk(b, collect)
    return "\n".join(parts)


def headings(blocks: list[Node], level: int) -> list[str]:
    return [text_of_block(b).strip() for b in blocks if b["t"] == "Header" and b["c"][0] == level]


def without_math(text: str) -> str:
    return re.sub(r"\$[^$]*\$", "", text)


def check_math(rep: Report, rel: str, tex: str) -> None:
    for rx, msg in FORBIDDEN_MATH:
        if rx.search(tex):
            rep.err(rel, f"{msg}: ${tex[:MATH_SNIPPET_CHARS]}$")
    if re.search(r"\[-?@[a-z]+:lec", tex) or re.search(r"(?<![\\\w])@[a-z]+:lec\d", tex):
        rep.err(
            rel,
            f"ссылка @метка внутри формулы не разрешается — вынеси её за $…$: ${tex[:MATH_SNIPPET_CHARS]}$",
        )
    stripped = TEXT_CMDS.sub("", tex)
    bad = sorted({ch for ch in stripped if ord(ch) > 127})
    if bad:
        rep.err(
            rel,
            f"не-ASCII символы в формуле ({''.join(bad)}): кириллица — только в \\text{{}}, "
            f"греческие буквы и знаки — командами (\\varepsilon, \\le): ${tex[:MATH_SNIPPET_CHARS]}$",
        )


def check_cite(rep: Report, rel: str, cite: Node, course_labels: dict[str, Any]) -> None:
    for c in cite["c"][0]:
        if c["citationId"] not in course_labels:
            rep.err(rel, f"ссылка @{c['citationId']} никуда не ведет")


def check_stray_dollar(rep: Report, rel: str, text: str, hint: str = "") -> None:
    rep.err(rel, f"знак $ в тексте — формула не распознана{hint}: «{text}»")


def check_div_classes(rep: Report, rel: str, classes: list[str]) -> bool:
    """Классы блока известны. False — найден удаленный блок (::: answer): дальше блок не проверять."""
    gone = [GONE_DIVS[c] for c in classes if c in GONE_DIVS]
    if gone:
        rep.err(rel, gone[0])
        return False
    unknown = [c for c in classes if c not in PREFIX and c not in AUX_DIVS and c != "unnumbered"]
    if unknown:
        rep.err(rel, f"неизвестный тип блока ::: {{.{unknown[0]}}} (см. context/markup.md)")
    return True


def check_tag(rep: Report, rel: str, tag: str | None) -> None:
    if tag is not None and tag not in TAGS:
        rep.err(rel, f"неизвестная пометка замечания: {tag!r}; допустимо: {', '.join(sorted(TAGS))}")


def check_texts(rep: Report, rel: str, blocks: list[Node]) -> None:
    """Тексты: служебные слова пайплайна, «очевидно», символы без глифа в шрифте, «!»."""
    # заголовок уходит в оглавление и индекс как «текст $формула$»: литеральный $ там не отличить
    for h in (n for n in iter_nodes(blocks) if n["t"] == "Header"):
        literal = (n for n in iter_nodes(h["c"][2]) if n["t"] in ("Str", "Code", "RawInline"))
        if any("$" in (n["c"] if n["t"] == "Str" else n["c"][1]) for n in literal):
            rep.err(rel, f"литеральный знак $ в заголовке «{stringify(h['c'][2])}»: перефразируй без него")
    for b in blocks:
        text = text_of_block(b)
        no_math = without_math(text)
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
        prose = without_math(text_of_block(b, code=False))
        if "!" in prose:
            at = prose.find("!")
            rep.warn(rel, f"восклицательный знак вне формулы: «{prose[max(0, at - 40) : at + 1]}»")


def check_practice(rep: Report, rel: str, body: list[Node]) -> None:
    """В практике за каждой задачей идет ::: solution (ответ — в его конце)."""
    flat = [n for n in iter_nodes(body) if n["t"] == "Div"]
    for i, d in enumerate(flat):
        if "problem" in d["c"][0][1]:
            nxt = [x["c"][0][1] for x in flat[i + 1 : i + 2]]
            if not nxt or "solution" not in nxt[0]:
                rep.err(rel, f"после задачи {d['c'][0][0] or '(без метки)'} должно идти ::: solution")
