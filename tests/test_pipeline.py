"""Тесты фильтра, сборки и линтера на демо-конспектах tests/fixtures/demo."""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
DEMO = ROOT / "tests" / "fixtures" / "demo"
HAS_TEX = (
    shutil.which("xelatex") is not None
    or (Path.home() / ".TinyTeX" / "bin" / "x86_64-linux" / "xelatex").exists()
)


def run(script: str, *args: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, str(ROOT / "scripts" / script), *args],
        capture_output=True,
        text=True,
        cwd=ROOT,
    )


@pytest.fixture()
def demo(tmp_path: Path) -> Path:
    dst = tmp_path / "demo"
    shutil.copytree(DEMO, dst)
    return dst


def build(src: Path, *extra: str) -> subprocess.CompletedProcess:
    return run("build.py", "--src", str(src), "--out", str(src / "build"), *extra)


def lint(src: Path, *extra: str) -> subprocess.CompletedProcess:
    return run("lint.py", "--src", str(src), *extra)


# ----------------------------------------------------------------------------- нумерация и индекс


def test_index_single_counter(demo: Path):
    res = build(demo, "--no-pdf", "--no-html")
    assert res.returncode == 0, res.stderr
    idx = json.loads((demo / "build" / "index.json").read_text(encoding="utf-8"))
    labels = idx["labels"]["algebra"]
    # один сквозной счётчик на все блоки, рисунки и формулы, в порядке появления
    assert labels["def:lec01:matrix"]["number"] == "1.1"
    assert labels["ex:lec01:matrix"]["number"] == "1.2"
    assert labels["thm:lec01:assoc"]["number"] == "1.3"
    assert labels["eq:lec01:assoc"]["number"] == "1.4"
    assert labels["rem:lec01:noncomm"]["number"] == "1.5"
    assert labels["fig:lec01:mult"]["number"] == "1.6"
    assert labels["prob:lec01:product"]["number"] == "1.7"
    assert labels["def:lec02:elem"]["number"] == "2.1"
    assert "basis" not in labels["def:lec02:elem"]
    assert {g["term"] for g in idx["glossary"]["algebra"]} == {
        "Матрица",
        "[A]_{ij}",
        "Элементарное преобразование",
    }


FIGURE_CASES = """
::: {.theorem #thm:lec02:fig-inside}
Формула и рисунок внутри блока получают номера после блока:
$$a = a.$$ {#eq:lec02:inside}

```{.tikz #fig:lec02:inside caption="внутри теоремы"}
\\begin{tikzpicture}\\draw (0,0) -- (1,1);\\end{tikzpicture}
```
:::

::: {.remark .unnumbered}
Ненумерованный блок счётчик не двигает.
:::

```{.tikz #fig:lec02:after caption="после ненумерованного блока"}
\\begin{tikzpicture}\\draw (0,0) -- (1,0);\\end{tikzpicture}
```

# Практика
"""


@pytest.mark.skipif(not HAS_TEX, reason="нужен TeX для TikZ → SVG")
def test_single_counter_for_blocks_figures_equations(demo: Path):
    # формула и рисунок внутри блока, рисунок после ненумерованного блока: сбор меток и рендер
    # должны пройти документ в одном порядке, иначе номера в индексе и в тексте разъедутся
    note = demo / "notes" / "algebra" / "02_sep09_gauss.md"
    note.write_text(
        note.read_text(encoding="utf-8").replace("\n# Практика\n", FIGURE_CASES, 1), encoding="utf-8"
    )
    res = build(demo, "--no-pdf")
    assert res.returncode == 0, res.stderr
    labels = json.loads((demo / "build" / "index.json").read_text(encoding="utf-8"))["labels"]["algebra"]
    expected = {
        "def:lec02:elem": "2.1",
        "thm:lec02:fig-inside": "2.3",
        "eq:lec02:inside": "2.4",
        "fig:lec02:inside": "2.5",
        "fig:lec02:after": "2.6",
        "prob:lec02:swap": "2.7",
    }
    assert {key: labels[key]["number"] for key in expected} == expected
    frag = (demo / "build" / "site-data" / "algebra" / "02_sep09_gauss" / "fragment.html").read_text(
        encoding="utf-8"
    )
    for key, number in expected.items():
        assert f'id="{key}"' in frag
        tag = frag[frag.rindex("<", 0, frag.index(f'id="{key}"')) :]
        assert f'data-number="{number}"' in tag.split(">", 1)[0], key


