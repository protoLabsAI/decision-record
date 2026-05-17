import { z } from "zod";
import { Store } from "../storage/store.js";
import {
  Decision,
  DecisionIdSchema,
  DecisionSchema,
} from "../schemas/index.js";
import { fail, ok, registerTool } from "./registry.js";
import { decisionId, nowIso, slugify } from "../util.js";
import { getSeed, listSeeds, scoreSeed } from "../seed/index.js";

function resolveCwd(cwd: string | undefined): string {
  return cwd && cwd.length > 0 ? cwd : process.cwd();
}

export function registerSeedTools(): void {
  registerTool({
    name: "dr_seed_search",
    description:
      "Search the seed library for decisions relevant to a query. Returns ranked matches. Use this when starting work in a new project to find common decisions worth pulling.",
    inputSchema: z.object({
      query: z.string().describe("Free-text query. Matches on name, title, keywords, tags."),
      limit: z.number().int().min(1).max(20).default(5),
    }),
    async handler(input) {
      const seeds = await listSeeds();
      const ranked = seeds
        .map((s) => ({ seed: s, score: scoreSeed(s, input.query) }))
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, input.limit);
      return ok({
        results: ranked.map(({ seed, score }) => ({
          name: seed.name,
          title: seed.title,
          template_variant: seed.template_variant,
          description: seed.description,
          tags: seed.tags,
          score,
        })),
        count: ranked.length,
      });
    },
  });

  registerTool({
    name: "dr_seed_list",
    description: "List every seed in the library. Useful when the agent wants to browse rather than search.",
    inputSchema: z.object({}),
    async handler() {
      const seeds = await listSeeds();
      return ok({
        seeds: seeds.map((s) => ({
          name: s.name,
          title: s.title,
          template_variant: s.template_variant,
          description: s.description,
          tags: s.tags,
        })),
        count: seeds.length,
      });
    },
  });

  registerTool({
    name: "dr_seed_get",
    description: "Fetch a single seed entry by name, including starter content and notes_for_agent.",
    inputSchema: z.object({
      name: z.string(),
    }),
    async handler(input) {
      const seed = await getSeed(input.name);
      if (!seed) return fail(`No seed named '${input.name}'.`);
      return ok({ seed });
    },
  });

  registerTool({
    name: "dr_seed_load",
    description:
      "Instantiate a seed as a real Decision in the current project. Pre-fills positions, assumptions, constraints, and implications from the seed; the agent should still customize them.",
    inputSchema: z.object({
      cwd: z.string().optional(),
      seed_name: z.string(),
      title_override: z
        .string()
        .min(1)
        .max(80)
        .optional()
        .describe("Optional: override the seed's title with project-specific phrasing."),
      slug_override: z.string().optional(),
      depends_on: z.array(DecisionIdSchema).default([]),
      tags: z.array(z.string()).default([]),
    }),
    async handler(input) {
      const cwd = resolveCwd(input.cwd);
      const store = new Store(cwd);
      if (!(await store.hasProject())) {
        return fail(`No project initialized at ${cwd}.`);
      }
      const seed = await getSeed(input.seed_name);
      if (!seed) return fail(`No seed named '${input.seed_name}'.`);
      const state = await store.readState();
      const seq = state.next_decision_seq;
      const title = input.title_override ?? seed.title;
      const slug = input.slug_override ?? slugify(title);
      if (!/^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$/.test(slug)) {
        return fail(`Derived slug '${slug}' invalid. Pass 'slug_override'.`);
      }
      const id = decisionId(seq, slug);
      const existing = await store.listDecisions();
      if (existing.some((d) => d.id === id)) {
        return fail(`Decision with id ${id} already exists.`);
      }
      const now = nowIso();
      const decision: Decision = DecisionSchema.parse({
        id,
        number: seq,
        slug,
        title,
        status: "proposed",
        template_variant: seed.template_variant,
        created_at: now,
        updated_at: now,
        summary: seed.starter.summary,
        issue: seed.starter.issue,
        assumptions: seed.starter.assumptions,
        constraints: seed.starter.constraints,
        positions: seed.starter.positions.map((p) => ({
          title: p.title,
          description: p.description,
          pros: p.pros,
          cons: p.cons,
          links: [],
        })),
        opinions: [],
        implications: seed.starter.implications,
        depends_on: input.depends_on,
        related_decisions: [],
        related_artifacts: [],
        review: [],
        tags: [...(input.tags ?? []), ...seed.tags],
        seed_origin: seed.name,
      });
      await store.writeDecision(decision);
      await store.writeState({ ...state, next_decision_seq: seq + 1, last_event_at: now });
      await store.appendEvent({
        at: now,
        actor: "agent",
        kind: "seed_loaded",
        entity_kind: "decision",
        entity_id: id,
        payload: { seed_name: seed.name },
      });
      return ok({ decision, notes_for_agent: seed.notes_for_agent });
    },
  });
}
