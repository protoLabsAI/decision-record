# Benchmarks

Canonical prompts we run against the decision-record planning pipeline to catch regressions as the system evolves.

_(No public benchmarks committed yet. Add new ones as `benchmarks/<name>/` with a `prompt.md`, a `reference/` artifact snapshot, and a `run.sh` runner. See the structure described below.)_

## Benchmark layout

Each benchmark lives in its own directory:

```
benchmarks/<name>/
├── prompt.md      # the exact idea, effort level, and what "good output" looks like
├── reference/     # a baseline artifact snapshot from a canonical run
└── run.sh         # one-shot runner that fires the CLI against a fresh tmp dir
```

## How to run

```bash
cd benchmarks/<name>
./run.sh
```

## What we look for when comparing runs

Each benchmark's `prompt.md` defines its own success criteria. Generally:

- Pipeline reaches `handed-off`
- Decision count and shape match expectations for the effort tier
- Tasks are vertical slices, every leaf has a decision ref, graph validates
- Render artifacts are emitted (Markdown + HTML)
- Event log is coherent

These benchmarks are **not unit tests** — they're regression observability. Different runs will produce slightly different plans and that's by design. Treat the reference as "shape we expect," not "bytes we require."
