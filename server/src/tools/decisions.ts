import { z } from "zod";
import { Store } from "../storage/store.js";
import {
  Decision,
  DecisionIdSchema,
  DecisionSchema,
  OpinionSchema,
  PositionSchema,
  ReviewSchema,
  TemplateVariantSchema,
} from "../schemas/index.js";
import { fail, ok, registerTool } from "./registry.js";
import { decisionId, nowIso, slugify } from "../util.js";
import { indexDecision } from "../embeddings/index.js";

function resolveCwd(cwd: string | undefined): string {
  return cwd && cwd.length > 0 ? cwd : process.cwd();
}

export function registerDecisionTools(): void {
  registerTool({
    name: "dr_propose_decision",
    description:
      "Create a new decision record (status='proposed'). The agent typically calls this when it identifies a significant choice the project must make.",
    inputSchema: z.object({
      cwd: z.string().optional(),
      title: z
        .string()
        .min(1)
        .max(80)
        .describe("Short present-tense imperative. Up to 80 chars."),
      template_variant: TemplateVariantSchema.default("canonical"),
      summary: z.string().optional(),
      issue: z.string().optional(),
      assumptions: z.array(z.string()).default([]),
      constraints: z.array(z.string()).default([]),
      positions: z.array(PositionSchema).default([]),
      depends_on: z.array(DecisionIdSchema).default([]),
      tags: z.array(z.string()).default([]),
      seed_origin: z.string().optional(),
      slug: z.string().optional(),
    }),
    async handler(input) {
      const cwd = resolveCwd(input.cwd);
      const store = new Store(cwd);
      if (!(await store.hasProject())) {
        return fail(`No project initialized at ${cwd}. Run dr_init first.`);
      }
      const state = await store.readState();
      const seq = state.next_decision_seq;
      const slug = input.slug ?? slugify(input.title);
      if (!/^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$/.test(slug)) {
        return fail(
          `Derived slug '${slug}' invalid. Pass an explicit 'slug' argument.`
        );
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
        title: input.title,
        status: "proposed",
        template_variant: input.template_variant,
        created_at: now,
        updated_at: now,
        summary: input.summary,
        issue: input.issue,
        assumptions: input.assumptions,
        constraints: input.constraints,
        positions: input.positions,
        opinions: [],
        implications: [],
        depends_on: input.depends_on,
        related_decisions: [],
        related_artifacts: [],
        review: [],
        tags: input.tags,
        seed_origin: input.seed_origin,
      });
      await store.writeDecision(decision);
      await store.writeState({ ...state, next_decision_seq: seq + 1, last_event_at: now });
      await store.appendEvent({
        at: now,
        actor: "agent",
        kind: "decision_proposed",
        entity_kind: "decision",
        entity_id: id,
        payload: { template_variant: input.template_variant, seed_origin: input.seed_origin },
      });
      return ok({ decision });
    },
  });

  registerTool({
    name: "dr_update_decision",
    description:
      "Patch fields on an existing decision. Pass only the fields you want to change. To append (rather than replace) lists like positions/opinions/implications, use the add_* tools where available.",
    inputSchema: z.object({
      cwd: z.string().optional(),
      id: DecisionIdSchema,
      title: z.string().min(1).max(80).optional(),
      summary: z.string().optional(),
      issue: z.string().optional(),
      assumptions: z.array(z.string()).optional(),
      constraints: z.array(z.string()).optional(),
      positions: z.array(PositionSchema).optional(),
      argument: z.string().optional(),
      selected_position: z.string().optional(),
      implications: z.array(z.string()).optional(),
      depends_on: z.array(DecisionIdSchema).optional(),
      related_decisions: z.array(DecisionIdSchema).optional(),
      related_artifacts: z.array(z.string()).optional(),
      tags: z.array(z.string()).optional(),
      template_variant: TemplateVariantSchema.optional(),
      add_opinion: OpinionSchema.optional().describe(
        "Append one opinion to the opinions list. Use repeatedly to add more."
      ),
    }),
    async handler(input) {
      const cwd = resolveCwd(input.cwd);
      const store = new Store(cwd);
      const decision = await store.readDecision(input.id);
      const now = nowIso();
      const updated: Decision = DecisionSchema.parse({
        ...decision,
        title: input.title ?? decision.title,
        summary: input.summary ?? decision.summary,
        issue: input.issue ?? decision.issue,
        assumptions: input.assumptions ?? decision.assumptions,
        constraints: input.constraints ?? decision.constraints,
        positions: input.positions ?? decision.positions,
        argument: input.argument ?? decision.argument,
        selected_position: input.selected_position ?? decision.selected_position,
        implications: input.implications ?? decision.implications,
        depends_on: input.depends_on ?? decision.depends_on,
        related_decisions: input.related_decisions ?? decision.related_decisions,
        related_artifacts: input.related_artifacts ?? decision.related_artifacts,
        tags: input.tags ?? decision.tags,
        template_variant: input.template_variant ?? decision.template_variant,
        opinions: input.add_opinion
          ? [...decision.opinions, input.add_opinion]
          : decision.opinions,
        updated_at: now,
      });
      await store.writeDecision(updated);
      await store.appendEvent({
        at: now,
        actor: "agent",
        kind: "decision_updated",
        entity_kind: "decision",
        entity_id: updated.id,
        payload: { changed: Object.keys(input).filter((k) => k !== "cwd" && k !== "id") },
      });
      if (updated.status === "accepted") {
        await indexDecision(store, updated);
      }
      return ok({ decision: updated });
    },
  });

  registerTool({
    name: "dr_review_decision",
    description:
      "Record an antagonistic-review pass on a decision. Used to gate acceptance when review_required_per_decision=true or for phase-level reviews.",
    inputSchema: z.object({
      cwd: z.string().optional(),
      id: DecisionIdSchema,
      reviewer: z.string().describe("Name/identifier of the reviewer (e.g., 'dr-skeptic')."),
      lens: z.enum(["operational", "strategic", "security", "cost", "user-impact"]),
      verdict: z.enum(["pass", "block"]),
      score: z.number().min(1).max(5).optional(),
      concerns: z.array(z.string()).default([]),
    }),
    async handler(input) {
      const cwd = resolveCwd(input.cwd);
      const store = new Store(cwd);
      const decision = await store.readDecision(input.id);
      const now = nowIso();
      const review = ReviewSchema.parse({
        reviewer: input.reviewer,
        lens: input.lens,
        verdict: input.verdict,
        score: input.score,
        concerns: input.concerns,
        at: now,
      });
      const updated: Decision = DecisionSchema.parse({
        ...decision,
        review: [...decision.review, review],
        updated_at: now,
      });
      await store.writeDecision(updated);
      await store.appendEvent({
        at: now,
        actor: "agent",
        actor_name: input.reviewer,
        kind: "decision_reviewed",
        entity_kind: "decision",
        entity_id: updated.id,
        payload: { lens: input.lens, verdict: input.verdict, score: input.score },
      });
      return ok({ decision: updated, review });
    },
  });

  registerTool({
    name: "dr_accept_decision",
    description:
      "Move a decision to status='accepted' and record sign-off. Requires `selected_position` and `argument` to be set, plus a passing review if the project's gate config requires per-decision review.",
    inputSchema: z.object({
      cwd: z.string().optional(),
      id: DecisionIdSchema,
      sign_off_by: z.enum(["agent", "human"]).default("human"),
      sign_off_actor: z.string().optional(),
      sign_off_notes: z.string().optional(),
    }),
    async handler(input) {
      const cwd = resolveCwd(input.cwd);
      const store = new Store(cwd);
      const state = await store.readState();
      const decision = await store.readDecision(input.id);
      const errors: string[] = [];
      if (!decision.selected_position || decision.selected_position.length === 0) {
        errors.push("selected_position is empty.");
      } else if (
        !decision.positions.some((p) => p.title === decision.selected_position)
      ) {
        errors.push(
          `selected_position '${decision.selected_position}' is not in the positions list.`
        );
      }
      if (!decision.argument || decision.argument.trim().length === 0) {
        errors.push("argument is empty.");
      }
      if (state.effective_gate_config.review_required_per_decision) {
        const hasPass = decision.review.some((r) => r.verdict === "pass");
        if (!hasPass) {
          errors.push(
            "review_required_per_decision=true; this decision has no passing review."
          );
        }
        const hasBlock = decision.review.some((r) => r.verdict === "block");
        if (hasBlock) {
          errors.push("a reviewer issued 'block' — address concerns or override review before acceptance.");
        }
      }
      if (decision.depends_on.length > 0) {
        const allDecisions = await store.listDecisions();
        const unmet = decision.depends_on.filter(
          (dep) =>
            !allDecisions.some((other) => other.id === dep && other.status === "accepted")
        );
        if (unmet.length > 0) {
          errors.push(
            `Dependencies not yet accepted: ${unmet.join(", ")}`
          );
        }
      }
      if (errors.length > 0) return fail(...errors);

      const now = nowIso();
      const updated: Decision = DecisionSchema.parse({
        ...decision,
        status: "accepted",
        sign_off: {
          by: input.sign_off_by,
          actor: input.sign_off_actor,
          at: now,
          notes: input.sign_off_notes,
        },
        updated_at: now,
      });
      await store.writeDecision(updated);
      await store.appendEvent({
        at: now,
        actor: input.sign_off_by,
        actor_name: input.sign_off_actor,
        kind: "decision_accepted",
        entity_kind: "decision",
        entity_id: updated.id,
      });
      await indexDecision(store, updated);
      return ok({ decision: updated });
    },
  });

  registerTool({
    name: "dr_reject_decision",
    description:
      "Move a decision to status='rejected'. The decision stays on file for traceability but no longer counts toward the deciding gate.",
    inputSchema: z.object({
      cwd: z.string().optional(),
      id: DecisionIdSchema,
      reason: z.string().describe("Why this decision is being rejected."),
      sign_off_by: z.enum(["agent", "human"]).default("human"),
      sign_off_actor: z.string().optional(),
    }),
    async handler(input) {
      const cwd = resolveCwd(input.cwd);
      const store = new Store(cwd);
      const decision = await store.readDecision(input.id);
      const now = nowIso();
      const updated: Decision = DecisionSchema.parse({
        ...decision,
        status: "rejected",
        argument: input.reason,
        sign_off: {
          by: input.sign_off_by,
          actor: input.sign_off_actor,
          at: now,
          notes: input.reason,
        },
        updated_at: now,
      });
      await store.writeDecision(updated);
      await store.appendEvent({
        at: now,
        actor: input.sign_off_by,
        actor_name: input.sign_off_actor,
        kind: "decision_rejected",
        entity_kind: "decision",
        entity_id: updated.id,
        payload: { reason: input.reason },
      });
      return ok({ decision: updated });
    },
  });

  registerTool({
    name: "dr_list_decisions",
    description:
      "List decisions, optionally filtering by status or template_variant. Returns summaries (id, title, status, deps) — call dr_get_decision for full content.",
    inputSchema: z.object({
      cwd: z.string().optional(),
      status: z
        .array(
          z.enum(["rfc", "proposed", "accepted", "rejected", "deprecated", "superseded"])
        )
        .optional(),
      template_variant: z.array(TemplateVariantSchema).optional(),
    }),
    async handler(input) {
      const cwd = resolveCwd(input.cwd);
      const store = new Store(cwd);
      const decisions = await store.listDecisions();
      const filtered = decisions.filter((d) => {
        if (input.status && !input.status.includes(d.status)) return false;
        if (input.template_variant && !input.template_variant.includes(d.template_variant)) return false;
        return true;
      });
      return ok({
        decisions: filtered.map((d) => ({
          id: d.id,
          title: d.title,
          status: d.status,
          template_variant: d.template_variant,
          summary: d.summary,
          selected_position: d.selected_position,
          depends_on: d.depends_on,
          updated_at: d.updated_at,
          review_count: d.review.length,
        })),
        total: filtered.length,
        grand_total: decisions.length,
      });
    },
  });

  registerTool({
    name: "dr_get_decision",
    description: "Fetch the full content of a decision by id.",
    inputSchema: z.object({
      cwd: z.string().optional(),
      id: DecisionIdSchema,
    }),
    async handler(input) {
      const cwd = resolveCwd(input.cwd);
      const store = new Store(cwd);
      const decision = await store.readDecision(input.id);
      return ok({ decision });
    },
  });

  registerTool({
    name: "dr_ready_decisions",
    description:
      "Return decisions whose dependencies are all accepted (or which have no deps). Used by the agent to pick the next DR to work on.",
    inputSchema: z.object({
      cwd: z.string().optional(),
    }),
    async handler(input) {
      const cwd = resolveCwd(input.cwd);
      const store = new Store(cwd);
      const decisions = await store.listDecisions();
      const acceptedIds = new Set(
        decisions.filter((d) => d.status === "accepted").map((d) => d.id)
      );
      const ready = decisions
        .filter((d) => d.status === "rfc" || d.status === "proposed")
        .filter((d) => d.depends_on.every((dep) => acceptedIds.has(dep)));
      return ok({
        ready: ready.map((d) => ({
          id: d.id,
          title: d.title,
          status: d.status,
          template_variant: d.template_variant,
          depends_on: d.depends_on,
        })),
        count: ready.length,
      });
    },
  });
}
