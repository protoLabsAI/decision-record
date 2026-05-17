# Design rationale

The decisions behind how this system is built. Use these when you want to understand "why this way and not the obvious other way."

## Hard gates instead of soft suggestions

Soft gates degrade. People learn to skip them, the optional becomes invisible, and within a few iterations the artifact stops being trustworthy. We made every phase transition refusal-by-default: if a gate fails, the wizard returns reasons, does not advance, and there is no `--force`. The artifact's value is the assurance that everything it claims is real.

Consequence: when a gate is too strict, you change the gate, not bypass it. The `gate_config.overrides` mechanism is the official escape hatch — explicit and recorded.

## Five phases, exactly

Intake → Scoping → Deciding → Decomposing → Handoff is the smallest sequence that gives each artifact a clean home and makes ordering load-bearing:

- **Intake** captures the seed.
- **Scoping** sets the perimeter before decisions are made (so decisions can be evaluated against scope).
- **Deciding** resolves significant choices before tasks are written (so tasks can reference decisions for traceability).
- **Decomposing** turns decisions into work (so the work shape follows from the choices).
- **Handoff** finalizes (so the artifact has a clear "done" state).

We tried collapsing decisions and decomposition. The decomposer ended up making decisions in passing — implicit, unreviewed, untraceable. Splitting the phases forced decisions to be first-class.

## File-system, not a database

Beads_rust uses SQLite + JSONL. We went filesystem-only:

- The working set is small (tens of decisions, dozens of tasks).
- JSON files diff well in git; engineers can read them without tooling.
- A future UI can read the same files; no schema migration tax.
- The JSONL event log gives us the audit trail without the DB dependency.

The trade-off: queries are O(N) directory scans. Acceptable at our scale. If we ever need cross-project indexing or multi-user concurrency, we revisit.

## TypeScript everywhere

Single language across the MCP server, CLI, and tests. Best fit for the Claude Code plugin ecosystem. The `openai` SDK is mature in TypeScript. Iterating on prompts and templates is fast. We considered Rust to match beads_rust's philosophy — rejected because we iterate on prompts more than perf, and a 100KB CLI bundle is fine.

## OpenAI-compatible, single provider

We initially planned dual backends (Anthropic SDK + openai SDK). Cut to OpenAI-compat only because:

- A single SDK is half the surface area to maintain.
- `OPENAI_BASE_URL` already covers Anthropic-via-OpenRouter, local Ollama/vLLM, LiteLLM proxies, and most enterprise gateways.
- The agents do straightforward tool calling; nothing requires a vendor-specific SDK feature.

If we ever need Anthropic-native features (cache_control, adaptive thinking), we add a thin adapter — but we don't anticipate it.

## Antagonistic review with lens rotation

We use a `dr-skeptic` sub-agent that reviews decisions through one specific lens (operational, strategic, security, cost, user-impact) per invocation. For the `full` preset, every decision runs through all five lenses.

Inspired by Automaker's two-reviewer pattern (Ava operational + Jon strategic), but generalized: the lens menu is open-ended, and each lens is its own scoped prompt instead of a single reviewer trying to hold all perspectives at once. A focused agent finds more concrete concerns than a broad one.

The skeptic doesn't have to win. A human can override `block` verdicts with explicit sign-off. But the lens output is recorded on the DR forever — visible to anyone who reads it later.

## State-driven, not form-driven

The wizard's job is to read the current state, identify what's missing for the next gate, and pick the next action. It is not a fixed Q&A sequence. This matches Automaker's resume-check pattern — drop in mid-pipeline, the wizard recovers gracefully.

Practical consequence: every wizard invocation starts with `dr_status`. There's no implicit conversation state in the agent loop; everything is on disk.

## Pre-MVP only, deliberately

The pipeline stops at `handed-off`. We don't track post-handoff execution. That belongs in whatever execution system the team uses — Linear, Plane, GitHub Projects, etc.

Why: planning tools that grow into execution tools accumulate scope until they're nothing in particular. By stopping at handoff, the boundary is clear: the plan is the artifact; execution is somebody else's tool.

## Per-project gate calibration

A weekend hack does not need the same gates as a regulated production rollout. Three presets (`poc`, `mvp`, `full`) calibrate strictness; per-knob overrides handle the edge cases. Picked at init.

This was the user feedback that shaped the gate machine: the same hard-gate philosophy can apply to wildly different project shapes, as long as the strictness scales.

## Seed library

A small set (currently nine) of canned decisions for territory the agent will repeatedly see: language, runtime, data store, auth, deployment, CI/CD, testing, observability, scope-statement. Each is a starter — the agent loads it and customizes for the project.

Why ship these: avoids the agent rediscovering the same trade-offs each project. The seed encodes prior pattern-matching as a starting point, not a final answer. The user can fork the seed library and add their team's defaults.

## Linear as the primary handoff target

The user's primary use case is Linear; the data model maps cleanly. We use Linear's GraphQL API directly with an API key, not their MCP server, because:

- We need precise control over the project/issue/relation creation sequence.
- The GraphQL API is mature and well-documented.
- Adding MCP-server-as-downstream adds an extra dependency layer for a one-shot operation.

Other handoff targets follow the `server/src/handoff/linear.ts` pattern: `buildExportPlan` (pure, testable) + per-target API calls.

## What we explicitly didn't build

- **A web UI** — the data model is UI-ready (JSON-everywhere, JSONL event log) but we ship Markdown + static HTML for now. UI work would dwarf the pipeline work.
- **Real-time multi-user collaboration** — single-user, single-machine. The artifact is git-tracked; that's how teams share.
- **A built-in LLM** — we depend on OpenAI-compat endpoints. No model bundling.
- **Reconciliation for partial Linear exports** — a known follow-up. For now, a failed export means deleting the partial Linear project and re-running.
- **A CI integration** — beyond the test suite. The plugin produces artifacts; what teams do with them in CI is up to the team.

## Open questions

- Does the lens-rotating skeptic produce meaningfully better decisions than a single skeptic? Needs benchmark data over time.
- Is the nine-seed library the right size? Probably grows.
- Should `handed-off` have a "re-open for amendment" path? Currently it's a terminal state.

We track these by re-running benchmarks as the system changes.
