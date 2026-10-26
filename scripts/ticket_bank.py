"""Банк вопросов генератора билетов: `prep/<course>/<prep>-bank.yaml` рядом со страницей подготовки.

Формат — context/markup.md §11 («Банк билетов»). Здесь общее для линтера и сборки:

- `load` — чтение YAML (двойные кавычки с `\\` запрещены: YAML съедает обратную косую черту);
- `check_schema` — структура, уникальность, виды вопросов, темы, метки ответов, хватает ли вопросов;
- `snippets_markdown` — тексты вопросов и ответов одним Markdown-документом (линтер проверяет формулы
  и ссылки в его AST, сборка рендерит его в HTML);
- `export` — `bank.json` для сайта: тексты в HTML, ссылки разрешены, у каждой метки ответа — документ,
  где лежит блок (`week_id` лекции или id страницы подготовки).

В PDF банк не попадает: на бумаге генератора нет.
"""

from __future__ import annotations

import html
import json
import re
from dataclasses import dataclass
from pathlib import Path

import pypandoc
import yaml

BANK_SUFFIX = "-bank.yaml"
SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9-]*$")
TOP_KEYS = {"ticket", "questions"}
TICKET_KEYS = {"kind", "title", "count", "points"}
QUESTION_KEYS = {"id", "kind", "topic", "text", "refs", "answer"}
# ответом может быть блок, формула или рисунок; раздел целиком — слишком много для карточки вопроса
NOT_AN_ANSWER = {"section"}
MARK_RE = re.compile(r"^<!--BANK (\S+)-->$")


class BankError(Exception):
    pass


def bank_path(prep_md: Path) -> Path:
    """prep/calculus/colloq1.md → prep/calculus/colloq1-bank.yaml"""
    return prep_md.with_name(prep_md.stem + BANK_SUFFIX)


def _double_quoted_backslashes(text: str) -> list[str]:
    """Строки в "…" с обратной косой чертой: `"\\varepsilon"` даёт вертикальную табуляцию, `"\\neq"` — перевод строки."""
    bad = []
    for node in _scalars(yaml.compose(text)):
        if node.style == '"' and "\\" in text[node.start_mark.index : node.end_mark.index]:
            bad.append(f"строка {node.start_mark.line + 1}")
    return bad


def _scalars(node) -> list:
    if node is None:
        return []
    if isinstance(node, yaml.ScalarNode):
        return [node]
    if isinstance(node, yaml.SequenceNode):
        return [s for x in node.value for s in _scalars(x)]
    if isinstance(node, yaml.MappingNode):
        return [s for k, v in node.value for s in _scalars(k) + _scalars(v)]
    return []


def load(path: Path) -> dict:
    text = path.read_text(encoding="utf-8")
    try:
        bad = _double_quoted_backslashes(text)
        data = yaml.safe_load(text)
    except yaml.YAMLError as e:
        raise BankError(f"не читается как YAML: {e}") from e
    if bad:
        raise BankError(
            "обратная косая черта в строке в двойных кавычках (" + ", ".join(bad) + "): YAML превращает "
            "\\n, \\v, \\t в управляющие символы — пиши без кавычек, в '…' или блоком >-"
        )
    if not isinstance(data, dict):
        raise BankError("в банке должен быть словарь с ключами ticket и questions")
    return data


@dataclass
class Labels:
    """Что знает проверка: метки конспектов курса (`id → {type, week_id, …}`) и свои метки страницы."""

    notes: dict[str, dict]
    own: dict[str, str]  # id → type (section, remark, problem…)


