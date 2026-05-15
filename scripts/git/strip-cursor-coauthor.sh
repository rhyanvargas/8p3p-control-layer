#!/usr/bin/env bash
# Strip "Co-authored-by: Cursor" from the latest commit message (same tree).
# Use when the Cursor agent shell appends that trailer after `git commit`.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
if ! git log -1 --format=%B | grep -q '^Co-authored-by: Cursor'; then
  echo "strip-cursor-coauthor: no Cursor co-author trailer on HEAD; nothing to do."
  exit 0
fi
if ! git log -1 --format=%B | grep -q '^Co-authored-by: Cursor'; then
  echo "strip-cursor-coauthor: no Cursor co-author trailer on HEAD; nothing to do."
  exit 0
fi
stash_popped=0
if ! git diff --quiet || ! git diff --cached --quiet || git status --porcelain | grep -q '^??'; then
  git stash push -u -m "strip-cursor-coauthor: temp" >/dev/null
  stash_popped=1
fi
FILTER_BRANCH_SQUELCH_WARNING=1 git filter-branch -f --msg-filter 'grep -v "^Co-authored-by: Cursor"' -- HEAD^..HEAD
for ref in $(git for-each-ref --format='%(refname)' refs/original/ 2>/dev/null); do
  git update-ref -d "$ref" 2>/dev/null || true
done
if [ "$stash_popped" = 1 ]; then
  git stash pop
fi
echo "strip-cursor-coauthor: HEAD message rewritten."
