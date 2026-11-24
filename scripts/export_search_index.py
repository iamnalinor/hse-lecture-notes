#!/usr/bin/env python3
"""Incremental exporter of HSE lecture notes into Cloudflare D1 (SQLite + FTS5) and Vectorize.

Covers all 4 doc_kind categories:
  - notes/<course>/*.md     -> doc_kind = 'lecture'
  - theory/<course>.md      -> doc_kind = 'theory'
  - prep/<course>/*.md      -> doc_kind = 'prep'
  - program/<course>.md     -> doc_kind = 'program'

Features:
  - Identical deterministic Russian Snowball stemmer as `backend/src/stemmer.ts`.
  - Incremental D1 updates by `content_hash` (unchanged blocks/docs are NOT rewritten).
  - Handles deletions in both D1 and Vectorize (`deleteByIds`).
  - Enforces Cloudflare Vectorize Free tier budget (<= 4800 vectors @ 1024 dim = 4.91M < 5M).

Usage:
  python3 scripts/export_search_index.py --dry-run
  python3 scripts/export_search_index.py --sync-remote [--skip-vectorize] [--only-course discrete]
"""

from __future__ import annotations

import argparse
import dataclasses
import hashlib
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

import yaml

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_D1_ID = "3516cc7d-e847-4266-8764-95c43dd0881c"
DEFAULT_VECTORIZE_INDEX = "hse-course-blocks"
VECTORIZE_FREE_MAX_VECTORS = 4800  # hard Free cap is 4882 @ 1024 dim (5M stored dimensions)
CHUNKING_VERSION = 1
EMBEDDING_MODEL = "@cf/baai/bge-m3"

# Priority order for vectorization if corpus approaches Vectorize Free ceiling
VECTORIZE_PRIORITY = {
    "theorem": 1,
    "definition": 1,
    "lemma": 1,
    "proposition": 1,
    "corollary": 1,
    "axiom": 1,
    "ticket": 2,
    "problem": 2,
    "example": 3,
    "section": 4,
    "remark": 5,
}

# =============================================================================
# Deterministic Russian Snowball stemmer (identical to backend/src/stemmer.ts)
# =============================================================================

_VOWELS = re.compile(r"[аеиоуыэюя]")
_RVRE = re.compile(r"^(.*?[аеиоуыэюя])(.*)$")
_PERFECTIVE_GERUND_1 = re.compile(r"([ая])(в|вши|вшись)$")
_PERFECTIVE_GERUND_2 = re.compile(r"(ив|ивши|ившись|ыв|ывши|ывшись)$")
_ADJECTIVE = re.compile(
    r"(ее|ие|ые|ое|ими|ыми|ей|ий|ый|ой|ем|им|ым|ом|его|ого|ему|ому|их|ых|ую|юю|ая|яя|ою|ею)$"
)
_PARTICIPLE_1 = re.compile(r"([ая])(ем|нн|вш|ющ|щ)$")
_PARTICIPLE_2 = re.compile(r"(ивш|ывш|ующ)$")
_REFLEXIVE = re.compile(r"(ся|сь)$")
_VERB_1 = re.compile(r"([ая])(ла|на|ете|йте|ли|й|л|ем|н|ло|но|ет|ют|ны|ть|ешь|нно)$")
_VERB_2 = re.compile(
    r"(ила|ыла|ена|ейте|уйте|ите|или|ыли|ей|уй|ил|ыл|им|ым|ен|ило|ыло|ено|ят|ует|уют|ит|ыт|ены|ить|ыть|ишь|ую|ю)$"
)
_NOUN = re.compile(
    r"(а|ев|ов|ие|ье|е|иями|ями|ами|еи|ии|и|ией|ей|ой|ий|й|иям|ям|ием|ем|ам|ом|о|у|ах|иях|ях|ы|ь|ию|ью|ю|ия|ья|я)$"
)
_SUPERLATIVE = re.compile(r"(ейш|ейше)$")
_DERIVATIONAL = re.compile(r"(ост|ость)$")
_I_ENDING = re.compile(r"и$")
_NN_ENDING = re.compile(r"нн$")
_SOFT_SIGN = re.compile(r"ь$")
_CYRILLIC = re.compile(r"[а-я]")
_TOKEN_RE = re.compile(r"[a-zа-я0-9_]+")


