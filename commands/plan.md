---
description: Drive a new (or in-progress) project through the hard-gated decision-record planning pipeline — intake, MVP scope, decisions, task graph, and handoff.
argument-hint: Optional one-line idea; will be elicited if missing
---

# /plan — idea-to-MVP planning pipeline

You are running the decision-record planning pipeline. The user wants to take an idea and produce a complete, ship-ready MVP plan: a scope manifest, an accepted set of decision records, and a dependency-aware task graph. The pipeline is **hard-gated** — at each phase, gates must pass before advancing. The user can pick a gate strictness preset (`poc`, `mvp`, `full`) that calibrates how rigorous the gates are.

**Argument from user:** $ARGUMENTS

## Operating principles

1. **Read state, then act.** Every loop iteration starts with `mcp__decision-record__dr_status` to learn the current phase, gate evaluation, and what's blocking. Don't carry assumptions across turns — the source of truth is on disk.
2. **Dynamic wizard, not rigid form.** Decide what to ask the user next based on the current phase, the project, and what's already been captured. Skip questions you already have answers to. Pull seed library entries when you spot familiar territory (`mcp__decision-record__dr_seed_search`).
3. **The human is your teammate.** When you propose a position, scope item, or task, propose with confidence — but the human signs off. Phases requiring human sign-off cannot be advanced by the agent alone.
4. **Don't fake completion.** If a gate fails, the wizard returns reasons. Surface them plainly and work through them; don't try to bypass.
5. **One DR per significant choice.** Tiny implementation details aren't DRs — they're tasks. A DR is for a decision that would otherwise be re-litigated.

## Pipeline phases

| Phase | What happens | Tools used |
| --- | --- | --- |
| `intake` | Capture the raw idea: title, description, effort level | `dr_init` |
| `scoping` | Negotiate MVP boundaries: in_scope, out_of_scope, success_criteria | `dr_update_scope`, possibly a `scoping`-variant DR |
| `deciding` | Surface and resolve significant decisions as DRs | `dr_propose_decision`, `dr_seed_load`, `dr_update_decision`, `dr_review_decision` (often delegated to `dr-skeptic`), `dr_accept_decision` |
| `decomposing` | Break decisions into a beads-style task graph | `dr_propose_task`, `dr_update_task` (often delegated to `dr-decomposer`), `dr_validate_graph` |
| `handing-off` | Export to Linear or filesystem | `dr_export_linear` (with `dry_run` first), `dr_export_filesystem`, `dr_render` |

Use **`dr_advance`** to move between phases; pass `sign_off_by: 'human'` only when the user has explicitly confirmed they're ready.

## What to do, in order

### 1. Resume check

Call `mcp__decision-record__dr_status`. Possibilities:

- **No project initialized** (tool returns `ok: false` with "No project initialized"): proceed to step 2.
- **Project initialized**: skip ahead to whatever phase the project is in. Tell the user what you found: "Picking up your `<title>` project, currently in `<phase>`. Here's what's blocking advance: …". Then continue from the appropriate phase below.

### 2. Intake (only when initializing fresh)

Confirm the idea with the user. If `$ARGUMENTS` is empty, ask them: *"What's the project? One line is fine for now."* Once you have a title + description (description can be a few sentences):

- Ask the user the effort level: **POC** (one weekend, light gates), **MVP** (a few weeks, the default), or **Full** (production-quality, every gate enforced). Default to **MVP** if they're unsure.
- Call `dr_init` with `title`, `description`, `effort_level`. Confirm the project ID it derived.
- Call `dr_advance` to move to scoping. (Intake → scoping requires no human sign-off in any preset.)

### 3. Scoping

This is where most projects get stuck. Resist the impulse to advance until scope is sharp.

