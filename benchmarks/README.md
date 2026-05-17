# Benchmarks

Canonical prompts we run against the decision-record planning pipeline to catch regressions as the system evolves.

| Benchmark | Prompt | Effort | Purpose |
|---|---|---|---|
| [roguelike-ai-poc](roguelike-ai-poc/) | AI-driven roguelike where the agent plays the game | `poc` | Exercises all five pipeline phases on a small, well-bounded problem. The original dogfood case. |

## How to run a benchmark

```bash
cd benchmarks/<name>
./run.sh
```

Each benchmark has:

- `prompt.md` — the exact idea, effort level, and what "good output" looks like
- `reference/` — a baseline artifact snapshot from a canonical run
- `run.sh` — one-shot runner that fires the CLI against a fresh tmp dir

## What we look for when comparing runs

Each benchmark's `prompt.md` defines its own success criteria. Generally:

- Pipeline reaches `handed-off`
- Decision count and shape match expectations for the effort tier
- Tasks are vertical slices, every leaf has a decision ref, graph validates
- Render artifacts are emitted (Markdown + HTML)
- Event log is coherent

These benchmarks are **not unit tests** — they're regression observability. Different runs will produce slightly different plans and that's by design. Treat the reference as "shape we expect," not "bytes we require."
