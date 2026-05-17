# 0004-define-the-tick-loop-and-termination-conditions — Define the tick loop and termination conditions

| Field | Value |
| --- | --- |
| Status | `accepted` |
| Template | `architecture` |
| Updated | 2026-05-17T04:13:38.692Z |
| Selected | **Synchronous loop with step cap** |
| Depends on | _(none)_ |

## Summary

How the game advances tick by tick, when it stops, and how the user observes it.

## Issue

With an LLM in the loop, each tick is slow (~2-5s). We need a predictable loop with hard stops so the POC always terminates and is always watchable.

## Assumptions

- One-player synchronous game
- User runs the script in a terminal and watches frames
- LLM calls happen on the same thread

## Constraints

- Must terminate on win, death, or step limit
- Frame must visibly update each tick
- Must not deadlock on a stuck agent

## Positions

### Synchronous loop with step cap ✅

while not terminal: render → ask agent → apply → check win/death. Hard cap at N steps (e.g., 50).

**Pros**

- Simplest mental model
- Easy to log
- Predictable termination

**Cons**

- UI freezes during LLM call (acceptable for POC)

### Async loop with timeout per tick

Wrap each agent call in a 10s timeout; on timeout, treat as noop.

**Pros**

- Robust to slow API
- Game keeps moving

**Cons**

- More complex
- Asyncio inside a CLI script is heavier than warranted

## Argument

For a single-window terminal demo, synchronous is fine. Adding asyncio doubles the code size for no demo-visible benefit. The step cap protects against an agent that wanders forever and ensures every run terminates.

## Implications

- Step cap = 50; on cap, exit with status "timeout" and final HP.
- Use time.sleep(0.05) after each render so the user can see the frames advance.
- Loop logs each tick to stdout: frame, action, reasoning, hp, tick#.

## Sign-off

- **By:** kj (human)
- **At:** 2026-05-17T04:13:38.692Z
