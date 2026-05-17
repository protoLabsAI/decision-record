# Hand off to Linear

When the pipeline reaches the handoff phase, the wizard can push the finished plan into Linear — a Project containing one Issue per task and one Issue (labeled `decision`) per accepted DR, with `blocks` relations matching task dependencies.

## One-time setup

1. **Get a Linear API key.**
   Settings → API → Personal API keys → "New". Copy the `lin_api_…` value.

2. **Find your team ID.**
   Two easy ways:
   - In Linear, open any issue → look at the URL: `linear.app/<workspace>/issue/<TEAM-N>` — the `TEAM` prefix is the team key, not the ID. To get the UUID, use the GraphQL explorer at <https://studio.apollographql.com/public/Linear-API/> or [`linear teams`](https://linear.app/docs/cli) in their CLI.
   - Or: `curl -H 'Authorization: lin_api_…' -X POST https://api.linear.app/graphql -d '{"query":"{ teams { nodes { id name key } } }"}'`

3. **Set env vars:**
   ```bash
   export LINEAR_API_KEY=lin_api_…
   export LINEAR_TEAM_ID=<the UUID>   # optional; you'll be prompted otherwise
   ```

## Run with handoff to Linear

```bash
decision-record --idea "…" --cwd ~/dev/my-project
```

When the wizard reaches the handoff phase, you'll see:

```
> LINEAR_API_KEY detected. Push the plan to Linear? [Y/n]
```

Answer yes. The wizard will:

1. Run a **dry-run preview** — building the export plan locally without calling Linear.
2. Show you the totals: `N issues (M decisions + K tasks)`.
3. Ask **"Push to Linear now?"** Confirm to fire the real export.

If you ran with `--yes`, both prompts auto-confirm.

## What gets created

| In decision-record | In Linear |
|---|---|
| Project manifest (`project.json`) | A new **Project** with the MVP manifest as the description |
| Each accepted Decision | An **Issue** labeled `decision` + `dr:<variant>`, with the issue/argument/implications in the description |
| Each Task | An **Issue** with priority + estimate + acceptance criteria as checkboxes |
| Task `depends_on` relations | Linear `blocks` issue relations |
| `LINEAR_TEAM_ID` | The team the Project and Issues are created in |

After the export succeeds:

- `dr/project.json` gets a `handoff` block recording the Linear project URL.
- Each task's JSON gets an `external_ref: { system: "linear", id, url }` for traceability.
- `dr/index.html` shows a Handoff banner linking to Linear.

## Preview without pushing

To see the export plan without calling Linear at all, the wizard's interactive prompt offers preview-first by default. If you want to script a preview only, invoke the MCP tool directly:

```bash
node dist/index.js   # start the MCP server, then call dr_export_linear with dry_run=true
```

Or just run with `--yes` and watch the dry-run output before answering the confirm prompt (when not in autonomous mode).

## Filesystem only

If `LINEAR_API_KEY` is **not** set in the environment, the wizard skips the Linear branch entirely and exports to filesystem. The plan is still complete and shippable — engineers can pick it up from `dr/` directly and create issues themselves wherever they want.

## When it fails partway

The current Linear export is one-shot, not idempotent. If a `dr_export_linear` call fails after creating some issues:

1. The wizard logs `export_failed` to `events.jsonl` and exits with code 1.
2. **No reconciliation logic** — the partial Linear project exists, but a re-run will create a fresh project alongside it.
3. Delete the partial project in Linear, then re-run with `--resume`.

A reconciliation pass that detects and continues partial exports is a known follow-up.

## Other handoff targets

The data model is target-agnostic. To support Plane, GitHub Projects, Jira, etc., follow the pattern in `server/src/handoff/linear.ts` — a `buildExportPlan` function plus per-target API calls. PRs welcome.
