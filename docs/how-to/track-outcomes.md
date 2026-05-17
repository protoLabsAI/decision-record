# Track outcomes after handoff

Decision records are predictions. **Outcomes are the score.**

After a project is handed off and the team has actually built (and operated) the thing, you'll learn whether each decision held up. Record that knowledge as an `Outcome` linked to the original DR. Doing this consistently closes the feedback loop most decision-record practices leave open.

## When to record an outcome

- A success criterion is met (or missed) and you can attribute it to a specific decision.
- A constraint or assumption from a DR turned out to be wrong.
- A position you rejected came back to bite you.
- Time has passed (30 days, a quarter, end of an experiment) and you have observable data.

You can only record outcomes once `project.status === "handed-off"`. The pre-handoff phases are for planning; outcomes are post-handoff.

## Record an outcome

Use the MCP tool `dr_record_outcome`, or call the CLI in MCP mode:

```bash
# Via the MCP server (after handoff)
# Tool: dr_record_outcome
{
  "decision_id": "0001-choose-data-store",
  "observation": "After 30 days in production, p99 query latency is 290ms — within the 350ms budget set in the decision.",
  "metric": "p99 latency 290ms",
  "evidence": [
    "https://grafana.internal/d/db-latency",
    "ops/post-launch-review.md"
  ],
  "status": "validated",
  "tags": ["perf", "prod"]
}
```

Returns an outcome with id `O0001-after-30-days-in-production-p99-query-...`. The store:

- Writes `dr/outcomes/O0001-*.json`.
- Bumps `state.next_outcome_seq`.
- Appends an `outcome_recorded` event.

Re-run `dr_render` to refresh the Markdown and HTML — the outcome will appear in three places: the decision's `## Outcomes` section, its own `dr/outcomes/<id>.md`, and the `Outcomes` table on `dr/index.html`.

## Outcome statuses

| Status | Meaning |
|---|---|
| `pending` | Recorded but not yet evaluated. Useful when you want to log an early observation and update later. |
| `validated` | The decision held up. |
| `invalidated` | The decision did not hold up. The argument was wrong, or the world changed. |
| `inconclusive` | Real but ambiguous. Note this honestly — false validation is worse than `inconclusive`. |

Transitions emit an `outcome_status_changed` event with `{from, to}`. Use `dr_set_outcome_status` for these.

## Update an outcome

Use `dr_update_outcome` to patch `observation`, `metric`, `evidence`, or `tags`. Use `dr_set_outcome_status` for status changes. Both emit events so the audit trail is intact.

## Listing and reading

- `dr_list_outcomes` — optional `decision_id` filter and `status[]` filter.
- `dr_get_outcome` — fetch one by id.

## Why outcomes are separate entities

Outcomes live in `dr/outcomes/`, not inside the decision JSON. Two reasons:

1. **Decision immutability after sign-off.** Once a DR is accepted and signed off, it shouldn't be edited. Outcomes are continuous and many-per-decision; nesting them would force constant rewrites of the canonical record.
2. **Cleaner search and embedding behavior.** The decision's text is the predictive content. Outcomes are observations *about* the prediction. Keeping them separate makes the embedding cache stable.

## Anti-patterns

- **Recording only validating outcomes.** Selection bias makes the DR record useless. Note invalidations and inconclusive results.
- **One outcome per project.** Most DRs deserve their own outcome. Tying them all to a single "retrospective" outcome defeats the point of per-decision tracking.
- **Outcomes with no evidence.** "It worked" without a metric or link is barely better than no outcome. Aim for at least one URL or file ref.
