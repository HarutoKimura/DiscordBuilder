#!/usr/bin/env bash
# Remove ONE project completely: container, named volumes, registry entry,
# project files, and any thread bindings pointing at it.
# Usage: ./scripts/reset-project.sh <projectId>
set -euo pipefail

if [ $# -ne 1 ]; then
  echo "usage: $0 <projectId>" >&2
  exit 1
fi

PROJECT_ID="$1"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONTAINER="dbuilder-${PROJECT_ID}"

case "$PROJECT_ID" in
  *[!a-z0-9-]*|'')
    echo "invalid project id (lowercase letters, digits, hyphens): ${PROJECT_ID}" >&2
    exit 1
    ;;
esac

echo "→ removing container ${CONTAINER} (if any)"
docker rm -f "$CONTAINER" >/dev/null 2>&1 || true

echo "→ removing volumes"
docker volume rm "dbuilder-nm-${PROJECT_ID}" "dbuilder-next-${PROJECT_ID}" >/dev/null 2>&1 || true

echo "→ removing var/projects/${PROJECT_ID}"
rm -rf "${REPO_ROOT}/var/projects/${PROJECT_ID}"

echo "→ cleaning registry and thread bindings"
node -e '
  const { readFileSync, writeFileSync, existsSync } = require("node:fs");
  const [repoRoot, projectId] = process.argv.slice(1);

  const registryPath = `${repoRoot}/var/projects/registry.json`;
  if (existsSync(registryPath)) {
    const registry = JSON.parse(readFileSync(registryPath, "utf8"));
    if (registry.projects && registry.projects[projectId]) {
      delete registry.projects[projectId];
      writeFileSync(registryPath, JSON.stringify(registry, null, 2) + "\n");
      console.log("  registry entry removed");
    }
  }

  const threadsPath = `${repoRoot}/var/bot/threads.json`;
  if (existsSync(threadsPath)) {
    const threads = JSON.parse(readFileSync(threadsPath, "utf8"));
    let removed = 0;
    for (const [threadId, binding] of Object.entries(threads)) {
      if (binding && binding.projectId === projectId) {
        delete threads[threadId];
        removed++;
      }
    }
    if (removed > 0) {
      writeFileSync(threadsPath, JSON.stringify(threads, null, 2) + "\n");
      console.log(`  ${removed} thread binding(s) removed`);
    }
  }
' "$REPO_ROOT" "$PROJECT_ID"

echo "✓ ${PROJECT_ID} reset (delete the Discord thread manually)"
