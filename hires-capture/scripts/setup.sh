#!/usr/bin/env bash
# playwright-core をリポジトリの外のキャッシュに 1 度だけ入れ、そのディレクトリを出力する。
# ブラウザ本体はダウンロードせず、インストール済みの Google Chrome を使う。
set -euo pipefail
dir="${HIRES_CAPTURE_HOME:-${XDG_CACHE_HOME:-$HOME/.cache}/hires-capture}"
mkdir -p "$dir"
cd "$dir"
[ -f package.json ] || echo '{"private":true}' > package.json
[ -d node_modules/playwright-core ] || npm install --silent --no-audit --no-fund playwright-core >&2
echo "$dir"
