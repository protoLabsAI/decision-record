import { z } from "zod";

export const SCHEMA_VERSION = "0.1.0";

export const PhaseSchema = z.enum([
  "intake",
  "scoping",
  "deciding",
  "decomposing",
  "handing-off",
  "handed-off",
]);
export type Phase = z.infer<typeof PhaseSchema>;

export const EffortLevelSchema = z.enum(["poc", "mvp", "full"]);
export type EffortLevel = z.infer<typeof EffortLevelSchema>;

export const ActorTypeSchema = z.enum(["agent", "human", "system"]);
export type ActorType = z.infer<typeof ActorTypeSchema>;

const slugRegex = /^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$/;
export const SlugSchema = z.string().regex(slugRegex, "must be kebab-case");

export const DecisionIdSchema = z
  .string()
  .regex(/^[0-9]{4}-[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$/, "must look like '0001-slug'");
export const TaskIdSchema = z
  .string()
  .regex(/^T[0-9]{4}-[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$/, "must look like 'T0001-slug'");

export const GateOverridesSchema = z
  .object({
    decisions_required_status: z.enum(["accepted", "any"]).optional(),
    review_required_phases: z
      .array(z.enum(["scoping", "deciding", "decomposing"]))
      .optional(),
    review_required_per_decision: z.boolean().optional(),
    max_task_estimate_hours: z.number().min(0).optional(),
    require_human_signoff_phases: z
      .array(z.enum(["scoping", "deciding", "decomposing", "handing-off"]))
      .optional(),
    min_decisions: z.number().int().min(0).optional(),
    min_tasks: z.number().int().min(0).optional(),
  })
  .partial();
export type GateOverrides = z.infer<typeof GateOverridesSchema>;

export const GateConfigSchema = z.object({
  preset: EffortLevelSchema,
  overrides: GateOverridesSchema.optional(),
});
export type GateConfig = z.infer<typeof GateConfigSchema>;

export const EffectiveGateConfigSchema = z.object({
  decisions_required_status: z.enum(["accepted", "any"]),
  review_required_phases: z.array(z.enum(["scoping", "deciding", "decomposing"])),
  review_required_per_decision: z.boolean(),
  max_task_estimate_hours: z.number(),
  require_human_signoff_phases: z.array(
    z.enum(["scoping", "deciding", "decomposing", "handing-off"])
  ),
  min_decisions: z.number().int().min(0),
  min_tasks: z.number().int().min(0),
});
export type EffectiveGateConfig = z.infer<typeof EffectiveGateConfigSchema>;

export const ScopeSchema = z.object({
  in_scope: z.array(z.string()).default([]),
  out_of_scope: z.array(z.string()).default([]),
  success_criteria: z.array(z.string()).default([]),
  nice_to_have: z.array(z.string()).default([]),
});
export type Scope = z.infer<typeof ScopeSchema>;

export const SignOffSchema = z.object({
  phase: z.enum(["scoping", "deciding", "decomposing", "handing-off"]),
  by: z.enum(["agent", "human"]),
  actor: z.string().optional(),
  at: z.string().datetime(),
  notes: z.string().optional(),
});
export type SignOff = z.infer<typeof SignOffSchema>;

export const HandoffRecordSchema = z.object({
  target: z.enum(["linear", "filesystem", "symphony"]),
  target_id: z.string().optional(),
  target_url: z.string().url().optional(),
  exported_at: z.string().datetime(),
  issue_count: z.number().int().min(0).optional(),
  document_count: z.number().int().min(0).optional(),
  workflow_path: z
    .string()
    .optional()
    .describe(
      "Path to the emitted WORKFLOW.md when target='symphony'. Repo-owned, read by the Symphony service."
    ),
});
export type HandoffRecord = z.infer<typeof HandoffRecordSchema>;

export const ProjectSchema = z.object({
  id: SlugSchema,
  title: z.string().min(1).max(120),
  description: z.string().optional(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  effort_level: EffortLevelSchema,
  status: PhaseSchema,
  scope: ScopeSchema.optional(),
  sign_offs: z.array(SignOffSchema).default([]),
  handoff: HandoffRecordSchema.optional(),
  gate_config: GateConfigSchema,
  tags: z.array(z.string()).default([]),
});
export type Project = z.infer<typeof ProjectSchema>;

export const PositionSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  pros: z.array(z.string()).default([]),
  cons: z.array(z.string()).default([]),
  cost: z.record(z.unknown()).optional(),
  links: z.array(z.string().url()).default([]),
});
export type Position = z.infer<typeof PositionSchema>;

export const OpinionSchema = z.object({
  author: z.string(),
  by: z.enum(["agent", "human"]),
  at: z.string().datetime(),
  body: z.string(),
  position_ref: z.string().optional(),
});
export type Opinion = z.infer<typeof OpinionSchema>;

export const ReviewSchema = z.object({
  reviewer: z.string(),
  lens: z.enum(["operational", "strategic", "security", "cost", "user-impact"]),
  score: z.number().min(1).max(5).optional(),
  concerns: z.array(z.string()).default([]),
  verdict: z.enum(["pass", "block"]),
  at: z.string().datetime(),
});
export type Review = z.infer<typeof ReviewSchema>;

export const TemplateVariantSchema = z.enum([
  "canonical",
  "lightweight",
  "scoping",
  "vendor",
  "architecture",
  "data-model",
]);
export type TemplateVariant = z.infer<typeof TemplateVariantSchema>;

export const DecisionStatusSchema = z.enum([
  "rfc",
  "proposed",
  "accepted",
  "rejected",
  "deprecated",
  "superseded",
]);
export type DecisionStatus = z.infer<typeof DecisionStatusSchema>;

export const DecisionSchema = z.object({
  id: DecisionIdSchema,
  number: z.number().int().min(1),
  slug: SlugSchema,
  title: z.string().min(1).max(80),
  status: DecisionStatusSchema,
  template_variant: TemplateVariantSchema,
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  summary: z.string().optional(),
  issue: z.string().optional(),
  assumptions: z.array(z.string()).default([]),
  constraints: z.array(z.string()).default([]),
  positions: z.array(PositionSchema).default([]),
  opinions: z.array(OpinionSchema).default([]),
  argument: z.string().optional(),
  selected_position: z.string().optional(),
  implications: z.array(z.string()).default([]),
  depends_on: z.array(DecisionIdSchema).default([]),
  related_decisions: z.array(DecisionIdSchema).default([]),
  related_artifacts: z.array(z.string()).default([]),
  review: z.array(ReviewSchema).default([]),
  sign_off: z
    .object({
      by: z.enum(["agent", "human"]),
      actor: z.string().optional(),
      at: z.string().datetime(),
      notes: z.string().optional(),
    })
    .optional(),
  superseded_by: DecisionIdSchema.optional(),
  seed_origin: z.string().optional(),
  tags: z.array(z.string()).default([]),
});
export type Decision = z.infer<typeof DecisionSchema>;

export const OutcomeStatusSchema = z.enum([
  "pending",
  "validated",
  "invalidated",
  "inconclusive",
]);
export type OutcomeStatus = z.infer<typeof OutcomeStatusSchema>;

export const OutcomeIdSchema = z
  .string()
  .regex(/^O[0-9]{4}-[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$/, "must look like 'O0001-slug'");

export const OutcomeSchema = z.object({
  id: OutcomeIdSchema,
  number: z.number().int().min(1),
  slug: SlugSchema,
  decision_id: DecisionIdSchema,
  status: OutcomeStatusSchema,
  observation: z.string().min(1),
  metric: z.string().optional(),
  evidence: z.array(z.string()).default([]),
  recorded_by: z.enum(["agent", "human"]).default("human"),
  recorded_actor: z.string().optional(),
  recorded_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  tags: z.array(z.string()).default([]),
});
export type Outcome = z.infer<typeof OutcomeSchema>;

export const EmbeddingCacheEntrySchema = z.object({
  decision_id: DecisionIdSchema,
  model: z.string(),
  dim: z.number().int().min(1),
  hash: z.string(),
  vector: z.array(z.number()),
  embedded_at: z.string().datetime(),
});
export type EmbeddingCacheEntry = z.infer<typeof EmbeddingCacheEntrySchema>;

export const EmbeddingCacheSchema = z.object({
  version: z.literal("1"),
  default_model: z.string(),
  entries: z.record(EmbeddingCacheEntrySchema),
});
export type EmbeddingCache = z.infer<typeof EmbeddingCacheSchema>;

export const TaskStatusSchema = z.enum([
  "open",
  "ready",
  "in_progress",
  "done",
  "blocked",
  "deferred",
]);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const TaskSchema = z.object({
  id: TaskIdSchema,
  number: z.number().int().min(1),
  slug: SlugSchema,
  title: z.string().min(1).max(120),
  description: z.string().optional(),
  status: TaskStatusSchema,
  estimate: z
    .object({
      unit: z.enum(["hours", "days"]),
      value: z.number().min(0),
      confidence: z.enum(["low", "med", "high"]).optional(),
    })
    .optional(),
  acceptance_criteria: z.array(z.string()).default([]),
  depends_on: z.array(TaskIdSchema).default([]),
  decision_refs: z.array(DecisionIdSchema).default([]),
  priority: z.enum(["p0", "p1", "p2", "p3"]).default("p2"),
  labels: z.array(z.string()).default([]),
  assignee_hint: z.enum(["agent", "human", "either"]).optional(),
  external_ref: z
    .object({
      system: z.enum(["linear", "github", "plane", "jira", "other"]),
      id: z.string(),
      url: z.string().url().optional(),
    })
    .optional(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});
export type Task = z.infer<typeof TaskSchema>;

export const PendingQuestionSchema = z.object({
  id: z.string(),
  phase: z.string(),
  asked_at: z.string().datetime(),
  text: z.string(),
  answered: z.boolean().default(false),
  answered_at: z.string().datetime().optional(),
  answer: z.string().optional(),
});
export type PendingQuestion = z.infer<typeof PendingQuestionSchema>;

export const GateFailureSchema = z.object({
  phase_from: PhaseSchema,
  phase_to: PhaseSchema,
  at: z.string().datetime(),
  reasons: z.array(z.string()),
});
export type GateFailure = z.infer<typeof GateFailureSchema>;

export const PipelineStateSchema = z.object({
  schema_version: z.string().regex(/^[0-9]+\.[0-9]+\.[0-9]+$/, "must be semver"),
  project_id: SlugSchema,
  phase: PhaseSchema,
  effective_gate_config: EffectiveGateConfigSchema,
  next_decision_seq: z.number().int().min(1).default(1),
  next_task_seq: z.number().int().min(1).default(1),
  next_outcome_seq: z.number().int().min(1).default(1),
  pending_questions: z.array(PendingQuestionSchema).default([]),
  gate_failures: z.array(GateFailureSchema).default([]),
  last_event_at: z.string().datetime().optional(),
  last_render_at: z.string().datetime().optional(),
});
export type PipelineState = z.infer<typeof PipelineStateSchema>;

export const EventKindSchema = z.enum([
  "project_initialized",
  "phase_advanced",
  "phase_advance_blocked",
  "scope_updated",
  "decision_proposed",
  "decision_updated",
  "decision_reviewed",
  "decision_accepted",
  "decision_rejected",
  "task_proposed",
  "task_updated",
  "task_status_changed",
  "graph_validated",
  "gate_check_passed",
  "gate_check_failed",
  "question_asked",
  "question_answered",
  "seed_loaded",
  "render_run",
  "export_started",
  "export_completed",
  "export_failed",
  "sign_off_recorded",
  "outcome_recorded",
  "outcome_status_changed",
  "outcome_updated",
  "embeddings_indexed",
  "embeddings_index_failed",
]);
export type EventKind = z.infer<typeof EventKindSchema>;

export const EventSchema = z.object({
  at: z.string().datetime(),
  actor: ActorTypeSchema,
  actor_name: z.string().optional(),
  kind: EventKindSchema,
  entity_kind: z.enum(["project", "decision", "task", "phase", "question", "outcome"]).optional(),
  entity_id: z.string().optional(),
  payload: z.record(z.unknown()).optional(),
  correlation_id: z.string().optional(),
});
export type Event = z.infer<typeof EventSchema>;
