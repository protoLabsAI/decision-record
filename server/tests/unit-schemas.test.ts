import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DecisionIdSchema,
  DecisionSchema,
  EventSchema,
  GateConfigSchema,
  PipelineStateSchema,
  ProjectSchema,
  SCHEMA_VERSION,
  SlugSchema,
  TaskIdSchema,
  TaskSchema,
} from "../src/schemas/index.js";

const NOW = "2026-05-17T00:00:00.000Z";

describe("SlugSchema", () => {
  it("accepts well-formed kebab-case", () => {
    assert.doesNotThrow(() => SlugSchema.parse("project-name"));
    assert.doesNotThrow(() => SlugSchema.parse("a1"));
    assert.doesNotThrow(() => SlugSchema.parse("multi-word-thing"));
  });

  it("rejects upper-case, underscores, leading/trailing dashes", () => {
    assert.throws(() => SlugSchema.parse("Project"));
    assert.throws(() => SlugSchema.parse("snake_case"));
    assert.throws(() => SlugSchema.parse("-leading"));
    assert.throws(() => SlugSchema.parse("trailing-"));
    assert.throws(() => SlugSchema.parse(""));
  });
});

describe("DecisionIdSchema", () => {
  it("requires 0000-slug shape", () => {
    assert.doesNotThrow(() => DecisionIdSchema.parse("0001-language-choice"));
    assert.doesNotThrow(() => DecisionIdSchema.parse("9999-ab"));
  });

  it("rejects malformed prefixes", () => {
    assert.throws(() => DecisionIdSchema.parse("1-foo"));
    assert.throws(() => DecisionIdSchema.parse("0001"));
    assert.throws(() => DecisionIdSchema.parse("T0001-foo"));
    assert.throws(() => DecisionIdSchema.parse("0001-"));
  });
});

describe("TaskIdSchema", () => {
  it("requires T0000-slug shape", () => {
    assert.doesNotThrow(() => TaskIdSchema.parse("T0001-bootstrap"));
  });

  it("rejects decision-style IDs", () => {
    assert.throws(() => TaskIdSchema.parse("0001-foo"));
    assert.throws(() => TaskIdSchema.parse("t0001-foo"));
  });
});

describe("GateConfigSchema", () => {
  it("accepts preset-only", () => {
    assert.doesNotThrow(() => GateConfigSchema.parse({ preset: "poc" }));
    assert.doesNotThrow(() => GateConfigSchema.parse({ preset: "mvp" }));
    assert.doesNotThrow(() => GateConfigSchema.parse({ preset: "full" }));
  });

  it("accepts preset + overrides", () => {
    const parsed = GateConfigSchema.parse({
      preset: "mvp",
      overrides: { min_tasks: 5, review_required_per_decision: true },
    });
    assert.equal(parsed.overrides?.min_tasks, 5);
    assert.equal(parsed.overrides?.review_required_per_decision, true);
  });

  it("rejects unknown preset values", () => {
    assert.throws(() => GateConfigSchema.parse({ preset: "rapid" }));
  });
});

describe("ProjectSchema", () => {
  const validProject = {
    id: "demo",
    title: "Demo",
    description: "",
    created_at: NOW,
    updated_at: NOW,
    effort_level: "poc" as const,
    status: "intake" as const,
    sign_offs: [],
    gate_config: { preset: "poc" as const },
    tags: [],
  };

  it("round-trips a minimal project", () => {
    const parsed = ProjectSchema.parse(validProject);
    assert.equal(parsed.id, "demo");
    assert.equal(parsed.status, "intake");
  });

  it("rejects unknown status values", () => {
    assert.throws(() => ProjectSchema.parse({ ...validProject, status: "launching" }));
  });

  it("rejects bogus id slugs", () => {
    assert.throws(() => ProjectSchema.parse({ ...validProject, id: "Invalid_Id" }));
  });

  it("rejects invalid effort_level", () => {
    assert.throws(() => ProjectSchema.parse({ ...validProject, effort_level: "rapid" }));
  });
});

