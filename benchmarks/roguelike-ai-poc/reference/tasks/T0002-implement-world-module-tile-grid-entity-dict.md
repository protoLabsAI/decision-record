# T0002-implement-world-module-tile-grid-entity-dict — Implement world module (tile grid + entity dict)

| Field | Value |
| --- | --- |
| Status | `open` |
| Priority | `p0` |
| Estimate | 2 hours (med confidence) |
| Depends on | `T0001-bootstrap-repository` |
| Decision refs | `0002-define-the-world-representation-and-renderer` — Define the world representation and renderer |
| Assignee hint | agent |
| Labels | `core` |
| Updated | 2026-05-17T04:14:22.526Z |

## Description

Build src/world.py: World dataclass with static_tiles: list[list[str]] and entities: dict[str, dict]. Provide constructors for a default 10×10 room (walls border, one hazard, one exit). Pure data and helpers; no rendering, no game logic.

## Acceptance criteria

- [ ] World.default_room() returns a valid 10x10 with #, ., X, > tiles
- [ ] entities dict contains a player at a known spawn
- [ ] is_walkable(x,y) returns False for walls, True for floor and hazard
- [ ] unit test: default room is fully walkable from spawn to exit
