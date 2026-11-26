"""Сборка конспектов, теории, программ курсов и подготовок: Markdown → PDF (xelatex) и HTML-фрагменты для сайта.

Запуск:
    uv run scripts/build.py                       # всё
    uv run scripts/build.py --only notes/algebra/04_*.md
    uv run scripts/build.py --no-html --strict

Результат в build/:
    build/index.json                    глобальный индекс меток и лекций
    build/pdf/<course>/<week_id>.pdf    PDF конспектов, build/pdf/<course>/theory.pdf, program.pdf
    build/pdf/<course>/krN-cheatsheet-<variant>.pdf
                                        читлисты из prep/<course>/cheatsheet/krN-cheatsheet-<variant>.tex
    build/site-data/                    данные для будущего сайта + preview-страницы
        index.json, courses.json, katex-macros.json, search.json, curriculum.json
        <course>/<week_id>/fragment.html, meta.json, fig/*.svg, index.html (preview)
        <course>/theory/..., <course>/program/...
        <course>/<prep>/bank.json       банк генератора билетов (prep/<course>/<prep>-bank.yaml)
"""

from __future__ import annotations

import argparse
import concurrent.futures as cf
import dataclasses
import datetime as dt
import fnmatch
import hashlib
import html
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

import pypandoc
import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent))
import curriculum
import ticket_bank
from site_search import search_entries

ROOT = Path(__file__).resolve().parent.parent
TEMPLATES = ROOT / "templates"
FILTER = ROOT / "filters" / "notes.lua"
CONFIG = TEMPLATES / "courses.json"
SRC = ROOT  # где лежат notes/, theory/, program/ и prep/ (в тестах — временная папка)
BUILD = ROOT / "build"
CACHE = ROOT / ".cache"
SITE = BUILD / "site-data"
PDF_DIR = BUILD / "pdf"
TEX_DIR = BUILD / "tex"


def set_dirs(src: Path, build: Path) -> None:
    global SRC, BUILD, SITE, PDF_DIR, TEX_DIR
    SRC, BUILD = src.resolve(), build.resolve()
    SITE, PDF_DIR, TEX_DIR = BUILD / "site-data", BUILD / "pdf", BUILD / "tex"


PANDOC = pypandoc.get_pandoc_path()
TINYTEX_BIN = Path.home() / ".TinyTeX" / "bin" / "x86_64-linux"

MARKDOWN = "markdown+tex_math_dollars+fenced_divs+citations-implicit_figures"


def tex_env() -> dict[str, str]:
    env = dict(os.environ)
    if TINYTEX_BIN.is_dir():
        env["PATH"] = f"{TINYTEX_BIN}{os.pathsep}{env['PATH']}"
    env["TEXINPUTS"] = f"{TEMPLATES}//{os.pathsep}"
    return env


# Подготовка к контрольной (krN), коллоквиуму (colloqN), экзамену (examN) или квизу (quiz-<slug>):
# имя файла = id страницы на сайте. Id квиза — по теме (quiz-o-symbols), номер («Квиз 4») — в front matter quiz_number.
# = PREP_IDS в web/src/domain/preps.ts (маршруты сайта)
# synced в front matter: с чем сверен конспект. Порядок в courses.json фиксированный (сначала лекция).
SYNCED_PARTS = ("lecture", "seminars")


def synced_parts(value: object) -> list[str]:
    """Список из front matter `synced` в каноническом порядке; нет поля — пустой список."""
    if not isinstance(value, list):
        return []
    return [p for p in SYNCED_PARTS if p in value]


PREP_ID_RE = re.compile(r"(?P<kind>kr|colloq|exam)(?P<n>\d+)|(?P<quiz>quiz)-[a-z0-9][a-z0-9-]*")
PREP_IDS = ("kr1", "kr2", "kr3", "colloq1", "colloq2", "exam1", "exam2", "quiz-o-symbols", "quiz-limits")
PREP_FILES = ", ".join(f"{i}.md" for i in PREP_IDS)


