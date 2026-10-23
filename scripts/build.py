"""Сборка конспектов и теории курсов: Markdown → PDF (xelatex) и HTML-фрагменты для сайта.

Запуск:
    uv run scripts/build.py                       # всё
    uv run scripts/build.py --only notes/algebra/04_*.md
    uv run scripts/build.py --no-html --strict

Результат в build/:
    build/index.json                    глобальный индекс меток и глоссариев
    build/pdf/<course>/<week_id>.pdf    PDF конспектов, build/pdf/<course>/theory.pdf
    build/pdf/<course>/krN-cheatsheet-<variant>.pdf
                                        читлисты из prep/<course>/cheatsheet/krN-cheatsheet-<variant>.tex
    build/site-data/                    данные для будущего сайта + preview-страницы
        index.json, courses.json, katex-macros.json, search.json
        <course>/glossary.json
        <course>/<week_id>/fragment.html, meta.json, fig/*.svg, index.html (preview)
        <course>/theory/...
"""

from __future__ import annotations

import argparse
import concurrent.futures as cf
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
from dataclasses import dataclass
from html.parser import HTMLParser
from pathlib import Path

import pypandoc
import yaml

ROOT = Path(__file__).resolve().parent.parent
TEMPLATES = ROOT / "templates"
FILTER = ROOT / "filters" / "notes.lua"
CONFIG = TEMPLATES / "courses.json"
SRC = ROOT  # где лежат notes/ и theory/ (в тестах — временная папка)
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


@dataclass
class Doc:
    path: Path
    kind: str  # notes | theory | prep
    course: str
    week_id: str
    meta: dict

    @property
    def rel(self) -> str:
        return self.path.relative_to(SRC).as_posix()

    @property
    def out_name(self) -> str:
        return "theory" if self.kind == "theory" else self.week_id  # prep: week_id = kr1, kr2…


class BuildError(Exception):
    pass


def write_json(path: Path, data) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")


def read_front_matter(path: Path) -> dict:
    text = path.read_text(encoding="utf-8")
    m = re.match(r"^---\n(.*?)\n(---|\.\.\.)\n", text, re.S)
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
    for p in sorted((SRC / "prep").glob("*/*.md")):
        if not re.fullmatch(r"kr[1-3]", p.stem):  # = PREP_IDS на сайте; линтер скажет то же
            raise BuildError(f"{p}: подготовка к КР называется kr1.md, kr2.md или kr3.md")
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
    res = subprocess.run(cmd, capture_output=True, text=True, cwd=ROOT)
    if res.stderr.strip():
        sys.stderr.write(f"--- pandoc {doc.rel} ({to}) ---\n{res.stderr}")
    if res.returncode != 0:
        raise BuildError(f"pandoc упал на {doc.rel} ({to})")


# ----------------------------------------------------------------------------- индекс


def build_index(docs: list[Doc], jobs: int) -> dict:
    # отдельная временная папка на каждый запуск: агенты могут собирать параллельно
    BUILD.mkdir(parents=True, exist_ok=True)
    idx_dir = Path(tempfile.mkdtemp(prefix="idx-", dir=BUILD))

    def one(doc: Doc) -> Path:
        out = idx_dir / doc.course / f"{doc.out_name}.json"
        # вывод pandoc не нужен; файл вместо os.devnull — pandoc на Windows не пишет в «nul».
        # run_pandoc создаёт папку sink, и фильтр пишет out туда же
        sink = out.with_suffix(".native")
        run_pandoc(doc, "native", sink, ["-M", "notes_mode=index", "-M", f"notes_out={out}"])
        return out

    with cf.ThreadPoolExecutor(jobs) as ex:
        paths = list(ex.map(one, docs))

    labels: dict[str, dict] = {}
    glossary: dict[str, list] = {}
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
        for g in data.get("glossary") or []:
            g.update(lecture=data["lecture"], week_id=doc.week_id)
            glossary.setdefault(doc.course, []).append(g)
        lectures.setdefault(doc.course, []).append(
            {
                "lecture": data["lecture"],
                "week_id": doc.week_id,
                "title": data.get("title"),
                "date": data.get("date"),
                "file": doc.rel,
            }
        )
    if errors:
        raise BuildError("\n".join(errors))
    for v in lectures.values():
        v.sort(key=lambda x: x["lecture"])
    index = {"labels": labels, "glossary": glossary, "lectures": lectures}
    shutil.rmtree(idx_dir, ignore_errors=True)
    tmp = BUILD / f"index.json.{os.getpid()}"
    write_json(tmp, index)
    os.replace(tmp, BUILD / "index.json")
    return index


