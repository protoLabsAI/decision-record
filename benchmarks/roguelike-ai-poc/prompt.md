# Benchmark: roguelike-ai-poc

This is the canonical benchmark for the decision-record planning pipeline. We re-run it as the system evolves to spot regressions in plan quality, gate behavior, agent prompts, and rendering.

## The prompt

**Idea (free-form):**

> A minimal roguelike where the player primes an AI agent with a strategy, then the agent autonomously navigates a single ASCII-rendered room over a tick system until it wins the objective or dies. Goal: prove the agent-as-player concept with the smallest viable surface area.

**Effort level:** `poc`

## Invocation

```bash
decision-record \
  --title "AI-driven roguelike POC" \
  --description "$(cat <<'EOF'
A minimal roguelike where the player primes an AI agent with a strategy, then the agent autonomously navigates a single ASCII-rendered room over a tick system until it wins the objective or dies. Goal: prove the agent-as-player concept with the smallest viable surface area.
EOF
)" \
  --effort poc \
  --cwd ./tmp-roguelike-bench \
  --yes
```

Or the one-shot wrapper: `./run.sh` (creates a fresh tmp dir, runs the CLI, prints where the artifacts landed).

## What "good output" looks like

A run is healthy if the produced plan:

- **Pipeline reaches `handed-off`** — every gate passes, sign-offs recorded, project finalized.
- **3-5 significant decisions** are proposed and accepted — language, world representation, agent action contract, tick-loop control. (Not 1; not 12.)
- **5-8 vertical-slice tasks** — bootstrap → world → renderer → agent client → action handlers → game loop → CLI entry. Every leaf ≤ 16h (poc cap). Every task references at least one accepted DR.
- **The seed library is consulted** for at least the language decision (`dr_seed_search` + `dr_seed_load` on `language-choice`).
- **Graph validates clean** — no cycles, no orphan deps, no missing decision refs.
- **Artifacts emitted** — `dr/project.json`, `dr/decisions/*.json`, `dr/tasks/*.json`, rendered `.md` siblings, `dr/index.html`. `.dr/events.jsonl` contains a coherent audit trail.

## Reference snapshot

`./reference/` holds the artifacts from the canonical run produced by hand-driving the MCP tools (2026-05-16, the dogfood test that originally produced this benchmark). Treat it as a "this is what good looks like" baseline, not a strict equality target — different agent runs will pick slightly different positions, phrasing, and task decomposition, and that's fine.

When comparing a new run against `./reference/`:

- **Same final phase, gate decisions, event mix** → no regression.
- **More/fewer decisions or tasks** → check whether the new run is denser/sparser appropriately or whether the agent over- or under-decomposed.
- **Different selected positions** → fine if defensible; concerning if the argument is weaker.
- **Missing seed usage** → bug or prompt drift; the agent should reach for `language-choice` here.
- **Tasks without decision refs** → regression. Every task must link to a DR.
- **Validation failures** → regression. The graph must validate.

## What this benchmark exercises

| Surface | Coverage |
|---|---|
| Phase machine | All five transitions: intake → scoping → deciding → decomposing → handing-off → handed-off |
| Seed library | At least one `dr_seed_load` (language-choice) |
| Decision lifecycle | propose → update with position + argument → accept (no review under poc preset) |
| Task graph | Multi-node dependency chain with decision_refs |
| Gates | `min_tasks=3`, `max_task_estimate_hours=16`, `require_human_signoff_phases=['handing-off']` |
| Render | Markdown per record + static HTML index |
| Handoff | Filesystem path (Linear path is exercised by separate live test) |