describe("DecisionSchema", () => {
  const validDecision = {
    id: "0001-xx",
    number: 1,
    slug: "xx",
    title: "X",
    status: "proposed" as const,
    template_variant: "canonical" as const,
    created_at: NOW,
    updated_at: NOW,
  };

  it("accepts minimal valid decision", () => {
    const parsed = DecisionSchema.parse(validDecision);
    assert.equal(parsed.id, "0001-xx");
    assert.deepEqual(parsed.positions, []);
    assert.deepEqual(parsed.review, []);
  });

  it("rejects mismatched id format", () => {
    assert.throws(() => DecisionSchema.parse({ ...validDecision, id: "T0001-xx" }));
  });

  it("rejects invalid template_variant", () => {
    assert.throws(() =>
      DecisionSchema.parse({ ...validDecision, template_variant: "novel" })
    );
  });

  it("parses full structure with positions, review, sign_off", () => {
    const full = {
      ...validDecision,
      status: "accepted" as const,
      positions: [{ title: "A", pros: ["fast"], cons: [], links: [] }],
      selected_position: "A",
      argument: "speed matters",
      implications: ["follow-up"],
      review: [
        {
          reviewer: "dr-skeptic",
          lens: "operational" as const,
          verdict: "pass" as const,
          score: 5,
          concerns: [],
          at: NOW,
        },
      ],
      sign_off: { by: "human" as const, at: NOW },
    };
    const parsed = DecisionSchema.parse(full);
    assert.equal(parsed.selected_position, "A");
    assert.equal(parsed.review[0]?.verdict, "pass");
    assert.equal(parsed.sign_off?.by, "human");
  });
});

describe("TaskSchema", () => {
  const validTask = {
    id: "T0001-xx",
    number: 1,
    slug: "xx",
    title: "X task",
    status: "open" as const,
    acceptance_criteria: [],
    depends_on: [],
    decision_refs: [],
    priority: "p2" as const,
    labels: [],
    created_at: NOW,
    updated_at: NOW,
  };

  it("round-trips a minimal task", () => {
    const parsed = TaskSchema.parse(validTask);
    assert.equal(parsed.status, "open");
    assert.equal(parsed.priority, "p2");
  });

  it("accepts estimate with confidence", () => {
    const parsed = TaskSchema.parse({
      ...validTask,
      estimate: { unit: "hours", value: 4, confidence: "med" },
    });
    assert.equal(parsed.estimate?.confidence, "med");
  });

  it("rejects negative estimate", () => {
    assert.throws(() =>
      TaskSchema.parse({
        ...validTask,
        estimate: { unit: "hours", value: -1 },
      })
    );
  });

  it("rejects unknown priority", () => {
    assert.throws(() => TaskSchema.parse({ ...validTask, priority: "p4" }));
  });
});

describe("PipelineStateSchema", () => {
  const validState = {
    schema_version: SCHEMA_VERSION,
    project_id: "demo",
    phase: "intake" as const,
    effective_gate_config: {
      decisions_required_status: "accepted" as const,
      review_required_phases: [],
      review_required_per_decision: false,
      max_task_estimate_hours: 16,
      require_human_signoff_phases: ["handing-off"],
      min_decisions: 0,
      min_tasks: 3,
    },
    next_decision_seq: 1,
    next_task_seq: 1,
    pending_questions: [],
    gate_failures: [],
  };

  it("round-trips and defaults", () => {
    const parsed = PipelineStateSchema.parse(validState);
    assert.equal(parsed.phase, "intake");
    assert.equal(parsed.next_decision_seq, 1);
  });

  it("rejects non-semver schema_version", () => {
    assert.throws(() =>
      PipelineStateSchema.parse({ ...validState, schema_version: "0.1" })
    );
  });
});

describe("EventSchema", () => {
  it("accepts a minimal event", () => {
    const parsed = EventSchema.parse({
      at: NOW,
      actor: "agent",
      kind: "project_initialized",
    });
    assert.equal(parsed.kind, "project_initialized");
  });

  it("accepts a payload of arbitrary shape", () => {
    const parsed = EventSchema.parse({
      at: NOW,
      actor: "human",
      kind: "decision_accepted",
      entity_kind: "decision",
      entity_id: "0001-x",
      payload: { reason: "fine", nested: { key: "value" } },
    });
    assert.equal(parsed.payload?.["reason"], "fine");
  });

  it("rejects unknown event kinds", () => {
    assert.throws(() =>
      EventSchema.parse({ at: NOW, actor: "agent", kind: "totally_made_up" })
    );
  });
});
