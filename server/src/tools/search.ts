import { z } from "zod";
import { Store } from "../storage/store.js";
import { DecisionStatusSchema } from "../schemas/index.js";
import { fail, ok, registerTool } from "./registry.js";
import { nowIso } from "../util.js";
import {
  cosineSim,
  embed,
  getDefaultEmbedClient,
  resolveEmbedConfig,
} from "../embeddings/client.js";
import { indexDecision } from "../embeddings/index.js";

function resolveCwd(cwd: string | undefined): string {
  return cwd && cwd.length > 0 ? cwd : process.cwd();
}

export function registerSearchTools(): void {
  registerTool({
    name: "dr_search_decisions",
    description:
      "Search across decisions by semantic similarity (using cached embeddings) or by substring match when embeddings are unavailable. Used by the deciding agent to retrieve similar prior decisions before proposing a new one (read-before-write).",
    inputSchema: z.object({
      cwd: z.string().optional(),
      query: z.string().min(1).describe("Free-form text describing the topic to search."),
      limit: z.number().int().min(1).max(50).default(5),
      min_score: z
        .number()
        .min(-1)
        .max(1)
        .default(0.5)
        .describe("Minimum cosine similarity for semantic results."),
      status: z
        .array(DecisionStatusSchema)
        .default(["accepted"])
        .describe("Filter to these decision statuses."),
    }),
    async handler(input) {
      const cwd = resolveCwd(input.cwd);
      const store = new Store(cwd);
      if (!(await store.hasProject())) {
        return fail(`No project initialized at ${cwd}. Run dr_init first.`);
      }
      const decisions = await store.listDecisions();
      const filtered = decisions.filter((d) => input.status.includes(d.status));
      if (filtered.length === 0) {
        return ok({
          mode: "empty",
          results: [],
          warnings: ["No decisions match the requested status filter."],
        });
      }

      const cfg = resolveEmbedConfig();
      const cache = await store.readEmbeddings();
      const warnings: string[] = [];

      const canUseSemantic =
        cfg.enabled &&
        cache !== null &&
        cache.default_model === cfg.model &&
        Object.keys(cache.entries).length > 0;

      if (!canUseSemantic) {
        if (!cfg.enabled) {
          warnings.push("Embeddings disabled (OPENAI_EMBEDDING_MODEL=none). Falling back to substring match.");
        } else if (cache === null) {
          warnings.push("No embeddings cache found. Run dr_reindex_embeddings to populate it. Falling back to substring match.");
        } else if (cache.default_model !== cfg.model) {
          warnings.push(
            `Embedding cache model '${cache.default_model}' does not match current model '${cfg.model}'. Falling back to substring match.`
          );
        } else {
          warnings.push("Embeddings cache is empty. Falling back to substring match.");
        }
        const q = input.query.toLowerCase();
        const matches = filtered
          .map((d) => {
            const haystack = [
              d.title,
              d.summary ?? "",
              d.issue ?? "",
              d.argument ?? "",
              d.selected_position ?? "",
              d.tags.join(" "),
            ]
              .join(" ")
              .toLowerCase();
            return { d, hit: haystack.includes(q) };
          })
          .filter((r) => r.hit)
          .slice(0, input.limit)
          .map((r) => ({
            id: r.d.id,
            title: r.d.title,
            status: r.d.status,
            summary: r.d.summary,
            selected_position: r.d.selected_position,
            score: null as number | null,
          }));
        return ok({
          mode: "substring",
          results: matches,
          warnings,
        });
      }

      try {
        const client = getDefaultEmbedClient(cfg);
        const queryVec = await embed(client, cfg, input.query);
        const scored = filtered
          .map((d) => {
            const entry = cache!.entries[d.id];
            if (!entry || entry.model !== cfg.model) return null;
            const score = cosineSim(queryVec, entry.vector);
            return { d, score };
          })
          .filter((x): x is { d: typeof filtered[number]; score: number } => x !== null)
          .filter((x) => x.score >= input.min_score)
          .sort((a, b) => b.score - a.score)
          .slice(0, input.limit);

        const missing = filtered.length - Object.keys(cache!.entries).length;
        if (missing > 0) {
          warnings.push(
            `${missing} matching decision(s) have no cached embedding. Run dr_reindex_embeddings for full coverage.`
          );
        }

        return ok({
          mode: "semantic",
          model: cfg.model,
          results: scored.map((s) => ({
            id: s.d.id,
            title: s.d.title,
            status: s.d.status,
            summary: s.d.summary,
            selected_position: s.d.selected_position,
            score: s.score,
          })),
          warnings,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        warnings.push(`Embedding query failed: ${msg}. Falling back to substring match.`);
        const q = input.query.toLowerCase();
        const matches = filtered
          .filter((d) =>
            [d.title, d.summary ?? "", d.issue ?? "", d.argument ?? ""]
              .join(" ")
              .toLowerCase()
              .includes(q)
          )
          .slice(0, input.limit)
          .map((d) => ({
            id: d.id,
            title: d.title,
            status: d.status,
            summary: d.summary,
            selected_position: d.selected_position,
            score: null as number | null,
          }));
        return ok({ mode: "substring", results: matches, warnings });
      }
    },
  });

  registerTool({
    name: "dr_reindex_embeddings",
    description:
      "Re-embed all accepted decisions. Useful after switching embedding models, after a manual cache wipe, or to backfill decisions that were accepted before embeddings were enabled. Returns counts.",
    inputSchema: z.object({
      cwd: z.string().optional(),
      force: z
        .boolean()
        .default(false)
        .describe("If true, ignore cache hash check and re-embed every decision."),
    }),
    async handler(input) {
      const cwd = resolveCwd(input.cwd);
      const store = new Store(cwd);
      if (!(await store.hasProject())) {
        return fail(`No project initialized at ${cwd}. Run dr_init first.`);
      }
      const cfg = resolveEmbedConfig();
      if (!cfg.enabled) {
        return fail(
          "Embeddings disabled (OPENAI_EMBEDDING_MODEL=none). Re-enable to reindex."
        );
      }
      const decisions = await store.listDecisions();
      const accepted = decisions.filter((d) => d.status === "accepted");

      if (input.force) {
        // Wipe cache so every entry gets recomputed
        await store.writeEmbeddings({
          version: "1",
          default_model: cfg.model,
          entries: {},
        });
      } else {
        const existing = await store.readEmbeddings();
        if (existing && existing.default_model !== cfg.model) {
          // Model changed but no force flag — start fresh under the new model
          await store.writeEmbeddings({
            version: "1",
            default_model: cfg.model,
            entries: {},
          });
        } else if (!existing) {
          await store.writeEmbeddings({
            version: "1",
            default_model: cfg.model,
            entries: {},
          });
        }
      }

      let indexed = 0;
      let skipped = 0;
      let failed = 0;
      const failures: { id: string; error: string }[] = [];
      for (const d of accepted) {
        const result = await indexDecision(store, d, { config: cfg });
        if (result.status === "indexed") indexed++;
        else if (result.status === "skipped") skipped++;
        else {
          failed++;
          failures.push({ id: d.id, error: result.error });
        }
      }
      return ok({
        model: cfg.model,
        accepted_total: accepted.length,
        indexed,
        skipped,
        failed,
        failures,
        at: nowIso(),
      });
    },
  });
}