@pytest.mark.skipif(not HAS_TEX, reason="нужен TeX для TikZ → SVG")
def test_html_blocks_and_refs(demo: Path):
    res = build(demo, "--no-pdf")
    assert res.returncode == 0, res.stderr
    site = demo / "build" / "site-data"
    frag = (site / "algebra" / "01_sep03_matrices" / "fragment.html").read_text(encoding="utf-8")
    assert 'id="thm:lec01:assoc"' in frag and 'data-number="1.3"' in frag
    assert 'data-tag="misconception"' in frag
    assert "Замечание 1.5" in frag
    assert 'href="#eq:lec01:assoc"' in frag and "(1.4)" in frag
    assert "\\tag{1.4}" in frag
    assert '<details class="nb-answers">' in frag
    meta = json.loads((site / "algebra" / "01_sep03_matrices" / "meta.json").read_text(encoding="utf-8"))
    assert meta["lecture"] == 1 and "basis" not in meta and "based_on" not in meta
    assert meta["header_line"] == "ПИ ФКН ВШЭ 2026/27 · Алгебра · Лекция 1 · 3 сентября 2026"
    fig = meta["figures"][0]
    assert (site / "algebra" / "01_sep03_matrices" / "fig" / f"{fig['hash']}.svg").exists()
    # alt рисунка без сырого TeX: в подписи есть формула, поэтому alt — номер рисунка
    assert 'alt="Рис. 1.6"' in frag and "c_{ij}" not in frag.split('alt="', 1)[1].split('"', 1)[0]
    # ссылка на другую лекцию: относительный путь + номер лекции
    frag2 = (site / "algebra" / "02_sep09_gauss" / "fragment.html").read_text(encoding="utf-8")
    assert 'href="../01_sep03_matrices/#thm:lec01:assoc"' in frag2
    assert "1.3 (лекция 1)" in frag2
    # теория курса берёт номера из конспектов
    reg = (site / "algebra" / "theory" / "fragment.html").read_text(encoding="utf-8")
    assert 'data-number="1.3"' in reg and "черновик" not in reg
    # глоссарий курса в теории: сначала по лекциям, внутри по алфавиту
    glossary_html = reg[reg.index("nb-course-glossary") :]
    assert (
        glossary_html.index("Лекция\u00a01")
        < glossary_html.index("Матрица")
        < glossary_html.index("Лекция\u00a02")
    )
    gl = json.loads((site / "algebra" / "glossary.json").read_text(encoding="utf-8"))
    assert [g["term"] for g in gl] == ["[A]_{ij}", "Матрица", "Элементарное преобразование"]
    search = json.loads((site / "search.json").read_text(encoding="utf-8"))
    assoc = next(e for e in search if e["anchor"] == "thm:lec01:assoc")
    assert assoc["course"] == "algebra" and assoc["doc"] == "01_sep03_matrices"
    assert assoc["heading"].startswith("Теорема 1.3")
    assert any(e["doc"] == "theory" for e in search)
    # подготовка к КР: свои номера без лекции, ref-блоки и ссылки в конспекты
    prep = (site / "algebra" / "kr1" / "fragment.html").read_text(encoding="utf-8")
    assert 'id="prob:kr1:square"' in prep and "Задача\u00a02" in prep
    assert 'id="reg-thm:lec01:assoc"' in prep and 'data-number="1.3"' in prep
    assert 'id="reg-thm:lec01:assoc-2"' in prep  # повтор того же блока — другой якорь
    assert 'href="../01_sep03_matrices/#prob:lec01:product"' in prep
    assert 'href="#prob:kr1:square"' in prep and "«Умножение матриц»" in prep
    assert 'class="nb-answer"' in prep and '<details class="nb-answers">' in prep
    pmeta = json.loads((site / "algebra" / "kr1" / "meta.json").read_text(encoding="utf-8"))
    assert pmeta["kind"] == "prep" and pmeta["lecture"] == 0
    assert pmeta["header_line"] == "ПИ ФКН ВШЭ 2026/27 · Алгебра · Подготовка к КР-1 · 7 ноября 2026"
    courses = json.loads((site / "courses.json").read_text(encoding="utf-8"))
    assert courses["preps"] == {
        "algebra": [
            {
                "id": "kr1",
                "title": "Подготовка к КР-1: Алгебра",
                "date": "2026-11-07",
                "active_until": "2026-11-07",
                "cheatsheets": ["1side"],
                "bank": False,
            }
        ]
    }
    assert any(e["doc"] == "kr1" for e in search)
    # метки подготовки не попадают в индекс курса
    assert "prob:kr1:square" not in json.loads((site / "index.json").read_text(encoding="utf-8"))["algebra"]


