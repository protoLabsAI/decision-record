# 0001-choose-the-implementation-language — Choose the implementation language

| Field | Value |
| --- | --- |
| Status | `accepted` |
| Template | `architecture` |
| Updated | 2026-05-17T04:13:38.685Z |
| Selected | **Python** |
| Depends on | _(none)_ |

## Summary

Decide the primary implementation language for the project.

## Issue

Every other foundational decision (runtime, package manager, framework choices, testing tools) flows from the language choice. Picking this early and explicitly avoids drift.

## Assumptions

- Team has existing language strengths to lean on.
- Project lifespan is long enough that hiring and onboarding matter.
- Ecosystem maturity matters for the project's domain.

## Constraints

- Team's current expertise.
- Target runtime environments (browser, server, native, embedded).
- Performance and memory budgets.
- Licensing or compliance restrictions on language ecosystems.

## Positions

### TypeScript

Strongly typed JavaScript. Best for full-stack web work, ubiquitous tooling.

**Pros**

- Ubiquitous in web
- Strong types catch errors early
- Massive ecosystem
- Frontend/backend code sharing

**Cons**

- Build step overhead
- Type system can be over-engineered
- Slower than native languages for hot paths

### Python ✅

Dynamic, batteries-included. Best for data work, scripting, ML, fast prototypes.

**Pros**

- Excellent ML/data ecosystem
- Fast to write
- Readable
- Huge stdlib

**Cons**

- Slow runtime without C extensions
- GIL limits concurrency
- Dynamic typing → runtime errors

### Go

Statically typed, compiled, built for concurrent services.

**Pros**

- Simple language
- Single binary deployment
- Strong concurrency primitives
- Fast compile times

**Cons**

- Generics still maturing
- Verbose error handling
- Less rich third-party ecosystem than JS/Python

### Rust

Memory-safe systems language. Best for performance-critical or systems work.

**Pros**

- No GC, predictable performance
- Memory safety
- Excellent tooling (cargo)
- Strong types

**Cons**

- Steep learning curve
- Slower to ship initial features
- Compile times can be long

## Argument

Python is fastest to write for a single-script game-loop POC. The OpenAI SDK + a tiny terminal renderer fit naturally; no build step or transpile loop slows iteration. Team is comfortable with Python and the project never needs to leave a single repo.

## Implications

- Use the official openai Python SDK for agent calls.
- Single-file or small-module layout; no package manager beyond pip/uv.
- Pin to Python 3.11+ for ergonomic match-statement parsing of agent actions.

## Sign-off

- **By:** kj (human)
- **At:** 2026-05-17T04:13:38.685Z
- **Notes:** poc preset, no review required

---

_Instantiated from seed: `language-choice`_
