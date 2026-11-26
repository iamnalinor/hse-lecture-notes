"""Lecture notes → documents, blocks and cross-references for the chat search index.

Covers the four doc_kind categories:
  notes/<course>/*.md  -> 'lecture'      theory/<course>.md  -> 'theory'
  prep/<course>/*.md   -> 'prep'         program/<course>.md -> 'program'
"""

from __future__ import annotations

import dataclasses
import hashlib
import json
import re
import subprocess
from collections.abc import Callable
from pathlib import Path
from typing import Any

import pypandoc
import yaml

from search_stemmer import tokenize_and_stem

VECTORIZE_FREE_MAX_VECTORS = 4800  # hard Free cap is 4882 @ 1024 dim (5M stored dimensions)

# Priority order for vectorization if the corpus approaches the Vectorize Free ceiling
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

Reference = tuple[str, str]  # (from_block_id, to_block_id)


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


Corpus = tuple[list[IndexedDocument], list[IndexedBlock], list[Reference]]

_FRONT_MATTER_RE = re.compile(r"^---\n(.*?)\n(?:---|\.\.\.)\n(.*)$", re.DOTALL)
_HEADING_RE = re.compile(r"^(#{1,3})\s+(.+?)(?:\s+\{#([a-zA-Z0-9_:-]+)\})?\s*$")
_DIV_OPEN_RE = re.compile(r"^(:{3,})\s*(?:\{(.*)\}|([\w-]+))\s*$")
_DIV_CLOSE_RE = re.compile(r"^(:{3,})\s*$")
_REF_LINK_RE = re.compile(r"(?:\[-?@([a-zA-Z]+:[a-zA-Z0-9_:-]+)\]|\[[^\]]+\]\(#([a-zA-Z0-9_:-]+)\))")
_REG_REF_RE = re.compile(r"""(?:^|\s)ref=["']?([\w:-]+)""")
_PANDOC_MARKDOWN = "markdown+tex_math_dollars+fenced_divs+citations-implicit_figures"

_BLOCK_KINDS = {
    "theorem",
    "lemma",
    "proposition",
    "corollary",
    "definition",
    "axiom",
    "problem",
    "example",
    "remark",
    "ticket",
}
_PROOF_CLASSES = {"proof", "solution"}
_PROOF_OWNERS = {"theorem", "lemma", "proposition", "corollary", "problem"}
_MIN_SECTION_CHARS = 60  # shorter prose is not worth a search block
_MAX_FIELD_CHARS = 4000


def sha256_hex(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:32]


def _content_hash(*parts: str) -> str:
    return sha256_hex("|".join(parts))


def _lemmas(*texts: str) -> str:
    return " ".join(dict.fromkeys(tokenize_and_stem(" ".join(texts))))[:_MAX_FIELD_CHARS]


def _parse_div_attrs(attr_str: str) -> tuple[str | None, str | None, str]:
    cls_match = re.search(r"\.([a-zA-Z0-9_-]+)", attr_str)
    id_match = re.search(r"#([a-zA-Z0-9_:-]+)", attr_str)
    title_match = re.search(r'title="([^"]*)"', attr_str) or re.search(r"title='([^']*)'", attr_str)
    return (
        cls_match.group(1) if cls_match else None,
        id_match.group(1) if id_match else None,
        title_match.group(1).strip() if title_match else "",
    )


def _heading_ids(lines: list[str]) -> list[str]:
    # Use the site's Pandoc reader for math, Unicode, punctuation and duplicate headings.
    headings = [line for line in lines if _HEADING_RE.match(line)]
    if not headings:
        return []
    data = subprocess.check_output(
        [pypandoc.get_pandoc_path(), "-f", _PANDOC_MARKDOWN, "-t", "json"],
        input="\n\n".join(headings),
        text=True,
    )
    return [block["c"][1][0] for block in json.loads(data)["blocks"] if block["t"] == "Header"]


