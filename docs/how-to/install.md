# Install

Two ways to use decision-record:

1. **Standalone CLI** — fast to set up, no Claude Code dependency.
2. **Claude Code plugin** — adds the `/plan` slash command and registers the MCP server with Claude Code.

Both share the same MCP server binary, the same artifacts on disk, and the same gate machine.

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
- [Configure LLM providers](configure-providers.md) — OpenAI, OpenRouter, Ollama, vLLM, LiteLLM
