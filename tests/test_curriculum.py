"""Учебный план 1 курса: program/curriculum-2026-y1.yaml → site-data/curriculum.json."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest
import yaml
from test_pipeline import ROOT, build, demo, lint  # noqa: F401  (demo — фикстура)

sys.path.insert(0, str(ROOT / "scripts"))
import curriculum

PLAN = ROOT / curriculum.FILE


def test_real_plan_matches_header():
    """Суммы по модулям сходятся со строкой «Вся образовательная программа» плана (211, 231, 336, 328)."""
    data = curriculum.load(PLAN)
    assert curriculum.validate(data) == []
    assert data["plan_totals"] == [211, 231, 336, 328]
    shown = [sum(d["hours"][m] for d in data["disciplines"]) for m in range(4)]
    assert shown == [183, 203, 290, 282]  # без физкультуры (28, 28, 44, 44) и экзаменов без кредитов
    # учебная практика (3 кредита, без часов) вынесена в excluded: показано 57 из 60
    assert sum(d["credits"] for d in data["disciplines"]) == 57
    in_total = sum(x["credits"] for x in data["excluded"] if x["in_plan_total"])
    assert in_total == 3 and sum(x["credits"] for x in data["excluded"]) == 11  # 57 + 3 = 60, с английским 68
    assert 57 + in_total == 60


def test_real_plan_scope():
    data = curriculum.load(PLAN)
    names = {d["name"] for d in data["disciplines"]}
    assert not {n for n in names if "Физическая" in n or "Английский" in n or "экзамен" in n.lower()}
    assert sum(d["short"] == "НИС" for d in data["disciplines"]) == 1
    assert "practice" not in {d["id"] for d in data["disciplines"]}
    shorts = {d["id"]: d["short"] for d in data["disciplines"]}
    assert shorts["history"] == "История" and shorts["state"] == "ОРГ"
    assert shorts["intro-prog"] == "Введение в программирование"
    assert shorts["intro-se"] == "ВвПИ"


def put_plan(demo: Path, text: str | None = None) -> None:  # noqa: F811 (фикстура pytest)
    dst = demo / curriculum.FILE
    dst.parent.mkdir(exist_ok=True)
    dst.write_text(text if text is not None else PLAN.read_text(encoding="utf-8"), encoding="utf-8")


def test_build_writes_curriculum_json(demo: Path):  # noqa: F811 (фикстура pytest)
    put_plan(demo)
    res = build(demo, "--no-pdf")
    assert res.returncode == 0, res.stderr
    out = json.loads((demo / "build" / "site-data" / "curriculum.json").read_text(encoding="utf-8"))
    assert set(out) == {"title", "categories", "module_spans", "disciplines", "excluded"}
    assert sum(x["credits"] for x in out["excluded"] if x["in_plan_total"]) == 3
    assert sum(x["credits"] for x in out["excluded"] if not x["in_plan_total"]) == 8
    assert [s["module"] for s in out["module_spans"]] == [1, 2, 3, 4]
    assert out["module_spans"][1] == {
        "module": 2,
        "from": "2026-11-01",
        "study_to": "2026-12-20",
        "to": "2026-12-30",
        "weeks": 7.1,
    }
    # учебные дни / 7: 55, 50, 75, 81 − 7 каникулярных дней весны = 74
    assert [s["weeks"] for s in out["module_spans"]] == [7.9, 7.1, 10.7, 10.6]
    assert "breaks" not in out
    assert [c["label"] for c in out["categories"]] == [
        "Математика",
        "Программирование",
        "Непрофильные дисциплины",
    ]


def test_build_without_plan_has_no_file(demo: Path):  # noqa: F811 (фикстура pytest)
    res = build(demo, "--no-pdf")
    assert res.returncode == 0, res.stderr
    assert not (demo / "build" / "site-data" / "curriculum.json").exists()


@pytest.mark.parametrize(
    ("old", "new", "expected"),
    [
        (
            "hours: [28, 28, 44, 44], attestations: [2, 4] }",
            "hours: [29, 28, 44, 44], attestations: [2, 4] }",
            "не равна строке плана",
        ),
        (
            "category: math, credits: 8, hours: [28, 28, 44",
            "category: art, credits: 8, hours: [28, 28, 44",
            "неизвестная категория",
        ),
        (
            "hours: [24, 0, 0, 0], attestations: [1]",
            "hours: [24, 0, 0], attestations: [1]",
            "4 неотрицательных",
        ),
        (
            "hours: [24, 0, 0, 0], attestations: [1]",
            "hours: [24, 0, 0, 0], attestations: [2]",
            "аттестация в модуле без часов",
        ),
        ("id: calculus", "id: algebra", "повтор id"),
    ],
)
def test_curriculum_errors(demo: Path, old: str, new: str, expected: str):  # noqa: F811 (фикстура pytest)
    text = PLAN.read_text(encoding="utf-8")
    assert old in text
    put_plan(demo, text.replace(old, new, 1))
    res = build(demo, "--no-pdf")
    assert res.returncode != 0
    assert expected in res.stderr, res.stderr
    assert expected in lint(demo).stdout


def spans_data(**over) -> dict:
    return {
        "module_spans": [{"module": 1, "from": "2026-09-01", "study_to": "2026-09-14", "to": "2026-09-20"}],
        **over,
    }


def test_weeks_count_teaching_days_minus_breaks():
    data = spans_data(breaks=[{"from": "2026-09-05", "to": "2026-09-07"}])
    assert curriculum.module_weeks(data) == {1: 1.6}  # (14 − 3) / 7 = 1.571
    assert curriculum.module_weeks(spans_data()) == {1: 2.0}


def test_weeks_ignore_break_days_outside_the_teaching_days():
    data = spans_data(breaks=[{"from": "2026-09-10", "to": "2026-09-30"}])
    assert curriculum.module_weeks(data) == {1: 1.3}  # (14 − 5, перерыв 10–14 сентября) / 7 = 1.286


@pytest.mark.parametrize(
    ("spans", "breaks", "expected"),
    [
        ([{"module": 1, "from": "2026-09-01", "to": "2026-09-20"}], [], "study_to"),
        (
            [{"module": 1, "from": "2026-09-01", "study_to": "2026-08-31", "to": "2026-09-20"}],
            [],
            "from ≤ study_to ≤ to",
        ),
        (
            [{"module": 1, "from": "2026-09-01", "study_to": "2026-09-21", "to": "2026-09-20"}],
            [],
            "from ≤ study_to ≤ to",
        ),
        (
            [{"module": 1, "from": "2026-09-01", "study_to": "2026-09-14", "to": "2026-09-20"}],
            [{"from": "2026-09-08", "to": "2026-09-05"}],
            "breaks",
        ),
        (
            [{"module": 1, "from": "2026-09-01", "study_to": "2026-09-14", "to": "2026-09-20"}],
            [{"from": "2026-09-08"}],
            "breaks",
        ),
        (
            [{"module": 1, "from": "2026-09-01", "study_to": "2026-09-14", "to": "2026-09-20"}],
            [{"from": "2026-10-01", "to": "2026-10-02"}],
            "вне учебных дней",
        ),
        (
            [{"module": 1, "from": "2026-09-01", "study_to": "2026-09-14", "to": "2026-09-20"}],
            "no",
            "breaks — список",
        ),
    ],
)
def test_span_and_break_errors(spans, breaks, expected):
    errors = curriculum.check_spans({"module_spans": spans, "breaks": breaks})
    assert any(expected in e for e in errors), errors


def test_real_plan_has_spring_break_in_module_4():
    data = curriculum.load(PLAN)
    assert data["breaks"] == [{"from": "2027-05-02", "to": "2027-05-08"}]
    assert [s["study_to"] for s in data["module_spans"]] == [
        "2026-10-25",
        "2026-12-20",
        "2027-03-24",
        "2027-06-20",
    ]


def test_yaml_is_plain_data():
    """Даты в yaml — строки: json.dump не умеет date."""
    assert all(
        isinstance(s["from"], str) for s in yaml.safe_load(PLAN.read_text(encoding="utf-8"))["module_spans"]
    )