# ----------------------------------------------------------------------------- PDF

OVERFULL_RE = re.compile(r"Overfull \\[hv]box \(([\d.]+)pt too (?:wide|high)\)[^\n]*lines? (\d+)")


def build_pdf(doc: Doc) -> list[str]:
    warnings = []
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
    if pdf_out.exists() and stamp.exists() and stamp.read_text() == digest:
        tmp.unlink()
        return warnings
    tmp.replace(tex)
    res = subprocess.run(
        [
            "latexmk",
            "-xelatex",
            "-interaction=nonstopmode",
            "-halt-on-error",
            "-file-line-error",
            f"-outdir={tex_dir}",
            str(tex),
        ],
        capture_output=True,
        text=True,
        env=tex_env(),
        cwd=tex_dir,
    )
    log = tex.with_suffix(".log")
    log_text = log.read_text(encoding="utf-8", errors="replace") if log.exists() else ""
    if res.returncode != 0:
        errs = [ln for ln in log_text.splitlines() if ln.startswith("!") or ".tex:" in ln]
        tail = "\n".join(errs[:30]) or res.stdout[-3000:]
        raise BuildError(f"xelatex упал на {doc.rel}:\n{tail}\n(полный лог: {log})")
    if "There were undefined references" in log_text or "Hyper reference" in log_text:
        warnings.append(f"{doc.rel}: в PDF есть неразрешённые ссылки (см. {log.name})")
    for m in OVERFULL_RE.finditer(log_text):
        pt = float(m.group(1))
        if pt > 1.0:
            warnings.append(f"{doc.rel}: overfull box {pt}pt (строка {m.group(2)} в {tex.name})")
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
    if pdf_out.exists() and stamp.exists() and stamp.read_text() == digest:
        return []
    tex_dir.mkdir(parents=True, exist_ok=True)
    env = tex_env()
    env["TEXINPUTS"] = f"{src_dir}{os.pathsep}{env['TEXINPUTS']}"
    res = subprocess.run(
        [
            "latexmk",
            "-xelatex",
            "-interaction=nonstopmode",
            "-halt-on-error",
            "-file-line-error",
            f"-outdir={tex_dir}",
            str(cs.path),
        ],
        capture_output=True,
        text=True,
        env=env,
        cwd=src_dir,
    )
    log = tex_dir / f"{cs.path.stem}.log"
    log_text = log.read_text(encoding="utf-8", errors="replace") if log.exists() else ""
    if res.returncode != 0:
        errs = [ln for ln in log_text.splitlines() if ln.startswith("!") or ".tex:" in ln]
        tail = "\n".join(errs[:30]) or res.stdout[-3000:]
        raise BuildError(f"xelatex упал на {cs.rel}:\n{tail}\n(полный лог: {log})")
    pages = [int(n) for n in PAGES_RE.findall(log_text)]
    want = CHEATSHEET_PAGES[cs.variant]
    if pages[-1:] != [want]:
        raise BuildError(
            f"{cs.rel}: {pages[-1] if pages else '?'} стр., а вариант {cs.variant} — ровно {want}"
        )
    warnings = []
    for m in OVERFULL_RE.finditer(log_text):
        pt = float(m.group(1))
        if pt > 1.0:
            warnings.append(f"{cs.rel}: overfull box {pt}pt (строка {m.group(2)})")
    pdf_out.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(tex_dir / f"{cs.path.stem}.pdf", pdf_out)
    stamp.write_text(digest)
    return warnings


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
    return meta


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