def _doc_order_index(doc_kind: str, doc_id: str, meta: dict[str, Any]) -> int:
    if doc_kind == "lecture":
        if isinstance(meta.get("lecture"), int):
            return int(meta["lecture"])
        m = re.match(r"^(\d+)", doc_id)
        return int(m.group(1)) if m else 999
    return {"theory": 1000, "prep": 1100}.get(doc_kind, 1200)


# folder, glob, doc_kind, path -> (course, doc_id)
_SOURCE_LAYOUT: list[tuple[str, str, str, Callable[[Path], tuple[str, str]]]] = [
    ("notes", "*/*.md", "lecture", lambda p: (p.parent.name, p.stem)),
    ("theory", "*.md", "theory", lambda p: (p.stem, "theory")),
    ("prep", "*/*.md", "prep", lambda p: (p.parent.name, p.stem)),
    ("program", "*.md", "program", lambda p: (p.stem, "program")),
]


def discover_source_files(root: Path, only_course: str | None = None) -> list[tuple[Path, str, str, str]]:
    """(path, doc_kind, course, doc_id) for every document under notes/, theory/, prep/ and program/."""
    files = []
    for folder, pattern, doc_kind, course_and_id in _SOURCE_LAYOUT:
        for path in sorted((root / folder).glob(pattern)):
            course, doc_id = course_and_id(path)
            if not only_course or course == only_course:
                files.append((path, doc_kind, course, doc_id))
    return files


@dataclasses.dataclass
class _OpenDiv:
    cls: str
    anchor: str | None
    title: str
    ref: str | None
    statement_lines: list[str] = dataclasses.field(default_factory=list)
    proof_lines: list[str] = dataclasses.field(default_factory=list)


