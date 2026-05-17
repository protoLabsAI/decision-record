# T0006-implement-the-tick-based-game-loop — Implement the tick-based game loop

| Field | Value |
| --- | --- |
| Status | `open` |
| Priority | `p0` |
| Estimate | 2 hours (med confidence) |
| Depends on | `T0003-implement-frame-renderer`, `T0004-implement-openai-agent-client`, `T0005-implement-action-handlers-and-termination-checks` |
| Decision refs | `0004-define-the-tick-loop-and-termination-conditions` — Define the tick loop and termination conditions; `0002-define-the-world-representation-and-renderer` — Define the world representation and renderer |
| Assignee hint | agent |
| Labels | `core` |
| Updated | 2026-05-17T04:14:22.530Z |

## Description

Build src/loop.py: run_game(world, agent_client, max_steps=50). Each iteration: render frame, call agent_client.choose_action, apply action, check terminal, sleep 0.05s, repeat. Logs each tick: tick#, frame, action, reasoning excerpt, hp. Exits on terminal or step cap; returns final state + reason.

## Acceptance criteria

- [ ] Loop terminates on win, death, or step cap (≤50)
- [ ] Each tick prints the frame and HUD to stdout
- [ ] Final summary line shows reason and step count
- [ ] No exceptions leak from agent timeouts/errors (logged and treated as noop)