def prep_kind(prep_id: str) -> str:
    """kr1 → kr, colloq1 → colloq, exam1 → exam, quiz-o-symbols → quiz."""
    m = PREP_ID_RE.fullmatch(prep_id)
    if not m:
        return ""
    return m.group("kind") or m.group("quiz")


# Документы курса, по одному на курс: <kind>/<course>.md → site-data/<course>/<kind>/, pdf/<course>/<kind>.pdf
COURSE_DOCS = ("theory", "program")


@dataclass
class Doc:
    path: Path
    kind: str  # notes | theory | program | prep
    course: str
    week_id: str
    meta: dict

    @property
    def rel(self) -> str:
        # временный файл (страница с дописанным банком билетов) может лежать вне SRC
        return self.path.relative_to(SRC).as_posix() if self.path.is_relative_to(SRC) else self.path.name

    @property
    def out_name(self) -> str:
        if self.kind in COURSE_DOCS:
            return self.kind
        return self.week_id  # prep: week_id = kr1, colloq1…


class BuildError(Exception):
    pass


def write_json(path: Path, data) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")


def read_front_matter(path: Path) -> dict:
    text = path.read_text(encoding="utf-8")
    m = re.match(r"^---\n(.*?)\n(---|\.\.\.)\n", text, re.DOTALL)
    if not m:
        raise BuildError(f"{path}: нет YAML front matter")
    return yaml.safe_load(m.group(1)) or {}


def discover() -> list[Doc]:
    docs = []
    for p in sorted((SRC / "notes").glob("*/*.md")):
        meta = read_front_matter(p)
        docs.append(Doc(p, "notes", p.parent.name, p.stem, meta))
    for p in sorted((SRC / "theory").glob("*.md")):
        meta = read_front_matter(p)
        docs.append(Doc(p, "theory", p.stem, "theory", meta))
    # план учебной дисциплины курса (context/markup.md §12): program/<course>.md → /<course>/program
    for p in sorted((SRC / "program").glob("*.md")):
        meta = read_front_matter(p)
        docs.append(Doc(p, "program", p.stem, "program", meta))
    for p in sorted((SRC / "prep").glob("*/*.md")):
        if p.stem not in PREP_IDS:  # линтер скажет то же
            raise BuildError(f"{p}: подготовка называется {PREP_FILES}")
        meta = read_front_matter(p)
        docs.append(Doc(p, "prep", p.parent.name, p.stem, meta))
    return docs


def run_pandoc(doc: Doc, to: str, out: Path, extra: list[str]) -> None:
    out.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        PANDOC,
        str(doc.path),
        "-f",
        MARKDOWN,
        "-t",
        to,
        "-o",
        str(out),
        "--eol=lf",  # pandoc на Windows иначе пишет CRLF, и `<span\r\nclass=…>` ломает разбор фрагмента на сайте
        "--lua-filter",
        str(FILTER),
        "-M",
        f"week_id={doc.week_id}",
        "-M",
        f"kind={doc.kind}",
        "-M",
        f"course={doc.course}",
        "-M",
        f"notes_config={CONFIG}",
        *extra,
    ]
    res = subprocess.run(cmd, capture_output=True, text=True, cwd=ROOT, check=False)
    if res.stderr.strip():
        sys.stderr.write(f"--- pandoc {doc.rel} ({to}) ---\n{res.stderr}")
    if res.returncode != 0:
        raise BuildError(f"pandoc упал на {doc.rel} ({to})")


# ----------------------------------------------------------------------------- индекс


def check_lecture_numbers(docs: list[Doc]) -> None:
    """Номер лекции однозначен в курсе: по нему сайт находит лекцию по устаревшему адресу (смена slug)."""
    seen: dict[tuple[str, str], str] = {}
    for doc in docs:
        if doc.kind != "notes":
            continue
        key = (doc.course, doc.week_id[:2])
        if key in seen:
            raise BuildError(
                f"две лекции с номером {key[1]} в курсе {doc.course}: {seen[key]} и {doc.week_id}"
            )
        seen[key] = doc.week_id


