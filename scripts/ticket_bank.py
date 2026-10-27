"""Банк вопросов генератора билетов: `prep/<course>/<prep>-bank.yaml` рядом со страницей подготовки.

Формат — context/markup.md §11 («Банк билетов»). Здесь общее для линтера и сборки:

- `load` — чтение YAML (двойные кавычки с `\\` запрещены: YAML съедает обратную косую черту);
- `check_schema` — структура, уникальность, виды вопросов, темы, метки ответов, хватает ли вопросов;
- `snippets_markdown` / `check_snippets` — тексты вопросов и ответов одним Markdown-документом: линтер
  проверяет его AST (структуру, формулы, ссылки);
- `snippets_marked` / `split_rendered` — те же тексты между метками `<!--BANK …-->`: сборка дописывает их
  в конец страницы и рендерит тем же pandoc + filters/notes.lua, что и саму страницу (ссылки, тире,
  неразрывные пробелы — как на странице), и вырезает обратно;
- `missing_proofs` — у вопросов видов с `proofs: true` должно найтись доказательство;
- `export` — `bank.json` для сайта: тексты в HTML, у каждой метки ответа — документ, где лежит блок
  (`week_id` лекции или id страницы подготовки).

В PDF банк не попадает: на бумаге генератора нет.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path

import pypandoc
import yaml

BANK_SUFFIX = "-bank.yaml"
SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9-]*$")
TOP_KEYS = {"about", "ticket", "questions"}
# раздел страницы {#sec:<prep>:generator}: на сайте в нём генератор, в PDF — ссылка на сайт
GENERATOR_SECTION = "generator"
TICKET_KEYS = {"kind", "title", "count", "points", "proofs"}
# значения, которые обрезает неэкранированный « #» (YAML считает его комментарием)
TEXT_KEYS = {"about", "text", "answer", "title"}
QUESTION_KEYS = {"id", "kind", "topic", "text", "refs", "answer"}
# ответом может быть блок, формула или рисунок; раздел целиком — слишком много для карточки вопроса
NOT_AN_ANSWER = {"section"}
MARK_RE = re.compile(r"<!--BANK (\S+)-->")
END_MARK = "<!--BANK-END-->"


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


def _truncated_by_comment(text: str) -> list[str]:
    """`text: a # b` — YAML читает «a», а « # b» молча считает комментарием."""
    bad = []

    def walk(node) -> None:
        if isinstance(node, yaml.SequenceNode):
            for x in node.value:
                walk(x)
        elif isinstance(node, yaml.MappingNode):
            for k, v in node.value:
                if (
                    isinstance(k, yaml.ScalarNode)
                    and k.value in TEXT_KEYS
                    and isinstance(v, yaml.ScalarNode)
                    and v.style is None
                ):
                    rest = text[v.end_mark.index :].split("\n", 1)[0]
                    if rest.lstrip().startswith("#"):
                        bad.append(f"строка {v.end_mark.line + 1}")
                walk(v)

    walk(yaml.compose(text))
    return bad


def load(path: Path) -> dict:
    text = path.read_text(encoding="utf-8")
    try:
        bad = _double_quoted_backslashes(text)
        cut = _truncated_by_comment(text)
        data = yaml.safe_load(text)
    except yaml.YAMLError as e:
        hint = (
            " (обратная косая черта в двойных кавычках — пиши без кавычек или в '…')"
            if "escape" in str(e)
            else ""
        )
        raise BankError(f"не читается как YAML{hint}: {e}") from e
    if bad:
        raise BankError(
            "обратная косая черта в строке в двойных кавычках (" + ", ".join(bad) + "): YAML превращает "
            "\\n, \\v, \\t в управляющие символы — пиши без кавычек, в '…' или блоком >-"
        )
    if cut:
        raise BankError(
            "« #» в строке без кавычек (" + ", ".join(cut) + "): YAML считает остаток строки комментарием "
            "и обрезает текст — возьми строку в '…' или пиши блоком >-"
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
    if "about" in bank and (not isinstance(bank["about"], str) or not bank["about"].strip()):
        errors.append("about — непустая строка: подпись генератора на сайте")
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
        if "proofs" in entry and not isinstance(entry["proofs"], bool):
            errors.append(f"{where}: proofs — true или false, а не {entry['proofs']!r}")

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


def check_snippets(ast: dict) -> list[str]:
    """Каждый текст — ровно один div `#<id>--<поле>`; лишнее `:::` внутри текста ломает разбор."""
    errors = []
    for b in ast["blocks"]:
        ident = b["c"][0][0] if b["t"] == "Div" else ""
        if "--" not in ident:
            errors.append(
                "текст вопроса не разобрался в отдельный блок: лишняя строка ::: в text или answer?"
            )
    return errors


def snippets_marked(bank: dict) -> str:
    """Тексты между `<!--BANK <id>:<поле>-->` и `<!--BANK-END-->`, для рендера в конце страницы."""
    parts = []
    for q in bank["questions"]:
        for field in ("text", "answer"):
            if isinstance(q.get(field), str):
                parts.append(f"<!--BANK {q['id']}:{field}-->\n\n{q[field].strip()}\n\n{END_MARK}\n")
    return "\n".join(parts)


def split_rendered(page_html: str) -> dict[str, str]:
    """HTML страницы с дописанными текстами → `<id>:<поле> → HTML` (по меткам из `snippets_marked`)."""
    out = {}
    for m in MARK_RE.finditer(page_html):
        end = page_html.find(END_MARK, m.end())
        if end < 0:
            raise BankError(f"текст {m.group(1)} не закрылся: лишнее ::: или незакрытая формула?")
        out[m.group(1)] = page_html[m.end() : end].strip()
    return out


def missing_proofs(bank: dict, exam: str, has_proof) -> list[str]:
    """Вопросы видов с `proofs: true` без доказательства в ответе.

    Доказательство есть, если есть свой `answer`, ход доказательства `rem:<exam>:proof-…`, задача (с
    решением) или блок конспекта, за которым идёт `::: proof` (`has_proof(метка)`; сайт покажет его).
    """
    kinds = {t["kind"] for t in bank["ticket"] if t.get("proofs")}
    errors = []
    for q in bank["questions"]:
        if q["kind"] not in kinds or q.get("answer"):
            continue
        refs = q.get("refs") or []
        if any(r.startswith((f"rem:{exam}:proof-", "prob:")) or has_proof(r) for r in refs):
            continue
        errors.append(
            f"вопрос {q['id']}: в ответе нет доказательства — дай блок с ::: proof сразу после него, "
            f"rem:{exam}:proof-… или свой answer"
        )
    return errors


def export(bank: dict, exam: str, notes: dict[str, dict], own: list[dict], rendered: dict[str, str]) -> dict:
    """bank.json: `own` — метки страницы из её meta.json, `rendered` — из `split_rendered`."""
    own_ids = {e["id"] for e in own}
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
                "text": rendered.get(f"{q['id']}:text", ""),
                "answer": rendered.get(f"{q['id']}:answer", ""),
                "refs": [
                    {"id": r, "doc": exam if r in own_ids else notes[r]["week_id"]}
                    for r in q.get("refs") or []
                ],
            }
        )
    used = {q["topic"] for q in questions}
    return {
        "about": " ".join(str(bank.get("about") or "").split()),
        "ticket": [
            {
                "kind": t["kind"],
                "title": t["title"],
                "count": t["count"],
                "points": t.get("points", ""),
                "proofs": bool(t.get("proofs", False)),
            }
            for t in bank["ticket"]
        ],
        "topics": {k: v for k, v in topics.items() if k in used},
        "questions": questions,
    }