BLOCK_TAGS = {"p", "div", "li", "section", "br", "td", "th", "tr", "figcaption", "summary", "blockquote"}
# ответы прячутся под спойлер — в сниппете поиска их быть не должно
SEARCH_SKIP = {"nb-answer", "nb-answers", "nb-solution"}


class SearchChunks(HTMLParser):
    """Плоский текст фрагмента по якорям: ближайший `<section id>` или `div.nb[id]`.

    Заголовок раздела или имя блока идут в `heading`, остальное — в `text`. Inline-формулы
    остаются как `$…$`; display-формулы, ответы и копии блоков в теории (`reg-…`, оригинал
    уже есть в лекции) выкидываются.
    """

    def __init__(self) -> None:
        super().__init__()
        self.chunks: dict[str, dict] = {}
        self.stack: list[tuple[str, str | None]] = []  # (тег, что открыл: anchor | heading | math | skip)
        self.anchors: list[str] = []
        self.heading = 0
        self.skip = 0

    def handle_starttag(self, tag, attrs):
        if tag in BLOCK_TAGS or re.fullmatch(r"h[1-6]", tag):
            self.handle_data(" ")
        a = dict(attrs)
        classes = (a.get("class") or "").split()
        role = None
        if SEARCH_SKIP & set(classes) or (a.get("id") or "").startswith("reg-"):
            self.skip += 1
            role = "skip"
        elif a.get("id") and (tag == "section" or "nb" in classes):
            self.anchors.append(a["id"])
            self.chunks.setdefault(a["id"], {"heading": [], "text": []})
            role = "anchor"
        elif re.fullmatch(r"h[1-6]", tag) or "nb-name" in classes:
            self.heading += 1
            role = "heading"
        elif "math" in classes and "display" in classes:
            self.skip += 1
            role = "skip"
        elif "math" in classes:
            self.handle_data("$")
            role = "math"
        if tag not in ("br", "img", "hr", "input"):
            self.stack.append((tag, role))

    def handle_endtag(self, tag):
        if tag in BLOCK_TAGS:
            self.handle_data(" ")
        while self.stack:
            open_tag, role = self.stack.pop()
            if role == "anchor":
                self.anchors.pop()
            elif role == "heading":
                self.heading -= 1
            elif role == "skip":
                self.skip -= 1
            elif role == "math":
                self.handle_data("$")
            if open_tag == tag:
                break

    def handle_data(self, data):
        if self.skip or not self.anchors:
            return
        chunk = self.chunks[self.anchors[-1]]
        chunk["heading" if self.heading else "text"].append(data)


def squash(parts: list[str]) -> str:
    text = re.sub(r"\s+", " ", "".join(parts)).strip()
    text = re.sub(r"\$\s*(.*?)\s*\$", r"$\1$", text)
    return re.sub(r"\s+([,.;:!?)])", r"\1", text)


def search_entries(course: str, doc: str, lecture: int, fragment: str) -> list[dict]:
    parser = SearchChunks()
    parser.feed(fragment)
    entries = []
    for anchor, chunk in parser.chunks.items():
        heading, text = squash(chunk["heading"]), squash(chunk["text"])
        if heading or text:
            entries.append(
                {
                    "course": course,
                    "doc": doc,
                    "lecture": lecture,
                    "anchor": anchor,
                    "heading": heading,
                    "text": text,
                }
            )
    return entries