def build_index(docs: list[Doc], jobs: int) -> dict:
    check_lecture_numbers(docs)
    # отдельная временная папка на каждый запуск: агенты могут собирать параллельно
    BUILD.mkdir(parents=True, exist_ok=True)
    idx_dir = Path(tempfile.mkdtemp(prefix="idx-", dir=BUILD))

    def one(doc: Doc) -> Path:
        out = idx_dir / doc.course / f"{doc.out_name}.json"
        # вывод pandoc не нужен; файл вместо os.devnull — pandoc на Windows не пишет в «nul».
        # run_pandoc создает папку sink, и фильтр пишет out туда же
        sink = out.with_suffix(".native")
        run_pandoc(doc, "native", sink, ["-M", "notes_mode=index", "-M", f"notes_out={out}"])
        return out

    with cf.ThreadPoolExecutor(jobs) as ex:
        paths = list(ex.map(one, docs))

    labels: dict[str, dict] = {}
    lectures: dict[str, list] = {}
    errors = []
    for doc, p in zip(docs, paths, strict=True):
        data = json.loads(p.read_text(encoding="utf-8"))
        if doc.kind != "notes":
            continue
        course_labels = labels.setdefault(doc.course, {})
        for lid in data.get("label_order") or []:
            e = data["labels"][lid]
            if lid in course_labels:
                errors.append(f"метка {lid} определена и в {course_labels[lid]['file']}, и в {doc.rel}")
                continue
            e.update(
                course=doc.course,
                lecture=data["lecture"],
                week_id=doc.week_id,
                file=doc.rel,
            )
            course_labels[lid] = e
        lectures.setdefault(doc.course, []).append(
            {
                "lecture": data["lecture"],
                "week_id": doc.week_id,
                "title": data.get("title"),
                "date": data.get("date"),
                "synced": synced_parts(doc.meta.get("synced")),
                "file": doc.rel,
            }
        )
    if errors:
        raise BuildError("\n".join(errors))
    for v in lectures.values():
        v.sort(key=lambda x: x["lecture"])
    index = {"labels": labels, "lectures": lectures}
    shutil.rmtree(idx_dir, ignore_errors=True)
    tmp = BUILD / f"index.json.{os.getpid()}"
    write_json(tmp, index)
    tmp.replace(BUILD / "index.json")
    return index


# ----------------------------------------------------------------------------- PDF

OVERFULL_RE = re.compile(r"Overfull \\[hv]box \(([\d.]+)pt too (?:wide|high)\)[^\n]*lines? (\d+)")
OVERFULL_TOLERANCE_PT = 1.0
LATEX_ERROR_LINES = 30


def is_fresh(pdf_out: Path, stamp: Path, digest: str) -> bool:
    """PDF уже собран из этих же исходников (хеш лежит рядом)."""
    return pdf_out.exists() and stamp.exists() and stamp.read_text() == digest


def run_latexmk(
    tex: Path, out_dir: Path, cwd: Path, env: dict[str, str]
) -> tuple[subprocess.CompletedProcess[str], Path, str]:
    """latexmk -xelatex; возвращает результат, путь к логу и его текст."""
    res = subprocess.run(
        [
            "latexmk",
            "-xelatex",
            "-interaction=nonstopmode",
            "-halt-on-error",
            "-file-line-error",
            f"-outdir={out_dir}",
            str(tex),
        ],
        capture_output=True,
        text=True,
        env=env,
        cwd=cwd,
        check=False,
    )
    log = out_dir / f"{tex.stem}.log"
    return res, log, log.read_text(encoding="utf-8", errors="replace") if log.exists() else ""


def latex_failure(rel: str, res: subprocess.CompletedProcess[str], log: Path, log_text: str) -> BuildError:
    errs = [ln for ln in log_text.splitlines() if ln.startswith("!") or ".tex:" in ln]
    tail = "\n".join(errs[:LATEX_ERROR_LINES]) or res.stdout[-3000:]
    return BuildError(f"xelatex упал на {rel}:\n{tail}\n(полный лог: {log})")


