"""Проверка YAML со стартовыми вопросами чата и собранного из него JSON."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

import build_chat_suggestions as bcs  # noqa: E402


def _write(directory: Path, name: str, text: str) -> None:
    (directory / name).write_text(text, encoding="utf-8")


def _qs(prefix: str, count: int) -> str:
    return "".join(f'  - "{prefix} {i}"\n' for i in range(count))


def _six(prefix: str) -> str:
    return _qs(prefix, 6)


def _fifteen(prefix: str) -> str:
    return _qs(prefix, 15)


@pytest.fixture
def repo(tmp_path: Path) -> Path:
    (tmp_path / "chat-suggestions").mkdir()
    (tmp_path / "notes" / "algebra").mkdir(parents=True)
    (tmp_path / "notes" / "algebra" / "01_a.md").write_text("x")
    (tmp_path / "prep" / "algebra").mkdir(parents=True)
    (tmp_path / "prep" / "algebra" / "kr1.md").write_text("x")
    (tmp_path / "theory").mkdir()
    (tmp_path / "theory" / "algebra.md").write_text("x")
    _write(tmp_path / "chat-suggestions", "home.yaml", "questions:\n" + _fifteen("home"))
    return tmp_path


def test_collect_flat_keys(repo: Path) -> None:
    _write(
        repo / "chat-suggestions",
        "algebra.yaml",
        "course:\n" + _fifteen("c") + "docs:\n  01_a:\n" + _six("l").replace("  -", "    -")
        + "  kr1:\n" + _six("k").replace("  -", "    -")
        + "  theory:\n" + _six("t").replace("  -", "    -"),
    )
    data = bcs.collect(repo)
    assert set(data) == {"@home", "algebra", "algebra/01_a", "algebra/kr1", "algebra/theory"}
    assert data["algebra/01_a"][0] == "l 0"


@pytest.mark.parametrize(
    "body",
    [
        "course:\n" + _fifteen("c")[: -len('  - "c 14"\n')],  # четырнадцать вопросов
        "course:\n" + _six("c"),  # на курсе нужно 15, а не 6
        "course:\n" + _fifteen("c") + "docs:\n  kr1:\n" + _fifteen("k").replace("  -", "    -"),  # в docs нужно 6
        "course:\n" + _fifteen("c").replace('"c 1"', '"c 0"'),  # повтор
        "course:\n" + _fifteen("x" * 120),  # слишком длинный
        "course:\n" + _fifteen("c") + "docs:\n  missing:\n" + _six("m").replace("  -", "    -"),  # нет файла
    ],
)
def test_invalid_rejected(repo: Path, body: str) -> None:
    _write(repo / "chat-suggestions", "algebra.yaml", body)
    with pytest.raises(bcs.SuggestionsError):
        bcs.collect(repo)


def test_unknown_course_rejected(repo: Path) -> None:
    _write(repo / "chat-suggestions", "physics.yaml", "course:\n" + _fifteen("c"))
    with pytest.raises(bcs.SuggestionsError):
        bcs.collect(repo)


def test_repository_json_is_up_to_date() -> None:
    expected = bcs.collect(ROOT)
    actual = json.loads(bcs.OUTPUT_PATH.read_text(encoding="utf-8"))
    assert actual == expected, "uv run scripts/build_chat_suggestions.py"
    assert "@home" in expected and "algebra" in expected


def test_home_requires_fifteen(repo: Path) -> None:
    _write(repo / "chat-suggestions", "home.yaml", "questions:\n" + _six("home"))
    with pytest.raises(bcs.SuggestionsError):
        bcs.collect(repo)