- Lead with: *"What MUST this MVP do? Three or four bullet points."* Capture as `in_scope`.
- Then: *"What WON'T it do? What are you deliberately deferring?"* Capture as `out_of_scope`.
- Then: *"How will we know it worked? What measurable signals?"* Capture as `success_criteria`.
- Optionally a `nice_to_have` list for items the team might pick up if time permits.
- Call `dr_update_scope` to write all four lists.
- **For MVP/Full presets:** also seed the `scope-statement` DR via `dr_seed_load { seed_name: 'scope-statement' }`. Customize its `selected_position` (lean / walking-skeleton / polished), set the `argument`, then call `dr_accept_decision` with the human's sign-off.
- Optionally invoke `dr-skeptic` to review the scope DR before acceptance.
- Confirm with the user: *"Ready to lock scope and move to decisions?"* On yes, `dr_advance` with `sign_off_by: 'human'`.

### 4. Deciding

The wizard now identifies which decisions matter for this project. **You're picking, not enumerating** — every project is different.

For each potential decision area:

1. Search the seed library: `dr_seed_search { query: <topic> }`. If a match exists, prefer `dr_seed_load` to start from a curated template.
2. Otherwise, `dr_propose_decision` with at least `title`, `issue`, and 2-4 `positions` with pros/cons.
3. Tell the user: *"Here are the options for `<title>`. Which would you pick, and why?"*
4. Capture their selection: `dr_update_decision` with `selected_position` and a brief `argument`.
5. (Optional, for MVP/Full presets) Delegate to `dr-skeptic` to review: `Task(subagent_type: 'dr-skeptic', prompt: <decision context>)`. It returns a verdict and concerns; record them via `dr_review_decision`. If the verdict is `block`, work through concerns with the user before re-trying.
6. Once selected_position and argument are set and any required reviews are passing, `dr_accept_decision`.

Use `dr_ready_decisions` between rounds to see which DRs are now unblocked (their `depends_on` are all accepted). Cover one decision at a time; don't ask the user to triage 10 open DRs.

When you believe all significant decisions are captured and accepted, ask the user: *"Anything else we should pin down before decomposing into tasks?"* On confirmation, `dr_advance` with `sign_off_by: 'human'`.

### 5. Decomposing

Delegate the heavy lifting: `Task(subagent_type: 'dr-decomposer', prompt: '<project + accepted DRs + scope>')`. The decomposer proposes the task graph. You then:

- Review the proposed graph with the user. Ask: *"Anything missing? Anything we should split or merge?"*
- Apply changes via `dr_update_task` / `dr_propose_task`.
- Run `dr_validate_graph`. Surface any errors (cycles, orphan deps, oversized estimates, missing decision_refs) and fix them.
- When clean, ask the user: *"Ready to hand off?"* On yes, `dr_advance` with `sign_off_by: 'human'`.

### 6. Handing off

- Run `dr_render` to refresh Markdown and HTML artifacts.
- Ask the user where to hand off: **Linear** (if they have `LINEAR_API_KEY` and a team ID) or **filesystem only**.
- For Linear: ask for the team ID, then call `dr_export_linear` with `dry_run: true` first. Show the user the export plan. On confirmation, call again with `dry_run: false` and `sign_off_by: 'human'`.
- For filesystem: call `dr_export_filesystem` with `sign_off_by: 'human'`.
- Confirm the final state with `dr_status`. The project should now be `handed-off`.
- Print the final summary: number of decisions, number of tasks, where things landed.

## Behavior rules

- **Track your work.** Use `TodoWrite` for any non-trivial set of decisions/tasks you're working through.
- **Don't batch human prompts.** Ask one question at a time when something's genuinely ambiguous. Don't fire off a checklist.
- **Confirm before destructive ops.** Linear export, gate advances with human sign-off — say what you're about to do and wait for "yes."
- **When stuck, ask.** If a gate fails for a reason you don't understand, surface the reasons verbatim and ask the user how they want to handle it.
- **Stay in scope.** Don't propose decisions that aren't load-bearing for the MVP. Don't decompose tasks that won't ship in the MVP — put them in `nice_to_have` on the project scope and move on.

## Reference: where things live

- Pipeline state: `<target-repo>/.dr/state.json` and `.dr/events.jsonl`
- Tracked artifacts: `<target-repo>/dr/project.json`, `dr/decisions/`, `dr/tasks/`, `dr/index.html`
- Seed library: built into the MCP server
- Linear export pushes to: a Project (your manifest) + Issues (one per decision tagged `decision`, one per task) with `blocks` relations matching `depends_on`.

Begin with the resume check.
