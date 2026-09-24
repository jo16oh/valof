#!/usr/bin/env sh
# Bumps the version on a release branch cut from the latest main, and opens its PR.
set -eu

git diff --quiet HEAD -- || { echo 'tracked files differ from HEAD; commit them first'; exit 1; }

git switch main
git pull --ff-only

# bumpp only picks the version; the branch is named after it, so it is cut afterwards.
bumpp --no-commit --no-tag --no-push
version="$(node -p "require('./package.json').version")"

git switch -c "chore/release-$version"
git commit -am "chore: release v$version"
git push -u origin HEAD
gh pr create --fill --label skip-changelog
