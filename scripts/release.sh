#!/usr/bin/env bash
# Rebuild the storefront and refresh the `deploy` branch that Hostinger clones.
#
#   bash scripts/release.sh
#
# Hostinger's Git integration copies files but never runs a build, so the
# `deploy` branch has to carry the built site at its root. This script rebuilds
# it from whatever is committed on the current branch and force-pushes it.
# Afterwards, press Deploy in hPanel (or let the webhook fire).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLIENT_DIR="$REPO_ROOT/client/client"
WORKTREE="$(mktemp -d)/deploytree"
REMOTE="${REMOTE:-origin}"

cd "$REPO_ROOT"

if [ -n "$(git status --porcelain)" ]; then
  echo "Working tree is dirty. Commit or stash first so the deploy branch"
  echo "matches a real commit on this branch." >&2
  exit 1
fi

SOURCE_COMMIT="$(git rev-parse --short HEAD)"
echo "==> Building client from $SOURCE_COMMIT"
cd "$CLIENT_DIR"
npm run build

if [ ! -f dist/.htaccess ]; then
  echo "dist/.htaccess is missing. It must exist or deep links 404 on Apache." >&2
  exit 1
fi

echo "==> Assembling deploy branch"
cd "$REPO_ROOT"
git worktree add --detach "$WORKTREE" HEAD -q
trap 'git worktree remove --force "$WORKTREE" 2>/dev/null || true' EXIT

cd "$WORKTREE"
git checkout --orphan deploy -q
git rm -rq --cached .
rm -rf client server .gitignore scripts
cp -r "$CLIENT_DIR/dist/." .

# Nothing but the built site belongs here.
if git status --porcelain --untracked-files=all | grep -qE ' (src/|\.env)'; then
  echo "Refusing to publish: source or env files ended up in the build." >&2
  exit 1
fi

git add -A
git commit -q -m "Build output for Hostinger Git deploy (from $SOURCE_COMMIT)"
echo "==> Force-pushing $REMOTE/deploy"
git push --force -u "$REMOTE" deploy

echo
echo "Done. deploy branch now holds the build from $SOURCE_COMMIT."
echo "Trigger the pull in hPanel > Advanced > Git, then hard-reload the site."