def _find_r2(rv: str) -> int:
    seen_vowel = False
    r1 = len(rv)
    for i, ch in enumerate(rv):
        if _VOWELS.search(ch):
            seen_vowel = True
        elif seen_vowel:
            r1 = i + 1
            break
    seen_vowel = False
    r2 = len(rv)
    for i in range(r1, len(rv)):
        if _VOWELS.search(rv[i]):
            seen_vowel = True
        elif seen_vowel:
            r2 = i + 1
            break
    return r2


def stem_russian_word(raw: str) -> str:
    word = raw.lower().replace("ё", "е")
    if len(word) < 3 or not _CYRILLIC.search(word):
        return word
    m = _RVRE.match(word)
    if not m:
        return word
    head, rv = m.group(1), m.group(2)
    if not rv:
        return word

    r2_start = _find_r2(rv)

    if _PERFECTIVE_GERUND_1.search(rv):
        rv = _PERFECTIVE_GERUND_1.sub(r"\1", rv)
    elif _PERFECTIVE_GERUND_2.search(rv):
        rv = _PERFECTIVE_GERUND_2.sub("", rv)
    else:
        rv = _REFLEXIVE.sub("", rv)
        if _ADJECTIVE.search(rv):
            rv = _ADJECTIVE.sub("", rv)
            if _PARTICIPLE_1.search(rv):
                rv = _PARTICIPLE_1.sub(r"\1", rv)
            elif _PARTICIPLE_2.search(rv):
                rv = _PARTICIPLE_2.sub("", rv)
        elif _VERB_1.search(rv):
            rv = _VERB_1.sub(r"\1", rv)
        elif _VERB_2.search(rv):
            rv = _VERB_2.sub("", rv)
        else:
            rv = _NOUN.sub("", rv)

    rv = _I_ENDING.sub("", rv)

    if r2_start < len(rv):
        r2_part = rv[r2_start:]
        if _DERIVATIONAL.search(r2_part):
            rv = rv[:r2_start] + _DERIVATIONAL.sub("", r2_part)

    if _NN_ENDING.search(rv):
        rv = rv[:-1]
    else:
        rv = _SUPERLATIVE.sub("", rv)
        if _NN_ENDING.search(rv):
            rv = rv[:-1]
        else:
            rv = _SOFT_SIGN.sub("", rv)

    return head + rv


def tokenize_and_stem(text: str) -> list[str]:
    cleaned = text.lower().replace("ё", "е")
    tokens = _TOKEN_RE.findall(cleaned)
    out: list[str] = []
    for tok in tokens:
        if len(tok) < 2:
            continue
        out.append(stem_russian_word(tok) if _CYRILLIC.search(tok) else tok)
    return out


# =============================================================================
# Markdown parsing into course_documents, course_blocks & block_references
# =============================================================================

@dataclasses.dataclass
class IndexedDocument:
    id: str
    course: str
    doc_kind: str
    doc_id: str
    order_index: int
    title: str
    date: str | None
    outline: list[dict[str, Any]]
    body_tex: str
    content_hash: str


@dataclasses.dataclass
class IndexedBlock:
    id: str
    course: str
    doc_kind: str
    doc_id: str
    doc_order: int
    block_order: int
    block_kind: str
    anchor_id: str
    section_id: str | None
    title: str
    statement_tex: str
    proof_tex: str
    lemmas: str
    content_hash: str
    vectorize_candidate: bool = True


_FRONT_MATTER_RE = re.compile(r"^---\n(.*?)\n(?:---|\.\.\.)\n(.*)$", re.S)
_HEADING_RE = re.compile(r"^(#{1,3})\s+(.+?)(?:\s+\{#([a-zA-Z0-9_:-]+)\})?\s*$")
_DIV_OPEN_RE = re.compile(r"^(:{3,})\s*\{([^}]*)\}\s*$")
_DIV_CLOSE_RE = re.compile(r"^(:{3,})\s*$")
_REF_LINK_RE = re.compile(
    r"(?:\[-?@([a-zA-Z]+:[a-zA-Z0-9_:-]+)\]|\[[^\]]+\]\(#([a-zA-Z0-9_:-]+)\))"
)

