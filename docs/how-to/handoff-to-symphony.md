# Hand off to Symphony

[Symphony](https://github.com/openai/symphony) is OpenAI's open-source orchestrator that turns project work into autonomous coding-agent runs. It polls an issue tracker (Linear today), creates isolated per-issue workspaces, and runs a Codex coding-agent inside each one. It's designed to let teams **manage work** instead of supervising coding agents.

Our planning pipeline ends where Symphony begins. `dr_export_symphony` emits a Symphony-spec-compliant `WORKFLOW.md` for the target repo, optionally pushing tasks to Linear first so Symphony has issues to dispatch.

## What gets emitted

A single `WORKFLOW.md` at the repo root containing:

- **YAML front matter** with `tracker`, `polling`, `workspace`, `hooks` (optional), `agent`, and `codex` blocks per [Symphony spec §5.3](https://github.com/openai/symphony/blob/main/SPEC.md).
- **Prompt template** (Liquid syntax) that:
  - States project context (title, effort level, accepted-decision count, scope)
  - Lists all standing accepted decisions with their selected positions
  - Per-issue instructions that tell the coding agent to (1) resolve the Symphony issue to the underlying `dr/tasks/` task, (2) load the `decision_refs` from `dr/decisions/`, (3) honor `depends_on`, (4) implement the task, (5) satisfy `acceptance_criteria`, (6) test, (7) open a PR and move the tracker issue to review
  - Explicit guard rails: **do not modify `dr/decisions/` or `dr/outcomes/`**, do not mark issues `done` if work is partial, do not leave the workspace

## When to use it

You're handing off when:
- All your scoping, decisions, and tasks are accepted and the project is in `handing-off` phase.
- The execution team wants to use Symphony — they prefer "manage work" to "supervise agents."

You're **not** using Symphony when:
- The execution team is humans only and you just want Linear or filesystem tracking.
- The work isn't suitable for autonomous coding agents (high-judgment, multi-system, or needs significant human design).

## Three ways to invoke

### Through the CLI

When `LINEAR_API_KEY` is set, the CLI offers Symphony as the first option in the handoff phase:

```
> LINEAR_API_KEY detected. Hand off to Symphony (push to Linear + emit WORKFLOW.md for the Codex orchestrator)? [Y/n]
```

Accept and supply the team ID, and the CLI will (a) push your tasks to Linear, (b) write `WORKFLOW.md` to the project's working directory, (c) finalize the project as `handed-off` with `target: symphony`.

### Through the MCP tool

```jsonc
// Tool: dr_export_symphony
{
  "workflow_path": "WORKFLOW.md",          // optional; defaults to <cwd>/WORKFLOW.md
  "linear_team_id": "team-uuid",           // optional; if present, push to Linear first
  "linear_api_key": "...",                 // optional; defaults to $LINEAR_API_KEY
  "tracker_project_slug": "explicit-slug", // optional; falls back to Linear slug, then "CHANGEME"
  "polling_interval_ms": 30000,
  "workspace_root": "./.symphony-workspaces",
  "after_create_hook": "git clone ...\nnpm install",
  "max_concurrent_agents": 5,
  "max_turns": 20,
  "codex_command": "codex app-server"
}
```

Returns `{ target: "symphony", workflow_path, tracker_project_slug, linear, decisions, tasks, project }`.

The project must be in `handing-off` phase — call `dr_advance` first if needed.

### Standalone WORKFLOW.md without Linear

If you don't have `LINEAR_API_KEY` or want to wire a non-Linear tracker by hand later, call the tool with no `linear_team_id`. You'll get a `WORKFLOW.md` with `project_slug: CHANGEME` — edit it before running Symphony.

## After emission — wiring up Symphony

The Symphony service is a separate process. Follow the [Symphony README](https://github.com/openai/symphony) to install it (use the experimental Elixir reference impl, or ask a coding agent to build one in your preferred language from the SPEC). Then, in the repo where `WORKFLOW.md` lives:

```bash
export LINEAR_API_KEY=...           # the canonical env var for tracker auth
symphony WORKFLOW.md                # or however the impl is invoked
```

Symphony will:
1. Watch `WORKFLOW.md` for live changes (`§6.2 Dynamic Reload`).
2. Poll Linear every `polling.interval_ms` for issues in `active_states`.
3. For each eligible issue: create a workspace under `workspace.root`, run the `after_create` hook if first-time, run `before_run` hook, launch Codex with the rendered prompt template.
4. Stream agent updates; track tokens, turn count, rate limits.
5. On stall or terminal state, kill the worker. On clean exit, schedule a continuation tick.
6. Honor exponential-backoff retries on failure.

## What our handoff record captures

After a Symphony export, `project.handoff` looks like:

```jsonc
{
  "target": "symphony",
  "target_id": "linear-project-uuid-or-slug-or-CHANGEME",
  "target_url": "https://linear.app/.../project/...",  // when Linear was pushed
  "exported_at": "2026-05-17T...",
  "issue_count": 7,
  "document_count": 5,
  "workflow_path": "/abs/path/to/WORKFLOW.md"
}
```

`workflow_path` is new for Symphony handoffs — it tells you and any later tooling where the live WORKFLOW.md sits.

## Editing WORKFLOW.md after handoff

Symphony reloads `WORKFLOW.md` on filesystem change. Common edits:

- **Tighten the prompt** if agents are wandering or skipping acceptance criteria.
- **Add a `before_run` hook** to install deps or sync state before each turn.
- **Tune `agent.max_concurrent_agents`** for parallelism limits.
- **Change `active_states`** if your tracker uses non-default state names.
- **Add a `linear_graphql` tool advertisement** for richer in-session Linear access (extension).

Treat WORKFLOW.md as a version-controlled, repo-owned policy file. Edits are normal commits.

## What Symphony does NOT do

Per [§2.2 Non-Goals](https://github.com/openai/symphony/blob/main/SPEC.md#22-non-goals):

- It doesn't manage your tracker (no first-class write APIs in the orchestrator — agents do the writes via tools).
- It doesn't prescribe a dashboard.
- It isn't a general workflow engine.
- It doesn't guarantee strong sandboxing — you must explicitly choose your trust posture.

For each of those: our system covers some via the planning surface (we set the contract and recorded the rationale), and the agent's tools cover the rest at runtime.

## Where to go next

- After agents start landing PRs, record `Outcomes` against the decisions those PRs validated or invalidated. See [Track outcomes](track-outcomes.md).
- For the broader roadmap of how this system extends into a full project management app aligned with Symphony, read [Symphony alignment plan](../explanation/symphony-alignment.md).