def test_search_entries():
    sys.path.insert(0, str(ROOT / "scripts"))
    from build import search_entries

    frag = (
        '<section id="s1" class="level1"><h1>Раздел</h1><p>Текст <span class="math inline">x^2</span>, '
        'дальше.</p><span class="math display">\\[ y \\]</span>'
        '<div id="thm:a" class="nb nb-theorem"><div class="nb-head"><span class="nb-name">Теорема 1.1'
        '</span></div><div class="nb-body"><p>Тело.</p><div class="nb-answer"><p>Ответ.</p></div></div></div>'
        '<div id="reg-thm:a" class="nb"><p>Копия.</p></div><p>Хвост.</p></section>'
    )
    assert search_entries("algebra", "w", 1, frag) == [
        {
            "course": "algebra",
            "doc": "w",
            "lecture": 1,
            "anchor": "s1",
            "heading": "Раздел",
            "text": "Текст $x^2$, дальше. Хвост.",
        },
        {
            "course": "algebra",
            "doc": "w",
            "lecture": 1,
            "anchor": "thm:a",
            "heading": "Теорема 1.1",
            "text": "Тело.",
        },
    ]


def to_latex(demo: Path, week_id: str) -> str:
    import pypandoc

    return pypandoc.convert_file(
        str(demo / "notes" / "algebra" / f"{week_id}.md"),
        "latex",
        format="markdown",
        extra_args=[
            "--lua-filter",
            str(ROOT / "filters" / "notes.lua"),
            "-M",
            "notes_mode=render",
            "-M",
            f"notes_index={demo / 'build' / 'index.json'}",
            "-M",
            f"week_id={week_id}",
            "-M",
            f"notes_config={ROOT / 'templates' / 'courses.json'}",
        ],
    )


def test_latex_blocks(demo: Path):
    res = build(demo, "--no-pdf", "--no-html")
    assert res.returncode == 0, res.stderr
    out = to_latex(demo, "02_sep09_gauss")
    assert "\\begin{nbblock}{definition}{}{def:lec02:elem}" in out
    assert "\\nbhead{Определение~2.1}" in out
    assert "\\begin{nbblock}{remark}{corner-case}{}" in out
    assert "(корнер-кейс)" in out
    # в LaTeX тот же единый ряд: Теорема 1.3, формула (1.4), Замечание 1.5, Рис. 1.6
    out1 = to_latex(demo, "01_sep03_matrices")
    order = [
        out1.index(mark)
        for mark in ("\\nbhead{Теорема~1.3", "\\tag{1.4}", "\\nbhead{Замечание~1.5", "\\nbfigcaption{1.6}")
    ]
    assert order == sorted(order)


# ----------------------------------------------------------------------------- ошибки сборки


