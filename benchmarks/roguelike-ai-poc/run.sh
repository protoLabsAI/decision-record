#!/usr/bin/env bash
# Run the roguelike-ai-poc benchmark prompt against a fresh tmp dir.
# Requires OPENAI_API_KEY in the environment.
# Usage:
#   ./run.sh                            # run with defaults
#   OUT=./my-output ./run.sh            # specify output dir
#   MODEL=gpt-4o-mini ./run.sh          # override model

set -euo pipefail

if [[ -z "${OPENAI_API_KEY:-}" ]]; then
  echo "OPENAI_API_KEY not set — refusing to run." >&2
  exit 2
fi

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$HERE/../.." && pwd)"
OUT="${OUT:-$(mktemp -d -t dr-bench-roguelike-XXXX)}"

DESCRIPTION="A minimal roguelike where the player primes an AI agent with a strategy, then the agent autonomously navigates a single ASCII-rendered room over a tick system until it wins the objective or dies. Goal: prove the agent-as-player concept with the smallest viable surface area."

cd "$REPO_ROOT/server"
[[ -f dist/cli.js ]] || npm run build >&2

node dist/cli.js \
  --title "AI-driven roguelike POC" \
  --description "$DESCRIPTION" \
  --effort poc \
  --cwd "$OUT" \
  --yes \
  ${MODEL:+--model "$MODEL"}

echo ""
echo "── Benchmark artifacts at: $OUT"
echo "Compare with: $HERE/reference/"
