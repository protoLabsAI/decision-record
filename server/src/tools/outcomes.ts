import { z } from "zod";
import { Store } from "../storage/store.js";
import {
  DecisionIdSchema,
  Outcome,
  OutcomeIdSchema,
  OutcomeSchema,
  OutcomeStatusSchema,
} from "../schemas/index.js";
import { fail, ok, registerTool } from "./registry.js";
import { nowIso, outcomeId, slugify } from "../util.js";

function resolveCwd(cwd: string | undefined): string {
  return cwd && cwd.length > 0 ? cwd : process.cwd();
}

export function registerOutcomeTools(): void {
  registerTool({
    name: "dr_record_outcome",
    description:
      "Record an observed outcome of an accepted decision after handoff. Outcomes close the feedback loop between a DR and reality — they live alongside decisions, never inside them. Requires the project to be in 'handed-off' status.",
    inputSchema: z.object({
      cwd: z.string().optional(),
      decision_id: DecisionIdSchema.describe(
        "The accepted decision this outcome observes."
      ),
      observation: z
        .string()
        .min(1)
        .describe("Free-form prose describing what was observed in reality."),
      status: OutcomeStatusSchema.default("pending").describe(
        "Whether the decision held up. 'pending' = recorded but not yet evaluated."
      ),
      metric: z
        .string()
        .optional()
        .describe("Optional structured metric, e.g., 'p99 latency 320ms'."),
      evidence: z
        .array(z.string())
        .default([])
        .describe("Links, file references, or other supporting artifacts."),
      tags: z.array(z.string()).default([]),
      slug: z
        .string()
        .optional()
        .describe(
          "Optional kebab-case slug. If omitted, derived from the first 60 chars of observation."
        ),
      recorded_by: z.enum(["agent", "human"]).default("human"),
      recorded_actor: z.string().optional(),
    }),
    async handler(input) {
      const cwd = resolveCwd(input.cwd);
      const store = new Store(cwd);
      if (!(await store.hasProject())) {
        return fail(`No project initialized at ${cwd}. Run dr_init first.`);
      }
      const project = await store.readProject();
      if (project.status !== "handed-off") {
        return fail(
          `Outcomes can only be recorded after handoff (project.status='handed-off'). Current status: '${project.status}'.`
        );
      }
      const decision = await store.readDecision(input.decision_id).catch(() => null);
      if (!decision) {
        return fail(`Decision '${input.decision_id}' not found.`);
      }
      if (decision.status !== "accepted") {
        return fail(
          `Decision '${input.decision_id}' has status '${decision.status}'. Outcomes can only observe accepted decisions.`
        );
      }
      const state = await store.readState();
      const seq = state.next_outcome_seq;
      const slug = input.slug ?? slugify(input.observation);
      if (!/^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$/.test(slug)) {
        return fail(
          `Derived slug '${slug}' invalid. Pass an explicit 'slug' argument.`
        );
      }
      const id = outcomeId(seq, slug);
      const existing = await store.listOutcomes();
      if (existing.some((o) => o.id === id)) {
        return fail(`Outcome with id ${id} already exists.`);
      }
      const now = nowIso();
      const outcome: Outcome = OutcomeSchema.parse({
        id,
        number: seq,
        slug,
        decision_id: input.decision_id,
        status: input.status,
        observation: input.observation,
        metric: input.metric,
        evidence: input.evidence,
        recorded_by: input.recorded_by,
        recorded_actor: input.recorded_actor,
        recorded_at: now,
        updated_at: now,
        tags: input.tags,
      });
      await store.writeOutcome(outcome);
      await store.writeState({
        ...state,
        next_outcome_seq: seq + 1,
        last_event_at: now,
      });
      await store.appendEvent({
        at: now,
        actor: input.recorded_by,
        actor_name: input.recorded_actor,
        kind: "outcome_recorded",
        entity_kind: "outcome",
        entity_id: id,
        payload: {
          decision_id: input.decision_id,
          status: input.status,
        },
      });
      return ok({ outcome });
    },
  });

  registerTool({
    name: "dr_set_outcome_status",
    description:
      "Change an outcome's status (e.g., 'pending' → 'validated' once enough data is collected). Emits an outcome_status_changed event.",
    inputSchema: z.object({
      cwd: z.string().optional(),
      id: OutcomeIdSchema,
      status: OutcomeStatusSchema,
      recorded_by: z.enum(["agent", "human"]).default("human"),
      recorded_actor: z.string().optional(),
    }),
    async handler(input) {
      const cwd = resolveCwd(input.cwd);
      const store = new Store(cwd);
      const outcome = await store.readOutcome(input.id);
      if (outcome.status === input.status) {
        return ok({ outcome, unchanged: true });
      }
      const previous = outcome.status;
      const now = nowIso();
      const updated: Outcome = OutcomeSchema.parse({
        ...outcome,
        status: input.status,
        updated_at: now,
      });
      await store.writeOutcome(updated);
      await store.appendEvent({
        at: now,
        actor: input.recorded_by,
        actor_name: input.recorded_actor,
        kind: "outcome_status_changed",
        entity_kind: "outcome",
        entity_id: updated.id,
        payload: { from: previous, to: input.status },
      });
      return ok({ outcome: updated, previous });
    },
  });

  registerTool({
    name: "dr_update_outcome",
    description:
      "Patch fields on an existing outcome (observation, metric, evidence, tags). Use dr_set_outcome_status for status changes.",
    inputSchema: z.object({
      cwd: z.string().optional(),
      id: OutcomeIdSchema,
      observation: z.string().min(1).optional(),
      metric: z.string().optional(),
      evidence: z.array(z.string()).optional(),
      tags: z.array(z.string()).optional(),
      recorded_by: z.enum(["agent", "human"]).default("human"),
      recorded_actor: z.string().optional(),
    }),
    async handler(input) {
      const cwd = resolveCwd(input.cwd);
      const store = new Store(cwd);
      const outcome = await store.readOutcome(input.id);
      const now = nowIso();
      const updated: Outcome = OutcomeSchema.parse({
        ...outcome,
        observation: input.observation ?? outcome.observation,
        metric: input.metric ?? outcome.metric,
        evidence: input.evidence ?? outcome.evidence,
        tags: input.tags ?? outcome.tags,
        updated_at: now,
      });
      await store.writeOutcome(updated);
      await store.appendEvent({
        at: now,
        actor: input.recorded_by,
        actor_name: input.recorded_actor,
        kind: "outcome_updated",
        entity_kind: "outcome",
        entity_id: updated.id,
        payload: {
          changed: Object.keys(input).filter((k) => k !== "cwd" && k !== "id"),
        },
      });
      return ok({ outcome: updated });
    },
  });

  registerTool({
    name: "dr_list_outcomes",
    description:
      "List outcomes, optionally filtering by decision_id or status. Returns summaries.",
    inputSchema: z.object({
      cwd: z.string().optional(),
      decision_id: DecisionIdSchema.optional(),
      status: z.array(OutcomeStatusSchema).optional(),
    }),
    async handler(input) {
      const cwd = resolveCwd(input.cwd);
      const store = new Store(cwd);
      const outcomes = await store.listOutcomes();
      const filtered = outcomes.filter((o) => {
        if (input.decision_id && o.decision_id !== input.decision_id) return false;
        if (input.status && !input.status.includes(o.status)) return false;
        return true;
      });
      return ok({
        outcomes: filtered.map((o) => ({
          id: o.id,
          decision_id: o.decision_id,
          status: o.status,
          observation: o.observation,
          metric: o.metric,
          recorded_at: o.recorded_at,
          updated_at: o.updated_at,
        })),
        total: filtered.length,
        grand_total: outcomes.length,
      });
    },
  });

  registerTool({
    name: "dr_get_outcome",
    description: "Fetch the full content of an outcome by id.",
    inputSchema: z.object({
      cwd: z.string().optional(),
      id: OutcomeIdSchema,
    }),
    async handler(input) {
      const cwd = resolveCwd(input.cwd);
      const store = new Store(cwd);
      const outcome = await store.readOutcome(input.id);
      return ok({ outcome });
    },
  });
}
