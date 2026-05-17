# Your first plan

By the end of this tutorial you will have used decision-record to turn a one-line idea into a complete, scoped, decision-backed, task-decomposed MVP plan — and you will have looked at every artifact the system produces. This takes about 15 minutes.

We will use the **roguelike-ai-poc** benchmark idea — a small but real planning problem — so you can see the system handle something other than `hello world`.

## Before you start

You need:

1. **Node 20 or later** installed (`node --version` should print `v20.x` or higher).
2. **An OpenAI-compatible API key.** This can be:
   - An OpenAI API key (`OPENAI_API_KEY=sk-…`), or
   - Any compatible endpoint — set `OPENAI_BASE_URL` and `OPENAI_MODEL`. See [Configure LLM providers](../how-to/configure-providers.md).
3. **The repo cloned and built:**
   ```bash
   git clone https://github.com/protoLabsAI/decision-record.git
   cd decision-record/server
   npm install
   npm run build
   ```

You do **not** need the Claude Code plugin installed for this tutorial. We will run the CLI directly.

## Step 1: Pick a working directory

The system writes artifacts into a target project directory. We will create a fresh one:

```bash
mkdir -p ~/dev/my-first-plan
```

Everything that follows lands in there. Nothing is written into the decision-record repo itself.

## Step 2: Run the CLI

From the `decision-record/server/` directory:

```bash
export OPENAI_API_KEY=sk-…   # if you haven't already

node dist/cli.js \
  --idea "a CLI tool that converts QuickBooks CSV exports into a normalized double-entry ledger" \
  --effort poc \
  --cwd ~/dev/my-first-plan
```

You can also drop the `--idea` flag entirely and run interactively — but for a guided first run, this is cleaner.

## Step 3: Watch the wizard work

The CLI will print colored progress to stderr as each phase runs. You will see something like:

```
━━━ decision-record v0.1.0 ━━━
  Target: /Users/you/dev/my-first-plan
  Model: gpt-4o
━━━ Phase: Intake ━━━
✓ Initialized 'a-cli-tool-that-converts-quickbooks-csv-export…' at effort_level=poc
✓ Advanced: intake → scoping
━━━ Phase: Scoping ━━━
  Running scoping agent…
✓ Scoping agent finished (3 tool calls).
────────────────────────────────────────────────────────────
Scope set. in_scope: read QuickBooks CSV, parse rows…
…
────────────────────────────────────────────────────────────
✓ Advanced: scoping → deciding
━━━ Phase: Deciding ━━━
  Running deciding agent (proposing decisions)…
…
━━━ Antagonistic review: 4 decisions × 5 lenses ━━━
  operational: pass (4/5)
  strategic: pass (4/5)
…
✓ Accepted 0001-…
…
━━━ Phase: Decomposing ━━━
  Running decomposer agent (building task graph)…
✓ Decomposer finished (28 tool calls). Graph validates.
…
━━━ Phase: Handoff ━━━
✓ Artifacts rendered.
> LINEAR_API_KEY detected. Push the plan to Linear? [Y/n] [auto-yes]
✓ Plan finalized to filesystem.
✓ Pipeline complete. Final phase: handed-off
```

Each phase shows what it did. Read the summaries — they tell you what the agent decided.

> **About checkpoints:** Under the `poc` preset, only the **handoff** transition requires human sign-off. Because you passed `--yes`, the wizard auto-confirms; without it, you would be prompted before each gate that needs sign-off. See [Calibrate gates](../how-to/calibrate-gates.md) for the difference between `poc`, `mvp`, and `full`.

## Step 4: Look at what got produced

```bash
ls ~/dev/my-first-plan/dr/
```

You should see:

```
project.json     # the MVP manifest — scope, status, sign-offs
project.md       # human-readable view of project.json
decisions/       # one .json + .md per decision
tasks/           # one .json + .md per task
index.html       # rendered overview — open in a browser
```

Open `~/dev/my-first-plan/dr/index.html` in a browser. You will see the full plan: scope, decisions with their selected positions, and the task graph.

```bash
open ~/dev/my-first-plan/dr/index.html   # macOS
xdg-open ~/dev/my-first-plan/dr/index.html  # Linux
```

## Step 5: Inspect a decision

Pick one. For example:

```bash
cat ~/dev/my-first-plan/dr/decisions/0001-*.md
```

You will see the full record: issue, positions considered, the selected position, the argument for why it won, the implications, and five lens reviews from the skeptic.

```bash
cat ~/dev/my-first-plan/dr/decisions/0001-*.json | jq .
```

Same content, machine-readable.

## Step 6: Inspect a task

```bash
cat ~/dev/my-first-plan/dr/tasks/T0001-*.md
```

Tasks have: title, description, acceptance criteria (as a checkbox list), estimate, dependencies, and the decisions they implement (`decision_refs`). A developer can pick up T0001 and ship it.

## Step 7: Look at the audit log

```bash
tail ~/dev/my-first-plan/.dr/events.jsonl | jq .
```

Every action the wizard took — phase advances, decisions proposed, reviews completed, tasks created, exports — is recorded as one JSON line. This is your replay log; it never gets rewritten.

## You are done

You ran a complete planning pipeline end-to-end. From a one-line idea you produced:

- A scoped MVP manifest with success criteria and explicit non-goals
- A set of accepted decisions, each with reviewed rationale
- A dependency-aware task graph linked back to those decisions
- Rendered Markdown and HTML for human review
- An immutable event log

## Next steps

- **Hand off to Linear instead of filesystem** — [How-to: Hand off to Linear](../how-to/handoff-to-linear.md)
- **Run with a PRD instead of a one-liner** — [How-to: Run the CLI](../how-to/run-the-cli.md)
- **Use a different model** — [How-to: Configure LLM providers](../how-to/configure-providers.md)
- **Understand what just happened** — [Explanation: The five phases](../explanation/the-five-phases.md) and [Design rationale](../explanation/design-rationale.md)
- **Look up a specific flag** — [Reference: CLI](../reference/cli.md)
