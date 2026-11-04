#!/usr/bin/env bash
# Pushes this folder as the root of a new, empty GitHub repo.
# Usage: scripts/publish.sh https://github.com/<you>/tailorscan.git
set -euo pipefail
URL="${1:?Pass the new repo URL}"
cd "$(dirname "$0")/.."
TMP="$(mktemp -d)"
cp -R . "$TMP/"
rm -rf "$TMP/.git" "$TMP/dist"
cd "$TMP"
git init -q -b main
git add -A
git commit -qm "Initial commit: TailorScan site"
git remote add origin "$URL"
git push -u origin main
echo "Pushed. Now enable Pages: repo Settings > Pages > Source: GitHub Actions."
