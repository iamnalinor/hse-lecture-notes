"""Линтер конспектов, теории и программ курсов, подготовок к КР (разметка — context/markup.md, скелет — context/recommendations.md).

    uv run scripts/lint.py                 # все файлы
    uv run scripts/lint.py notes/algebra/04_sep23_determinant_properties.md
    uv run scripts/lint.py --strict        # предупреждения тоже валят проверку

Ошибки (ERROR) — нарушения схемы, которые ломают сборку, сайт или правила из context/.
Предупреждения (WARN) — то, что ревьюер должен посмотреть глазами.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build
import curriculum
import ticket_bank
from lint_common import Report
from lint_notes import lint_notes
from lint_prep import lint_prep
from lint_reference import lint_program, lint_theory


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
