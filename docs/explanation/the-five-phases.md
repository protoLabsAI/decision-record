# The five phases

The pipeline has exactly five phases between an idea and a ship-ready plan. Each phase has a single job; each transition is gated.

```
intake → scoping → deciding → decomposing → handing-off → handed-off
```

This page explains what each phase accomplishes and why it exists.

## Intake

**Job:** Capture the idea.

**Inputs:** a one-line idea, an optional PRD, an effort-level choice.

**Outputs:** a `Project` object with title, description, effort_level, and an empty everything-else.

**Gate to next phase:** title and description non-empty.

**Why it exists:** to write the seed down. Until the idea has an `id` on disk, the wizard has nothing to read on subsequent turns. Intake is mechanical and fast.

## Scoping

**Job:** Pin the MVP perimeter.

**Inputs:** the project description, optionally a PRD, optionally a `scope-statement` seed.

**Outputs:**

- `project.scope.in_scope` — capabilities the MVP MUST ship
- `project.scope.out_of_scope` — explicit non-goals (this is the load-bearing list)
- `project.scope.success_criteria` — measurable signals
- `project.scope.nice_to_have` — optional capabilities
- Under `mvp`/`full` presets: a `scope-statement` DR with a selected shape (lean / walking-skeleton / polished) and an argument

**Gate to next phase:** `in_scope` and `success_criteria` non-empty. Under `mvp`/`full`, the scope DR has a passing review.

**Why it exists:** without explicit scope, decisions and tasks expand silently. Pinning scope first means every decision evaluated against it has a clear target. The `out_of_scope` list, in particular, is the thing that prevents scope creep later — if it's not on the in_scope list, it's not in the plan.

## Deciding

**Job:** Resolve significant decisions.

**Inputs:** the scoped project. Each decision area is a "would otherwise be re-litigated" choice — language, data store, auth, deployment target, agent contract, etc.

**Outputs:** a set of `Decision` records, each with:

- An issue framing
- 2–4 positions with pros/cons
- A `selected_position` and an `argument`
- Under `full` preset: one `Review` entry per lens (operational, strategic, security, cost, user-impact)
- Final `status: accepted` with a `sign_off`

**Gate to next phase:** ≥ `min_decisions` count; every decision either `accepted` or `rejected` (no in-flight `proposed`); per-decision review passed if `review_required_per_decision`; no dangling decision dependencies.

**Why it exists:** decisions made implicitly during decomposition are untraceable. Forcing them into first-class records means future-you (or future-them) can see why the team chose X. The `seed_origin` field also lets the agent learn from past projects without redeciding the obvious.

## Decomposing

**Job:** Turn decisions into a task graph.

**Inputs:** accepted decisions + scope. Each task is a vertical slice that ships some user-visible behavior end-to-end, sized to fit under the preset's `max_task_estimate_hours`.

**Outputs:** a set of `Task` records, each with:

- A title and description
- Acceptance criteria (concrete done-when statements)
- An estimate (hours/days + confidence)
- `decision_refs` linking back to the decisions it implements
- `depends_on` for ordering

**Gate to next phase:** ≥ `min_tasks`; no cycles; no orphan dependencies; every estimate within budget; every `decision_refs` resolves; under `mvp`/`full`, the decomposing phase has been reviewed.

**Why it exists:** without explicit dependencies, the team works in arbitrary order and discovers blockers late. The dependency graph makes the order legible. The `decision_refs` make traceability automatic — if a decision changes, you can find every task affected.

## Handing off

**Job:** Finalize the plan into a target system.

**Inputs:** the validated decision + task graph; a handoff target (Linear or filesystem).

**Outputs:**

- For Linear: a Linear Project, an Issue per decision (labeled `decision`), an Issue per task with priority/estimate/acceptance criteria, `blocks` relations for `depends_on`. Each task's local JSON gets an `external_ref` for traceability.
- For filesystem: the `dr/` tree is finalized, `project.json.handoff` is set, mutations are halted.

**Gate to next phase:** `project.handoff` set; sign-off provided.

**Why it exists:** to mark the plan as complete and hand it to the execution system. After this point, the pipeline considers the work done; ongoing changes happen wherever the engineering team works.

## Handed off (terminal)

**Job:** Hold the final state.

**Inputs:** the finished pipeline.

**Outputs:** none. This is a terminal state — `dr_advance` from `handed-off` returns null.

**Why it exists:** the pipeline has a clear "done." There is no post-handoff lifecycle in this system; that belongs in Linear/Plane/wherever.

## Why exactly these five

We tried a few alternative shapes:

- **Three phases** (idea → plan → handoff) — too coarse; the agent had to make scope decisions and task decisions in the same step, and they collapsed into each other.
- **Seven phases** (adding "research" before scope and "verification" before handoff) — felt heavier than the workload warranted. The agent can pull research into scoping; verification is what the gates already do.
- **No explicit handoff phase** (just an export tool) — the export ended up being the implicit handoff, but without a phase boundary the gate machine couldn't enforce sign-off and completeness.

The current shape is the smallest that gives each artifact a single owner and makes every transition load-bearing.

## What happens between phases

Between phases, the wizard:

1. Reads the current state with `dr_status`.
2. Evaluates the gate to the next phase.
3. If passing and no human sign-off is required, calls `dr_advance` directly.
4. If passing and human sign-off is required, prompts the user (or auto-confirms under `--yes`).
5. If failing, surfaces the gate reasons and tries to make the agent fix them — usually by running the phase's sub-agent again.

The phase machine is therefore not just "what's the next thing" — it's "what gate is blocking us, and what work closes that gate."

## State-driven progression

Critically: phase progression is **state-driven, not turn-driven**. The wizard doesn't say "we just finished scoping so I'll move to deciding." It says "scope is non-empty, the scope DR is reviewed, the gate passes, so I'll advance." This means:

- The wizard can resume cleanly mid-phase.
- Partial work isn't wasted.
- A human can edit `project.json` between sessions and the wizard adapts.
- Phase order is enforced by the gate machine, not by the agent's memory.

That's the underlying primitive that makes the rest work.