def check_schema(bank: dict, exam: str, labels: Labels) -> tuple[list[str], list[str]]:
    """(ошибки, предупреждения) по структуре банка; тексты проверяются отдельно (по AST)."""
    errors: list[str] = []
    warnings: list[str] = []
    for k in sorted(set(bank) - TOP_KEYS):
        errors.append(f"неизвестный ключ {k!r} (есть ticket и questions)")
    ticket = bank.get("ticket")
    questions = bank.get("questions")
    if not isinstance(ticket, list) or not ticket:
        errors.append("ticket — непустой список пунктов билета: kind, title, count, points")
        ticket = []
    if not isinstance(questions, list) or not questions:
        errors.append("questions — непустой список вопросов")
        questions = []

    kinds: dict[str, int] = {}
    for i, entry in enumerate(ticket, 1):
        where = f"ticket[{i}]"
        if not isinstance(entry, dict):
            errors.append(f"{where}: нужен словарь kind, title, count, points")
            continue
        for k in sorted(set(entry) - TICKET_KEYS):
            errors.append(f"{where}: неизвестный ключ {k!r}")
        kind = entry.get("kind")
        if not isinstance(kind, str) or not SLUG_RE.match(kind):
            errors.append(f"{where}: kind — латинский slug (proof, definition…), а не {kind!r}")
            continue
        if kind in kinds:
            errors.append(f"{where}: вид {kind} уже есть в билете — увеличь count")
        count = entry.get("count")
        if type(count) is not int or count < 1:
            errors.append(f"{where}: count — целое число ≥ 1, а не {count!r}")
            count = 0
        kinds[kind] = count
        if not isinstance(entry.get("title"), str) or not entry["title"].strip():
            errors.append(f"{where}: нет title — так пункт называется в билете")
        if "points" in entry and not isinstance(entry["points"], str):
            errors.append(f"{where}: points — строка («2 балла»), а не {entry['points']!r}")

    seen: set[str] = set()
    per_kind: dict[str, list[dict]] = {k: [] for k in kinds}
    for i, q in enumerate(questions, 1):
        if not isinstance(q, dict):
            errors.append(f"questions[{i}]: нужен словарь")
            continue
        qid = q.get("id")
        where = f"вопрос {qid}" if isinstance(qid, str) else f"questions[{i}]"
        for k in sorted(set(q) - QUESTION_KEYS):
            errors.append(f"{where}: неизвестный ключ {k!r}")
        if not isinstance(qid, str) or not SLUG_RE.match(qid):
            errors.append(f"{where}: id — латинский slug, а не {qid!r}")
        elif qid in seen:
            errors.append(f"{where}: id повторяется")
        else:
            seen.add(qid)
        kind = q.get("kind")
        if kind not in kinds:
            errors.append(f"{where}: вид {kind!r} не объявлен в ticket ({', '.join(kinds)})")
        else:
            per_kind[kind].append(q)
        topic = q.get("topic")
        if not isinstance(topic, str) or labels.own.get(f"sec:{exam}:{topic}") != "section":
            errors.append(f"{where}: topic={topic!r} — нет раздела {{#sec:{exam}:{topic}}} на странице")
        if not isinstance(q.get("text"), str) or not q["text"].strip():
            errors.append(f"{where}: нет text")
        answer = q.get("answer")
        if answer is not None and (not isinstance(answer, str) or not answer.strip()):
            errors.append(f"{where}: answer — непустая строка")
        refs = q.get("refs", [])
        if not isinstance(refs, list) or not all(isinstance(r, str) for r in refs):
            errors.append(f"{where}: refs — список меток")
            refs = []
        if not refs and answer is None:
            errors.append(f"{where}: нет ответа — дай refs (метки блоков) или answer")
        if len(set(refs)) != len(refs):
            errors.append(f"{where}: метка в refs повторяется")
        for ref in refs:
            kind_of = labels.own.get(ref) or (labels.notes.get(ref) or {}).get("type")
            if kind_of is None:
                errors.append(f"{where}: метки {ref} нет ни в конспектах курса, ни на странице")
            elif kind_of in NOT_AN_ANSWER:
                errors.append(f"{where}: {ref} — раздел; в refs — блоки (определение, теорема, замечание…)")

    for kind, count in kinds.items():
        got = per_kind.get(kind, [])
        if len(got) < count:
            errors.append(f"вопросов вида {kind} {len(got)}, а в билете их {count}")
            continue
        topics = {q.get("topic") for q in got}
        if len(topics) < count:
            warnings.append(
                f"у вопросов вида {kind} всего {len(topics)} тем при {count} в билете: темы будут повторяться"
            )
        if len(got) < 3 * count:
            warnings.append(f"вопросов вида {kind} {len(got)} при {count} в билете: билеты будут похожи")
    return errors, warnings


def snippets_markdown(bank: dict) -> str:
    """Тексты вопросов и ответов: каждый — div `#<id>--text` или `#<id>--answer`."""
    parts = []
    for q in bank.get("questions") or []:
        if not isinstance(q, dict) or not isinstance(q.get("id"), str):
            continue
        for field in ("text", "answer"):
            if isinstance(q.get(field), str):
                parts.append(f"::: {{#{q['id']}--{field}}}\n{q[field].strip()}\n:::\n")
    return "\n".join(parts)


