# Symphony alignment — extending decision-record into a project management app

This document explains where our system sits in the broader [Symphony](https://github.com/openai/symphony) ecosystem and the staged plan for extending decision-record into a full project management app aligned with OpenAI's research.

## What Symphony is, and why it matters for us

Symphony is OpenAI's open-source orchestration spec, released April 2026. Its core thesis: stop *supervising* coding agents, start *managing the work*. Every open issue gets a dedicated coding-agent session in an isolated workspace; agents run continuously; humans review the results.

The spec is language-neutral and ships in a single [SPEC.md](https://github.com/openai/symphony/blob/main/SPEC.md). The Elixir implementation is a reference. OpenAI's internal data shows 500% PR throughput increases on teams running Symphony with disciplined `WORKFLOW.md`.

The pieces:

- A long-running daemon polls the issue tracker (Linear today) on a fixed cadence.
- For each eligible issue, it creates a per-issue workspace and launches a Codex coding-agent inside.
- A repo-owned `WORKFLOW.md` defines the runtime contract: tracker config, workspace setup hooks, agent settings, and the prompt template.
- Reconciliation continuously kills runs whose tracker state goes terminal, and retries failures with exponential backoff.
- Optional HTTP server exposes `/api/v1/state` for dashboards.

Crucially, **Symphony is a scheduler/runner**. It does not produce the work, define the work, or evaluate the work. Those are the layers above and below it.

## The complementarity

| Layer | Owner | What it does |
|---|---|---|
| **Planning** | decision-record | Idea → scope → decisions → tasks → handoff |
| **Tracking** | Linear (or future filesystem tracker) | Holds the queue of issues |
| **Execution** | Symphony + Codex | Picks issues off the tracker, runs agents to land PRs |
| **Outcomes** | decision-record | Post-handoff observations linked back to decisions |

We're a great planning + outcomes layer. Symphony is a great execution layer. The tracker is the wire between them. When the wire is Linear, it's exactly what Symphony already supports.

## Three slices of alignment

We've sketched the alignment as three slices, sequenced by leverage and amount of work.

### Slice 1 — Symphony handoff target (✅ shipped)

Add `dr_export_symphony` that emits a Symphony-spec-compliant `WORKFLOW.md`. Optionally push tasks to Linear first so the WORKFLOW.md targets the resulting Linear project.

What this delivers:
- A clean single-tool handoff from planning to execution.
- The prompt template embeds our standing decisions and points the agent at `dr/decisions/` for full context.
- The handoff record captures `workflow_path` so downstream tooling can find it.

What this does NOT solve:
- Operators still need to run Symphony separately.
- We have no view into what Symphony is doing once it's running.

See: [Handoff to Symphony](../how-to/handoff-to-symphony.md), the `renderSymphonyWorkflow` module, and the [Symphony spec §5.3](https://github.com/openai/symphony/blob/main/SPEC.md#53-front-matter-schema).

### Slice 2 — Filesystem tracker extension (planned)

The Symphony spec [§18.2](https://github.com/openai/symphony/blob/main/SPEC.md#182-recommended-extensions-not-required-for-conformance) lists "Add pluggable issue tracker adapters beyond Linear" as a TODO. Our `dr/tasks/<id>.json` directory is already a perfectly good issue store — it has IDs, states, dependencies, labels, descriptions, and stable URLs (via the rendered .md).

The plan:
- Define `tracker.kind: filesystem` as an extension to the Symphony front-matter schema.
- Spec the candidate-fetch / state-refresh / terminal-fetch operations against `dr/tasks/*.json`.
- Map task `status` to Symphony's `active_states` / `terminal_states` model (e.g., `open|ready|in_progress` are active; `done|deferred` are terminal).
- Map task `depends_on` to Symphony's `blocked_by` so the dispatch blocker rule (§8.2) prevents work from running ahead of unmet dependencies.
- Implement a small reference adapter in our codebase that can be linked into Symphony either as a plugin (if Symphony's adapter API allows) or as a subprocess Symphony shells out to.
- Open a discussion/PR upstream on `openai/symphony` proposing the filesystem tracker as a conformant extension.

What this delivers:
- No Linear needed. Our `dr/tasks/` is the tracker. Pure local dev loop.
- Faster cycle time — no GraphQL roundtrips.
- Decisions and tasks live next to the work the agent is doing.

Cost:
- Need to define the tracker adapter API or wrap our own polling around the spec.
- Need to handle status writes — when an agent moves an issue from `ready` to `done`, our task file must be updated. This is a new responsibility for the agent or the adapter.
- May require upstream changes to Symphony or a fork.

### Slice 3 — Status surface (planned)

Symphony exposes `GET /api/v1/state` (running, retrying, token totals, rate limits) and `GET /api/v1/<issue_identifier>` (per-issue details) per [§13.7](https://github.com/openai/symphony/blob/main/SPEC.md#137-optional-http-server-extension). Our `dr/index.html` is the natural place to surface this data alongside decisions, tasks, and outcomes.

The plan:
- Add a `dr_symphony_status` tool that hits `http://localhost:<port>/api/v1/state` and returns the parsed snapshot.
- Cache the snapshot in `.dr/cache/symphony-status.json` (gitignored, regeneratable).
- Extend `dr_render` to embed live status data in `dr/index.html`: per-task running/retrying state, token spend, last event, last error.
- Render task rows with a Symphony status pill (running | retrying | done | blocked).
- Plumb agent's PR link back to the task — likely via Symphony's per-issue API once the agent opens the PR.

What this delivers:
- Our HTML index becomes a single project management view: planning + execution + outcomes.
- Operators don't need to flip between Symphony's dashboard and ours.
- Outcomes can be recorded with direct reference to the agent's session id, PR, and metric.

Cost:
- HTTP polling adds operational complexity.
- We become coupled to Symphony's optional HTTP extension (it's not REQUIRED for conformance per §13.7).

## What about the planning-side feedback loop?

A real project management app closes both ends: planning informs execution, *and* execution informs replanning. Our outcome-tracking work (already shipped) is the first half — outcomes record whether decisions held up.

The second half — agent-authored AgDR (Agent Decision Records) — is on our backlog from the [research-notes](research-notes.md) doc. The shape: when an agent makes a non-trivial implementation decision (which test framework to add, how to structure a new module), it can record an AgDR linked back to the parent task. The AgDR is read by the next agent picking up dependent work. This is the operationalized version of the [AgenticAKM](https://arxiv.org/abs/2602.04445) paper's vision.

Symphony's per-session log/event stream is the natural hook: when the agent emits a structured `agent_decision` event, we ingest it and write an AgDR. Slice 3's status surface gives us the wire.

## Where this stops short

Even with all three slices, this isn't a "full project management app" by every definition. It doesn't replace:

- **Sprint planning / roadmapping** — multi-project capacity tracking, OKR alignment, milestone planning.
- **Time tracking / billing** — not our problem.
- **PM-side observability** — Slack notifications, dashboards your VP wants, etc.
- **Multi-tenant control plane** — Symphony itself is explicitly not multi-tenant per [§2.2](https://github.com/openai/symphony/blob/main/SPEC.md#22-non-goals).

We're aiming for the **agentic-engineering** slice of project management: planning + execution + outcomes for teams running coding agents on real work. That's a defensible slice; we'll resist drifting into the rest until there's a specific need.

## References

- [openai/symphony](https://github.com/openai/symphony) — canonical repo and SPEC.md
- [OpenAI announcement](https://openai.com/index/open-source-codex-orchestration-symphony/) — Apr 2026 release
- [Research notes](research-notes.md) — broader DR/ADR ecosystem context, AgDR roadmap, agentic AKM literature
- [Handoff to Symphony](../how-to/handoff-to-symphony.md) — slice 1 usage