def overfull_warnings(rel: str, log_text: str, tex_name: str | None = None) -> list[str]:
    warnings = []
    for m in OVERFULL_RE.finditer(log_text):
        pt = float(m.group(1))
        if pt > OVERFULL_TOLERANCE_PT:
            where = f" в {tex_name}" if tex_name else ""
            warnings.append(f"{rel}: overfull box {pt}pt (строка {m.group(2)}{where})")
    return warnings


def build_pdf(doc: Doc) -> list[str]:
    tex_dir = TEX_DIR / doc.course
    tex = tex_dir / f"{doc.out_name}.tex"
    tmp = tex.with_suffix(".tex.new")
    run_pandoc(
        doc,
        "latex",
        tmp,
        [
            "--template",
            str(TEMPLATES / "notes.latex"),
            "-M",
            "notes_mode=render",
            "-M",
            f"notes_index={BUILD / 'index.json'}",
        ],
    )
    pdf_out = PDF_DIR / doc.course / f"{doc.out_name}.pdf"
    stamp = tex.with_suffix(".hash")
    deps = "".join(
        hashlib.sha1(p.read_bytes()).hexdigest() for p in sorted(TEMPLATES.glob("*")) if p.is_file()
    )
    digest = hashlib.sha1(tmp.read_bytes() + deps.encode()).hexdigest()
    if is_fresh(pdf_out, stamp, digest):
        tmp.unlink()
        return []
    tmp.replace(tex)
    res, log, log_text = run_latexmk(tex, tex_dir, tex_dir, tex_env())
    if res.returncode != 0:
        raise latex_failure(doc.rel, res, log, log_text)
    warnings = []
    if "There were undefined references" in log_text or "Hyper reference" in log_text:
        warnings.append(f"{doc.rel}: в PDF есть неразрешенные ссылки (см. {log.name})")
    warnings += overfull_warnings(doc.rel, log_text, tex.name)
    pdf_out.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(tex.with_suffix(".pdf"), pdf_out)
    stamp.write_text(digest)
    return warnings


# ----------------------------------------------------------------------------- читлисты

# вариант печати → ровно столько страниц (context/prompts/cheatsheet.md §2)
CHEATSHEET_PAGES = {"1side": 1, "2side": 2}
PAGES_RE = re.compile(r"Output written on .*?\((\d+) pages?")


@dataclass
class Cheatsheet:
    """prep/<course>/cheatsheet/<prep>-cheatsheet-<variant>.tex — готовый LaTeX, не pandoc."""

    path: Path
    course: str
    prep: str  # kr1, kr2…
    variant: str  # 1side | 2side

    @property
    def rel(self) -> str:
        return self.path.relative_to(SRC).as_posix()

    @property
    def out_name(self) -> str:
        return f"{self.prep}-cheatsheet-{self.variant}"


def find_cheatsheets(course: str, prep: str) -> list[Cheatsheet]:
    found = []
    for p in sorted((SRC / "prep" / course / "cheatsheet").glob(f"{prep}-cheatsheet-*.tex")):
        variant = p.stem.removeprefix(f"{prep}-cheatsheet-")
        if variant not in CHEATSHEET_PAGES:
            raise BuildError(f"{p}: вариант читлиста — {' или '.join(CHEATSHEET_PAGES)}, а не {variant!r}")
        found.append(Cheatsheet(p, course, prep, variant))
    return found


