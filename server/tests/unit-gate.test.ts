import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { presetFor, resolveEffectiveGateConfig } from "../src/gate.js";
import { evaluateAdvance, nextPhaseOf } from "../src/gateEval.js";
import {
  Decision,
  PipelineState,
  Project,
  SCHEMA_VERSION,
  Task,
} from "../src/schemas/index.js";

const NOW = "2026-05-17T00:00:00.000Z";

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: "test-project",
    title: "Test Project",
    description: "An idea worth shipping.",
    created_at: NOW,
    updated_at: NOW,
    effort_level: "poc",
    status: "intake",
    sign_offs: [],
    gate_config: { preset: "poc" },
    tags: [],
    ...overrides,
  };
}

function makeState(overrides: Partial<PipelineState> = {}): PipelineState {
  return {
    schema_version: SCHEMA_VERSION,
    project_id: "test-project",
    phase: "intake",
    effective_gate_config: presetFor("poc"),
    next_decision_seq: 1,
    next_task_seq: 1,
    pending_questions: [],
    gate_failures: [],
    ...overrides,
  };
}

function makeDecision(overrides: Partial<Decision> = {}): Decision {
  return {
    id: "0001-test",
    number: 1,
    slug: "test",
    title: "Test decision",
    status: "accepted",
    template_variant: "canonical",
    created_at: NOW,
    updated_at: NOW,
    assumptions: [],
    constraints: [],
    positions: [{ title: "A", pros: [], cons: [], links: [] }],
    opinions: [],
    selected_position: "A",
    argument: "Because A.",
    implications: [],
    depends_on: [],
    related_decisions: [],
    related_artifacts: [],
    review: [],
    tags: [],
    ...overrides,
  };
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "T0001-test",
    number: 1,
    slug: "test",
    title: "Test task",
    status: "ready",
    estimate: { unit: "hours", value: 2 },
    acceptance_criteria: ["criteria 1"],
    depends_on: [],
    decision_refs: [],
    priority: "p2",
    labels: [],
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

describe("gate / preset resolution", () => {
  it("returns the preset baseline when no overrides", () => {
    const cfg = resolveEffectiveGateConfig({ preset: "mvp" });
    assert.equal(cfg.min_decisions, 3);
    assert.equal(cfg.min_tasks, 8);
    assert.equal(cfg.max_task_estimate_hours, 8);
    assert.equal(cfg.review_required_per_decision, false);
    assert.deepEqual(cfg.review_required_phases, ["scoping", "decomposing"]);
  });

  it("applies overrides per-knob without affecting other preset values", () => {
    const cfg = resolveEffectiveGateConfig({
      preset: "mvp",
      overrides: { min_tasks: 5, review_required_per_decision: true },
    });
    assert.equal(cfg.min_tasks, 5);
    assert.equal(cfg.review_required_per_decision, true);
    assert.equal(cfg.min_decisions, 3, "min_decisions still preset default");
    assert.equal(cfg.max_task_estimate_hours, 8, "max_task_estimate_hours still preset default");
  });

  it("preset 'poc' is loosest, 'full' is strictest", () => {
    const poc = presetFor("poc");
    const mvp = presetFor("mvp");
    const full = presetFor("full");
    assert.ok(poc.min_tasks <= mvp.min_tasks);
    assert.ok(mvp.min_tasks <= full.min_tasks);
    assert.ok(poc.min_decisions <= mvp.min_decisions);
    assert.ok(mvp.min_decisions <= full.min_decisions);
    assert.ok(poc.max_task_estimate_hours >= mvp.max_task_estimate_hours);
    assert.ok(mvp.max_task_estimate_hours >= full.max_task_estimate_hours);
  });
});

describe("nextPhaseOf", () => {
  it("walks the linear pipeline", () => {
    assert.equal(nextPhaseOf("intake"), "scoping");
    assert.equal(nextPhaseOf("scoping"), "deciding");
    assert.equal(nextPhaseOf("deciding"), "decomposing");
    assert.equal(nextPhaseOf("decomposing"), "handing-off");
    assert.equal(nextPhaseOf("handing-off"), "handed-off");
    assert.equal(nextPhaseOf("handed-off"), null);
  });
});

describe("evaluateAdvance: intake → scoping", () => {
  it("passes with title + description", () => {
    const project = makeProject();
    const state = makeState({ phase: "intake" });
    const result = evaluateAdvance(project, state, [], [], null);
    assert.equal(result.pass, true);
    assert.equal(result.next_phase, "scoping");
  });

  it("blocks when description empty", () => {
    const project = makeProject({ description: "" });
    const state = makeState({ phase: "intake" });
    const result = evaluateAdvance(project, state, [], [], null);
    assert.equal(result.pass, false);
    assert.ok(
      result.reasons.some((r) => r.includes("description")),
      `expected description-blocked reason; got: ${result.reasons.join(" | ")}`
    );
  });
});

describe("evaluateAdvance: scoping → deciding", () => {
  it("passes with non-empty in_scope and success_criteria (poc)", () => {
    const project = makeProject({
      status: "scoping",
      scope: {
        in_scope: ["thing 1"],
        success_criteria: ["measurable 1"],
        out_of_scope: [],
        nice_to_have: [],
      },
    });
    const state = makeState({ phase: "scoping" });
    const result = evaluateAdvance(project, state, [], [], null);
    assert.equal(result.pass, true);
  });

  it("blocks when in_scope is empty", () => {
    const project = makeProject({
      status: "scoping",
      scope: {
        in_scope: [],
        success_criteria: ["x"],
        out_of_scope: [],
        nice_to_have: [],
      },
    });
    const state = makeState({ phase: "scoping" });
    const result = evaluateAdvance(project, state, [], [], null);
    assert.equal(result.pass, false);
    assert.ok(result.reasons.some((r) => r.includes("in_scope")));
  });

  it("blocks when success_criteria is empty", () => {
    const project = makeProject({
      status: "scoping",
      scope: {
        in_scope: ["x"],
        success_criteria: [],
        out_of_scope: [],
        nice_to_have: [],
      },
    });
    const state = makeState({ phase: "scoping" });
    const result = evaluateAdvance(project, state, [], [], null);
    assert.equal(result.pass, false);
    assert.ok(result.reasons.some((r) => r.includes("success_criteria")));
  });

  it("under mvp preset, requires a scoping DR with passing review", () => {
    const project = makeProject({
      effort_level: "mvp",
      status: "scoping",
      scope: {
        in_scope: ["x"],
        success_criteria: ["y"],
        out_of_scope: [],
        nice_to_have: [],
      },
      gate_config: { preset: "mvp" },
    });
    const state = makeState({
      phase: "scoping",
      effective_gate_config: presetFor("mvp"),
    });
    const noScopingDr = evaluateAdvance(
      project,
      state,
      [],
      [],
      { by: "human" }
    );
    assert.equal(noScopingDr.pass, false);
    assert.ok(noScopingDr.reasons.some((r) => r.includes("scoping decision")));

    const unreviewedScopingDr = makeDecision({
      id: "0001-scope",
      slug: "scope",
      template_variant: "scoping",
      status: "proposed",
      review: [],
    });
    const stillBlocked = evaluateAdvance(
      project,
      state,
      [unreviewedScopingDr],
      [],
      { by: "human" }
    );
    assert.equal(stillBlocked.pass, false);
    assert.ok(stillBlocked.reasons.some((r) => r.includes("no passing review")));

    const reviewedScopingDr = makeDecision({
      id: "0001-scope",
      slug: "scope",
      template_variant: "scoping",
      status: "proposed",
      review: [
        {
          reviewer: "dr-skeptic",
          lens: "operational",
          verdict: "pass",
          score: 4,
          concerns: [],
          at: NOW,
        },
      ],
    });
    const passes = evaluateAdvance(
      project,
      state,
      [reviewedScopingDr],
      [],
      { by: "human" }
    );
    assert.equal(passes.pass, true, `expected pass, got: ${passes.reasons.join("; ")}`);
  });
});

describe("evaluateAdvance: deciding → decomposing", () => {
  it("blocks when fewer decisions than min_decisions", () => {
    const project = makeProject({ status: "deciding", effort_level: "mvp" });
    const state = makeState({ phase: "deciding", effective_gate_config: presetFor("mvp") });
    const result = evaluateAdvance(project, state, [makeDecision()], [], { by: "human" });
    assert.equal(result.pass, false);
    assert.ok(result.reasons.some((r) => r.includes("decisions")));
  });

  it("blocks when any decision is still 'proposed'", () => {
    const project = makeProject({ status: "deciding" });
    const state = makeState({ phase: "deciding" });
    const ds = [
      makeDecision({ id: "0001-a", slug: "a" }),
      makeDecision({ id: "0002-b", slug: "b", status: "proposed", selected_position: undefined, argument: undefined }),
    ];
    const result = evaluateAdvance(project, state, ds, [], { by: "human" });
    assert.equal(result.pass, false);
    assert.ok(result.reasons.some((r) => r.includes("not 'accepted'")));
  });

  it("passes when all decisions accepted and deps resolved (poc)", () => {
    const project = makeProject({ status: "deciding" });
    const state = makeState({ phase: "deciding" });
    const ds = [makeDecision()];
    const result = evaluateAdvance(project, state, ds, [], { by: "human" });
    assert.equal(result.pass, true, `expected pass, got: ${result.reasons.join("; ")}`);
  });

  it("blocks when decision dependencies are missing", () => {
    const project = makeProject({ status: "deciding" });
    const state = makeState({ phase: "deciding" });
    const ds = [
      makeDecision({ id: "0001-a", slug: "a", depends_on: ["0999-missing"] }),
    ];
    const result = evaluateAdvance(project, state, ds, [], { by: "human" });
    assert.equal(result.pass, false);
    assert.ok(result.reasons.some((r) => r.includes("missing dependencies")));
  });

  it("under full preset, requires every accepted decision to have a passing review", () => {
    const project = makeProject({
      status: "deciding",
      effort_level: "full",
      gate_config: { preset: "full" },
    });
    const state = makeState({
      phase: "deciding",
      effective_gate_config: presetFor("full"),
    });
    // 6 accepted decisions; min_decisions = 6 for full
    const ds = Array.from({ length: 6 }, (_, i) =>
      makeDecision({
        id: `${String(i + 1).padStart(4, "0")}-d${i}`,
        slug: `d${i}`,
        number: i + 1,
      })
    );
    const noReview = evaluateAdvance(project, state, ds, [], { by: "human" });
    assert.equal(noReview.pass, false);
    assert.ok(
      noReview.reasons.some((r) => r.includes("lack a passing review")),
      `expected per-decision-review blocker; got: ${noReview.reasons.join(" | ")}`
    );
  });
});

describe("evaluateAdvance: decomposing → handing-off", () => {
  it("passes with deps satisfied and estimates in budget", () => {
    const project = makeProject({ status: "decomposing" });
    const state = makeState({ phase: "decomposing" });
    const tasks = [
      makeTask({ id: "T0001-a", slug: "a", number: 1, decision_refs: [] }),
      makeTask({ id: "T0002-b", slug: "b", number: 2, depends_on: ["T0001-a"] }),
      makeTask({ id: "T0003-c", slug: "c", number: 3, depends_on: ["T0002-b"] }),
    ];
    const result = evaluateAdvance(project, state, [makeDecision()], tasks, { by: "human" });
    assert.equal(result.pass, true, `expected pass, got: ${result.reasons.join("; ")}`);
  });

  it("blocks on cycles", () => {
    const project = makeProject({ status: "decomposing" });
    const state = makeState({ phase: "decomposing" });
    const tasks = [
      makeTask({ id: "T0001-a", slug: "a", number: 1, depends_on: ["T0003-c"] }),
      makeTask({ id: "T0002-b", slug: "b", number: 2, depends_on: ["T0001-a"] }),
      makeTask({ id: "T0003-c", slug: "c", number: 3, depends_on: ["T0002-b"] }),
    ];
    const result = evaluateAdvance(project, state, [makeDecision()], tasks, { by: "human" });
    assert.equal(result.pass, false);
    assert.ok(result.reasons.some((r) => r.includes("cycles")));
  });

  it("blocks on orphan dependencies", () => {
    const project = makeProject({ status: "decomposing" });
    const state = makeState({ phase: "decomposing" });
    const tasks = [
      makeTask({ id: "T0001-a", slug: "a", number: 1, depends_on: ["T0999-missing"] }),
      makeTask({ id: "T0002-b", slug: "b", number: 2 }),
      makeTask({ id: "T0003-c", slug: "c", number: 3 }),
    ];
    const result = evaluateAdvance(project, state, [makeDecision()], tasks, { by: "human" });
    assert.equal(result.pass, false);
    assert.ok(result.reasons.some((r) => r.includes("missing dependencies")));
  });

  it("blocks when task estimate exceeds max", () => {
    const project = makeProject({ status: "decomposing" });
    const state = makeState({ phase: "decomposing" });
    const tasks = [
      makeTask({ id: "T0001-a", slug: "a", number: 1, estimate: { unit: "hours", value: 100 } }),
      makeTask({ id: "T0002-b", slug: "b", number: 2 }),
      makeTask({ id: "T0003-c", slug: "c", number: 3 }),
    ];
    const result = evaluateAdvance(project, state, [makeDecision()], tasks, { by: "human" });
    assert.equal(result.pass, false);
    assert.ok(result.reasons.some((r) => r.includes("estimate")));
  });

  it("blocks when task has no estimate", () => {
    const project = makeProject({ status: "decomposing" });
    const state = makeState({ phase: "decomposing" });
    const tasks = [
      makeTask({ id: "T0001-a", slug: "a", number: 1 }),
      makeTask({ id: "T0002-b", slug: "b", number: 2 }),
      makeTask({ id: "T0003-c", slug: "c", number: 3, estimate: undefined }),
    ];
    const result = evaluateAdvance(project, state, [makeDecision()], tasks, { by: "human" });
    assert.equal(result.pass, false);
    assert.ok(result.reasons.some((r) => r.includes("missing or oversized")));
  });

  it("blocks when task references a missing decision", () => {
    const project = makeProject({ status: "decomposing" });
    const state = makeState({ phase: "decomposing" });
    const tasks = [
      makeTask({ id: "T0001-a", slug: "a", number: 1, decision_refs: ["0999-missing"] }),
      makeTask({ id: "T0002-b", slug: "b", number: 2 }),
      makeTask({ id: "T0003-c", slug: "c", number: 3 }),
    ];
    const result = evaluateAdvance(project, state, [makeDecision()], tasks, { by: "human" });
    assert.equal(result.pass, false);
    assert.ok(result.reasons.some((r) => r.includes("missing decisions")));
  });
});

describe("evaluateAdvance: sign-off requirement", () => {
  it("requires human sign-off for handing-off under poc preset", () => {
    const project = makeProject({ status: "decomposing" });
    const state = makeState({ phase: "decomposing" });
    const tasks = [
      makeTask({ id: "T0001-a", slug: "a", number: 1 }),
      makeTask({ id: "T0002-b", slug: "b", number: 2 }),
      makeTask({ id: "T0003-c", slug: "c", number: 3 }),
    ];
    const agentOnly = evaluateAdvance(project, state, [makeDecision()], tasks, {
      by: "agent",
    });
    assert.equal(agentOnly.pass, false);
    assert.ok(agentOnly.reasons.some((r) => r.includes("human sign-off")));

    const human = evaluateAdvance(project, state, [makeDecision()], tasks, { by: "human" });
    assert.equal(human.pass, true, `expected pass, got: ${human.reasons.join("; ")}`);
  });
});
