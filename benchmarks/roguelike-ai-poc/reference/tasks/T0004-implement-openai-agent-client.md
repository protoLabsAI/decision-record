# T0004-implement-openai-agent-client — Implement OpenAI agent client

| Field | Value |
| --- | --- |
| Status | `open` |
| Priority | `p0` |
| Estimate | 2 hours (med confidence) |
| Depends on | `T0001-bootstrap-repository` |
| Decision refs | `0003-define-the-agent-action-contract` — Define the agent action contract |
| Assignee hint | agent |
| Labels | `llm`, `core` |
| Updated | 2026-05-17T04:14:22.528Z |

## Description

Build src/agent.py: AgentClient class with constructor(strategy_prompt, model, api_key). Single method choose_action(world_state_json, tick, hp) → (direction, reasoning). Uses tool-calling with one tool do_action(direction in {N,S,E,W,noop}); tool_choice="required". Returns the chosen direction and the assistant message content as reasoning.

## Acceptance criteria

- [ ] AgentClient instantiates without making a call
- [ ] choose_action returns a valid direction enum
- [ ] reasoning is captured as a string (may be empty)
- [ ] malformed responses raise a clear error (does not silently noop)
- [ ] strategy_prompt is in the system role on every call
