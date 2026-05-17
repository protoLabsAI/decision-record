# T0003-implement-frame-renderer — Implement frame renderer

| Field | Value |
| --- | --- |
| Status | `open` |
| Priority | `p0` |
| Estimate | 1 hours (high confidence) |
| Depends on | `T0002-implement-world-module-tile-grid-entity-dict` |
| Decision refs | `0002-define-the-world-representation-and-renderer` — Define the world representation and renderer |
| Assignee hint | agent |
| Labels | `core` |
| Updated | 2026-05-17T04:14:22.527Z |

## Description

Build src/render.py: render_frame(world) -> list[str]. Compose static_tiles + entity glyphs (entity overrides tile). Provide a small HUD line below the frame showing tick number, HP, and last action. Return as list of strings so the game loop can join + print or send to LLM.

## Acceptance criteria

- [ ] render_frame returns 10 strings of length 10
- [ ] player @ is visible at its current position
- [ ] HUD line includes tick, hp, last_action
- [ ] manual visual check: frame looks like a roguelike room
