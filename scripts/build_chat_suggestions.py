#!/usr/bin/env python3
"""Собирает стартовые вопросы чата из `chat-suggestions/*.yaml` в JSON для сайта.

Сколько вопросов на странице — решает автор; сайт показывает 3 случайных, поэтому меньше трех нельзя. Ключи JSON:
`@home` — главная, `<course>` — страница курса, `<course>/<id>` — остальные страницы.
Страниц без записи в JSON нет: фронтенд подставляет три универсальных вопроса.

    uv run scripts/build_chat_suggestions.py          # записать JSON
    uv run scripts/build_chat_suggestions.py --check  # проверить, что JSON свежий
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
SOURCE_DIR = "chat-suggestions"
OUTPUT_PATH = ROOT / "web" / "src" / "domain" / "chat" / "suggestions.json"
MIN_QUESTIONS = 3
MAX_LENGTH = 110
HOME_KEY = "@home"


class SuggestionsError(ValueError):
    """Файл с вопросами нарушает правила `chat-suggestions/README.md`."""


def _check_list(where: str, value: object) -> list[str]:
    if not isinstance(value, list) or not all(isinstance(q, str) for q in value):
        raise SuggestionsError(f"{where}: ожидается список строк")
    questions = [q.strip() for q in value]
    if len(questions) < MIN_QUESTIONS:
        raise SuggestionsError(f"{where}: нужно хотя бы {MIN_QUESTIONS} вопроса, найдено {len(questions)}")
    if len(set(questions)) != len(questions):
        raise SuggestionsError(f"{where}: вопросы повторяются")
    for q in questions:
        if not q or len(q) > MAX_LENGTH:
            raise SuggestionsError(f"{where}: вопрос пустой или длиннее {MAX_LENGTH} знаков: {q[:40]!r}")
    return questions


def _doc_exists(root: Path, course: str, doc_id: str) -> bool:
    if doc_id in ("theory", "program"):
        return (root / doc_id / f"{course}.md").is_file()
    return any((root / folder / course / f"{doc_id}.md").is_file() for folder in ("notes", "prep"))


def collect(root: Path = ROOT) -> dict[str, list[str]]:
    """Читает YAML и возвращает плоский словарь `ключ страницы → вопросы` (15 или 6)."""
    source = root / SOURCE_DIR
    courses = {p.name for p in (root / "notes").iterdir() if p.is_dir()}
    result: dict[str, list[str]] = {}
    for path in sorted(source.glob("*.yaml")):
        data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
        if path.stem == "home":
            result[HOME_KEY] = _check_list(f"{path.name}: questions", data.get("questions"))
            continue
        course = path.stem
        if course not in courses:
            raise SuggestionsError(f"{path.name}: нет курса notes/{course}/")
        result[course] = _check_list(f"{path.name}: course", data.get("course"))
        for doc_id, questions in (data.get("docs") or {}).items():
            if not _doc_exists(root, course, str(doc_id)):
                raise SuggestionsError(f"{path.name}: нет страницы {doc_id}")
            result[f"{course}/{doc_id}"] = _check_list(f"{path.name}: {doc_id}", questions)
    if HOME_KEY not in result:
        raise SuggestionsError(f"нет {SOURCE_DIR}/home.yaml")
    return result


def render(data: dict[str, list[str]]) -> str:
    return json.dumps(data, ensure_ascii=False, indent=2) + "\n"


def main(argv: list[str]) -> int:
    try:
        text = render(collect())
    except SuggestionsError as error:
        print(f"Ошибка: {error}", file=sys.stderr)
        return 1
    if "--check" in argv:
        if not OUTPUT_PATH.is_file() or OUTPUT_PATH.read_text(encoding="utf-8") != text:
            print("suggestions.json устарел: uv run scripts/build_chat_suggestions.py", file=sys.stderr)
            return 1
        print("suggestions.json актуален")
        return 0
    OUTPUT_PATH.write_text(text, encoding="utf-8")
    print(f"Записано страниц: {text.count('\n  \"')} → {OUTPUT_PATH.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
