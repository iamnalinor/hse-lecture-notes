"""Поиск по сайту: плоский текст фрагмента страницы по якорям → записи `search.json`."""

from __future__ import annotations

import re
from html.parser import HTMLParser

BLOCK_TAGS = {"p", "div", "li", "section", "br", "td", "th", "tr", "figcaption", "summary", "blockquote"}
# ответы прячутся под спойлер — в сниппете поиска их быть не должно
SEARCH_SKIP = {"nb-answers", "nb-solution"}


class SearchChunks(HTMLParser):
    """Плоский текст фрагмента по якорям: ближайший `<section id>` или `div.nb[id]`.

    Заголовок раздела или имя блока идут в `heading`, остальное — в `text`. Inline-формулы
    остаются как `$…$`; display-формулы, ответы и копии блоков в теории (`reg-…`, оригинал
    уже есть в лекции) выкидываются.
    """

    def __init__(self) -> None:
        super().__init__()
        self.chunks: dict[str, dict] = {}
        self.stack: list[tuple[str, str | None]] = []  # (тег, что открыл: anchor | heading | math | skip)
        self.anchors: list[str] = []
        self.heading = 0
        self.skip = 0

    def handle_starttag(self, tag, attrs):
        if tag in BLOCK_TAGS or re.fullmatch(r"h[1-6]", tag):
            self.handle_data(" ")
        a = dict(attrs)
        classes = (a.get("class") or "").split()
        role = None
        if SEARCH_SKIP & set(classes) or (a.get("id") or "").startswith("reg-"):
            self.skip += 1
            role = "skip"
        elif a.get("id") and (tag == "section" or "nb" in classes):
            self.anchors.append(a["id"])
            self.chunks.setdefault(a["id"], {"heading": [], "text": []})
            role = "anchor"
        elif re.fullmatch(r"h[1-6]", tag) or "nb-name" in classes:
            self.heading += 1
            role = "heading"
        elif "math" in classes and "display" in classes:
            self.skip += 1
            role = "skip"
        elif "math" in classes:
            self.handle_data("$")
            role = "math"
        if tag not in ("br", "img", "hr", "input"):
            self.stack.append((tag, role))

    def handle_endtag(self, tag):
        if tag in BLOCK_TAGS:
            self.handle_data(" ")
        while self.stack:
            open_tag, role = self.stack.pop()
            if role == "anchor":
                self.anchors.pop()
            elif role == "heading":
                self.heading -= 1
            elif role == "skip":
                self.skip -= 1
            elif role == "math":
                self.handle_data("$")
            if open_tag == tag:
                break

    def handle_data(self, data):
        if self.skip or not self.anchors:
            return
        chunk = self.chunks[self.anchors[-1]]
        chunk["heading" if self.heading else "text"].append(data)


def squash(parts: list[str]) -> str:
    text = re.sub(r"\s+", " ", "".join(parts)).strip()
    text = re.sub(r"\$\s*(.*?)\s*\$", r"$\1$", text)
    return re.sub(r"\s+([,.;:!?)])", r"\1", text)


def search_entries(course: str, doc: str, lecture: int, fragment: str) -> list[dict]:
    parser = SearchChunks()
    parser.feed(fragment)
    entries = []
    for anchor, chunk in parser.chunks.items():
        heading, text = squash(chunk["heading"]), squash(chunk["text"])
        if heading or text:
            entries.append(
                {
                    "course": course,
                    "doc": doc,
                    "lecture": lecture,
                    "anchor": anchor,
                    "heading": heading,
                    "text": text,
                }
            )
    return entries
