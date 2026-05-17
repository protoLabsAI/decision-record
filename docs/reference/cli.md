# CLI reference

```
decision-record [options]
```

## Synopsis

```bash
decision-record [--idea TEXT | --prd PATH | --resume] [options]
```

## Description

Run the decision-record planning pipeline against a target project directory. By default, starts a new project from an idea string; with `--resume`, continues an existing project; with `--prd`, reads scope context from a Markdown file.

The CLI orchestrates a phase state machine (intake → scoping → deciding → decomposing → handing-off → handed-off), running LLM-driven sub-agents for the actual planning work and stopping at human sign-off gates when configured.

## Options

### Project input

| Flag | Type | Default | Description |
|---|---|---|---|
| `--idea TEXT` | string | — | Free-form one-line idea. Used to derive title + description. |
| `--title TEXT` | string | derived from `--idea` or `--prd` | Explicit project title. Max 120 chars. |
| `--description TEXT` | string | derived from `--idea` or `--prd` | Explicit project description. |
| `--prd PATH` | string | — | Markdown PRD file; first H1 used as title hint, first paragraph as description hint, full text passed to scoping agent. |

A positional argument can substitute for `--idea` if no other input flag is given.

### Pipeline behavior

| Flag | Type | Default | Description |
|---|---|---|---|
| `--cwd PATH` | string | `process.cwd()` | Target project directory. State lands under `.dr/` and `dr/`. |
| `--effort poc\|mvp\|full` | string | `mvp` | Gate strictness preset. See [Calibrate gates](../how-to/calibrate-gates.md). |
| `--resume` | flag | false | Skip intake; pick up the existing project in `--cwd`. |
| `--yes`, `-y` | flag | false | Bypass interactive checkpoints (fully autonomous). |
| `--verbose`, `-v` | flag | false | Stream agent reasoning and tool calls to stderr. |

### LLM connection

| Flag | Type | Default | Description |
|---|---|---|---|
| `--model NAME` | string | `$OPENAI_MODEL` or `gpt-4o` | OpenAI-compat model name. |
| `--api-key KEY` | string | `$OPENAI_API_KEY` | OpenAI-compat API key. |
| `--base-url URL` | string | `$OPENAI_BASE_URL` or OpenAI default | OpenAI-compat base URL (for OpenRouter, Ollama, vLLM, LiteLLM, etc.). |

### Informational

| Flag | Description |
|---|---|
| `--help`, `-h` | Print help and exit. |
| `--version` | Print version (`decision-record X.Y.Z`) and exit. |

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `OPENAI_API_KEY` | yes (unless `--api-key`) | API key for the LLM endpoint. |
| `OPENAI_BASE_URL` | no | OpenAI-compatible base URL. Defaults to OpenAI's. |
| `OPENAI_MODEL` | no | Default model. Defaults to `gpt-4o`. |
| `OPENAI_EMBEDDING_MODEL` | no | Embedding model for `dr_search_decisions` and the read-before-write retrieval. Defaults to `text-embedding-3-small`. Set to `"none"` to disable embeddings entirely; search will use substring fallback. |
| `LINEAR_API_KEY` | no | Enables the Linear handoff branch in the handoff phase. |
| `LINEAR_TEAM_ID` | no | Pre-fills the team ID prompt at Linear handoff. |
| `DR_LOG_LEVEL` | no | `debug` \| `info` \| `warn` \| `error`. Default `info`. Applies to the MCP server's stderr logs. |
| `DR_SEED_DIR` | no | Override the seed library directory. Defaults to the bundled `server/seed/`. |

## Exit codes

| Code | Meaning |
|---|---|
| `0` | Pipeline completed successfully (final phase is `handed-off`, or the user declined to advance at a checkpoint and that was a clean stop). |
| `1` | A phase failed: gate failure, agent error, validation failure, export failure. |
| `2` | Bad arguments, missing required env (`OPENAI_API_KEY`), or precondition not met (e.g., `--resume` against a directory with no project). |

## Output

- **stdout** — minimal; mostly empty until `--version` or terminal summaries.
- **stderr** — all wizard progress, agent summaries, checkpoint prompts. Pipe with `2>file` if you want to capture.

## Examples

```bash
# Minimal — uses cwd, derives title from idea
decision-record --idea "a CLI to dedupe contact lists"

# Specify everything explicitly
decision-record \
  --title "Contact deduper" \
  --description "A CLI that reads CSVs of contacts and merges fuzzy duplicates" \
  --effort mvp \
  --cwd ~/dev/dedup \
  --model gpt-4o \
  --yes

# From a PRD
decision-record --prd ./docs/idea.md --cwd ~/dev/my-project

# Resume after a break
decision-record --resume --cwd ~/dev/my-project

# Use OpenRouter
decision-record \
  --idea "…" \
  --base-url https://openrouter.ai/api/v1 \
  --model anthropic/claude-sonnet-4-6
```