def build_cheatsheet(cs: Cheatsheet) -> list[str]:
    """xelatex прямо по исходнику (общие \\input-файлы лежат рядом); проверка числа страниц."""
    src_dir = cs.path.parent
    tex_dir = TEX_DIR / cs.course / "cheatsheet"
    pdf_out = PDF_DIR / cs.course / f"{cs.out_name}.pdf"
    stamp = tex_dir / f"{cs.out_name}.hash"
    digest = hashlib.sha1(
        cs.path.name.encode() + b"".join(p.read_bytes() for p in sorted(src_dir.glob("*.tex")))
    ).hexdigest()
    if is_fresh(pdf_out, stamp, digest):
        return []
    tex_dir.mkdir(parents=True, exist_ok=True)
    env = tex_env()
    env["TEXINPUTS"] = f"{src_dir}{os.pathsep}{env['TEXINPUTS']}"
    res, log, log_text = run_latexmk(cs.path, tex_dir, src_dir, env)
    if res.returncode != 0:
        raise latex_failure(cs.rel, res, log, log_text)
    pages = [int(n) for n in PAGES_RE.findall(log_text)]
    want = CHEATSHEET_PAGES[cs.variant]
    if pages[-1:] != [want]:
        raise BuildError(
            f"{cs.rel}: {pages[-1] if pages else '?'} стр., а вариант {cs.variant} — ровно {want}"
        )
    pdf_out.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(tex_dir / f"{cs.path.stem}.pdf", pdf_out)
    stamp.write_text(digest)
    return overfull_warnings(cs.rel, log_text)


# ----------------------------------------------------------------------------- HTML


def preamble_hash() -> str:
    h = hashlib.sha1()
    for name in ("tikz-standalone.tex", "tikz-preamble.tex", "macros.tex", "fonts.tex"):
        h.update((TEMPLATES / name).read_bytes())
    return h.hexdigest()[:12]


def compile_tikz(code: str, digest: str) -> Path:
    cache_dir = CACHE / "tikz" / preamble_hash()
    svg = cache_dir / f"{digest}.svg"
    if svg.exists():
        return svg
    work = cache_dir / digest
    work.mkdir(parents=True, exist_ok=True)
    src = (TEMPLATES / "tikz-standalone.tex").read_text(encoding="utf-8")
    src = src.replace("\\input{figure-body.tex}", code)
    (work / "fig.tex").write_text(src, encoding="utf-8")
    env = tex_env()
    res = subprocess.run(
        ["xelatex", "-no-pdf", "-interaction=nonstopmode", "-halt-on-error", "fig.tex"],
        cwd=work,
        capture_output=True,
        text=True,
        env=env,
        check=False,
    )
    if res.returncode != 0:
        errs = [ln for ln in res.stdout.splitlines() if ln.startswith("!")]
        raise BuildError(f"TikZ → SVG: xelatex упал ({digest}): {' '.join(errs[:5])}")
    res = subprocess.run(
        ["dvisvgm", "--no-fonts", "--exact-bbox", "-o", str(svg), "fig.xdv"],
        cwd=work,
        capture_output=True,
        text=True,
        env=env,
        check=False,
    )
    if res.returncode != 0 or not svg.exists():
        raise BuildError(f"TikZ → SVG: dvisvgm упал ({digest}): {res.stderr[-500:]}")
    shutil.rmtree(work, ignore_errors=True)
    return svg


def build_html(doc: Doc) -> dict:
    page_dir = SITE / doc.course / doc.out_name
    if page_dir.exists():
        shutil.rmtree(page_dir)
    page_dir.mkdir(parents=True)
    sidecar = page_dir / "meta.json"
    run_pandoc(
        doc,
        "html5",
        page_dir / "fragment.html",
        [
            "--katex",
            "--section-divs",
            "-M",
            "notes_mode=render",
            "-M",
            f"notes_index={BUILD / 'index.json'}",
            "-M",
            f"notes_out={sidecar}",
        ],
    )
    meta = json.loads(sidecar.read_text(encoding="utf-8"))
    figures = meta.get("figures") or []
    if figures:
        (page_dir / "fig").mkdir()
        for fig in figures:
            svg = compile_tikz(fig["code"], fig["hash"])
            shutil.copy2(svg, page_dir / "fig" / f"{fig['hash']}.svg")
        for fig in figures:
            fig.pop("code", None)
        write_json(sidecar, meta)
    write_preview(page_dir, meta)
    if doc.kind == "prep" and ticket_bank.bank_path(doc.path).exists():
        export_bank(doc, meta, page_dir)
        meta["bank"] = True  # → courses.json: генератор на странице есть, только если bank.json записан
    return meta


