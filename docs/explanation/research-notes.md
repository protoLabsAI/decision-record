# Research notes — DR/ADR discipline and how this system extends it

This document is the "why" behind the outcome-tracking, semantic-search, and read-before-write expansion. It captures the broader DR / ADR ecosystem as it stood at the time of this writing, what's well-trodden, what's underserved, and which gaps we chose to fill.

If you're looking for "how do I use feature X" — that's in the [how-to guides](../how-to/). This document is for understanding the design forces.

## Lineage

The Decision Record discipline has roughly three intellectual roots:

- **Joel Parker Henderson** maintains the canonical [decision-record](https://github.com/joelparkerhenderson/decision-record) repo this project is forked from. The structure (title, status, context, decision, consequences) and the framing "an immutable, append-only record of significant choices" anchor most modern usage.
- **Michael Nygard's "Documenting Architecture Decisions" (2011)** popularized lightweight ADRs in the agile / DevOps mainstream. The key insight was that *the value is in writing them, not in fancy tooling* — a Markdown file in the repo beats a wiki entry that no one updates.
- **Tyree and Akerman (2005)** laid the academic foundation in "Architecture Decisions: Demystifying Architecture," covering position, argument, implications, and the explicit modeling of trade-offs that became the template variants this system supports.

Subsequent work — **MADR v3/v4**, **e-adr (extended ADRs)**, **agile ADR templates** — refines the same skeleton. The ThoughtWorks Technology Radar moved ADRs to **Adopt** in 2018.

## Theoretical foundations

Three older traditions inform the shape of decision records:

- **IBIS (Issue-Based Information System)** — Rittel and Kunz's argumentation model: Issues, Positions, Arguments. Our `Decision` schema is a direct descendant: `issue`, `positions`, `argument`.
- **QOC (Questions, Options, Criteria)** — MacLean et al.'s design-rationale model. Where IBIS focuses on debate, QOC focuses on choice. Our `assumptions`, `constraints`, and `selected_position` carry the QOC pattern.
- **DRL (Decision Representation Language)** — Lee's formal model for decision rationale. Less visible in practice but foundational.

A specifically architectural strand:

- **ASR (Architecturally Significant Requirements)** — Chen et al. — the framing that some requirements are load-bearing for the architecture and deserve dedicated records. Our `effort_level` calibration is a coarse stand-in for ASR-first intake.

## Lifecycle in practice

Most teams running ADR-style practice converge on a similar shape:

1. **Trigger.** Either a code review reveals an unrecorded decision, a design review requires one, or a new project warrants documenting its load-bearing choices.
2. **Drafting.** Status starts at `proposed` or `rfc`. Discussion happens in the PR.
3. **Acceptance.** Status moves to `accepted` once enough stakeholders sign off. From this moment the record is immutable — *changes happen via new DRs that supersede*.
4. **Supersession or deprecation.** Older decisions can be marked `superseded` (with a forward link) or `deprecated`.

What's **missing** in nearly every tool we surveyed: the **post-acceptance feedback loop**. The DR is written, work happens, and the record never learns whether the prediction came true. Outcomes were already implicit in the "Consequences" section of Nygard's template, but they were written *at decision time*, not *after observation*. This is the gap our `Outcome` entity fills.

## Tooling ecosystem

A non-exhaustive map of where the discipline lives today:

- **`adr-tools`** (Nat Pryce) — the Bash CLI that put ADRs on most maps. Static Markdown only.
- **`log4brains`** (Thomson Reuters) — Markdown ADRs + static-site generator. Read-only browse experience.
- **Backstage TechDocs** (Spotify) — ADR plugin renders Markdown into the developer portal. Full-text search only.
- **`e-adr`** — academic extension introducing more structured fields.
- **MCP ADR Analysis Server** — recent MCP-based attempt at LLM-assisted ADR consumption.
- **Linear Projects + Docs** — many teams write decisions as Linear documents, especially when the same team executes them. Loses repo-coupling.
- **Notion, Confluence, hand-rolled wikis** — common in enterprise. Usually decays into the "DR graveyard" anti-pattern.

Nobody we found ships **outcome tracking**, **semantic search across decisions**, or **agent-native read-before-write** as a first-class feature. That's the surface we expanded into.

## Anti-patterns

- **Compliance theater** — ADRs are written because a process says so, but no one reads them. Symptoms: titles are vague, arguments are absent, no DR ever cites another.
- **DR graveyard** — DRs are written, archived, and never re-examined. The new joiner can't find the relevant prior art and re-litigates instead.
- **Conflicting DRs** — over time, contradictory accepted decisions accumulate. Without supersession discipline (and ideally search to surface the conflict), the team operates on stale prior art.
- **Outcome blindness** — without an explicit outcome record, the team can't tell which DRs are predictive and which are aspirational. Selection bias takes over.
- **Over-fragmentation** — every tiny choice gets its own DR. The signal drowns in noise.
- **One-shot accept-and-archive** — the DR is treated as a write-once artifact. No revisits, no outcomes, no supersession.

## Adjacent artifacts

Decision records sit in a constellation of related documents. Knowing where they don't belong is as useful as knowing where they do.

| Artifact | Purpose | When to use *instead of* a DR |
|---|---|---|
| **RFC** | Solicit feedback before a decision | While the decision is still genuinely open. Promote to DR when narrowing to a position. |
| **Design doc** | Detailed how-it-works writeup | When the *implementation* is the deliverable, not the *choice*. |
| **PRD** | Product requirements | Captures *what* and *for whom*, not *which option won*. |
| **Postmortem** | Incident analysis | After failure; the lessons may seed new DRs. |
| **Runbook** | Operational procedure | Stable how-to, not a choice. |
| **AGENTS.md / context files** | Standing guidance for agents | A persistent "always do X" instruction, often *derived* from one or more DRs. |

## Emerging agentic applications

Recent work explicitly connects DRs to AI-agent workflows:

- **AgenticAKM (arXiv:2602.04445)** — proposes "Agentic Architecture Knowledge Management," with agents both consuming and producing ADRs as part of their planning loops.
- **Pollick's "ADR Comeback"** — argues that LLM-driven engineering teams rediscover ADRs because the agent context window benefits enormously from terse, structured prior art.
- **AgDR (Agent Decision Records)** — proposed schema extension where agents' own decisions about how to approach a task get the DR treatment, with explicit linkage to user prompts and tool calls.
- **AGENTS.md** — the trend toward a "living ADR" file that captures the *current* standing decisions agents must respect, derived from accepted DRs.

This is the trajectory we're operating in: not just human-authored decisions, but decisions an agent helps author, retrieves before proposing, and circles back to validate or invalidate after handoff.

## Open challenges

A non-exhaustive list of things the field hasn't solved well:

- **Cross-project decision search.** Most teams have decisions scattered across many repos. There's no canonical pattern for unified retrieval.
- **Decision aging.** When is a DR stale? When the world it was made in no longer applies. Hard to detect automatically.
- **Counter-evidence discovery.** Surfacing outcomes that *invalidate* an existing accepted DR is harder than surfacing supporting ones.
- **Quality calibration.** Distinguishing a high-quality DR (load-bearing, well-argued, observable outcome) from boilerplate.
- **Conflict detection.** Pairwise comparison of all accepted DRs is O(N²); LLM-driven detection is plausible but unshipped.

## Opportunities — what this release ships

Three opportunities the survey identified as both **high-value** and **schema-light** to ship in our system:

### 1. Outcome tracking

A new `Outcome` entity, post-handoff, links forward from an accepted decision and records what was observed. Status enum captures whether the decision held up. Evidence list captures URLs and file references. Status transitions are auditable. See [Track outcomes](../how-to/track-outcomes.md).

### 2. Semantic search

`dr_search_decisions` powered by OpenAI-compatible embeddings, with a deterministic substring fallback when embeddings are unavailable. Cache is hash-keyed so unchanged decisions skip re-embedding. See [Search decisions](../how-to/search-decisions.md).

### 3. Read-before-write in the deciding agent

The deciding-phase prompt now mandates a `dr_search_decisions` call per prospective topic *before* `dr_propose_decision`. Hits ≥ 0.85 either suppress the new DR or get cited via `related_decisions`. This is the operationalization of "agents should reuse prior art, not re-litigate" that the AgenticAKM literature names but doesn't ship.

## Symphony alignment (April 2026)

After this release we extended the system to align with [OpenAI's Symphony](https://github.com/openai/symphony) — the open-source orchestrator that turns project work into autonomous coding-agent runs. Our system became the **planning + outcomes layer**; Symphony became the **execution layer**. The wire between them is Linear (today) or a future filesystem tracker extension.

See [Symphony alignment](symphony-alignment.md) for the staged plan; slice 1 (Symphony handoff target + `WORKFLOW.md` emitter) is shipped.

## Opportunities — future

Out of scope for this release, on the medium-term roadmap:

- **Cross-project semantic search.** A shared cache at `~/.dr-cache/` and a tool that crawls multiple project directories.
- **RFC → DR promotion.** Preserve the pre-decision deliberation thread as the DR's `summary` + `issue`.
- **AgDR schema extension.** A separate record type for agent-authored task decisions, linked back to the human-authored DR.
- **ASR-first intake.** Quality-attribute targeting (latency, availability, cost) before scoping, threaded through to gates.
- **Conflict detection.** LLM pairwise comparison over accepted DRs to flag latent contradictions.
- **Decision aging signals.** Heuristics on staleness (no outcomes, no references, no related work in N months).

## Why this was worth shipping now

The original Nygard / Tyree-Akerman skeleton is mature. The MADR / e-adr work refines it. The agentic literature names the next steps. But the **operationalized agent-native discipline** — write, gate, hand off, *then learn from outcomes, and retrieve before re-litigating* — wasn't represented in any tool we could find. We're not inventing the discipline; we're shipping the missing infrastructure.

## Sources

- Henderson, J.P. — [decision-record](https://github.com/joelparkerhenderson/decision-record) (canonical repo).
- Nygard, M. — "Documenting Architecture Decisions" (Cognitect, 2011).
- Tyree, J. & Akerman, A. — "Architecture Decisions: Demystifying Architecture," IEEE Software (2005).
- Rittel, H. & Kunz, W. — "Issues as Elements of Information Systems" (1970).
- MacLean et al. — "Questions, Options, and Criteria: Elements of Design Space Analysis," HCI (1991).
- Lee, J. — "Extending the Potts and Bruns Model for Recording Design Rationale" (1991).
- Chen, L. et al. — "Architecturally Significant Requirements" (2013).
- MADR, e-adr, AgenticAKM, Pollick's "ADR Comeback," AgDR — various blog posts and arXiv preprints (2023–2026).
