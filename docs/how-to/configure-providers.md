# Configure LLM providers

The CLI uses the **OpenAI-compatible** API surface. Anything that speaks that protocol works — OpenAI itself, OpenRouter, Ollama, vLLM, LiteLLM, etc.

## OpenAI (the default)

```bash
export OPENAI_API_KEY=sk-…
decision-record --idea "…"
```

Default model: `gpt-4o`. Override per-call:

```bash
decision-record --idea "…" --model gpt-4o-mini
```

Or persistently:

```bash
export OPENAI_MODEL=gpt-4o-mini
```

## OpenRouter

[OpenRouter](https://openrouter.ai/) proxies many providers behind a single OpenAI-compatible endpoint.

```bash
export OPENAI_API_KEY=sk-or-…
export OPENAI_BASE_URL=https://openrouter.ai/api/v1
export OPENAI_MODEL=anthropic/claude-sonnet-4-6
decision-record --idea "…"
```

## Ollama (local)

[Ollama](https://ollama.com/) serves an OpenAI-compatible endpoint on `:11434`.

```bash
ollama pull llama3.1:70b      # one time
ollama serve                  # if not already running
```

```bash
export OPENAI_API_KEY=ollama   # any non-empty string works
export OPENAI_BASE_URL=http://localhost:11434/v1
export OPENAI_MODEL=llama3.1:70b
decision-record --idea "…"
```

> **Tool calling matters.** The agents rely on the model emitting tool calls. Verify your local model supports OpenAI-style function calling before running a full pipeline. Smaller models often struggle here.

## vLLM (self-hosted)

[vLLM](https://github.com/vllm-project/vllm) exposes an OpenAI-compatible server.

```bash
python -m vllm.entrypoints.openai.api_server \
  --model meta-llama/Llama-3.1-70B-Instruct \
  --port 8000
```

```bash
export OPENAI_API_KEY=any-string
export OPENAI_BASE_URL=http://localhost:8000/v1
export OPENAI_MODEL=meta-llama/Llama-3.1-70B-Instruct
```

## LiteLLM proxy

[LiteLLM](https://github.com/BerriAI/litellm) is a universal proxy that converts many providers to OpenAI format. Once running:

```bash
export OPENAI_API_KEY=sk-litellm-…
export OPENAI_BASE_URL=http://localhost:4000/v1
export OPENAI_MODEL=gpt-4o  # the alias you defined in litellm config
```

## Per-invocation overrides

All env vars have CLI equivalents that take precedence:

```bash
decision-record \
  --api-key sk-… \
  --base-url https://openrouter.ai/api/v1 \
  --model anthropic/claude-opus-4-7 \
  --idea "…"
```

## Choosing a model

The agents do a lot of tool calling and structured reasoning. Models that work well:

| Model | Notes |
|---|---|
| `gpt-4o` | Default; reliable tool calling, good reasoning |
| `gpt-4o-mini` | Faster and cheaper; works for `poc` and many `mvp` projects |
| Claude Sonnet 4.6 via OpenRouter | Strong on long-form reasoning and skeptic critique |
| Claude Opus 4.7 via OpenRouter | Highest-quality decisions and decompositions; slower and pricier |
| Local Llama 3.1 70B+ | Workable if your tooling supports function calling; weaker on subtle critique |

Pick based on the project's criticality. POC throwaway → `gpt-4o-mini`. Production decision that other people will read → `gpt-4o` or Sonnet/Opus.