def export_bank(doc: Doc, meta: dict, page_dir: Path) -> None:
    """prep/<course>/<prep>-bank.yaml → bank.json рядом с фрагментом страницы (только сайт, не PDF)."""
    path = ticket_bank.bank_path(doc.path)
    try:
        data = bank_site_data(doc, meta, page_dir, path)
    except ticket_bank.BankError as e:
        raise BuildError(
            f"{path.relative_to(SRC).as_posix()}: {e} (подробнее — uv run scripts/lint.py)"
        ) from e
    write_json(page_dir / "bank.json", data)


def bank_site_data(doc: Doc, meta: dict, page_dir: Path, path: Path) -> dict:
    notes = json.loads((BUILD / "index.json").read_text(encoding="utf-8"))["labels"].get(doc.course, {})
    own = meta.get("labels") or []
    bank = ticket_bank.load(path)
    labels = ticket_bank.Labels(notes, {e["id"]: e["type"] for e in own})
    errors, _ = ticket_bank.check_schema(bank, doc.week_id, labels)
    if errors:
        raise ticket_bank.BankError("; ".join(errors))
    ast = ticket_bank.snippet_ast(ticket_bank.snippets_markdown(bank), MARKDOWN)
    errors = ticket_bank.check_snippets(ast)
    if errors:
        raise ticket_bank.BankError("; ".join(errors))
    rendered = ticket_bank.split_rendered(render_bank_texts(doc, bank, page_dir))
    return ticket_bank.export(bank, doc.week_id, notes, own, rendered)


def render_bank_texts(doc: Doc, bank: dict, page_dir: Path) -> str:
    """Тексты банка дописываются в конец страницы и рендерятся тем же pandoc + notes.lua, что и она:
    ссылки на свои метки страницы и на конспекты, тире и неразрывные пробелы — ровно как на странице."""
    tmp = page_dir / f"{doc.week_id}.bank-render.md"
    out = page_dir / f"{doc.week_id}.bank-render.html"
    text = doc.path.read_text(encoding="utf-8").rstrip() + "\n\n" + ticket_bank.snippets_marked(bank)
    tmp.write_text(text, encoding="utf-8")
    try:
        run_pandoc(
            dataclasses.replace(doc, path=tmp),
            "html5",
            out,
            ["--katex", "-M", "notes_mode=render", "-M", f"notes_index={BUILD / 'index.json'}"],
        )
        return out.read_text(encoding="utf-8")
    finally:
        tmp.unlink(missing_ok=True)
        out.unlink(missing_ok=True)


def katex_macros() -> dict[str, str]:
    macros = {}
    for line in (TEMPLATES / "macros.tex").read_text(encoding="utf-8").splitlines():
        m = re.match(r"\\(?:re)?newcommand\{(\\[A-Za-z]+)\}(?:\[\d\])?\{(.*)\}\s*$", line)
        if m:
            macros[m.group(1)] = m.group(2)
    return macros


def write_preview(page_dir: Path, meta: dict) -> None:
    tpl = (TEMPLATES / "preview.html").read_text(encoding="utf-8")
    fragment = (page_dir / "fragment.html").read_text(encoding="utf-8")
    page = (
        tpl.replace("{{title}}", html.escape(meta.get("title") or ""))
        .replace("{{header_line}}", html.escape(meta.get("header_line") or ""))
        .replace("{{macros}}", json.dumps(katex_macros()))
        .replace("{{content}}", fragment)
    )
    (page_dir / "index.html").write_text(page, encoding="utf-8")


HIGHLIGHT_DAYS = 14


def highlight_default(date: str | None) -> str | None:
    """День, с которого подготовка выделена цветом, если в front matter нет highlight_from: date − 14 дней."""
    try:
        day = dt.date.fromisoformat(date or "")
    except ValueError:  # формат даты проверяет линтер
        return None
    return (day - dt.timedelta(days=HIGHLIGHT_DAYS)).isoformat()