class _DocumentParser:
    """Line scanner over one file: fenced divs become blocks, prose under headings becomes sections."""

    def __init__(self, doc_kind: str, course: str, doc_id: str, order_index: int) -> None:
        self.doc_kind, self.course, self.doc_id, self.order_index = doc_kind, course, doc_id, order_index
        self.outline: list[dict[str, Any]] = []
        self.blocks: list[IndexedBlock] = []
        self.source_refs: list[Reference] = []
        self._block_order = 0
        self._section_id: str | None = None
        self._section_title: str | None = None
        self._section_lines: list[str] = []
        self._div_stack: list[_OpenDiv] = []
        self._reg_counts: dict[str, int] = {}

    def scan(self, lines: list[str]) -> None:
        heading_ids = iter(_heading_ids(lines))
        for line in lines:
            heading_id = next(heading_ids) if _HEADING_RE.match(line) else None
            if open_m := _DIV_OPEN_RE.match(line):
                self._open_div(open_m)
            elif _DIV_CLOSE_RE.match(line) and self._div_stack:
                self._close_div()
            elif self._div_stack:
                self._div_stack[-1].statement_lines.append(line)
            elif heading_m := _HEADING_RE.match(line):
                self._start_section(heading_m, heading_id)
            elif self._section_title is not None:
                self._section_lines.append(line)
        self._flush_section()

    def _new_block(self, **fields: Any) -> None:
        self._block_order += 1
        self.blocks.append(
            IndexedBlock(
                course=self.course,
                doc_kind=self.doc_kind,
                doc_id=self.doc_id,
                doc_order=self.order_index,
                block_order=self._block_order,
                section_id=self._section_id,
                **fields,
            )
        )

    def _start_section(self, heading: re.Match[str], heading_id: str | None) -> None:
        title = heading.group(2).strip()
        self.outline.append({"id": heading_id, "title": title, "level": len(heading.group(1))})
        self._flush_section()
        self._section_id, self._section_title, self._section_lines = heading_id, title, []

    def _flush_section(self) -> None:
        if not self._section_title:
            return
        prose = "\n".join(self._section_lines).strip()
        if len(prose) < _MIN_SECTION_CHARS:
            return
        anchor = self._section_id or f"sec:{self.doc_id}:{self._block_order + 1}"
        block_id = f"{self.course}:{self.doc_id}#{anchor}"
        self._new_block(
            id=block_id,
            block_kind="section",
            anchor_id=anchor,
            title=self._section_title,
            statement_tex=prose[:_MAX_FIELD_CHARS],
            proof_tex="",
            lemmas=_lemmas(self._section_title, prose),
            content_hash=_content_hash(block_id, self._section_title, prose),
        )

    def _open_div(self, match: re.Match[str]) -> None:
        attrs = match.group(2) or ""
        cls, anchor, title = _parse_div_attrs(attrs)
        ref_m = _REG_REF_RE.search(attrs)
        ref = ref_m.group(1) if ref_m else None
        if ref:
            n = self._reg_counts[ref] = self._reg_counts.get(ref, 0) + 1
            anchor = f"reg-{ref}" + (f"-{n}" if n > 1 else "")
        self._div_stack.append(_OpenDiv(cls or match.group(3) or "", anchor, title, ref))

    def _close_div(self) -> None:
        div = self._div_stack.pop()
        statement = "\n".join(div.statement_lines).strip()
        proof = "\n".join(div.proof_lines).strip()
        if div.cls in _PROOF_CLASSES:
            self._attach_proof("\n".join(p for p in [statement, proof] if p).strip())
        elif div.cls in _BLOCK_KINDS and (statement or div.title):
            self._add_div_block(div, statement, proof)
        elif self._div_stack:
            # Unknown inner div (e.g., callout): fold its text into the parent
            self._div_stack[-1].statement_lines.append(statement)

    def _attach_proof(self, proof: str) -> None:
        """A nested proof belongs to the enclosing div; a top-level one to the block just before it."""
        if self._div_stack:
            self._div_stack[-1].proof_lines.append(proof)
            return
        prev = self.blocks[-1] if self.blocks else None
        if prev is None or prev.block_kind not in _PROOF_OWNERS:
            return
        prev.proof_tex = f"{prev.proof_tex}\n\n{proof}".strip() if prev.proof_tex else proof
        prev.lemmas = _lemmas(prev.title, prev.statement_tex, prev.proof_tex)
        prev.content_hash = _content_hash(prev.id, prev.title, prev.statement_tex, prev.proof_tex)

    def _add_div_block(self, div: _OpenDiv, statement: str, proof: str) -> None:
        anchor = div.anchor or f"{div.cls}:{self.doc_id}:{self._block_order + 1}"
        block_id = anchor if div.anchor else f"{self.course}:{self.doc_id}#{anchor}"
        if div.ref:
            self.source_refs.append((block_id, div.ref))
        title = div.title or f"{div.cls} ({self.doc_id})"
        self._new_block(
            id=block_id,
            block_kind=div.cls,
            anchor_id=div.anchor or self._section_id or "",
            title=title,
            statement_tex=statement,
            proof_tex=proof,
            lemmas=_lemmas(title, statement, proof),
            content_hash=_content_hash(block_id, title, statement, proof),
        )


def _split_front_matter(raw: str) -> tuple[dict[str, Any], str]:
    m = _FRONT_MATTER_RE.match(raw)
    if not m:
        return {}, raw
    return yaml.safe_load(m.group(1)) or {}, m.group(2)


def _dedupe_block_ids(blocks: list[IndexedBlock]) -> None:
    """Suffix accidental id collisions within one document."""
    seen: dict[str, int] = {}
    for b in blocks:
        if b.id in seen:
            seen[b.id] += 1
            b.id = f"{b.id}__{seen[b.id]}"
        else:
            seen[b.id] = 1


def _cross_references(blocks: list[IndexedBlock], source_refs: list[Reference]) -> list[Reference]:
    """Pandoc `[-@id]` / `[@id]` and Markdown `[text](#id)` links inside block texts, plus `ref=` copies."""
    refs = set(source_refs)
    for b in blocks:
        for m in _REF_LINK_RE.finditer(f"{b.statement_tex}\n{b.proof_tex}"):
            target = m.group(1) or m.group(2)
            if target and target != b.id:
                refs.add((b.id, target))
    return sorted(refs)


