"""Deterministic Russian Snowball stemmer: the same algorithm as `backend/src/stemmer.ts`.

The search index stores stems computed here; the Worker stems queries with the TypeScript twin,
so any change must be made in both (tests/test_export_search_index.py checks parity).
"""

from __future__ import annotations

import re

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


def _region_start(word: str, after: int = 0) -> int:
    """Snowball R1 (after=0) or R2 (after=R1): the index just past the first non-vowel that follows a vowel."""
    seen_vowel = False
    for i in range(after, len(word)):
        if _VOWELS.search(word[i]):
            seen_vowel = True
        elif seen_vowel:
            return i + 1
    return len(word)


def _find_r2(word: str) -> int:
    # Snowball defines R1/R2 on the whole word; callers pass the full word.
    return _region_start(word, _region_start(word))


def _strip_inflection(rv: str) -> str:
    """Step 1: perfective gerund, else reflexive + adjective/participle, verb or noun endings."""
    if _PERFECTIVE_GERUND_1.search(rv):
        return _PERFECTIVE_GERUND_1.sub(r"\1", rv)
    if _PERFECTIVE_GERUND_2.search(rv):
        return _PERFECTIVE_GERUND_2.sub("", rv)
    rv = _REFLEXIVE.sub("", rv)
    if _ADJECTIVE.search(rv):
        rv = _ADJECTIVE.sub("", rv)
        if _PARTICIPLE_1.search(rv):
            return _PARTICIPLE_1.sub(r"\1", rv)
        return _PARTICIPLE_2.sub("", rv) if _PARTICIPLE_2.search(rv) else rv
    if _VERB_1.search(rv):
        return _VERB_1.sub(r"\1", rv)
    if _VERB_2.search(rv):
        return _VERB_2.sub("", rv)
    return _NOUN.sub("", rv)


def _strip_tail(rv: str) -> str:
    """Step 4: double n, else superlative, then double n or soft sign."""
    if _NN_ENDING.search(rv):
        return rv[:-1]
    rv = _SUPERLATIVE.sub("", rv)
    if _NN_ENDING.search(rv):
        return rv[:-1]
    return _SOFT_SIGN.sub("", rv)


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

    r2_start = max(0, _find_r2(word) - len(head))
    rv = _I_ENDING.sub("", _strip_inflection(rv))
    if r2_start < len(rv):
        r2_part = rv[r2_start:]
        if _DERIVATIONAL.search(r2_part):
            rv = rv[:r2_start] + _DERIVATIONAL.sub("", r2_part)
    return head + _strip_tail(rv)


def tokenize_and_stem(text: str) -> list[str]:
    tokens = _TOKEN_RE.findall(text.lower().replace("ё", "е"))
    return [stem_russian_word(tok) if _CYRILLIC.search(tok) else tok for tok in tokens if len(tok) >= 2]