def test_unresolved_ref_fails(demo: Path):
    p = demo / "notes" / "algebra" / "02_sep09_gauss.md"
    p.write_text(
        p.read_text(encoding="utf-8").replace("@def:lec01:matrix", "@def:lec01:nope"), encoding="utf-8"
    )
    res = build(demo, "--no-pdf")
    assert res.returncode != 0
    assert "неизвестная ссылка @def:lec01:nope" in res.stderr


def test_duplicate_label_fails(demo: Path):
    p = demo / "notes" / "algebra" / "02_sep09_gauss.md"
    p.write_text(
        p.read_text(encoding="utf-8").replace("#def:lec02:elem", "#def:lec01:matrix"), encoding="utf-8"
    )
    res = build(demo, "--no-pdf", "--no-html")
    assert res.returncode != 0
    assert "def:lec01:matrix" in res.stderr


@pytest.mark.skipif(not HAS_TEX, reason="нужен TeX")
def test_pdf_builds(demo: Path):
    res = build(demo, "--no-html", "--strict")
    assert res.returncode == 0, res.stderr + res.stdout
    for name in ("01_sep03_matrices", "02_sep09_gauss", "theory", "kr1"):
        assert (demo / "build" / "pdf" / "algebra" / f"{name}.pdf").stat().st_size > 10_000
    # читлист prep/algebra/cheatsheet/kr1-cheatsheet-1side.tex — рядом с PDF подготовки
    assert (demo / "build" / "pdf" / "algebra" / "kr1-cheatsheet-1side.pdf").stat().st_size > 1_000


@pytest.mark.skipif(not HAS_TEX, reason="нужен TeX")
def test_cheatsheet_page_count(demo: Path):
    sheet = demo / "prep" / "algebra" / "cheatsheet" / "kr1-cheatsheet-1side.tex"
    sheet.write_text(
        sheet.read_text(encoding="utf-8").replace(r"\end{document}", "\\newpage x\n\\end{document}"),
        encoding="utf-8",
    )
    res = build(demo, "--no-html", "--only", "prep/algebra/kr1.md")
    assert res.returncode != 0
    assert "2 стр., а вариант 1side — ровно 1" in res.stderr


def test_cheatsheet_unknown_variant(demo: Path):
    cheatsheet = demo / "prep" / "algebra" / "cheatsheet"
    (cheatsheet / "kr1-cheatsheet-1side.tex").rename(cheatsheet / "kr1-cheatsheet-a5.tex")
    res = build(demo, "--no-pdf")
    assert res.returncode != 0
    assert "'a5'" in res.stderr


# ----------------------------------------------------------------------------- линтер


def test_lint_demo_clean(demo: Path):
    res = lint(demo, "--strict")
    assert res.returncode == 0, res.stdout


@pytest.mark.parametrize(
    "old,new,expected",
    [
        ('tag="частое заблуждение"', 'tag="ловушка"', "неизвестная пометка"),
        ("$A = (a_{ij})$", "$A = (a_{ij}) ∈ ℝ$", "не-ASCII символы в формуле"),
        ("$A = (a_{ij})$", "$A \\boxed{x}$", "boxed"),
        ("$A = (a_{ij})$", "$A = $ таблица", "формула не распознана"),
        ("$A = (a_{ij})$", "$A \\text{ см. [-@def:lec01:matrix]}$", "внутри формулы"),
        ("Первая лекция курса", "По рекомендации Р4 первая лекция курса", "служебное слово"),
        ("#def:lec01:matrix", "#def:lec02:matrix", "номер лекции lec02"),
        ("#ex:lec01:matrix", "#thm:lec01:matrixex", "префикс ex:"),
        ("::: answers\n1. Нет", "::: answer\n1. Нет", "нет блока ::: answers"),
        ("date: 2026-09-03", "date: 2026-09-04", "mmmDD в имени"),
        ("# Итоги", "# Выводы", "нет раздела «# Итоги»"),
        ("date: 2026-09-03", "date: 2026-09-03\nbasis: lecture", "поле basis больше не используется"),
        ("::: {.definition #def:lec01:matrix", "::: {.defenition #def:lec01:matrix", "неизвестный тип блока"),
    ],
)
def test_lint_catches(demo: Path, old: str, new: str, expected: str):
    p = demo / "notes" / "algebra" / "01_sep03_matrices.md"
    text = p.read_text(encoding="utf-8")
    assert old in text
    p.write_text(text.replace(old, new, 1), encoding="utf-8")
    res = lint(demo)
    assert res.returncode != 0
    assert expected in res.stdout, res.stdout