_KIND_MAP = {
    "theorem": "theorem",
    "lemma": "lemma",
    "proposition": "proposition",
    "corollary": "corollary",
    "definition": "definition",
    "axiom": "axiom",
    "problem": "problem",
    "example": "example",
    "remark": "remark",
    "ticket": "ticket",
}

_PROOF_CLASSES = {"proof", "solution"}


def _sha256_hex(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:32]


def _parse_div_attrs(attr_str: str) -> tuple[str | None, str | None, str]:
    cls_match = re.search(r"\.([a-zA-Z0-9_-]+)", attr_str)
    id_match = re.search(r"#([a-zA-Z0-9_:-]+)", attr_str)
    title_match = re.search(r'title="([^"]*)"', attr_str)
    if not title_match:
        title_match = re.search(r"title='([^']*)'", attr_str)
    return (
        cls_match.group(1) if cls_match else None,
        id_match.group(1) if id_match else None,
        title_match.group(1).strip() if title_match else "",
    )


def _slugify(text: str) -> str:
    tokens = _TOKEN_RE.findall(text.lower().replace("ё", "е"))
    return "-".join(tokens[:6]) or "sec"


def _doc_order_index(doc_kind: str, doc_id: str, meta: dict[str, Any]) -> int:
    if doc_kind == "lecture":
        if isinstance(meta.get("lecture"), int):
            return int(meta["lecture"])
        m = re.match(r"^(\d+)", doc_id)
        return int(m.group(1)) if m else 999
    if doc_kind == "theory":
        return 1000
    if doc_kind == "prep":
        return 1100
    return 1200


def discover_source_files(root: Path, only_course: str | None = None) -> list[tuple[Path, str, str, str]]:
    files: list[tuple[Path, str, str, str]] = []
    for p in sorted((root / "notes").glob("*/*.md")):
        if only_course and p.parent.name != only_course:
            continue
        files.append((p, "lecture", p.parent.name, p.stem))
    for p in sorted((root / "theory").glob("*.md")):
        if only_course and p.stem != only_course:
            continue
        files.append((p, "theory", p.stem, "theory"))
    for p in sorted((root / "prep").glob("*/*.md")):
        if only_course and p.parent.name != only_course:
            continue
        files.append((p, "prep", p.parent.name, p.stem))
    for p in sorted((root / "program").glob("*.md")):
        if only_course and p.stem != only_course:
            continue
        files.append((p, "program", p.stem, "program"))
    return files


