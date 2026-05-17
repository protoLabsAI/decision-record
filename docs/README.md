# Documentation

The decision-record docs follow the [Diátaxis](https://diataxis.fr) framework — four kinds of documentation, each serving a different need.

| You want to… | Read |
|---|---|
| **Learn** by following a guided first run | [Tutorials](tutorials/) |
| **Accomplish** a specific task | [How-to guides](how-to/) |
| **Look up** facts about a flag, tool, schema | [Reference](reference/) |
| **Understand** the design — why things are the way they are | [Explanation](explanation/) |

## Start here

**Brand new?** → [Your first plan](tutorials/your-first-plan.md) (15 minutes, end-to-end).

**Already installed and want to do a thing?** → [How-to guides](how-to/).

**Need the exact spec?** → [Reference](reference/).

**Want the rationale?** → [Explanation](explanation/) — especially [why decision records](explanation/why-decision-records.md) and [design rationale](explanation/design-rationale.md).

## Index

### Tutorials
- [Your first plan](tutorials/your-first-plan.md) — run the roguelike benchmark prompt end-to-end

### How-to guides
- [Install the plugin or CLI](how-to/install.md)
- [Run the CLI](how-to/run-the-cli.md) — idea, PRD, resume
- [Configure LLM providers](how-to/configure-providers.md) — OpenAI, OpenRouter, Ollama, vLLM, LiteLLM
- [Hand off to Linear](how-to/handoff-to-linear.md)
- [Calibrate gates](how-to/calibrate-gates.md) — `poc` / `mvp` / `full` + overrides

### Reference
- [CLI](reference/cli.md) — every flag, env var, exit code
- [MCP tools](reference/mcp-tools.md) — full tool surface
- [Data model](reference/data-model.md) — entities, fields, types
- [Gates](reference/gates.md) — per-phase gate matrix

### Explanation
- [Why decision records?](explanation/why-decision-records.md) — Joel Parker Henderson's canonical material
- [Design rationale](explanation/design-rationale.md) — why filesystem, why hard gates, why lens-rotating skeptic
- [The five phases](explanation/the-five-phases.md) — what each phase does and why this shape

## Outside the docs tree

- [Repo README](../README.md) — overview, status, install summary
- [CONTRIBUTING](../CONTRIBUTING.md) — how to contribute seeds, templates, and code
- [Benchmarks](../benchmarks/) — canonical prompts we use to spot regressions
- [Schemas](../schemas/) — JSON Schema source of truth for every entity