def write_site_data(index: dict, metas: list[dict]) -> None:
    SITE.mkdir(parents=True, exist_ok=True)
    write_json(SITE / "index.json", index["labels"])
    preps: dict[str, list] = {}
    for m in sorted(metas, key=lambda m: (m.get("date") or "", m["week_id"])):
        if m.get("kind") == "prep":
            preps.setdefault(m["course"], []).append(
                {
                    "id": m["week_id"],
                    "title": m.get("title"),
                    "date": m.get("date"),
                    "cheatsheets": [c.variant for c in find_cheatsheets(m["course"], m["week_id"])],
                }
            )
    write_json(
        SITE / "courses.json",
        {
            "config": json.loads(CONFIG.read_text(encoding="utf-8")),
            "lectures": index["lectures"],
            "preps": preps,
        },
    )
    write_json(SITE / "katex-macros.json", katex_macros())
    by_course: dict[str, list] = {}
    for m in metas:
        if m.get("kind") != "notes":
            continue
        for g in m.get("glossary") or []:
            by_course.setdefault(m["course"], []).append(
                {**g, "lecture": m["lecture"], "week_id": m["week_id"]}
            )
    for course, items in by_course.items():
        items.sort(key=lambda g: (g["lecture"], g["term"].lower()))
        (SITE / course).mkdir(parents=True, exist_ok=True)
        write_json(SITE / course / "glossary.json", items)
    search = []
    for m in sorted(metas, key=lambda m: (m["course"], m["kind"], m["lecture"])):
        fragment = (SITE / m["course"] / m["week_id"] / "fragment.html").read_text(encoding="utf-8")
        search += search_entries(m["course"], m["week_id"], m["lecture"], fragment)
    (SITE / "search.json").write_text(json.dumps(search, ensure_ascii=False), encoding="utf-8")
    # список страниц для ревью html-версии
    links = []
    for course, lst in sorted(index["lectures"].items()):
        links.append(f"<h2>{html.escape(course)}</h2><ul>")
        for lec in lst:
            links.append(
                f'<li><a href="{course}/{lec["week_id"]}/">{lec["lecture"]}. '
                f"{html.escape(lec['title'] or '')}</a></li>"
            )
        if (SITE / course / "theory").exists():
            links.append(f'<li><a href="{course}/theory/">Теория</a></li>')
        for p in preps.get(course, []):
            links.append(f'<li><a href="{course}/{p["id"]}/">{html.escape(p["title"] or "")}</a></li>')
        links.append("</ul>")
    (SITE / "index.html").write_text(
        "<!doctype html><meta charset='utf-8'><title>Конспекты — превью</title>"
        "<body style='font-family:sans-serif;max-width:40em;margin:2em auto'>"
        "<h1>Превью html-версии</h1>" + "".join(links),
        encoding="utf-8",
    )


# ----------------------------------------------------------------------------- main


def run_parallel(kind: str, fn, targets: list[Doc], jobs: int, failures: list[str]) -> list:
    """fn(doc) для всех targets в пуле; ошибки сборки копятся в failures, результаты — в порядке готовности."""
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


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--only", nargs="*", help="glob-и путей (относительно корня), которые собирать")
    ap.add_argument("--no-pdf", action="store_true")
    ap.add_argument("--no-html", action="store_true")
    ap.add_argument("--strict", action="store_true", help="предупреждения — ошибки")
    ap.add_argument("-j", "--jobs", type=int, default=os.cpu_count() or 2)
    ap.add_argument("--src", type=Path, default=ROOT, help="папка с notes/ и theory/")
    ap.add_argument("--out", type=Path, default=None, help="папка сборки (по умолчанию <src>/build)")
    args = ap.parse_args()
    set_dirs(args.src, args.out or args.src / "build")

    try:
        docs = discover()
        index = build_index(docs, args.jobs)
        targets = docs
        if args.only:
            targets = [
                d for d in docs if any(fnmatch.fnmatch(d.rel, pat) or d.rel == pat for pat in args.only)
            ]
            if not targets:
                raise BuildError(f"--only {args.only}: ни одного файла")
        warnings: list[str] = []
        failures: list[str] = []

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
    except BuildError as e:
        print(f"\nОШИБКА: {e}", file=sys.stderr)
        return 1

    for w in warnings:
        print(f"WARNING: {w}", file=sys.stderr)
    for e in failures:
        print(f"\nОШИБКА: {e}", file=sys.stderr)
    if failures or (args.strict and warnings):
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
