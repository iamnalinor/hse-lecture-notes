"""Учебный план 1 курса: program/curriculum-2026-y1.yaml → site-data/curriculum.json."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest
import yaml
from test_pipeline import ROOT, build, demo, lint  # noqa: F401  (demo — фикстура)

sys.path.insert(0, str(ROOT / "scripts"))
import curriculum  # noqa: E402

PLAN = ROOT / curriculum.FILE


def test_real_plan_matches_header():
    """Суммы по модулям сходятся со строкой «Вся образовательная программа» плана (211, 231, 336, 328)."""
    data = curriculum.load(PLAN)
    assert curriculum.validate(data) == []
    assert data["plan_totals"] == [211, 231, 336, 328]
    shown = [sum(d["hours"][m] for d in data["disciplines"]) for m in range(4)]
    assert shown == [183, 203, 290, 282]  # без физкультуры (28, 28, 44, 44) и экзаменов без кредитов
    assert sum(d["credits"] for d in data["disciplines"]) == 60


def test_real_plan_scope():
    data = curriculum.load(PLAN)
    names = {d["name"] for d in data["disciplines"]}
    assert not {n for n in names if "Физическая" in n or "Английский" in n or "экзамен" in n.lower()}
    assert sum(d["short"] == "НИС" for d in data["disciplines"]) == 1
    assert next(d for d in data["disciplines"] if d["id"] == "practice")["no_module_hours"] is True


def put_plan(demo: Path, text: str | None = None) -> None:  # noqa: F811 (фикстура pytest)
    dst = demo / curriculum.FILE
    dst.parent.mkdir(exist_ok=True)
    dst.write_text(text if text is not None else PLAN.read_text(encoding="utf-8"), encoding="utf-8")


def test_build_writes_curriculum_json(demo: Path):  # noqa: F811 (фикстура pytest)
    put_plan(demo)
    res = build(demo, "--no-pdf")
    assert res.returncode == 0, res.stderr
    out = json.loads((demo / "build" / "site-data" / "curriculum.json").read_text(encoding="utf-8"))
    assert set(out) == {"title", "categories", "module_spans", "disciplines"}
    assert out["module_spans"] == [{"module": 2, "from": "2026-11-05", "to": "2026-12-30"}]
    assert [c["label"] for c in out["categories"]] == ["Матеша", "Прога", "Непрофильное"]


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


def test_yaml_is_plain_data():
    """Даты в yaml — строки: json.dump не умеет date."""
    assert all(
        isinstance(s["from"], str) for s in yaml.safe_load(PLAN.read_text(encoding="utf-8"))["module_spans"]
    )