def parse_markdown_document(
    path: Path,
    doc_kind: str,
    course: str,
    doc_id: str,
) -> tuple[IndexedDocument, list[IndexedBlock], list[tuple[str, str]]]:
    raw = path.read_text(encoding="utf-8")
    m = _FRONT_MATTER_RE.match(raw)
    if m:
        meta = yaml.safe_load(m.group(1)) or {}
        body = m.group(2)
    else:
        meta = {}
        body = raw

    order_index = _doc_order_index(doc_kind, doc_id, meta)
    doc_title = str(meta.get("title") or doc_id).strip()
    date_val = meta.get("date")
    date_str = str(date_val) if date_val is not None else None

    outline: list[dict[str, Any]] = []
    blocks: list[IndexedBlock] = []
    block_order = 0

    current_section_id: str | None = None
    current_section_title: str | None = None
    current_section_lines: list[str] = []

    def flush_section() -> None:
        nonlocal block_order
        if not current_section_title:
            return
        prose = "\n".join(current_section_lines).strip()
        if len(prose) < 60:
            return
        block_order += 1
        sec_anchor = current_section_id or f"sec:{doc_id}:{block_order}"
        canonical_id = f"{course}:{doc_id}#{sec_anchor}"
        lemmas = " ".join(dict.fromkeys(tokenize_and_stem(f"{current_section_title} {prose}")))
        chash = _sha256_hex(f"{canonical_id}|{current_section_title}|{prose}")
        blocks.append(
            IndexedBlock(
                id=canonical_id,
                course=course,
                doc_kind=doc_kind,
                doc_id=doc_id,
                doc_order=order_index,
                block_order=block_order,
                block_kind="section",
                anchor_id=sec_anchor,
                section_id=current_section_id,
                title=current_section_title,
                statement_tex=prose[:4000],
                proof_tex="",
                lemmas=lemmas[:4000],
                content_hash=chash,
            )
        )

    lines = body.splitlines()
    # Stack of active fenced divs: (fence_len, cls, anchor, title, statement_lines, proof_lines)
    div_stack: list[dict[str, Any]] = []

    for line in lines:
        open_m = _DIV_OPEN_RE.match(line)
        if open_m:
            fence_len = len(open_m.group(1))
            cls, anchor, title = _parse_div_attrs(open_m.group(2))
            div_stack.append(
                {
                    "fence_len": fence_len,
                    "cls": cls or "",
                    "anchor": anchor,
                    "title": title,
                    "statement_lines": [],
                    "proof_lines": [],
                }
            )
            continue

        close_m = _DIV_CLOSE_RE.match(line)
        if close_m and div_stack:
            top = div_stack.pop()
            cls = top["cls"]
            stmt_text = "\n".join(top["statement_lines"]).strip()
            proof_text = "\n".join(top["proof_lines"]).strip()

            # Nested proof/solution attaches to enclosing block if present
            if cls in _PROOF_CLASSES:
                combined_proof = "\n".join(p for p in [stmt_text, proof_text] if p).strip()
                if div_stack:
                    div_stack[-1]["proof_lines"].append(combined_proof)
                elif blocks:
                    # Proof div immediately following a theorem block in sibling position
                    prev = blocks[-1]
                    if prev.block_kind in {"theorem", "lemma", "proposition", "corollary", "problem"}:
                        prev.proof_tex = (
                            f"{prev.proof_tex}\n\n{combined_proof}".strip()
                            if prev.proof_tex
                            else combined_proof
                        )
                        prev.lemmas = " ".join(
                            dict.fromkeys(
                                tokenize_and_stem(f"{prev.title} {prev.statement_tex} {prev.proof_tex}")
                            )
                        )[:4000]
                        prev.content_hash = _sha256_hex(
                            f"{prev.id}|{prev.title}|{prev.statement_tex}|{prev.proof_tex}"
                        )
                continue

            mapped_kind = _KIND_MAP.get(cls)
            if mapped_kind and (stmt_text or top["title"]):
                block_order += 1
                anchor = top["anchor"] or f"{mapped_kind}:{doc_id}:{block_order}"
                canonical_id = anchor if top["anchor"] else f"{course}:{doc_id}#{anchor}"
                title = top["title"] or f"{mapped_kind} ({doc_id})"
                lemmas = " ".join(
                    dict.fromkeys(tokenize_and_stem(f"{title} {stmt_text} {proof_text}"))
                )[:4000]
                chash = _sha256_hex(f"{canonical_id}|{title}|{stmt_text}|{proof_text}")
                blocks.append(
                    IndexedBlock(
                        id=canonical_id,
                        course=course,
                        doc_kind=doc_kind,
                        doc_id=doc_id,
                        doc_order=order_index,
                        block_order=block_order,
                        block_kind=mapped_kind,
                        anchor_id=anchor,
                        section_id=current_section_id,
                        title=title,
                        statement_tex=stmt_text,
                        proof_tex=proof_text,
                        lemmas=lemmas,
                        content_hash=chash,
                    )
                )
            elif div_stack:
                # Unknown inner div (e.g., callout) — fold text into parent
                div_stack[-1]["statement_lines"].append(stmt_text)
            continue

        if div_stack:
            div_stack[-1]["statement_lines"].append(line)
            continue

        # Outside fenced divs: track headings & prose sections
        hm = _HEADING_RE.match(line)
        if hm:
            level = len(hm.group(1))
            htitle = hm.group(2).strip()
            hid = hm.group(3) or f"sec:{doc_id}:{_slugify(htitle)}"
            outline.append({"id": hid, "title": htitle, "level": level})
            if level == 2:
                flush_section()
                current_section_id = hid
                current_section_title = htitle
                current_section_lines = []
            continue

        if current_section_title is not None:
            current_section_lines.append(line)

    flush_section()

    # Deduplicate block IDs within document if any accidental collisions occur
    seen_ids: dict[str, int] = {}
    for b in blocks:
        if b.id in seen_ids:
            seen_ids[b.id] += 1
            b.id = f"{b.id}__{seen_ids[b.id]}"
        else:
            seen_ids[b.id] = 1

    # Extract cross-references from blocks (Pandoc [-@id]/[@id] and Markdown [text](#id))
    refs_set: set[tuple[str, str]] = set()
    for b in blocks:
        combined = f"{b.statement_tex}\n{b.proof_tex}"
        for m_ref in _REF_LINK_RE.finditer(combined):
            target = m_ref.group(1) or m_ref.group(2)
            if target and target != b.id:
                refs_set.add((b.id, target))

    doc = IndexedDocument(
        id=f"{course}:{doc_kind}:{doc_id}",
        course=course,
        doc_kind=doc_kind,
        doc_id=doc_id,
        order_index=order_index,
        title=doc_title,
        date=date_str,
        outline=outline,
        body_tex=body.strip(),
        content_hash=_sha256_hex(f"{doc_title}|{body.strip()}"),
    )
    return doc, blocks, sorted(refs_set)