@pytest.mark.parametrize(
    "old,new,expected",
    [
        ("#prob:kr1:square", "#prob:lec01:square", "не по схеме тип:kr1:slug"),
        ("#rem:kr1:order", "#prob:kr1:order", "префикс rem:"),
        ('ref="thm:lec01:assoc"', 'ref="thm:lec01:nope"', "не найден в конспектах"),
        ("::: answer\n$\\begin", "::: remark\n$\\begin", "должны идти ::: answer и ::: solution"),
        ("# О контрольной", "# Про контрольную", "первый раздел"),
        ("::: {.theorem ref=", "::: {.theorem #thm:kr1:x title=", "без ref="),
        ("course: algebra", "course: calculus", "лежит в prep/algebra/"),
        ("date: 2026-11-07", 'date: "7 ноября"', "не в формате YYYY-MM-DD"),
        (
            "date: 2026-11-07",
            "date: 2026-11-07\nactive_until: 8.11.2026",
            "active_until='8.11.2026' не в формате",
        ),
        ("date: 2026-11-07", "date: 2026-11-07\nactive_until: 2026-11-06", "раньше даты КР"),
        (
            "date: 2026-11-07",
            "date: 2026-11-07\nactive_until: 20261108",
            "active_until=20261108 не в формате",
        ),
        (
            "date: 2026-11-07",
            "date: 2026-11-07\nactive_until: 2026-11-08 18:00:00",
            "не в формате YYYY-MM-DD",
        ),
    ],
)
def test_lint_prep_catches(demo: Path, old: str, new: str, expected: str):
    p = demo / "prep" / "algebra" / "kr1.md"
    text = p.read_text(encoding="utf-8")
    assert old in text
    p.write_text(text.replace(old, new, 1), encoding="utf-8")
    res = lint(demo)
    assert res.returncode != 0
    assert expected in res.stdout, res.stdout


@pytest.mark.skipif(not HAS_TEX, reason="нужен TeX для TikZ → SVG")
def test_prep_active_until(demo: Path):
    """active_until из front matter доходит до courses.json строкой YYYY-MM-DD."""
    p = demo / "prep" / "algebra" / "kr1.md"
    p.write_text(
        p.read_text(encoding="utf-8").replace(
            "date: 2026-11-07\n", "date: 2026-11-07\nactive_until: 2026-11-08\n", 1
        ),
        encoding="utf-8",
    )
    assert lint(demo).returncode == 0
    res = build(demo, "--no-pdf")
    assert res.returncode == 0, res.stderr
    courses = json.loads((demo / "build" / "site-data" / "courses.json").read_text(encoding="utf-8"))
    assert courses["preps"]["algebra"][0]["active_until"] == "2026-11-08"


@pytest.mark.skipif(not HAS_TEX, reason="нужен шрифт CMU из TeX Live")
def test_lint_missing_glyph(demo: Path):
    p = demo / "notes" / "algebra" / "01_sep03_matrices.md"
    p.write_text(
        p.read_text(encoding="utf-8").replace("Первая лекция курса", "Итак ⇒ первая лекция курса", 1),
        encoding="utf-8",
    )
    res = lint(demo)
    assert "нет в шрифте PDF" in res.stdout, res.stdout


def test_lint_weekday(demo: Path):
    src = demo / "notes" / "algebra" / "02_sep09_gauss.md"
    dst = src.with_name("02_sep10_gauss.md")
    dst.write_text(src.read_text(encoding="utf-8").replace("2026-09-09", "2026-09-10"), encoding="utf-8")
    src.unlink()
    res = lint(demo)
    assert "не день лекции курса" in res.stdout


