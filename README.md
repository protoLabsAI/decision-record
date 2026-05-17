# decision-record

> An idea-to-MVP planning pipeline. Drives complex engineering work — code and architecture — through hard-gated phases that won't release a "ship-ready" plan until every decision is accepted and every task is decomposed.

This repository is a Claude Code plugin + bundled MCP server. It runs inside a fresh or template repo, partners with a human and an AI agent, and produces an executable MVP plan: a scoped manifest, a set of accepted decision records, and a dependency-aware task graph. Output goes to Linear (primary) or stays as filesystem artifacts (fallback).

This project is a derivative of [Joel Parker Henderson's canonical decision-record repo](https://github.com/joelparkerhenderson/decision-record). The canonical explanation of what a DR is and why it matters is preserved at [`docs/upstream-canon.md`](docs/upstream-canon.md). What this fork adds is **enforcement**: workflows, tools, and a state machine that make DRs a non-skippable part of planning with an agentic system.

## What you get

- **A pipeline.** Intake → MVP-Scope → Decisions → Task Graph → Handoff. Each phase is a hard gate; nothing advances until its gate passes.
- **A dynamic wizard.** The agent reads current state and decides the next question — no rigid form. It draws from a seed library of common decisions (language, runtime, auth, data store, etc.) when the territory is familiar.
- **Antagonistic review.** Each gate gets reviewed by skeptical lenses (operational + strategic) before progressing.
- **A living, machine-readable artifact set.** JSON per record, append-only event log, Markdown views, and a static HTML index. Future-proofed for a richer UI.
- **Handoff to where work actually happens.** Push the completed plan to Linear, or stop at the filesystem.
- **Per-project calibration.** Quick POC, MVP, and Full tiers — pick the gate strictness that matches the work. The system won't make you write SWOT analyses for a weekend hack.

## Status

Active development — first usable cut is in. The pipeline is functional end-to-end (intake → scope → decisions → tasks → handoff to filesystem or Linear). See [`docs/quickstart.md`](docs/quickstart.md) for the five-minute walkthrough, [`docs/usage.md`](docs/usage.md) for the full interaction model, and [`docs/architecture.md`](docs/architecture.md) for the data model.

## How it's structured

```
decision-record/
├── .claude-plugin/         # Claude Code plugin manifest
├── commands/               # /plan slash command (entry point)
├── agents/                 # dr-wizard, dr-skeptic, dr-decomposer
├── server/                 # MCP server (TypeScript, @modelcontextprotocol/sdk)
├── schemas/                # JSON Schemas — project, decision, task, state, event
├── templates/              # DR template variants (canonical, scoping, vendor, ...)
├── seed/                   # Prefilled common decisions agent can pull
└── docs/                   # Usage + architecture + upstream canon
```

## Working artifacts in a target repo

When you run the wizard against a target repository, it writes:

```
your-project/
├── .dr/                    # internal/derived (gitignored by default)
│   ├── state.json          # current phase, gate config, sign-offs
│   └── events.jsonl        # append-only audit log
└── dr/                     # tracked, human-readable
    ├── project.json        # MVP manifest: scope, gate level, status
    ├── decisions/          # one JSON + rendered Markdown per DR
    ├── tasks/              # one JSON + rendered Markdown per task
    └── index.html          # rendered project overview
```

## Install

```bash
git clone https://github.com/protoLabsAI/decision-record.git
cd decision-record/server
npm install
npm run build
```

Then either link as a Claude Code plugin (symlink the repo into `~/.claude/plugins/decision-record/`) or run the MCP server standalone via `node /path/to/decision-record/server/dist/index.js`. Full instructions: [`docs/quickstart.md`](docs/quickstart.md).

(A published marketplace release is on the roadmap.)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Issues and pull requests welcome.

## Acknowledgments

The conceptual core — what a decision record is, the canonical template structure, the teamwork model around DRs — is the work of [Joel Parker Henderson](https://joelparkerhenderson.com). See [`docs/upstream-canon.md`](docs/upstream-canon.md) for the preserved canonical material, and [CITATION.cff](CITATION.cff) for citation metadata.

## License

[MIT](LICENSE) — for the code, schemas, and tooling in this repository. The preserved canonical content in `docs/upstream-canon.md` and the canonical template at `templates/canonical.md` derive from upstream and should be attributed to Joel Parker Henderson per CITATION.cff.
