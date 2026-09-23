#!/bin/bash
# Shows files changed since last commit (or compared to a ref).
# Usage: ./changed_files.sh [ref]

PROJECT_DIR="/Users/thieleone/Library/Mobile Documents/com~apple~CloudDocs/STUDIUM/BA_Bachelorarbeit/VRM-Rust-GUI"
cd "$PROJECT_DIR" || exit 1

REF="${1:-HEAD}"

echo "=== Changed files (vs $REF) ==="
git diff --name-only "$REF" 2>/dev/null || git diff --name-only HEAD~1 2>/dev/null

echo ""
echo "=== Untracked/new files ==="
git ls-files --others --exclude-standard 2>/dev/null
