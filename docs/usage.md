# Usage

A walk-through of how an `idea → ship-ready MVP plan` session goes with this plugin.

## Setup

### Install the plugin (when published)

```bash
# In Claude Code
/plugin install decision-record
```

Until the plugin lands in a marketplace, you can use it locally:

```bash
git clone https://github.com/protoLabsAI/decision-record.git
cd decision-record/server
npm install
npm run build
```

Then point Claude Code at the local plugin (settings → plugins, or symlink into `~/.claude/plugins/`).

### Optional: configure Linear handoff

If you want to push the final plan to Linear, set a personal API token in the environment of whichever shell launches the MCP server:

```bash
export LINEAR_API_KEY=lin_api_xxx
```

You'll pass your Linear team ID per-export at handoff time. Find it in Linear (Settings → API → Personal API keys; team IDs visible in the GraphQL explorer or team URL).

Without Linear, everything still works — the plugin will hand off to the filesystem.

## Running the pipeline

In a target repository (fresh or template), open Claude Code and run:

```
/plan
```

Optionally pass a one-line idea:

```
/plan a CLI tool that converts CSV exports from QuickBooks into a normalized ledger format
```

The `dr-wizard` agent runs. It reads pipeline state from `.dr/state.json` (or initializes if missing) and drives forward one phase at a time.

## The five phases

### 1. Intake

The wizard captures the raw idea: a title, a one-paragraph description, and an effort level.

- **POC** — single-day spike. Light gates: ≥3 tasks, no required reviews, only the handoff requires human sign-off.
- **MVP** (default) — a few weeks of work. Gates: scope and decomposing reviewed, ≥3 decisions, ≥8 tasks, ≤8h per leaf task.
- **Full** — production-quality. Every gate reviewed, every DR reviewed individually, ≥6 decisions, ≥15 tasks, ≤4h per leaf task.

You can override individual knobs at init or via `dr_update_project` — see [architecture.md#gate-configuration](architecture.md#gate-configuration).

### 2. Scoping

The most important phase, often skipped to everyone's regret. The wizard pushes you to commit to:

- **In scope** — what the MVP MUST do.
- **Out of scope** — what it explicitly WON'T do.
- **Success criteria** — measurable signals it worked.
- **Nice to have** — optional capabilities (won't block ship).

In MVP and Full presets, the wizard also instantiates a `scope-statement` DR — a formal decision record about the scope choice (lean MVP vs walking-skeleton vs polished). The DR gets a human sign-off before advancing.

### 3. Deciding

The wizard surfaces *which decisions need to be made* for this project. It uses two signals:

- **Seed library** — common decisions (language, runtime, auth, data store, CI/CD, etc.). The wizard searches with `dr_seed_search`, finds matches, and instantiates them with `dr_seed_load`.
- **Project-specific decisions** — anything the seed library doesn't cover gets proposed fresh.

For each decision, the wizard asks one question at a time, drives you to pick a position, write a brief argument, and (in MVP/Full presets) requests an antagonistic review from `dr-skeptic` before acceptance.

Decisions can depend on each other (e.g., "runtime target" depends on "language choice"). The wizard calls `dr_ready_decisions` to find what's unblocked next.

You leave this phase when every significant decision is `accepted` (or explicitly `rejected`), and the wizard advances with your sign-off.

### 4. Decomposing

The wizard delegates to `dr-decomposer`, which:

1. Reads the project, scope, and accepted DRs.
2. Proposes a beads-style task graph — tasks with titles, descriptions, acceptance criteria, estimates, dependencies, and `decision_refs` linking back to the DRs they implement.
3. Calls `dr_validate_graph` to confirm: no cycles, no orphan deps, no oversized estimates, every `decision_refs` resolves.

You then review with the wizard: split tasks that are too big, merge tasks that are too small, fix anything missing. When the graph is clean, advance with your sign-off.

### 5. Handing off

The wizard renders the artifacts (`dr_render` regenerates Markdown + the static `index.html`) and asks where to hand off:

**Linear (preferred)** — provide your team ID. The wizard:
- First runs `dr_export_linear { dry_run: true }` to show you the plan.
- On your confirm, runs without dry_run: creates a Linear Project, an Issue per decision (labeled `decision`), an Issue per task, and `blocks` relations matching `depends_on`.
- Updates each task's `external_ref` so the local file knows the Linear identifier.

**Filesystem only** — `dr_export_filesystem` finalizes the plan in place. The team picks up where they want.

The project transitions to `handed-off`. The plugin's work is done; ongoing project management lives wherever you want.

## Resuming an in-progress project

Just run `/plan` again. The wizard's first move is `dr_status`, which discovers the existing project and jumps to the right phase. The state in `.dr/` is durable across sessions — restart-safe, agent-restart safe, machine-reboot safe.

## Inspecting state

```bash
# Read project
cat dr/project.json | jq

# Read events (everything that's happened)
tail -f .dr/events.jsonl | jq

# Re-render artifacts
# (in Claude Code:)
# Use the dr_render MCP tool, or just run /plan and let the wizard refresh.

# Open the rendered index
open dr/index.html
```

## Common situations

**"The wizard wants me to write more decisions, but my project is simple."**
You're probably running with the wrong effort level. Re-init with `effort_level: 'poc'`, or override `min_decisions` via `dr_update_project`'s `gate_overrides`.

**"`dr_advance` keeps failing with vague reasons."**
The wizard returns the gate failures verbatim. Read them. They name the specific knob and the specific shortfall.

**"I want to change my mind about a decision after acceptance."**
You can re-open a decision by marking it `superseded` and pointing it at a new DR. The old DR stays on file (immutability matters); the new one carries the current state.

**"My Linear export failed partway."**
Linear creates issues incrementally — partial state may exist. Either delete the partial project in Linear and re-run, or fix the underlying issue and call `dr_export_linear` again (Note: the current implementation doesn't reconcile — a fresh export creates a fresh project. PR welcome.).