# ----------------------------------------------------------------------------- подготовка к коллоквиуму


def make_colloq(demo: Path, name: str = "colloq1") -> Path:
    """prep/algebra/colloq1.md из демо-подготовки к КР: те же блоки, свои метки и первый раздел."""
    src = (demo / "prep" / "algebra" / "kr1.md").read_text(encoding="utf-8")
    text = (
        src.replace(":kr1:", f":{name}:")
        .replace("# О контрольной", "# О коллоквиуме")
        .replace("Подготовка к КР-1", "Подготовка к коллоквиуму 1")
        .replace("date: 2026-11-07", "date: 2026-11-09\nactive_until: 2026-11-20")
    )
    dst = demo / "prep" / "algebra" / f"{name}.md"
    dst.write_text(text, encoding="utf-8")
    return dst


def test_colloq_builds(demo: Path):
    """colloq1.md: свои метки prob:colloq1:…, своя шапка, своя запись в courses.json и поиске."""
    make_colloq(demo)
    res = lint(demo)
    assert res.returncode == 0, res.stdout
    res = build(demo, "--no-pdf")
    assert res.returncode == 0, res.stderr
    site = demo / "build" / "site-data"
    frag = (site / "algebra" / "colloq1" / "fragment.html").read_text(encoding="utf-8")
    assert 'id="prob:colloq1:square"' in frag and "Задача 2" in frag
    assert 'href="#prob:colloq1:square"' in frag
    assert 'id="reg-thm:lec01:assoc"' in frag
    meta = json.loads((site / "algebra" / "colloq1" / "meta.json").read_text(encoding="utf-8"))
    assert meta["kind"] == "prep" and meta["lecture"] == 0
    # у коллоквиума окно дат: в шапке диапазон, а не один день
    assert meta["header_line"] == (
        "ПИ ФКН ВШЭ 2026/27 · Алгебра · Подготовка к коллоквиуму 1 · 9.11–20.11.2026"
    )
    courses = json.loads((site / "courses.json").read_text(encoding="utf-8"))
    assert [p["id"] for p in courses["preps"]["algebra"]] == ["kr1", "colloq1"]
    colloq = courses["preps"]["algebra"][1]
    assert colloq["date"] == "2026-11-09" and colloq["active_until"] == "2026-11-20"
    assert colloq["cheatsheets"] == []
    search = json.loads((site / "search.json").read_text(encoding="utf-8"))
    assert any(e["doc"] == "colloq1" for e in search)
    index = json.loads((site / "index.json").read_text(encoding="utf-8"))["algebra"]
    assert not any(":colloq1:" in k for k in index)


def test_colloq_without_problems(demo: Path):
    """Коллоквиум — теория: «## Прототипы» не обязательны, «## Что нужно знать» — да."""
    p = make_colloq(demo)
    text = p.read_text(encoding="utf-8")
    p.write_text(text.replace("## Прототипы", "## Задачи"), encoding="utf-8")
    assert lint(demo).returncode == 0
    p.write_text(text.replace("## Что нужно знать", "## Теория"), encoding="utf-8")
    res = lint(demo)
    assert res.returncode != 0
    assert "нет ни одного подраздела «## Что нужно знать»" in res.stdout, res.stdout


@pytest.mark.parametrize(
    "old,new,expected",
    [
        ("#prob:colloq1:square", "#prob:kr1:square", "в файле colloq1.md метки вида тип:colloq1:slug"),
        ("# О коллоквиуме", "# О контрольной", "первый раздел — «# О коллоквиуме»"),
        ("active_until: 2026-11-20", "active_until: 2026-11-08", "раньше даты коллоквиума"),
    ],
)
def test_lint_colloq_catches(demo: Path, old: str, new: str, expected: str):
    p = make_colloq(demo)
    text = p.read_text(encoding="utf-8")
    assert old in text
    p.write_text(text.replace(old, new, 1), encoding="utf-8")
    res = lint(demo)
    assert res.returncode != 0
    assert expected in res.stdout, res.stdout


