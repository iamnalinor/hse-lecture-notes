"""Учебный план 1 курса: `program/curriculum-2026-y1.yaml` → `site-data/curriculum.json`.

В файле — контактные часы по модулям, кредиты и модули аттестации каждой дисциплины из «Рабочего
учебного плана» (формат — шапка самого yaml). Здесь проверка структуры и сверка с шапкой плана:
сумма часов показанных дисциплин и исключённых (физкультура, экзамены без кредитов) должна давать
строку «Вся образовательная программа». Диаграмму рисует сайт (`web/src/features/home/study-plan.tsx`).
"""

from __future__ import annotations

import re
from pathlib import Path

import yaml

FILE = Path("program") / "curriculum-2026-y1.yaml"
MODULES = 4
DISCIPLINE_KEYS = {
    "id", "name", "short", "category", "credits", "hours", "attestations", "variants", "no_module_hours",
}
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


class CurriculumError(Exception):
    pass


def load(path: Path) -> dict:
    try:
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
    except yaml.YAMLError as e:
        raise CurriculumError(f"{path.name}: {e}") from e
    if not isinstance(data, dict):
        raise CurriculumError(f"{path.name}: ожидался словарь")
    return data


def _hours(value: object, where: str) -> list[str]:
    ok = (
        isinstance(value, list)
        and len(value) == MODULES
        and all(isinstance(h, int) and not isinstance(h, bool) and h >= 0 for h in value)
    )
    return [] if ok else [f"{where}: часы — {MODULES} неотрицательных целых"]


def _check_discipline(d: object, categories: set[str]) -> list[str]:
    if not isinstance(d, dict):
        return ["дисциплина — не словарь"]
    where = f"дисциплина {d.get('id')!r}"
    errors = [f"{where}: лишний ключ {k!r}" for k in sorted(set(d) - DISCIPLINE_KEYS)]
    for key in ("id", "name", "short"):
        if not isinstance(d.get(key), str) or not d[key]:
            errors.append(f"{where}: нужна непустая строка {key}")
    if d.get("category") not in categories:
        errors.append(f"{where}: неизвестная категория {d.get('category')!r}")
    if not isinstance(d.get("credits"), int) or d["credits"] <= 0:
        errors.append(f"{where}: credits — положительное целое")
    errors += _hours(d.get("hours"), where)
    att = d.get("attestations")
    if not isinstance(att, list) or not all(a in range(1, MODULES + 1) for a in att):
        errors.append(f"{where}: attestations — список модулей 1–{MODULES}")
    elif isinstance(d.get("hours"), list) and any(d["hours"][a - 1] == 0 for a in att):
        errors.append(f"{where}: аттестация в модуле без часов")
    return errors


def _check_spans(spans: object) -> list[str]:
    if not isinstance(spans, list):
        return ["module_spans — список"]
    errors = []
    for s in spans:
        ok = (
            isinstance(s, dict)
            and s.get("module") in range(1, MODULES + 1)
            and all(isinstance(s.get(k), str) and DATE_RE.match(s[k]) for k in ("from", "to"))
            and s["from"] <= s["to"]
        )
        if not ok:
            errors.append(f"module_spans: {s!r} — нужны module 1–{MODULES} и даты from ≤ to (ГГГГ-ММ-ДД)")
    return errors


def _sum_hours(rows: list[dict]) -> list[int]:
    return [sum(r["hours"][m] for r in rows) for m in range(MODULES)]


def _check_totals(data: dict) -> list[str]:
    included = _sum_hours(data["disciplines"])
    counted = [e for e in data["excluded"] if e.get("in_plan_total")]
    total = [a + b for a, b in zip(included, _sum_hours(counted), strict=True)]
    if total != data["plan_totals"]:
        return [f"сумма часов {total} не равна строке плана {data['plan_totals']}"]
    return []


def validate(data: dict) -> list[str]:
    cats = data.get("categories")
    if not isinstance(cats, list) or not all(isinstance(c, dict) and {"id", "label", "name"} <= set(c) for c in cats):
        return ["categories — список {id, label, name}"]
    discs = data.get("disciplines")
    if not isinstance(discs, list) or not discs:
        return ["disciplines — непустой список"]
    errors = [e for d in discs for e in _check_discipline(d, {c["id"] for c in cats})]
    ids = [d.get("id") for d in discs if isinstance(d, dict)]
    errors += [f"повтор id {i!r}" for i in sorted({i for i in ids if ids.count(i) > 1})]
    excluded = data.get("excluded")
    if not isinstance(excluded, list):
        errors.append("excluded — список")
    else:
        errors += [e for x in excluded for e in _hours(x.get("hours") if isinstance(x, dict) else None, "excluded")]
    errors += _hours(data.get("plan_totals"), "plan_totals") + _check_spans(data.get("module_spans", []))
    return errors or _check_totals(data)


def export(path: Path) -> dict:
    """Проверенное содержимое yaml для сайта (всё, кроме excluded и plan_totals: они нужны проверке)."""
    data = load(path)
    errors = validate(data)
    if errors:
        raise CurriculumError(f"{path.name}: " + "; ".join(errors))
    keys = ("title", "categories", "module_spans", "disciplines")
    return {k: data.get(k, []) for k in keys}