def export_curriculum() -> None:
    """program/curriculum-2026-y1.yaml → curriculum.json (диаграмма учебного плана внизу главной; файл необязателен)."""
    path = SRC / curriculum.FILE
    if not path.exists():
        return
    try:
        write_json(SITE / "curriculum.json", curriculum.export(path))
    except curriculum.CurriculumError as e:
        raise BuildError(f"{curriculum.FILE.as_posix()}: {e}") from e


def prep_entries(metas: list[dict]) -> dict[str, list[dict]]:
    """Подготовки к КР, коллоквиумам, экзаменам и квизам по курсам, в порядке дат."""
    preps: dict[str, list[dict]] = {}
    for m in sorted(metas, key=lambda m: (m.get("date") or "", m["week_id"])):
        if m.get("kind") == "prep":
            preps.setdefault(m["course"], []).append(
                {
                    "id": m["week_id"],
                    "title": m.get("title"),
                    "date": m.get("date"),
                    # последний день, когда КР (коллоквиум) на сайте активна (плитка на главной,
                    # цветная кнопка); по умолчанию — день date
                    "active_until": m.get("active_until") or m.get("date"),
                    # с какого дня кнопка и плитка выделены цветом (до active_until включительно);
                    # по умолчанию — за две недели до date
                    "highlight_from": m.get("highlight_from") or highlight_default(m.get("date")),
                    "cheatsheets": [c.variant for c in find_cheatsheets(m["course"], m["week_id"])],
                    # есть банк билетов → на странице генератор (bank.json рядом с fragment.html)
                    "bank": bool(m.get("bank")),
                }
                # номер и тема квиза: сайт пишет «Квиз 4», тема — в скобках рядом; у КР полей нет
                | ({"quiz_topic": m["quiz_topic"]} if m.get("quiz_topic") else {})
                | ({"quiz_number": int(m["quiz_number"])} if m.get("quiz_number") else {})
            )
    return preps


def search_index(metas: list[dict]) -> list[dict]:
    entries = []
    for m in sorted(metas, key=lambda m: (m["course"], m["kind"], m["lecture"], m["week_id"])):
        fragment = (SITE / m["course"] / m["week_id"] / "fragment.html").read_text(encoding="utf-8")
        entries += search_entries(m["course"], m["week_id"], m["lecture"], fragment)
    return entries


def review_links(index: dict, preps: dict[str, list[dict]]) -> list[str]:
    """Список страниц для ревью html-версии."""
    links = []
    for course, lst in sorted(index["lectures"].items()):
        links.append(f"<h2>{html.escape(course)}</h2><ul>")
        links.extend(
            f'<li><a href="{course}/{lec["week_id"]}/">{lec["lecture"]}. {html.escape(lec["title"] or "")}</a></li>'
            for lec in lst
        )
        if (SITE / course / "theory").exists():
            links.append(f'<li><a href="{course}/theory/">Теория</a></li>')
        if (SITE / course / "program").exists():
            links.append(f'<li><a href="{course}/program/">План учебной дисциплины</a></li>')
        links.extend(
            f'<li><a href="{course}/{p["id"]}/">{html.escape(p["title"] or "")}</a></li>'
            for p in preps.get(course, [])
        )
        links.append("</ul>")
    return links


def write_site_data(index: dict, metas: list[dict]) -> None:
    SITE.mkdir(parents=True, exist_ok=True)
    write_json(SITE / "index.json", index["labels"])
    preps = prep_entries(metas)
    write_json(
        SITE / "courses.json",
        {
            "config": json.loads(CONFIG.read_text(encoding="utf-8")),
            "lectures": index["lectures"],
            "preps": preps,
            # курсы со страницей «План учебной дисциплины» (program/<course>.md)
            "programs": sorted(m["course"] for m in metas if m.get("kind") == "program"),
        },
    )
    write_json(SITE / "katex-macros.json", katex_macros())
    export_curriculum()
    (SITE / "search.json").write_text(json.dumps(search_index(metas), ensure_ascii=False), encoding="utf-8")
    (SITE / "index.html").write_text(
        "<!doctype html><meta charset='utf-8'><title>Конспекты — превью</title>"
        "<body style='font-family:sans-serif;max-width:40em;margin:2em auto'>"
        "<h1>Превью html-версии</h1>" + "".join(review_links(index, preps)),
        encoding="utf-8",
    )


