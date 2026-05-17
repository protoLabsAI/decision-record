# AI-driven roguelike POC

| Field | Value |
| --- | --- |
| ID | `ai-driven-roguelike-poc` |
| Status | `handed-off` |
| Effort level | `poc` |
| Created | 2026-05-17T04:12:02.030Z |
| Updated | 2026-05-17T04:14:44.540Z |
| Decisions | 4 |
| Tasks | 7 |

## Description

A minimal roguelike where the player primes an AI agent with a strategy, then the agent autonomously navigates a single ASCII-rendered room over a tick system until it wins the objective or dies. Goal: prove the agent-as-player concept with the smallest viable surface area.

## Scope

**In scope**

- A 10×10 ASCII-rendered single room with walls (#), floor (.), player (@), exit (>), and a hazard tile (X)
- Tick-based game loop: each tick prints the frame, then queries the agent for one action
- A small action vocabulary: move N/S/E/W and noop
- Player has HP; stepping on hazard removes HP; reaching exit = win, HP=0 = death
- Strategy prompt provided once at startup, fed to the agent as system prompt for every tick
- LLM agent receives current frame + HP + tick number, returns a single action

**Success criteria**

- A user can run a single command, supply a strategy prompt, and watch the agent play until win or death
- Win and death paths both observed in manual playtests
- Different strategy prompts produce visibly different agent behavior
- End-to-end run completes in under 60 seconds wall time on a typical OpenAI API call

**Out of scope**

- Multiple rooms, dungeon generation, procedural levels
- Combat with enemies, NPCs, monsters
- Inventory, items, equipment
- Save/load, persistence
- Visual UI beyond ASCII to terminal
- Multiplayer, networking
- Self-improving agent loops or RL training

**Nice to have**

- Configurable room layout from a text file
- Replay log written to disk for post-hoc inspection
- A few preset strategy prompts to demo (cautious, greedy, exploratory)

## Sign-offs

- **handing-off** by kj (human) at 2026-05-17T04:14:44.523Z — All decisions accepted, graph validates clean.

- **handing-off** by kj (human) at 2026-05-17T04:14:44.540Z

## Handoff

| Field | Value |
| --- | --- |
| Target | `filesystem` |
| Exported at | 2026-05-17T04:14:44.540Z |
| Target ID | — |
| Target URL | — |
