# 0003-define-the-agent-action-contract — Define the agent action contract

| Field | Value |
| --- | --- |
| Status | `accepted` |
| Template | `architecture` |
| Updated | 2026-05-17T04:13:38.690Z |
| Selected | **Tool-call (function calling) with one tool: do_action(direction)** |
| Depends on | _(none)_ |

## Summary

How the LLM receives the world state per tick and how it returns the chosen action.

## Issue

The agent must produce a structured, validated action every tick. We need the protocol pinned so the game loop never has to guess what the agent meant.

## Assumptions

- OpenAI-compatible API is the LLM transport
- Strategy prompt is supplied once at startup
- Per-tick latency budget ~2-5s is acceptable

## Constraints

- Action set is small (move N/S/E/W + noop)
- Agent must not stall the game with malformed output
- Must be debuggable from logs

## Positions

### Plain-text response parsing

Agent returns N/S/E/W/noop as plain text; we parse first token.

**Pros**

- Lowest token cost
- Works with any model

**Cons**

- Brittle to extra punctuation/prose
- No reasoning surface
- Hard to audit why

### Tool-call (function calling) with one tool: do_action(direction) ✅

Define a single OpenAI tool; agent invokes it once per tick with a strict enum direction.

**Pros**

- Schema-validated
- Free reasoning text alongside the call
- Easy to extend with new actions later

**Cons**

- Slightly more tokens per call
- Requires a model that supports function calling

### JSON-only response with output_config

Force agent to emit {"action":"N","reason":"…"} via structured outputs.

**Pros**

- Schema-validated
- Reasoning captured in same payload

**Cons**

- Some providers do not honor strict mode
- Slightly more setup than tool-call

## Argument

Tool-calling is the cleanest contract: the model gets free-form reasoning in `content` AND a strict-enum action in `tool_calls`. We can log both, and extending to new actions later is just adding enum values. Plain-text parsing trades 100 tokens of savings for a constant brittleness tax.

## Implications

- Define tool `do_action` with input_schema requiring `direction` in {N,S,E,W,noop}.
- Use tool_choice="required" each tick to force a call.
- Log the assistant message text (the reasoning) alongside the chosen direction for replay/debug.

## Sign-off

- **By:** kj (human)
- **At:** 2026-05-17T04:13:38.690Z