@pytest.mark.parametrize("name", ["colloq3", "kr4", "exam1"])
def test_prep_unknown_name(demo: Path, name: str):
    """Имя файла подготовки — только то, под что есть маршрут на сайте."""
    make_colloq(demo, name)
    assert build(demo, "--no-pdf", "--no-html").returncode != 0


@pytest.mark.skipif(not HAS_TEX, reason="нужен TeX")
def test_colloq_pdf(demo: Path):
    make_colloq(demo)
    res = build(demo, "--no-html", "--only", "prep/algebra/colloq1.md")
    assert res.returncode == 0, res.stderr
    assert (demo / "build" / "pdf" / "algebra" / "colloq1.pdf").stat().st_size > 1_000


# ----------------------------------------------------------------------------- банк билетов

BANK = r"""
ticket:
  - kind: proof
    title: Теорема с доказательством
    points: 2 балла
    count: 1
  - kind: definition
    title: Вопрос на формулировку
    count: 2
questions:
  - id: assoc
    kind: proof
    topic: product
    text: Ассоциативность умножения матриц $(AB)C = A(BC)$; см. [-@thm:lec01:assoc].
    refs: [thm:lec01:assoc, rem:colloq1:order]
  - id: matrix
    kind: definition
    topic: product
    text: Что такое матрица?
    refs: [def:lec01:matrix]
  - id: elem
    kind: definition
    topic: product
    text: Элементарное преобразование.
    answer: >-
      Своё: $\lambda \ne 0$, как в @rem:colloq1:order.
    refs: [def:lec02:elem, prob:colloq1:square]
"""


def make_bank(demo: Path, text: str = BANK) -> Path:
    make_colloq(demo)
    dst = demo / "prep" / "algebra" / "colloq1-bank.yaml"
    dst.write_text(text, encoding="utf-8")
    return dst


def test_bank_builds(demo: Path):
    """colloq1-bank.yaml → bank.json рядом с фрагментом: тексты в HTML, ссылки, документ каждого ответа."""
    make_bank(demo)
    res = lint(demo)
    assert res.returncode == 0, res.stdout
    # одна тема на все вопросы — линтер предупреждает, что темы в билете будут повторяться
    assert "темы будут повторяться" in res.stdout
    res = build(demo, "--no-pdf")
    assert res.returncode == 0, res.stderr
    site = demo / "build" / "site-data"
    bank = json.loads((site / "algebra" / "colloq1" / "bank.json").read_text(encoding="utf-8"))
    assert [t["kind"] for t in bank["ticket"]] == ["proof", "definition"]
    assert bank["ticket"][1]["points"] == ""
    assert bank["topics"] == {"product": "Умножение матриц"}
    q = {x["id"]: x for x in bank["questions"]}
    assert q["assoc"]["refs"] == [
        {"id": "thm:lec01:assoc", "doc": "01_sep03_matrices"},
        {"id": "rem:colloq1:order", "doc": "colloq1"},
    ]
    assert '<span class="math inline">(AB)C = A(BC)</span>' in q["assoc"]["text"]
    assert 'class="ref" data-ref="thm:lec01:assoc"' in q["assoc"]["text"]
    assert 'href="../01_sep03_matrices/#thm:lec01:assoc"' in q["assoc"]["text"]
    assert "1.3 (лекция\u00a01)" in q["assoc"]["text"]
    assert q["assoc"]["answer"] == ""
    # своя метка страницы — якорь на этой же странице, «Замечание N» без номера лекции
    assert 'href="#rem:colloq1:order"' in q["elem"]["answer"]
    assert "Замечание\u00a01<" in q["elem"]["answer"]
    courses = json.loads((site / "courses.json").read_text(encoding="utf-8"))
    assert {p["id"]: p["bank"] for p in courses["preps"]["algebra"]} == {"kr1": False, "colloq1": True}
    # в PDF и в сам фрагмент страницы банк не попадает
    frag = (site / "algebra" / "colloq1" / "fragment.html").read_text(encoding="utf-8")
    assert "Что такое матрица" not in frag


