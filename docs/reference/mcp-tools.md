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

## Render

### `dr_render`

Regenerate Markdown + `index.html` from JSON. Idempotent.

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