def collect_corpus(
    root: Path,
    only_course: str | None = None,
    max_vectorize: int = VECTORIZE_FREE_MAX_VECTORS,
) -> tuple[list[IndexedDocument], list[IndexedBlock], list[tuple[str, str]]]:
    docs: list[IndexedDocument] = []
    all_blocks: list[IndexedBlock] = []
    all_refs: list[tuple[str, str]] = []

    global_seen: dict[str, int] = {}
    for path, doc_kind, course, doc_id in discover_source_files(root, only_course):
        doc, blocks, refs = parse_markdown_document(path, doc_kind, course, doc_id)
        docs.append(doc)
        for b in blocks:
            if b.id in global_seen:
                global_seen[b.id] += 1
                b.id = f"{course}:{doc_id}#{b.anchor_id}_{global_seen[b.id]}"
            else:
                global_seen[b.id] = 1
            all_blocks.append(b)
        all_refs.extend(refs)

    # Enforce Vectorize Free tier budget (<= max_vectorize vectors @ 1024 dim)
    prioritized = sorted(
        range(len(all_blocks)),
        key=lambda i: (VECTORIZE_PRIORITY.get(all_blocks[i].block_kind, 9), i),
    )
    selected_vec = set(prioritized[:max_vectorize])
    for i, b in enumerate(all_blocks):
        b.vectorize_candidate = i in selected_vec

    # Deduplicate refs globally
    unique_refs = sorted(set(all_refs))
    return docs, all_blocks, unique_refs


# =============================================================================
# Cloudflare REST helpers (D1, Workers AI bge-m3, Vectorize v2)
# =============================================================================

