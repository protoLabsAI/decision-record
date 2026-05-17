# Gates reference

Every phase transition is checked by a set of gate conditions. The full evaluator lives at [`server/src/gateEval.ts`](../../server/src/gateEval.ts). This page documents what each gate checks and what each preset sets.

## Phase machine

```
intake ─→ scoping ─→ deciding ─→ decomposing ─→ handing-off ─→ handed-off
```

`dr_advance` is the only way to move forward. It evaluates the gate for the **next** phase against current state, and either transitions (and emits `phase_advanced`) or records a `phase_advance_blocked` event with reasons.

## What each gate checks

| Advancing to | Conditions |
|---|---|
| `scoping` | Project title non-empty; description non-empty. |
| `deciding` | `scope.in_scope` non-empty; `scope.success_criteria` non-empty; if `review_required_phases` includes `"scoping"`, a `scoping`-variant DR has a passing review. |
| `decomposing` | Number of decisions ≥ `min_decisions`; if `decisions_required_status === "accepted"`, no decisions in `proposed`/`rfc`; if `review_required_per_decision`, every accepted decision has a passing review; if `review_required_phases` includes `"deciding"`, at least one decision has a passing review; no decisions reference missing dependency IDs. |
| `handing-off` | Number of tasks ≥ `min_tasks`; no tasks reference missing dependency tasks; no cycles in the task dependency graph; every task has an estimate ≤ `max_task_estimate_hours` (days are normalized to hours at 8h/day); every task's `decision_refs` resolve. |
| `handed-off` | `project.handoff` is set (i.e., `dr_export_filesystem` or `dr_export_linear` has run). |

## Sign-off check (overlay)

If the next phase is in the project's `require_human_signoff_phases`, the gate also requires `dr_advance` to be called with `sign_off_by: "human"`. Without it, the gate fails with a clear "Sign-off gate" reason.

The orchestrator (CLI + dr-wizard) handles this automatically: it pauses at the relevant checkpoint, asks the user, then calls `dr_advance` with sign-off. Manual MCP callers must remember.

## Preset matrix

| Knob | `poc` | `mvp` | `full` |
|---|---|---|---|
| `decisions_required_status` | `accepted` | `accepted` | `accepted` |
| `review_required_phases` | `[]` | `["scoping", "decomposing"]` | `["scoping", "deciding", "decomposing"]` |
| `review_required_per_decision` | `false` | `false` | **`true`** |
| `max_task_estimate_hours` | `16` | `8` | `4` |
| `require_human_signoff_phases` | `["handing-off"]` | `["scoping", "decomposing", "handing-off"]` | `["scoping", "deciding", "decomposing", "handing-off"]` |
| `min_decisions` | `0` | `3` | `6` |
| `min_tasks` | `3` | `8` | `15` |

## Override knobs

Per-project overrides at `project.json → gate_config.overrides` take precedence per-key over the preset. Any of the seven keys above can be overridden; omitted keys inherit the preset.

```json
{
  "gate_config": {
    "preset": "mvp",
    "overrides": {
      "min_tasks": 5,
      "review_required_per_decision": true
    }
  }
}
```

The materialized result is at `state.effective_gate_config` — that's what the evaluator actually reads.

## Inspecting gate state

```bash
# Current evaluation against the next phase
node dist/index.js  # then call dr_status

# Or directly:
cat <cwd>/.dr/state.json | jq '.effective_gate_config'
cat <cwd>/dr/project.json | jq '.gate_config'
```

`dr_status` returns a `gate_to_next` block: `{ pass, reasons[], next_phase }`. Read the reasons — they name the specific failing knob and the specific shortfall.

## Why hard gates

The system refuses to advance when gates fail. There is no `--force` flag, no admin override.

The trade-off is intentional. Soft gates degrade — people learn to skip them, and the artifact stops being trustworthy. With hard gates, the rule is: if a plan exists and reached `handed-off`, every gate it crossed actually passed. The plan is real.

If a gate is too strict, change the gate (override the knob in `project.json`). Don't bypass it.
