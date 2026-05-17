# MCP tools

The MCP server exposes the planning pipeline as a set of tools an agent can call. The CLI uses the same registry in-process; nothing is CLI-only.

Every tool accepts `cwd?: string` (the target project directory; defaults to the server's `process.cwd()`).

## Pipeline tools

### `dr_init`

Initialize the pipeline in a target repo. Creates `.dr/` and `dr/` layout, writes `state.json` and `project.json`. Fails if already initialized.

| Input | Type | Notes |
|---|---|---|
| `title` | string | Project title. |
| `description` | string? | Intake description. |
| `effort_level` | `"poc" \| "mvp" \| "full"` | Default `mvp`. |
| `gate_overrides` | object? | Per-knob preset overrides. See [Gates reference](gates.md). |
| `tags` | string[] | Free-form. |
| `project_id` | string? | Override the derived slug. |

Returns: `{ project_id, paths, project, state, next_phase }`.

### `dr_status`

Read pipeline status. Returns project metadata, current phase, gate evaluation against the next phase (what's blocking advance), counts, pending questions, effective gate config.

### `dr_advance`

Advance to the next pipeline phase if the gate passes. Records a sign-off and emits `phase_advanced`. If the gate fails, returns reasons without changing phase.

| Input | Type | Notes |
|---|---|---|
| `sign_off_by` | `"agent" \| "human"`? | Required when the next phase has human sign-off requirement. |
| `sign_off_actor` | string? | Identifier of the signing actor. |
| `sign_off_notes` | string? | Free-form notes attached to the sign-off. |

### `dr_update_project`

Patch project metadata: `title`, `description`, `tags`, and `gate_overrides`. Cannot change the `effort_level` preset (re-init for that).

### `dr_update_scope`

Replace any/all of `in_scope`, `out_of_scope`, `success_criteria`, `nice_to_have`. Each list is fully replaced when provided; omitted lists are unchanged.

## Decision tools

### `dr_propose_decision`

Create a new decision record (`status: "proposed"`).

| Input | Type | Notes |
|---|---|---|
| `title` | string | Short imperative, max 80 chars. |
| `template_variant` | `"canonical" \| "lightweight" \| "scoping" \| "vendor" \| "architecture" \| "data-model"` | Default `canonical`. |
| `summary`, `issue`, `assumptions`, `constraints`, `positions`, `depends_on`, `tags`, `seed_origin`, `slug` | various | Optional initial content. |

### `dr_update_decision`

Patch any field. Pass only the fields you want to change. `add_opinion` appends a single opinion entry.

### `dr_review_decision`

Record an antagonistic-review pass.

| Input | Type | Notes |
|---|---|---|
| `id` | string | Decision id. |
| `reviewer` | string | e.g., `"dr-skeptic"`. |
| `lens` | `"operational" \| "strategic" \| "security" \| "cost" \| "user-impact"` | The review lens. |
| `verdict` | `"pass" \| "block"` | |
| `score` | number (1–5) | Optional. |
| `concerns` | string[] | Crisp one-line concerns. |

### `dr_accept_decision`

Move a decision to `accepted` and record sign-off. Requires `selected_position` and `argument` set. Requires a passing review if `review_required_per_decision` is true. Rejects if any blocking deps are unmet.

### `dr_reject_decision`

Move a decision to `rejected` with a reason and sign-off.

### `dr_list_decisions`

Filter by `status[]` and/or `template_variant[]`. Returns summaries.

### `dr_get_decision`

Fetch the full content of a decision by id.

### `dr_ready_decisions`

Return decisions whose `depends_on` are all `accepted` (or which have no deps). Used by the agent to pick the next DR to work on.

## Task tools

### `dr_propose_task`

Create a new task node. Status defaults to `ready` if no deps, `open` otherwise.

| Input | Type | Notes |
|---|---|---|
| `title`, `description` | string | |
| `depends_on` | string[] | Task IDs. |
| `decision_refs` | string[] | Decision IDs the task implements. |
| `estimate` | `{ unit: "hours" \| "days", value, confidence? }` | |
| `acceptance_criteria` | string[] | |
| `priority` | `"p0" \| "p1" \| "p2" \| "p3"` | Default `p2`. |
| `labels` | string[] | |
| `assignee_hint` | `"agent" \| "human" \| "either"` | |

### `dr_update_task`

Patch fields. Use `dr_set_task_status` to change lifecycle state.

### `dr_set_task_status`

Change status: `open`, `ready`, `in_progress`, `done`, `blocked`, `deferred`.

### `dr_list_tasks`, `dr_get_task`

Filter / fetch.

### `dr_ready_tasks`

Tasks whose deps are all `done` (or no deps), sorted by priority. The beads-style "what's next" query.

### `dr_validate_graph`

Validate the full task graph: no cycles, no orphan dependencies, all estimates ≤ `max_task_estimate_hours`, all `decision_refs` resolve. Emits `graph_validated`. Returns `{ valid, errors[], warnings[], cycles[], orphans[], oversized[], missing_decision_refs[] }`.

## Seed library tools

### `dr_seed_search`

Keyword search over the bundled seed library.

| Input | Type | Notes |
|---|---|---|
| `query` | string | Matches on name, title, keywords, tags. |
| `limit` | integer | Default 5. |

### `dr_seed_list`

List every seed.

### `dr_seed_get`

Fetch one seed's full content (including `notes_for_agent`).

### `dr_seed_load`

Instantiate a seed as a `proposed` DR. Pre-fills positions, assumptions, constraints, implications.

| Input | Type | Notes |
|---|---|---|
| `seed_name` | string | E.g., `"language-choice"`. |
| `title_override` | string? | Project-specific title. |
| `slug_override` | string? | |
| `depends_on` | string[] | Decision IDs this DR depends on. |
| `tags` | string[] | |

## Outcome tools

Outcomes close the feedback loop between an accepted decision and what actually happened in practice. They live alongside decisions (never nested inside) so decisions remain immutable after sign-off.

### `dr_record_outcome`

Record an observed outcome for an accepted decision. Requires the project to be in `handed-off` status — pre-handoff outcomes are nonsensical.

| Input | Type | Notes |
|---|---|---|
| `decision_id` | string | Must point at an `accepted` decision. |
| `observation` | string | Free-form prose of what was observed. |
| `status` | `"pending" \| "validated" \| "invalidated" \| "inconclusive"` | Default `pending`. |
| `metric` | string? | Optional structured metric, e.g., `"p99 latency 290ms"`. |
| `evidence` | string[] | URLs, file refs, dashboards. |
| `tags` | string[] | |
| `slug` | string? | Defaults to a slug derived from the observation. |
| `recorded_by` | `"agent" \| "human"` | Default `human`. |
| `recorded_actor` | string? | |

Returns: `{ outcome }`. Emits `outcome_recorded` and bumps `state.next_outcome_seq`.

### `dr_set_outcome_status`

Transition an outcome's status (e.g., `pending` → `validated`). Emits `outcome_status_changed` unless the status is unchanged (in which case the call is a no-op and returns `{ unchanged: true }`).

### `dr_update_outcome`

Patch `observation`, `metric`, `evidence`, `tags`. Use `dr_set_outcome_status` for status transitions.

### `dr_list_outcomes`

Filter by `decision_id` and/or `status[]`. Returns summaries.

### `dr_get_outcome`

Fetch the full outcome by id.

## Search tools

Semantic search over decisions powered by an embeddings cache. Falls back to substring match when embeddings are unavailable so the tool always returns something.

### `dr_search_decisions`

Find prior decisions similar to a free-form topic. Used by the deciding agent for **read-before-write** retrieval — before proposing a new DR, ask whether something similar already exists.

| Input | Type | Notes |
|---|---|---|
| `query` | string | Free-form text describing the topic. |
| `limit` | integer | Default 5, max 50. |
| `min_score` | number | Default 0.5. Only applied to semantic results. |
| `status` | array of decision statuses | Default `["accepted"]`. |

Returns one of:

- `{ mode: "semantic", model, results: [{ id, title, status, summary, selected_position, score }], warnings }`
- `{ mode: "substring", results: [...], warnings }` — when embeddings are disabled, the cache is empty, or the cache model doesn't match the current `OPENAI_EMBEDDING_MODEL`.
- `{ mode: "empty", results: [], warnings }` — when no decisions match the status filter.

### `dr_reindex_embeddings`

Re-embed every accepted decision. Useful after switching `OPENAI_EMBEDDING_MODEL`, after a manual cache wipe, or to backfill decisions that were accepted before embeddings were enabled.

| Input | Type | Notes |
|---|---|---|
| `force` | boolean | Default `false`. When `true`, wipes the cache first to force a full re-embed. |

Returns counts: `{ accepted_total, indexed, skipped, failed, failures, model }`. Fails fast when `OPENAI_EMBEDDING_MODEL=none`.

> **Env var.** `OPENAI_EMBEDDING_MODEL` selects the embedding model (default `text-embedding-3-small`). Set it to `"none"` to disable embeddings entirely — search will use substring fallback only, and `dr_accept_decision` will skip indexing.

## Render

### `dr_render`

Regenerate Markdown + `index.html` from JSON. Idempotent. Includes outcomes when present.

## Handoff

### `dr_export_filesystem`

Finalize the project to filesystem only. Records handoff metadata, transitions to `handed-off`, prevents further phase changes. Requires the project to be in `handing-off` phase.

### `dr_export_linear`

Push to Linear via the GraphQL API. Creates a Project, Issues per decision (labeled `decision`) and per task, with `blocks` relations matching `depends_on`. Supports `dry_run: true` to preview without calling Linear.

| Input | Type | Notes |
|---|---|---|
| `team_id` | string | Linear team UUID. |
| `api_key` | string? | Defaults to `$LINEAR_API_KEY`. |
| `dry_run` | boolean | Default `false`. |
| `sign_off_by`, `sign_off_actor`, `sign_off_notes` | various | Sign-off metadata. |

## Where the schemas live

Every tool's input is validated by Zod at the server. JSON Schema mirrors for external consumers live in [`../../schemas/`](../../schemas/). The Zod source of truth is at [`server/src/schemas/index.ts`](../../server/src/schemas/index.ts).
