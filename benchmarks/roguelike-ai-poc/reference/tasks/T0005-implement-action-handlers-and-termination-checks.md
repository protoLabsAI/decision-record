# T0005-implement-action-handlers-and-termination-checks — Implement action handlers and termination checks

| Field | Value |
| --- | --- |
| Status | `open` |
| Priority | `p0` |
| Estimate | 1 hours (high confidence) |
| Depends on | `T0002-implement-world-module-tile-grid-entity-dict` |
| Decision refs | `0002-define-the-world-representation-and-renderer` — Define the world representation and renderer |
| Assignee hint | agent |
| Labels | `core` |
| Updated | 2026-05-17T04:14:22.529Z |

## Description

Build src/actions.py: apply_action(world, direction) -> ActionResult. Moves the player one cell if walkable; otherwise noop. Compute side effects: HP-1 when stepping onto hazard, win flag when player_pos == exit_pos, dead flag when HP <= 0. Return ActionResult dataclass with new_world, hp_delta, terminal, terminal_reason.

## Acceptance criteria

- [ ] Moving into a wall is a noop with no HP change
- [ ] Moving onto hazard triggers hp_delta = -1
- [ ] Moving onto exit triggers terminal="win"
- [ ] HP reaching 0 triggers terminal="death"
- [ ] Unit tests for each transition