# ----------------------------------------------------------------------------- main


class Target(Protocol):
    @property
    def rel(self) -> str: ...


def run_parallel[T: Target, R](
    kind: str, fn: Callable[[T], R], targets: list[T], jobs: int, failures: list[str]
) -> list[R]:
    """fn(target) для всех targets в пуле; ошибки сборки копятся в failures, результаты — в порядке готовности."""
    results = []
    with cf.ThreadPoolExecutor(jobs) as ex:
        futs = {ex.submit(fn, d): d for d in targets}
        for f in cf.as_completed(futs):
            try:
                results.append(f.result())
                print(f"{kind:<4} ok  {futs[f].rel}")
            except BuildError as e:
                failures.append(str(e))
                print(f"{kind} FAIL {futs[f].rel}")
    return results


def select_targets(docs: list[Doc], only: list[str]) -> list[Doc]:
    """Документы, чьи пути подходят под glob-и `--only`; банк билетов собирается вместе со своей страницей."""
    patterns = [
        p.removesuffix(ticket_bank.BANK_SUFFIX) + ".md" if p.endswith(ticket_bank.BANK_SUFFIX) else p
        for p in only
    ]
    targets = [d for d in docs if any(fnmatch.fnmatch(d.rel, pat) or d.rel == pat for pat in patterns)]
    if not targets:
        raise BuildError(f"--only {patterns}: ни одного файла")
    return targets


def build_all(args: argparse.Namespace, failures: list[str]) -> list[str]:
    """Собирает выбранное; возвращает предупреждения, ошибки отдельных страниц копит в failures."""
    docs = discover()
    index = build_index(docs, args.jobs)
    targets = select_targets(docs, args.only) if args.only else docs
    warnings: list[str] = []
    if not args.no_pdf:
        sheets = [c for d in targets if d.kind == "prep" for c in find_cheatsheets(d.course, d.week_id)]
        for doc_warnings in run_parallel("PDF", build_pdf, targets, args.jobs, failures):
            warnings += doc_warnings
        for doc_warnings in run_parallel("PDF", build_cheatsheet, sheets, args.jobs, failures):
            warnings += doc_warnings
    if not args.no_html:
        metas = run_parallel("HTML", build_html, targets, args.jobs, failures)
        if not args.only:
            write_site_data(index, metas)
    return warnings


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--only", nargs="*", help="glob-и путей (относительно корня), которые собирать")
    ap.add_argument("--no-pdf", action="store_true")
    ap.add_argument("--no-html", action="store_true")
    ap.add_argument("--strict", action="store_true", help="предупреждения — ошибки")
    ap.add_argument("-j", "--jobs", type=int, default=os.cpu_count() or 2)
    ap.add_argument("--src", type=Path, default=ROOT, help="папка с notes/, theory/, program/ и prep/")
    ap.add_argument("--out", type=Path, default=None, help="папка сборки (по умолчанию <src>/build)")
    args = ap.parse_args()
    set_dirs(args.src, args.out or args.src / "build")

    failures: list[str] = []
    try:
        warnings = build_all(args, failures)
    except BuildError as e:
        print(f"\nОШИБКА: {e}", file=sys.stderr)
        return 1

    for w in warnings:
        print(f"WARNING: {w}", file=sys.stderr)
    for e in failures:
        print(f"\nОШИБКА: {e}", file=sys.stderr)
    return 1 if failures or (args.strict and warnings) else 0


if __name__ == "__main__":
    sys.exit(main())