def parse_markdown_document(
    path: Path, doc_kind: str, course: str, doc_id: str
) -> tuple[IndexedDocument, list[IndexedBlock], list[Reference]]:
    meta, body = _split_front_matter(path.read_text(encoding="utf-8"))
    order_index = _doc_order_index(doc_kind, doc_id, meta)
    title = str(meta.get("title") or doc_id).strip()
    date = str(meta["date"]) if meta.get("date") is not None else None

    parser = _DocumentParser(doc_kind, course, doc_id, order_index)
    parser.scan(body.splitlines())
    _dedupe_block_ids(parser.blocks)

    doc = IndexedDocument(
        id=f"{course}:{doc_kind}:{doc_id}",
        course=course,
        doc_kind=doc_kind,
        doc_id=doc_id,
        order_index=order_index,
        title=title,
        date=date,
        outline=parser.outline,
        body_tex=body.strip(),
        content_hash=sha256_hex(json.dumps([title, date, order_index, parser.outline, body.strip()])),
    )
    return doc, parser.blocks, _cross_references(parser.blocks, parser.source_refs)


def collect_corpus(
    root: Path,
    only_course: str | None = None,
    max_vectorize: int = VECTORIZE_FREE_MAX_VECTORS,
) -> Corpus:
    docs: list[IndexedDocument] = []
    all_blocks: list[IndexedBlock] = []
    targets: dict[tuple[str, str], list[IndexedBlock]] = {}  # (course, anchor) -> blocks
    pending_refs: list[tuple[str, str, str, str]] = []  # (course, doc_id, from_id, to_anchor)
    for path, doc_kind, course, doc_id in discover_source_files(root):
        doc, blocks, refs = parse_markdown_document(path, doc_kind, course, doc_id)
        docs.append(doc)
        source_ids = {}
        for block in blocks:
            # The public anchor is local to its document. Vectorize IDs are limited to 64 bytes.
            canonical = "block:" + sha256_hex(json.dumps([course, doc_id, block.id]))
            source_ids[block.id] = canonical
            block.id = canonical
            targets.setdefault((course, block.anchor_id), []).append(block)
            all_blocks.append(block)
        pending_refs.extend((course, doc_id, source_ids[src], dst) for src, dst in refs)

    all_refs: list[Reference] = []
    outgoing: dict[str, list[str]] = {}
    for course, doc_id, src, anchor in pending_refs:
        candidates = targets.get((course, anchor), [])
        local = [b for b in candidates if b.doc_id == doc_id] or candidates
        if len(local) == 1:
            all_refs.append((src, local[0].id))
            outgoing.setdefault(src, []).append(local[0].id)
    for block in all_blocks:
        block.content_hash = sha256_hex(
            json.dumps([dataclasses.asdict(block), sorted(outgoing.get(block.id, []))])
        )

    if len(all_blocks) > max_vectorize:
        by_priority = sorted(all_blocks, key=lambda b: (VECTORIZE_PRIORITY.get(b.block_kind, 9), b.id))
        for block in by_priority[max_vectorize:]:
            block.vectorize_candidate = False

    return scope_corpus(docs, all_blocks, sorted(set(all_refs)), only_course)


def scope_corpus(
    docs: list[IndexedDocument],
    all_blocks: list[IndexedBlock],
    all_refs: list[Reference],
    only_course: str | None,
) -> Corpus:
    if only_course:
        docs = [doc for doc in docs if doc.course == only_course]
        all_blocks = [block for block in all_blocks if block.course == only_course]
        ids = {block.id for block in all_blocks}
        all_refs = [(src, dst) for src, dst in all_refs if src in ids]
    return docs, all_blocks, all_refs