class CloudflareClient:
    def __init__(self, account_id: str, api_token: str, d1_id: str, vec_index: str) -> None:
        self.account_id = account_id
        self.api_token = api_token
        self.d1_id = d1_id
        self.vec_index = vec_index
        self.base = f"https://api.cloudflare.com/client/v4/accounts/{account_id}"

    def _req(
        self,
        method: str,
        path: str,
        body: bytes | dict[str, Any] | None = None,
        content_type: str = "application/json",
    ) -> Any:
        data: bytes | None
        if isinstance(body, dict):
            data = json.dumps(body).encode("utf-8")
        else:
            data = body
        req = urllib.request.Request(
            f"{self.base}{path}",
            data=data,
            method=method,
            headers={
                "Authorization": f"Bearer {self.api_token}",
                "Content-Type": content_type,
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            err_body = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"Cloudflare API {method} {path} HTTP {exc.code}: {err_body}") from exc

    def d1_query(self, sql: str, params: list[Any] | None = None) -> list[dict[str, Any]]:
        payload: dict[str, Any] = {"sql": sql}
        if params:
            payload["params"] = params
        res = self._req("POST", f"/d1/database/{self.d1_id}/query", payload)
        if not res.get("success"):
            raise RuntimeError(f"D1 query error: {res}")
        first = (res.get("result") or [{}])[0]
        return first.get("results") or []

    def embed_texts(self, texts: list[str]) -> list[list[float]]:
        res = self._req("POST", f"/ai/run/{EMBEDDING_MODEL}", {"text": texts})
        data = (res.get("result") or {}).get("data")
        if not isinstance(data, list) or len(data) != len(texts):
            raise RuntimeError(f"Unexpected Workers AI embedding response: {str(res)[:300]}")
        return data

    def vectorize_upsert(self, vectors: list[dict[str, Any]]) -> None:
        if not vectors:
            return
        ndjson = "\n".join(json.dumps(v) for v in vectors).encode("utf-8")
        self._req(
            "POST",
            f"/vectorize/v2/indexes/{self.vec_index}/upsert",
            body=ndjson,
            content_type="application/x-ndjson",
        )

    def vectorize_delete(self, ids: list[str]) -> None:
        if not ids:
            return
        self._req(
            "POST",
            f"/vectorize/v2/indexes/{self.vec_index}/delete_by_ids",
            {"ids": ids},
        )


def sync_to_cloudflare(
    cf: CloudflareClient,
    docs: list[IndexedDocument],
    blocks: list[IndexedBlock],
    refs: list[tuple[str, str]],
    skip_vectorize: bool = False,
    only_course: str | None = None,
) -> dict[str, int]:
    now_ms = int(time.time() * 1000)
    stats = {
        "docs_upserted": 0,
        "docs_skipped": 0,
        "docs_deleted": 0,
        "blocks_upserted": 0,
        "blocks_skipped": 0,
        "blocks_deleted": 0,
        "vectors_upserted": 0,
        "vectors_deleted": 0,
        "refs_updated": 0,
    }

    # 1. Fetch existing hashes from D1 for incremental diff
    if only_course:
        existing_docs = {
            r["id"]: r["content_hash"]
            for r in cf.d1_query(
                "SELECT id, content_hash FROM course_documents WHERE course = ?",
                [only_course],
            )
        }
        existing_blocks = {
            r["id"]: (r["content_hash"], int(r.get("vectorized") or 0))
            for r in cf.d1_query(
                "SELECT id, content_hash, vectorized FROM course_blocks WHERE course = ?",
                [only_course],
            )
        }
    else:
        existing_docs = {
            r["id"]: r["content_hash"]
            for r in cf.d1_query("SELECT id, content_hash FROM course_documents")
        }
        existing_blocks = {
            r["id"]: (r["content_hash"], int(r.get("vectorized") or 0))
            for r in cf.d1_query("SELECT id, content_hash, vectorized FROM course_blocks")
        }

    # 2. Upsert changed documents only
    new_doc_ids = {d.id for d in docs}
    for d in docs:
        if existing_docs.get(d.id) == d.content_hash:
            stats["docs_skipped"] += 1
            continue
        cf.d1_query(
            """INSERT INTO course_documents
               (id, course, doc_kind, doc_id, order_index, title, date, outline_json, body_tex, content_hash, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET
                 course=excluded.course, doc_kind=excluded.doc_kind, doc_id=excluded.doc_id,
                 order_index=excluded.order_index, title=excluded.title, date=excluded.date,
                 outline_json=excluded.outline_json, body_tex=excluded.body_tex,
                 content_hash=excluded.content_hash, updated_at=excluded.updated_at""",
            [
                d.id,
                d.course,
                d.doc_kind,
                d.doc_id,
                d.order_index,
                d.title,
                d.date,
                json.dumps(d.outline, ensure_ascii=False),
                d.body_tex,
                d.content_hash,
                now_ms,
            ],
        )
        stats["docs_upserted"] += 1

    # Delete removed documents
    for old_doc_id in set(existing_docs) - new_doc_ids:
        cf.d1_query("DELETE FROM course_documents WHERE id = ?", [old_doc_id])
        stats["docs_deleted"] += 1

    # 3. Diff blocks & upsert only changed blocks into D1 + FTS5
    new_block_ids = {b.id for b in blocks}
    changed_blocks: list[IndexedBlock] = []
    blocks_needing_vec: list[IndexedBlock] = []

    for b in blocks:
        prev = existing_blocks.get(b.id)
        if prev and prev[0] == b.content_hash:
            stats["blocks_skipped"] += 1
            if not skip_vectorize and b.vectorize_candidate and prev[1] == 0:
                blocks_needing_vec.append(b)
            continue
        changed_blocks.append(b)
        if not skip_vectorize and b.vectorize_candidate:
            blocks_needing_vec.append(b)

    # Batch changed blocks into D1 (10 per multi-row SQL statement for speed)
    changed_ids = {b.id for b in changed_blocks}
    BATCH_SZ = 5  # 5 * 16 = 80 params (well under SQLite 100 bind param limit per query!)
    for i in range(0, len(changed_blocks), BATCH_SZ):
        chunk = changed_blocks[i : i + BATCH_SZ]
        placeholders = ", ".join(
            "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)" for _ in chunk
        )
        params: list[Any] = []
        for b in chunk:
            params.extend(
                [
                    b.id,
                    b.course,
                    b.doc_kind,
                    b.doc_id,
                    b.doc_order,
                    b.block_order,
                    b.block_kind,
                    b.anchor_id,
                    b.section_id,
                    b.title,
                    b.statement_tex,
                    b.proof_tex,
                    b.lemmas,
                    b.content_hash,
                    now_ms,
                ]
            )
        cf.d1_query(
            f"""INSERT INTO course_blocks
               (id, course, doc_kind, doc_id, doc_order, block_order, block_kind, anchor_id, section_id,
                title, statement_tex, proof_tex, lemmas, content_hash, vectorized, updated_at)
               VALUES {placeholders}
               ON CONFLICT(id) DO UPDATE SET
                 course=excluded.course, doc_kind=excluded.doc_kind, doc_id=excluded.doc_id,
                 doc_order=excluded.doc_order, block_order=excluded.block_order,
                 block_kind=excluded.block_kind, anchor_id=excluded.anchor_id,
                 section_id=excluded.section_id, title=excluded.title,
                 statement_tex=excluded.statement_tex, proof_tex=excluded.proof_tex,
                 lemmas=excluded.lemmas, content_hash=excluded.content_hash,
                 vectorized=0, updated_at=excluded.updated_at""",
            params,
        )

        # Delete & re-insert FTS5 rows in batch
        del_ph = ", ".join("?" for _ in chunk)
        cf.d1_query(f"DELETE FROM course_blocks_fts WHERE id IN ({del_ph})", [b.id for b in chunk])
        fts_ph = ", ".join("(?, ?, ?, ?, ?, ?, ?, ?)" for _ in chunk)
        fts_params: list[Any] = []
        for b in chunk:
            fts_params.extend(
                [b.id, b.course, b.doc_kind, b.block_kind, b.title, b.statement_tex, b.proof_tex, b.lemmas]
            )
        cf.d1_query(
            f"""INSERT INTO course_blocks_fts (id, course, doc_kind, block_kind, title, statement_tex, proof_tex, lemmas)
               VALUES {fts_ph}""",
            fts_params,
        )
        stats["blocks_upserted"] += len(chunk)

    # Delete removed blocks from D1, FTS5, refs, and Vectorize
    removed_block_ids = sorted(set(existing_blocks) - new_block_ids)
    for i in range(0, len(removed_block_ids), 40):
        chunk_ids = removed_block_ids[i : i + 40]
        ph = ", ".join("?" for _ in chunk_ids)
        cf.d1_query(f"DELETE FROM course_blocks WHERE id IN ({ph})", chunk_ids)
        cf.d1_query(f"DELETE FROM course_blocks_fts WHERE id IN ({ph})", chunk_ids)
        cf.d1_query(
            f"DELETE FROM block_references WHERE from_block_id IN ({ph}) OR to_block_id IN ({ph})",
            chunk_ids + chunk_ids,
        )
        stats["blocks_deleted"] += len(chunk_ids)

    if not skip_vectorize and removed_block_ids:
        for i in range(0, len(removed_block_ids), 100):
            batch_ids = removed_block_ids[i : i + 100]
            cf.vectorize_delete(batch_ids)
            stats["vectors_deleted"] += len(batch_ids)

    # 4. Update references for changed blocks only (batched)
    if changed_ids:
        changed_list = sorted(changed_ids)
        for i in range(0, len(changed_list), 50):
            chunk_ids = changed_list[i : i + 50]
            ph = ", ".join("?" for _ in chunk_ids)
            cf.d1_query(f"DELETE FROM block_references WHERE from_block_id IN ({ph})", chunk_ids)

        changed_refs = [(src, dst) for src, dst in refs if src in changed_ids]
        for i in range(0, len(changed_refs), 40):
            chunk_refs = changed_refs[i : i + 40]
            ph = ", ".join("(?, ?, 'ref')" for _ in chunk_refs)
            rparams: list[Any] = []
            for src, dst in chunk_refs:
                rparams.extend([src, dst])
            cf.d1_query(
                f"INSERT OR IGNORE INTO block_references (from_block_id, to_block_id, ref_kind) VALUES {ph}",
                rparams,
            )
            stats["refs_updated"] += len(chunk_refs)

    # 5. Embed & upsert Vectorize in batches of 25
    if not skip_vectorize and blocks_needing_vec:
        for i in range(0, len(blocks_needing_vec), 25):
            chunk = blocks_needing_vec[i : i + 25]
            texts = [f"{b.title}\n{b.statement_tex[:1200]}" for b in chunk]
            embeddings = cf.embed_texts(texts)
            valid_blocks = [b for b in chunk if len(b.id.encode("utf-8")) <= 64]
            vectors = [
                {"id": b.id, "values": emb}
                for b, emb in zip(chunk, embeddings)
                if len(b.id.encode("utf-8")) <= 64
            ]
            cf.vectorize_upsert(vectors)
            if valid_blocks:
                ph = ", ".join("?" for _ in valid_blocks)
                cf.d1_query(
                    f"UPDATE course_blocks SET vectorized = 1 WHERE id IN ({ph})",
                    [b.id for b in valid_blocks],
                )
                stats["vectors_upserted"] += len(valid_blocks)

    # 6. Update index_meta version
    index_version = _sha256_hex(
        "|".join(sorted(f"{b.id}:{b.content_hash}" for b in blocks))
    )
    meta_json = json.dumps(
        {
            "indexVersion": index_version,
            "embeddingModel": EMBEDDING_MODEL,
            "chunkingVersion": CHUNKING_VERSION,
            "updatedAt": now_ms,
        }
    )
    cf.d1_query(
        """INSERT INTO service_config (key, value_json, updated_at)
           VALUES ('index_meta', ?, ?)
           ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json, updated_at=excluded.updated_at""",
        [meta_json, now_ms],
    )
    return stats


def main() -> None:
    parser = argparse.ArgumentParser(description="Export HSE lecture notes into D1 FTS5 & Vectorize.")
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--only-course", type=str, default=None)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--sync-remote", action="store_true")
    parser.add_argument("--skip-vectorize", action="store_true")
    parser.add_argument("--fail-on-vectorize-overflow", action="store_true")
    parser.add_argument("--output-json", type=Path, default=None)
    args = parser.parse_args()

    docs, blocks, refs = collect_corpus(args.root, only_course=args.only_course)
    vec_count = sum(1 for b in blocks if b.vectorize_candidate)
    stored_dims = vec_count * 1024

    summary = {
        "documents": len(docs),
        "blocks": len(blocks),
        "references": len(refs),
        "vectorize_selected": vec_count,
        "vectorize_stored_dimensions": stored_dims,
        "vectorize_free_limit_dimensions": 5_000_000,
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))

    if args.fail_on_vectorize_overflow and len(blocks) > VECTORIZE_FREE_MAX_VECTORS:
        print(
            f"ERROR: total blocks ({len(blocks)}) exceeds Vectorize Free cap ({VECTORIZE_FREE_MAX_VECTORS})",
            file=sys.stderr,
        )
        sys.exit(2)

    if args.output_json:
        args.output_json.write_text(
            json.dumps(
                {
                    "summary": summary,
                    "documents": [dataclasses.asdict(d) for d in docs],
                    "blocks": [dataclasses.asdict(b) for b in blocks],
                    "references": refs,
                },
                ensure_ascii=False,
                indent=1,
            ),
            encoding="utf-8",
        )

    if args.sync_remote and not args.dry_run:
        account_id = os.environ.get("CLOUDFLARE_ACCOUNT_ID", "").strip()
        api_token = os.environ.get("CLOUDFLARE_API_TOKEN", "").strip()
        if not account_id or not api_token:
            print("Missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN", file=sys.stderr)
            sys.exit(1)
        d1_id = os.environ.get("CLOUDFLARE_D1_ID", DEFAULT_D1_ID).strip()
        vec_idx = os.environ.get("CLOUDFLARE_VECTORIZE_INDEX", DEFAULT_VECTORIZE_INDEX).strip()
        cf = CloudflareClient(account_id, api_token, d1_id, vec_idx)
        stats = sync_to_cloudflare(
            cf,
            docs,
            blocks,
            refs,
            skip_vectorize=args.skip_vectorize,
            only_course=args.only_course,
        )
        print("Sync stats:", json.dumps(stats, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
