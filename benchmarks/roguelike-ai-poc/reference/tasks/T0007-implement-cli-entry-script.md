# T0007-implement-cli-entry-script — Implement CLI entry script

| Field | Value |
| --- | --- |
| Status | `open` |
| Priority | `p0` |
| Estimate | 1 hours (high confidence) |
| Depends on | `T0006-implement-the-tick-based-game-loop` |
| Decision refs | `0001-choose-the-implementation-language` — Choose the implementation language; `0004-define-the-tick-loop-and-termination-conditions` — Define the tick loop and termination conditions |
| Assignee hint | agent |
| Labels | `cli` |
| Updated | 2026-05-17T04:14:22.532Z |

## Description

Build src/__main__.py: argparse for --strategy (or read from stdin), --model (default gpt-4o), --max-steps (default 50). Construct AgentClient, build default room, call run_game. Print the final outcome. Document the env vars (OPENAI_API_KEY) and a sample invocation in README.

## Acceptance criteria

- [ ] python -m src --strategy "cautious explorer" runs end-to-end
- [ ] README has a complete example invocation
- [ ] --help prints usage
- [ ] Exit code 0 on win/timeout, 1 on death (so scripts can chain)
