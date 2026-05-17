# Search decisions semantically

Once decisions accumulate, you'll want to ask "have we decided something like this before?" — across projects in the same repo, or across many DRs in one project. `dr_search_decisions` answers that question with vector embeddings (when available) and substring matching (when not).

This is the same tool the deciding agent uses for **read-before-write** retrieval — before proposing a new decision, it checks whether the project already has a similar accepted one, and cites it via `related_decisions` instead of re-litigating.

## How it works

On every `dr_accept_decision` (and on `dr_update_decision` when the result is `accepted`), the server:

1. Builds an embedding text from the decision's title, summary, issue, argument, selected position, position titles, implications, and tags.
2. Hashes that text. If the hash + model are already in the cache for this decision, no API call.
3. Otherwise, calls the embedding endpoint configured via `OPENAI_EMBEDDING_MODEL` (defaults to `text-embedding-3-small`).
4. Writes the resulting vector to `.dr/cache/embeddings.json`.

`dr_search_decisions` embeds the query, computes cosine similarity against every cached vector, filters by status and `min_score`, sorts descending, and returns the top `limit`.

## Configuration

```bash
# Default — uses text-embedding-3-small
unset OPENAI_EMBEDDING_MODEL

# Use a larger model
export OPENAI_EMBEDDING_MODEL=text-embedding-3-large

# Disable embeddings entirely — search falls back to substring
export OPENAI_EMBEDDING_MODEL=none
```

`OPENAI_API_KEY` and `OPENAI_BASE_URL` are reused from the main LLM config. If you're running against a non-OpenAI provider that doesn't implement the embeddings endpoint, set `OPENAI_EMBEDDING_MODEL=none` to avoid noisy `embeddings_index_failed` events.

## Search

```jsonc
// Tool: dr_search_decisions
{
  "query": "primary data store",
  "limit": 5,            // top-N to return; default 5
  "min_score": 0.5,      // semantic cosine threshold; default 0.5
  "status": ["accepted"] // which decision statuses to consider
}
```

Returns one of three modes:

| Mode | When | Behavior |
|---|---|---|
| `semantic` | Embeddings enabled, cache populated, cache model matches `OPENAI_EMBEDDING_MODEL` | Cosine-ranked, scored, filtered by `min_score`. |
| `substring` | Embeddings disabled, cache missing, or cache model mismatched | Case-insensitive substring match across title/summary/issue/argument/selected_position/tags. Returns `score: null`. |
| `empty` | No decisions match the status filter | Empty `results[]`. |

`warnings[]` always explains the cache state when something degrades the search quality. Surface these to humans so they know whether to trust the result or rebuild the index.

## Reindex

After switching models, after a manual cache wipe, or to backfill decisions that were accepted before embeddings were enabled:

```jsonc
// Tool: dr_reindex_embeddings
{ "force": false }   // when true, wipes the cache and re-embeds every accepted DR
```

Returns counts: `{ accepted_total, indexed, skipped, failed, failures, model }`. When `OPENAI_EMBEDDING_MODEL=none`, this fails fast — re-enable embeddings to reindex.

## Read-before-write (the deciding agent's contract)

When the deciding agent identifies a prospective decision topic, it calls `dr_search_decisions` *before* `dr_propose_decision`. The agent's contract:

- If a similar **accepted** decision exists with score ≥ 0.85 and the context is transferable, do NOT propose a new DR. Cite the prior decision via `related_decisions`.
- If a similar one exists but the new context still warrants a new DR, propose anyway and cite the prior via `related_decisions`.
- Surface every score ≥ 0.85 hit in the final summary so reviewers can sanity-check the call.

This is operationalized in `server/src/cli/agents/deciding.ts`. The 0.85 threshold is a heuristic — adjust it in the prompt for noisier embedding setups.

## Cache hygiene

- The cache lives at `.dr/cache/embeddings.json` and is gitignored. It's derived state, regenerable from the accepted decisions.
- On model change (`OPENAI_EMBEDDING_MODEL` differs from the cache's `default_model`), the next reindex wipes and rebuilds.
- The hash check makes accepting an already-accepted decision cheap — same content + same model = cache hit, no API call.

## When semantic search isn't enough

For now, `dr_search_decisions` searches inside one project's `.dr/cache/embeddings.json`. Cross-project search (a shared `~/.dr-cache/`) is on the roadmap but out of scope for the current release. If you need it today, scrape `dr/decisions/*.json` from each repo and feed them to an external vector store.
