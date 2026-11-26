#!/usr/bin/env python3
"""Incremental exporter of HSE lecture notes into Cloudflare D1 (SQLite + FTS5) and Vectorize.

Features:
  - Identical deterministic Russian Snowball stemmer as `backend/src/stemmer.ts` (search_stemmer.py).
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
import json
import os
import sys
from pathlib import Path

from search_cloudflare import EMBEDDING_DIMENSIONS, CloudflareClient, sync_to_cloudflare
from search_corpus import VECTORIZE_FREE_MAX_VECTORS, collect_corpus, scope_corpus

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_D1_ID = "3516cc7d-e847-4266-8764-95c43dd0881c"
DEFAULT_VECTORIZE_INDEX = "hse-course-blocks"
VECTORIZE_FREE_LIMIT_DIMENSIONS = 5_000_000


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Export HSE lecture notes into D1 FTS5 & Vectorize.")
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--only-course", type=str, default=None)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--sync-remote", action="store_true")
    parser.add_argument("--skip-vectorize", action="store_true")
    parser.add_argument(
        "--fail-on-vectorize-overflow",
        action="store_true",
        help="Exit before sync if the global corpus exceeds the semantic search limit.",
    )
    parser.add_argument("--output-json", type=Path, default=None)
    return parser.parse_args()


def _cloudflare_client() -> CloudflareClient:
    account_id = os.environ.get("CLOUDFLARE_ACCOUNT_ID", "").strip()
    api_token = os.environ.get("CLOUDFLARE_API_TOKEN", "").strip()
    if not account_id or not api_token:
        print("Missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN", file=sys.stderr)
        sys.exit(1)
    d1_id = os.environ.get("CLOUDFLARE_D1_ID", DEFAULT_D1_ID).strip()
    vec_idx = os.environ.get("CLOUDFLARE_VECTORIZE_INDEX", DEFAULT_VECTORIZE_INDEX).strip()
    return CloudflareClient(account_id, api_token, d1_id, vec_idx)


def main() -> None:
    args = _parse_args()

    corpus = collect_corpus(args.root, max_vectorize=VECTORIZE_FREE_MAX_VECTORS)
    docs, blocks, refs = scope_corpus(*corpus, args.only_course)
    vec_count = sum(1 for b in blocks if b.vectorize_candidate)

    summary = {
        "documents": len(docs),
        "blocks": len(blocks),
        "references": len(refs),
        "vectorize_selected": vec_count,
        "vectorize_omitted": len(blocks) - vec_count,
        "vectorize_stored_dimensions": vec_count * EMBEDDING_DIMENSIONS,
        "vectorize_coverage": vec_count / len(blocks) if blocks else 0,
        "vectorize_free_limit_dimensions": VECTORIZE_FREE_LIMIT_DIMENSIONS,
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))

    if args.fail_on_vectorize_overflow:
        omitted = sum(not block.vectorize_candidate for block in corpus[1])
        if omitted:
            sys.stderr.write(f"Semantic search does not cover {omitted} blocks in the full corpus.\n")
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
        stats = sync_to_cloudflare(
            _cloudflare_client(),
            docs,
            blocks,
            refs,
            global_blocks=corpus[1],
            skip_vectorize=args.skip_vectorize,
            only_course=args.only_course,
        )
        print("Sync stats:", json.dumps(stats, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