def snippet_ast(markdown: str, fmt: str) -> dict:
    return json.loads(pypandoc.convert_text(markdown, "json", format=fmt, extra_args=["--quiet"]))


def ref_text(entry: dict, mode: str, same_doc: bool) -> str:
    """Текст ссылки — как у notes.lua (ref_text): «6.1 (лекция 6)», «Теорема 6.1», «(4.4)», «Название»."""
    if entry["type"] == "section":
        text = f"«{entry['title']}»"
    elif entry["type"] == "equation":
        text = f"({entry['number']})"
    elif mode == "SuppressAuthor":
        text = entry["number"]
    else:
        text = f"{entry['name']} {entry['number']}"
    if not same_doc and entry.get("lecture"):
        text += f" (лекция {entry['lecture']})"
    return text


def _resolve_cites(node, lookup) -> None:
    """Cite → RawInline с `<a class="ref" data-ref>` (разметка как у фрагментов, сайт сделает из неё RefLink)."""
    if isinstance(node, list):
        for i, x in enumerate(node):
            if isinstance(x, dict) and x.get("t") == "Cite":
                links = []
                for c in x["c"][0]:
                    entry, same, href = lookup(c["citationId"])
                    text = html.escape(ref_text(entry, c["citationMode"]["t"], same))
                    links.append(
                        f'<a href="{html.escape(href)}" class="ref" data-ref="{html.escape(entry["id"])}">'
                        f"{text}</a>"
                    )
                node[i] = {"t": "RawInline", "c": ["html", ", ".join(links)]}
            else:
                _resolve_cites(x, lookup)
    elif isinstance(node, dict):
        for v in node.values():
            if isinstance(v, (list, dict)):
                _resolve_cites(v, lookup)


def export(bank: dict, exam: str, notes: dict[str, dict], own: list[dict], fmt: str) -> dict:
    """bank.json: `own` — метки страницы из её meta.json (`id, name, number, title, type`)."""
    own_by_id = {e["id"]: e for e in own}

    def lookup(ref: str) -> tuple[dict, bool, str]:
        if ref in own_by_id:
            return own_by_id[ref], True, f"#{ref}"
        entry = notes[ref]
        return {**entry, "id": ref}, False, f"../{entry['week_id']}/#{ref}"

    ast = snippet_ast(snippets_markdown(bank), fmt)
    blocks = []
    for b in ast["blocks"]:
        ident = b["c"][0][0] if b["t"] == "Div" else ""
        if not ident:
            raise BankError("текст вопроса не разобрался в отдельный блок (лишнее ::: внутри?)")
        blocks.append({"t": "RawBlock", "c": ["html", f"<!--BANK {ident}-->"]})
        blocks.extend(b["c"][1])
    ast["blocks"] = blocks
    _resolve_cites(ast, lookup)
    out = pypandoc.convert_text(
        json.dumps(ast), "html5", format="json", extra_args=["--katex", "--wrap=none", "--quiet"]
    )
    rendered: dict[str, list[str]] = {}
    current: list[str] | None = None
    for line in out.splitlines():
        m = MARK_RE.match(line.strip())
        if m:
            current = rendered.setdefault(m.group(1), [])
        elif current is not None:
            current.append(line)

    def html_of(qid: str, field: str) -> str:
        return "\n".join(rendered.get(f"{qid}--{field}", [])).strip()

    topics = {
        e["id"].removeprefix(f"sec:{exam}:"): e["title"]
        for e in own
        if e["type"] == "section" and e["id"].startswith(f"sec:{exam}:")
    }
    questions = []
    for q in bank["questions"]:
        questions.append(
            {
                "id": q["id"],
                "kind": q["kind"],
                "topic": q["topic"],
                "text": html_of(q["id"], "text"),
                "answer": html_of(q["id"], "answer"),
                "refs": [
                    {"id": r, "doc": exam if r in own_by_id else notes[r]["week_id"]}
                    for r in q.get("refs") or []
                ],
            }
        )
    used = {q["topic"] for q in questions}
    return {
        "ticket": [
            {"kind": t["kind"], "title": t["title"], "count": t["count"], "points": t.get("points", "")}
            for t in bank["ticket"]
        ],
        "topics": {k: v for k, v in topics.items() if k in used},
        "questions": questions,
    }
