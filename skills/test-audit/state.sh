#!/bin/sh
# The record of the last audit, per branch. See SKILL.md.
#
#   state.sh tree    print the hash of the working tree, untracked files included
#   state.sh base    print the recorded tree, or HEAD with no record
#   state.sh check   Claude Code Stop hook: block while tests changed since the base
set -eu

cd "$(git rev-parse --show-toplevel)"

tree() {
  tmp="$(mktemp)"
  trap 'rm -f "$tmp"' EXIT
  cp "$(git rev-parse --git-path index)" "$tmp"
  GIT_INDEX_FILE="$tmp" git add -A
  GIT_INDEX_FILE="$tmp" git write-tree
}

base() {
  branch="$(git branch --show-current)"
  recorded="$(cat "$(git rev-parse --git-common-dir)/test-audit/$branch/tree" 2>/dev/null || true)"
  if [ -n "$branch" ] && [ -n "$recorded" ] && git cat-file -e "$recorded" 2>/dev/null; then
    echo "$recorded"
  else
    echo HEAD
  fi
}

case "${1:-}" in
  tree) tree ;;
  base) base ;;
  check)
    # Let the turn end when this hook already blocked it once.
    if grep -Eq '"stop_hook_active" *: *true'; then exit 0; fi
    [ -n "$(git branch --show-current)" ] || exit 0
    changed="$(git diff --name-only "$(base)" "$(tree)" -- tests '*.test.ts')"
    [ -z "$changed" ] && exit 0
    printf 'Tests changed since the last audit. Run /test-audit before ending the turn:\n%s\n' \
      "$changed" >&2
    exit 2
    ;;
  *)
    echo "usage: $0 tree|base|check" >&2
    exit 1
    ;;
esac
