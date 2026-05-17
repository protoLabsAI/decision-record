# Quickstart

A five-minute walkthrough of taking an idea to a ship-ready MVP plan.

## Prerequisites

- Claude Code installed
- Node 20+
- (Optional) A Linear account and a personal API token if you want to push the final plan to Linear

## Install (local dev)

```bash
git clone https://github.com/protoLabsAI/decision-record.git
cd decision-record/server
npm install
npm run build
```

Then either:

- **As a Claude Code plugin** — symlink the `decision-record` directory into `~/.claude/plugins/decision-record/`, restart Claude Code, and the `/plan` command + the `decision-record` MCP server should be available.
- **As a bare MCP server** — point any MCP client at `node /path/to/decision-record/server/dist/index.js`.

## Run

In a target repository (the project you want to plan):

```
/plan a small CLI that converts QuickBooks CSV exports to a normalized ledger format
```

You'll see the `dr-wizard` agent take over. It will:

1. Confirm the title, description, and effort level (default: `mvp`).
2. Run `dr_init`, creating `.dr/` and `dr/` in your target repo.
3. Advance to scoping and start asking about MVP boundaries.

## What you'll do, in order

1. **Scope it.** Three or four bullets each for in-scope, out-of-scope, and success criteria. The wizard will push back if you're vague.
2. **Decide.** The wizard surfaces 3-6 significant decisions (language, data store, deployment, etc.), pulling from the seed library where it can. You pick a position and write a brief argument for each. The `dr-skeptic` agent will review them.
3. **Decompose.** The `dr-decomposer` agent proposes a beads-style task graph. You review, refine, and lock it.
4. **Hand off.** Push to Linear (with `LINEAR_API_KEY` and a team ID) or finalize to the filesystem.

When the wizard reports `Phase: handed-off`, you have a complete plan. Open `dr/index.html` to see it rendered.

## What you get

In your target repo:

```
.dr/
├── state.json           # pipeline state
└── events.jsonl         # audit log
dr/
├── project.json         # the MVP manifest
├── project.md           # human-readable view
├── decisions/
│   ├── 0001-*.json
│   └── 0001-*.md
├── tasks/
│   ├── T0001-*.json
│   └── T0001-*.md
└── index.html           # rendered project overview
```

If you handed off to Linear, you also get:

- A Linear Project named after your manifest
- An Issue per decision (labeled `decision`)
- An Issue per task (with priority, estimate, and labels)
- `blocks` relations matching task dependencies

## Common follow-ups

- **Re-render after manual edits to JSON:** run the wizard again (`/plan`) and ask it to call `dr_render`.
- **Resume an interrupted session:** just run `/plan` again. The wizard's first action is `dr_status`, which picks up where you left off.
- **Loosen / tighten gates:** the wizard understands `gate_overrides` — ask it to "change `min_tasks` to 5" or similar.
- **Add a new seed:** drop a JSON file in `server/seed/` following the shape of the existing entries; the wizard will find it on next search.
