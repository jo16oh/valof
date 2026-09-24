#!/usr/bin/env sh
# Bumps the version on a release branch cut from the latest main, and opens its PR.
# Usage: bump-version [--body-file <path>] [bumpp options]. The file becomes the PR body.
set -eu

git diff --quiet HEAD -- || { echo 'tracked files differ from HEAD; commit them first'; exit 1; }

# Takes --body-file out of the arguments, and passes the rest to bumpp.
body_file=/dev/null
n=$#
while [ "$n" -gt 0 ]; do
  arg=$1
  shift
  n=$((n - 1))
  case $arg in
    --body-file)
      [ "$n" -gt 0 ] || { echo '--body-file needs a path'; exit 1; }
      body_file=$1
      shift
      n=$((n - 1))
      ;;
    *) set -- "$@" "$arg" ;;
  esac
done

# Read before anything changes, so a missing file stops the release here.
body="$(cat "$body_file")"

git switch main
git pull --ff-only

# bumpp only picks the version; the branch is named after it, so it is cut afterwards.
bumpp --no-commit --no-tag --no-push "$@"
version="$(node -p "require('./package.json').version")"

git switch -c "chore/release-$version"
git commit -am "chore: release v$version"
git push -u origin HEAD
gh pr create --fill --body "$body" --label skip-changelog
