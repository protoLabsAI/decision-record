# Install

Three ways to use decision-record:

1. **Standalone CLI** — fast to set up, no agent dependency.
2. **Claude Code plugin** — adds the `/plan` slash command and registers the MCP server with Claude Code.
3. **OpenCode** — installs the full pipeline (agents, commands, MCP server) into any existing repository.

All three share the same MCP server binary, the same artifacts on disk, and the same gate machine.

## Standalone CLI

```bash
git clone https://github.com/protoLabsAI/decision-record.git
cd decision-record/server
npm install
npm run build
```

The build produces `dist/cli.js` (CLI) and `dist/index.js` (MCP server). Run the CLI directly:

```bash
export OPENAI_API_KEY=sk-…
node dist/cli.js --help
```

Optionally, symlink it onto your PATH:

```bash
ln -s "$(pwd)/dist/cli.js" /usr/local/bin/decision-record
chmod +x /usr/local/bin/decision-record
decision-record --help
```

A published-to-npm release is on the roadmap — once shipped, `npx @protolabs/decision-record-server` will work without the clone.

## Claude Code plugin

The repo root contains a `.claude-plugin/plugin.json` and an `.mcp.json` that point Claude Code at the bundled server. To install locally:

```bash
git clone https://github.com/protoLabsAI/decision-record.git
cd decision-record/server
npm install
npm run build
cd ..

# Symlink into the Claude plugins directory
ln -s "$(pwd)" ~/.claude/plugins/decision-record
```

Restart Claude Code. You should see:

- The `/plan` slash command available
- The `decision-record` MCP server listed in `/mcp`
- The `dr-wizard`, `dr-skeptic`, `dr-decomposer` sub-agents available

Trigger a session:

```
/plan a CLI tool that converts QuickBooks CSV exports
```

A marketplace-published version is planned. When available, `/plugin install decision-record` will do everything above.

## OpenCode

[OpenCode](https://opencode.ai) is an open-source AI coding agent. The `setup-opencode.sh` script installs the entire decision-record pipeline — config, agents, commands, and MCP server — into any existing project in one step.

### Quick install

From the decision-record repo:

```bash
./setup-opencode.sh /path/to/your/project
```

Or from within your target project:

```bash
# Copy the script and run it
/path/to/decision-record/setup-opencode.sh
```

### What the script does

1. Validates prerequisites (Node ≥ 20, npm, opencode)
2. Copies `opencode.json` (MCP server registration, agent definitions, `/plan` command)
3. Copies `.opencode/agents/` — dr-wizard (primary), dr-skeptic (subagent), dr-decomposer (subagent)
4. Copies `.opencode/commands/plan.md` — the `/plan` slash command
5. Copies the MCP server source into `server/`
6. Installs dependencies and builds the MCP server
7. Validates the opencode configuration
8. Runs a smoke test against the MCP server

### After installation

```bash
cd /path/to/your/project
opencode
```

Then use `/plan` to start the pipeline, or run directly:

```bash
opencode run --model opencode-go/kimi-k2.5 'Run /plan: Build a todo app'
```

### Manual installation

If you prefer to install manually, copy these files into your project root:

```
your-project/
├── opencode.json           # MCP + agents + command config
└── .opencode/
    ├── agents/
    │   ├── dr-wizard.md    # Primary orchestrator
    │   ├── dr-skeptic.md   # Decision review subagent
    │   └── dr-decomposer.md # Task decomposition subagent
    └── commands/
        └── plan.md         # /plan command
```

Then build the MCP server:

```bash
# Copy server/ from decision-record into your project
cp -r /path/to/decision-record/server /path/to/your-project/
cd /path/to/your-project/server
npm install
npm run build
```

## Verify

```bash
# Standalone
node dist/cli.js --version
# decision-record 0.1.0

# Plugin (inside Claude Code)
/mcp
# should list `decision-record` with green status
```

## Next

- [Run the CLI](run-the-cli.md) — first invocation patterns
- [Install with OpenCode](#opencode) — one-step install into any project
- [Configure LLM providers](configure-providers.md) — OpenAI, OpenRouter, Ollama, vLLM, LiteLLM
