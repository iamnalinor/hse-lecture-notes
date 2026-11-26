#!/usr/bin/env bash
# Fetch the pinned upstream skills that context/process.md and context/style/ adapt,
# so an agent can read the originals even when they are not installed in the session.
# Usage: ./scripts/fetch_skills.sh   → .cache/skills/<owner>_<repo>/
set -euo pipefail
cd "$(dirname "$0")/.."
dest=.cache/skills
mkdir -p "$dest"

# owner/repo  commit
while read -r repo sha; do
  [[ -z "$repo" || "$repo" == \#* ]] && continue
  dir="$dest/${repo/\//_}"
  [[ -d "$dir/.git" ]] || git init -q "$dir"
  git -C "$dir" remote get-url origin >/dev/null 2>&1 \
    || git -C "$dir" remote add origin "https://github.com/$repo.git"
  if git -C "$dir" fetch -q --depth 1 origin "$sha" && git -C "$dir" checkout -q FETCH_HEAD; then
    echo "$repo @ ${sha:0:7} → $dir"
  else
    echo "WARN: $repo @ ${sha:0:7} не скачался, пропускаю" >&2
  fi
done <<'EOF'
obra/superpowers            22f0b463e7a5e579904dd6211a520321035526f7
pbakaus/impeccable          b49177d32788f2dc585c42831d845dacf1ebed2c
leonxlnx/taste-skill        f6b76575f949707b4e3c37cd86cb44b0b98643e8
emilkowalski/skill          64eb3deb9a5fbfa041faf783e0bc3fd635872e9c
nickture/skills             f219c28c616f2938f20542829d6b1f4b1006dc54
blader/humanizer            a32f24407364c74c812b43c15926d638bee1e072
smixs/humanizer-ru          ff990df404f78fb1a43fc574a725490bd1be8070
codemistake/human-writing   3d06941d99d78bb495d11a98f6cd30eeec7a701b
thevseprod/humanizer-ru     b94180f1cffc7e6665cd74aa4f530c495303ad15
deanpeters/Product-Manager-Skills 476ae12917b8e77609eb956bcc2203a4e4ec857d
EOF