@pytest.mark.parametrize(
    "old,new,expected",
    [
        ("refs: [def:lec01:matrix]", "refs: [def:lec01:nope]", "метки def:lec01:nope нет"),
        ("refs: [def:lec01:matrix]", "refs: [sec:colloq1:product]", "раздел; в refs — блоки"),
        ("refs: [def:lec01:matrix]", "refs: []", "нет ответа"),
        (
            "    kind: definition\n    topic: product\n    text: Что",
            "    kind: blitz\n    topic: product\n    text: Что",
            "вид 'blitz' не объявлен",
        ),
        (
            "topic: product\n    text: Что",
            "topic: limits\n    text: Что",
            "нет раздела {#sec:colloq1:limits}",
        ),
        ("    count: 2", "    count: 3", "вопросов вида definition 2, а в билете их 3"),
        ("  - id: elem", "  - id: matrix", "id повторяется"),
        ("Что такое матрица?", '"Что такое $\\lambda$?"', "обратная косая черта в двойных кавычках"),
        (
            "Что такое матрица?",
            '"Что такое $\\varepsilon$?"',
            "обратная косая черта в строке в двойных кавычках",
        ),
        ("Что такое матрица?", "Что такое $ матрица?", "знак $ в тексте"),
        ("Что такое матрица?", "Что такое $\\boxed{A}$?", "boxed"),
        (
            "Что такое матрица?",
            "Что такое матрица, см. [-@def:lec09:x]?",
            "ссылка @def:lec09:x никуда не ведёт",
        ),
        (
            "    text: Что такое матрица?",
            "    text: Что такое матрица?\n    level: 2",
            "неизвестный ключ 'level'",
        ),
    ],
)
def test_lint_bank_catches(demo: Path, old: str, new: str, expected: str):
    assert old in BANK
    make_bank(demo, BANK.replace(old, new, 1))
    res = lint(demo)
    assert res.returncode != 0
    assert expected in res.stdout, res.stdout
    # сломанный банк валит и сборку: на сайт он не уедет
    if (
        "двойных кавычках" not in expected
        and "никуда не ведёт" not in expected
        and "$" not in expected
        and "boxed" not in expected
    ):
        assert build(demo, "--no-pdf", "--no-html").returncode == 0  # PDF/индекс банк не трогает
        assert build(demo, "--no-pdf", "--only", "prep/algebra/colloq1.md").returncode != 0


def test_lint_bank_without_page(demo: Path):
    (demo / "prep" / "algebra" / "colloq2-bank.yaml").write_text(BANK, encoding="utf-8")
    res = lint(demo)
    assert res.returncode != 0
    assert "банк билетов без страницы colloq2.md" in res.stdout


def test_lint_bank_by_path(demo: Path):
    """lint.py prep/…/colloq1-bank.yaml проверяет банк вместе с его страницей."""
    bank = make_bank(demo, BANK.replace("refs: [def:lec01:matrix]", "refs: [def:lec01:nope]"))
    res = lint(demo, str(bank))
    assert res.returncode != 0
    assert "метки def:lec01:nope нет" in res.stdout


def test_prep_ids_match_site():
    """Имена подготовок, которые принимает сборка, = маршруты сайта (PREP_IDS в web/src/domain/preps.ts)."""
    import re

    sys.path.insert(0, str(ROOT / "scripts"))
    from build import PREP_IDS

    ts = (ROOT / "web" / "src" / "domain" / "preps.ts").read_text(encoding="utf-8")
    m = re.search(r"export const PREP_IDS = \[([^\]]*)\]", ts)
    assert m, "PREP_IDS не найден в preps.ts"
    assert tuple(re.findall(r'"([^"]+)"', m.group(1))) == PREP_IDS
