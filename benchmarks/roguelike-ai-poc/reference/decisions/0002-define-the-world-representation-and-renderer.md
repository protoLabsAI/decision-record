# 0002-define-the-world-representation-and-renderer — Define the world representation and renderer

| Field | Value |
| --- | --- |
| Status | `accepted` |
| Template | `data-model` |
| Updated | 2026-05-17T04:13:38.688Z |
| Selected | **Tile-grid + entity dict** |
| Depends on | _(none)_ |

## Summary

How the room is stored in memory and rendered to the terminal each tick.

## Issue

The world is small (one 10×10 room) but the representation must support: easy frame rendering, fast collision/hazard checks, and a stable serialization that the agent can read on each tick. Pick a model now so the action handlers and renderer can converge.

## Assumptions

- 10×10 fixed grid
- Single player entity
- Static tiles set at startup
- Frame fits in a single terminal redraw

## Constraints

- Frame must be readable both by humans and the LLM
- No external graphics libraries

## Positions

### Nested list of chars

world: list[list[str]] indexed by [y][x]. Player position stored separately.

**Pros**

- Simplest possible
- Trivial to mutate
- Renders by row-join

**Cons**

- No type safety on tile semantics
- Have to scan grid for entity positions

### Tile-grid + entity dict ✅

static_tiles: list[list[str]] for walls/floor/hazard/exit; entities: dict[id, {pos, hp, glyph}] overlaid at render time.

**Pros**

- Separates static map from dynamic state
- Easy to add entities later if needed
- Clean serialization to JSON

**Cons**

- Two structures to keep consistent
- Slightly more code

### Single 2D numpy array + glyph table

Each cell is an int; render by mapping ints to glyphs.

**Pros**

- Compact
- Fast
- Numpy is familiar

**Cons**

- Numpy is overkill for 10×10
- Adds a dep we do not otherwise need
- Less Pythonic for tiny data

## Argument

Static map + entity overlay is the simplest model that survives the day-2 question can we add a second entity? without a rewrite. It serializes naturally to JSON for the LLM payload and keeps render code in one row-join.

## Implications

- Tile glyphs: # wall, . floor, X hazard, > exit; entities overlay (@ for player).
- Each tick the renderer composes static_tiles + entity glyphs at their positions.
- JSON state sent to the agent: { frame: [<row strings>], hp, tick, exit_pos, player_pos }.

## Sign-off

- **By:** kj (human)
- **At:** 2026-05-17T04:13:38.688Z
