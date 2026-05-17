# Calibrate gates

The pipeline is hard-gated — every phase transition checks a set of conditions, and refuses to advance if they're not met. The strictness of those conditions is set per-project by an **effort level** preset, with optional per-knob overrides.

## Choose a preset

```bash
decision-record --idea "…" --effort poc    # loosest
decision-record --idea "…" --effort mvp    # default
decision-record --idea "…" --effort full   # strictest
```

| Knob | `poc` | `mvp` (default) | `full` |
|---|---|---|---|
| Minimum decisions to advance from deciding | 0 | 3 | 6 |
| Minimum tasks to advance from decomposing | 3 | 8 | 15 |
| Max hours per leaf task | 16 | 8 | 4 |
| Phases that require reviewed scope/decisions/decomp | (none) | scoping, decomposing | scoping, deciding, decomposing |
| Every DR reviewed individually (lens-rotating skeptic) | no | no | **yes** |
| Phases that require human sign-off | handing-off | scoping, decomposing, handing-off | scoping, deciding, decomposing, handing-off |

**When to use each:**

- **`poc`** — weekend hacks, prototypes, internal-only spikes. Minimal ceremony.
- **`mvp`** (default) — a real product slice. Scope and decomposition get scrutiny; individual decisions don't get a full review pass.
- **`full`** — production work, regulated domains, anything where reading the decisions in six months matters. Every DR is reviewed by the lens-rotating skeptic before acceptance.

## Override individual knobs

Sometimes a preset is close but one knob is off. Override at init time:

```bash
# Use MVP defaults but require only 5 tasks instead of 8
decision-record --idea "…" --effort mvp \
  # (override flags coming — for now use the MCP dr_update_project tool after init)
```

> The CLI does not currently expose per-knob overrides as flags. You can override them by calling `dr_update_project` via the MCP server, or by editing `dr/project.json` directly (then re-running with `--resume`). A `--gate-override key=value` flag is a planned addition.

### Override schema

`project.json` has a `gate_config.overrides` object. Any knob you set there wins over the preset:

```json
{
  "gate_config": {
    "preset": "mvp",
    "overrides": {
      "min_tasks": 5,
      "review_required_per_decision": true,
      "max_task_estimate_hours": 6
    }
  }
}
```

Available override knobs:

| Key | Type | Effect |
|---|---|---|
| `decisions_required_status` | `"accepted"` \| `"any"` | What DR status counts toward the deciding gate. Use `"any"` to allow rejection without re-deciding. |
| `review_required_phases` | `string[]` | Phases at which an antagonistic review must happen before advance. |
| `review_required_per_decision` | `boolean` | If true, every DR needs a passing review before acceptance. |
| `max_task_estimate_hours` | `number` | Leaf task estimate ceiling. |
| `require_human_signoff_phases` | `string[]` | Phases that need human (not agent) sign-off to advance. |
| `min_decisions` | `integer` | Minimum decisions to advance from deciding. |
| `min_tasks` | `integer` | Minimum tasks to advance from decomposing. |

## Inspect the effective config

```bash
cat <cwd>/.dr/state.json | jq '.effective_gate_config'
```

The `effective_gate_config` is the materialized preset + overrides; it's what the gate evaluator actually checks against. Edit `project.json` overrides, then re-run with `--resume` to see the change.

## Why hard gates?

Soft gates degrade. People learn to skip them. By refusing to emit a "ship-ready plan" until the criteria are met, the resulting artifact becomes trustworthy: if it exists, it's complete. See [the design rationale](../explanation/design-rationale.md) for the longer version.
