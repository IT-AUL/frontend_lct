#!/usr/bin/env bash
# TaskCompleted gate: задача не закрывается, пока lint/typecheck/test фронта не зелёные.
# Нет package.json — фронта ещё нет, пропускаем. Exit 2 = блок, stderr уходит модели.
set -uo pipefail
cd "${CLAUDE_PROJECT_DIR:-$(pwd)}" || exit 0
[ -f package.json ] || exit 0
[ -d node_modules ] || { echo "quality gate: node_modules нет — выполни npm ci" >&2; exit 2; }

has_script() { node -e "process.exit(require('./package.json').scripts?.['$1'] ? 0 : 1)"; }

failed=""
for s in lint typecheck test; do
  has_script "$s" || continue
  if [ "$s" = test ]; then out=$(CI=1 npm run -s test -- --run 2>&1); else out=$(npm run -s "$s" 2>&1); fi
  if [ $? -ne 0 ]; then failed="$failed $s"; echo "── npm run $s FAILED ──" >&2; echo "$out" | tail -40 >&2; fi
done

if [ -n "$failed" ]; then
  echo "quality gate: не прошли:$failed — исправь перед завершением задачи" >&2
  exit 2
fi
exit 0
