# @protolabs/decision-record-server

MCP server that powers the decision-record planning pipeline. Speaks the Model Context Protocol over stdio.

## Tool surface

| Group | Tools |
| --- | --- |
| Pipeline | `dr_init`, `dr_status`, `dr_advance` |
| Decisions | `dr_propose_decision`, `dr_update_decision`, `dr_review_decision`, `dr_accept_decision`, `dr_list_decisions`, `dr_ready_decisions` |
| Tasks | `dr_propose_task`, `dr_update_task`, `dr_ready_tasks`, `dr_validate_graph` |
| Seed library | `dr_seed_search`, `dr_seed_load` |
| Render | `dr_render` |
| Handoff | `dr_export_filesystem`, `dr_export_linear` |

## State

State and artifacts live in the **target repo's working directory**, not here. The server is stateless aside from its in-flight handling — restart safe.

```
<target-repo>/
├── .dr/                 # internal/derived (gitignored)
│   ├── state.json
│   ├── events.jsonl
│   └── cache/
└── dr/                  # tracked
    ├── project.json
    ├── decisions/
    ├── tasks/
    └── index.html
```

The target directory is selected per-call: every tool accepts a `cwd` argument, falling back to `process.cwd()` if omitted.

## Build & run

```bash
npm install
npm run build
node dist/index.js     # speaks MCP on stdio
```

## Development

```bash
npm run dev            # tsx watch
npm run typecheck      # tsc --noEmit
```

## Configuration

Environment variables (all optional):

- `DR_LINEAR_MCP_URL` — URL of the official Linear MCP. Defaults to `https://mcp.linear.app/mcp`.
- `DR_DEFAULT_EFFORT` — `poc` | `mvp` | `full`. Default `mvp`.
- `DR_LOG_LEVEL` — `debug` | `info` | `warn` | `error`. Default `info`.

## Schemas

See [`../schemas/`](../schemas/) for the JSON Schema source of truth. Zod mirrors live in [`src/schemas/`](src/schemas/).
