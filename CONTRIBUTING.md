# Contributing

Thank you for considering a contribution. This project is an early-stage Claude Code plugin + MCP server that turns ideas into ship-ready MVP plans through a hard-gated decision-record pipeline.

## Ways to contribute

- **Bug reports and feature requests.** Open an issue describing the behavior you saw, the behavior you expected, and any minimum reproduction.
- **Seed-library additions.** If you've shipped a project that made a non-obvious decision well, contribute it back as a seed entry under [`seed/`](seed/). The agent will get smarter for everyone.
- **Template variants.** New DR variants (under [`templates/`](templates/)) — scoping, vendor, data-model, lightweight, etc. — are useful when an existing variant doesn't fit a real decision you encountered.
- **Renderer / UI improvements.** The static HTML index ([`server/src/render/`](server/)) is intentionally minimal; richer renderings welcome.
- **Linear / handoff integrations.** Better mappings between our manifest and Linear's data model, or new handoff targets (Plane, GitHub Projects, Jira).
- **Documentation.** Real-world examples and case studies under `docs/`.

## Workflow

1. Fork the repo.
2. Create a branch.
3. Make the change, including tests where applicable.
4. Open a pull request describing **why** the change is needed and **what** trade-offs you considered.

## Scope discipline

This repo is the planning system itself. We deliberately stop at the handoff — once a plan is exported to Linear or finalized as filesystem artifacts, post-MVP execution belongs to wherever the engineering team works. Please don't propose ongoing project-management features (status sync, cycle tracking, retros) that overlap with execution tools.

## Attribution

The conceptual core derives from Joel Parker Henderson's [canonical decision-record repo](https://github.com/joelparkerhenderson/decision-record). Preserve attribution to upstream in any rework of `docs/upstream-canon.md` or `templates/canonical.md`.

## License

By contributing, you agree that your contributions will be licensed under the project's [MIT License](LICENSE).
