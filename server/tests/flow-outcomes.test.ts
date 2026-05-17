import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { makeTmpProject, TmpProject } from "./helpers/tmp-project.js";
import { registerAllTools } from "../src/tools/index.js";
import { getTool } from "../src/tools/registry.js";
import { Store } from "../src/storage/store.js";
import {
  Decision,
  DecisionSchema,
  Project,
  PipelineState,
} from "../src/schemas/index.js";
import { resolveEffectiveGateConfig } from "../src/gate.js";

const NOW = "2026-05-17T12:00:00.000Z";

async function call(name: string, args: Record<string, unknown>) {
  const tool = getTool(name);
  if (!tool) throw new Error(`tool not registered: ${name}`);
  const parsed = tool.inputSchema.parse(args);
  return tool.handler(parsed);
}

async function seedHandedOffProject(project: TmpProject): Promise<{ decisionId: string }> {
  const store = new Store(project.cwd);
  await store.ensureLayout();

  const proj: Project = {
    id: "p1",
    title: "Outcome flow",
    description: "",
    created_at: NOW,
    updated_at: NOW,
    effort_level: "poc",
    status: "handed-off",
    sign_offs: [],
    gate_config: { preset: "poc" },
    tags: [],
  };
  await store.writeProject(proj);

  const state: PipelineState = {
    schema_version: "0.1.0",
    project_id: "p1",
    phase: "handed-off",
    effective_gate_config: resolveEffectiveGateConfig({ preset: "poc" }),
    next_decision_seq: 2,
    next_task_seq: 1,
    next_outcome_seq: 1,
    pending_questions: [],
    gate_failures: [],
    last_event_at: NOW,
  };
  await store.writeState(state);

  const decision: Decision = DecisionSchema.parse({
    id: "0001-choose-data-store",
    number: 1,
    slug: "choose-data-store",
    title: "Choose data store",
    status: "accepted",
    template_variant: "canonical",
    created_at: NOW,
    updated_at: NOW,
    summary: "Pick a primary data store.",
    issue: "We need a persistent store.",
    assumptions: [],
    constraints: [],
    positions: [
      { title: "Postgres", pros: ["mature"], cons: [], links: [] },
    ],
    selected_position: "Postgres",
    argument: "Postgres meets our needs.",
    opinions: [],
    implications: [],
    depends_on: [],
    related_decisions: [],
    related_artifacts: [],
    review: [],
    tags: [],
    sign_off: { by: "human", at: NOW },
  });
  await store.writeDecision(decision);

  return { decisionId: decision.id };
}

describe("Flow: outcome lifecycle", () => {
  before(() => {
    if (!getTool("dr_record_outcome")) {
      registerAllTools();
    }
  });

  it("rejects outcome recording when project is not handed-off", async () => {
    const project = makeTmpProject("dr-flow-outcome-guard-");
    try {
      const store = new Store(project.cwd);
      await store.ensureLayout();
      const proj: Project = {
        id: "p1",
        title: "x",
        description: "",
        created_at: NOW,
        updated_at: NOW,
        effort_level: "poc",
        status: "deciding",
        sign_offs: [],
        gate_config: { preset: "poc" },
        tags: [],
      };
      const state: PipelineState = {
        schema_version: "0.1.0",
        project_id: "p1",
        phase: "deciding",
        effective_gate_config: resolveEffectiveGateConfig({ preset: "poc" }),
        next_decision_seq: 1,
        next_task_seq: 1,
        next_outcome_seq: 1,
        pending_questions: [],
        gate_failures: [],
        last_event_at: NOW,
      };
      await store.writeProject(proj);
      await store.writeState(state);

      const res = await call("dr_record_outcome", {
        cwd: project.cwd,
        decision_id: "0001-fake",
        observation: "premature",
      });
      assert.equal(res.ok, false);
      assert.match(res.errors?.[0] ?? "", /handed-off/);
    } finally {
      project.dispose();
    }
  });

  it("records, updates, transitions, and renders an outcome end-to-end", async () => {
    const project = makeTmpProject("dr-flow-outcome-happy-");
    try {
      const { decisionId } = await seedHandedOffProject(project);

      // Record outcome
      const recRes = await call("dr_record_outcome", {
        cwd: project.cwd,
        decision_id: decisionId,
        observation: "p99 latency 290ms in production after 30 days.",
        metric: "p99 latency 290ms",
        evidence: ["https://example.com/dashboard"],
        tags: ["perf"],
      });
      assert.equal(recRes.ok, true);
      const outcomeId = (recRes.data as { outcome: { id: string } }).outcome.id;
      assert.match(outcomeId, /^O0001-/);
      assert.ok(project.exists(`dr/outcomes/${outcomeId}.json`));

      // Outcome counter ticked
      const state = project.readJson<PipelineState>(".dr/state.json");
      assert.equal(state.next_outcome_seq, 2);

      // Update observation/metric
      const updRes = await call("dr_update_outcome", {
        cwd: project.cwd,
        id: outcomeId,
        observation: "p99 latency 280ms after 60 days.",
        metric: "p99 latency 280ms",
      });
      assert.equal(updRes.ok, true);

      // Transition status
      const statusRes = await call("dr_set_outcome_status", {
        cwd: project.cwd,
        id: outcomeId,
        status: "validated",
      });
      assert.equal(statusRes.ok, true);
      assert.equal((statusRes.data as { previous: string }).previous, "pending");

      // No-op transition is recognized
      const sameStatus = await call("dr_set_outcome_status", {
        cwd: project.cwd,
        id: outcomeId,
        status: "validated",
      });
      assert.equal(sameStatus.ok, true);
      assert.equal((sameStatus.data as { unchanged: boolean }).unchanged, true);

      // Listing returns it
      const listRes = await call("dr_list_outcomes", { cwd: project.cwd });
      assert.equal((listRes.data as { total: number }).total, 1);

      // Filter by decision
      const filtered = await call("dr_list_outcomes", {
        cwd: project.cwd,
        decision_id: decisionId,
      });
      assert.equal((filtered.data as { total: number }).total, 1);

      // Get single
      const getRes = await call("dr_get_outcome", {
        cwd: project.cwd,
        id: outcomeId,
      });
      assert.equal((getRes.data as { outcome: { status: string } }).outcome.status, "validated");

      // Render produces sibling .md, decision.md mentions the outcome, and index.html lists it
      const renderRes = await call("dr_render", { cwd: project.cwd });
      assert.equal(renderRes.ok, true);
      assert.ok(project.exists(`dr/outcomes/${outcomeId}.md`));
      const outcomeMd = project.read(`dr/outcomes/${outcomeId}.md`);
      assert.match(outcomeMd, /validated/);
      assert.match(outcomeMd, /Postgres|Choose data store|choose-data-store/);

      const decisionMd = project.read(`dr/decisions/${decisionId}.md`);
      assert.match(decisionMd, /## Outcomes/);
      assert.match(decisionMd, new RegExp(outcomeId));

      const indexHtml = project.read("dr/index.html");
      assert.match(indexHtml, /<h2>Outcomes<\/h2>/);
      assert.match(indexHtml, new RegExp(outcomeId));
      assert.match(indexHtml, /pill-outcome-validated/);

      // project.md shows the outcome count
      const projectMd = project.read("dr/project.md");
      assert.match(projectMd, /Outcomes \| 1/);

      // Events log captures the lifecycle
      const events = project.events();
      const kinds = events.map((e) => e.kind);
      assert.ok(kinds.includes("outcome_recorded"));
      assert.ok(kinds.includes("outcome_updated"));
      assert.ok(kinds.includes("outcome_status_changed"));
    } finally {
      project.dispose();
    }
  });

  it("rejects recording an outcome against a non-accepted decision", async () => {
    const project = makeTmpProject("dr-flow-outcome-bad-dec-");
    try {
      const store = new Store(project.cwd);
      await store.ensureLayout();
      const proj: Project = {
        id: "p1",
        title: "x",
        description: "",
        created_at: NOW,
        updated_at: NOW,
        effort_level: "poc",
        status: "handed-off",
        sign_offs: [],
        gate_config: { preset: "poc" },
        tags: [],
      };
      const state: PipelineState = {
        schema_version: "0.1.0",
        project_id: "p1",
        phase: "handed-off",
        effective_gate_config: resolveEffectiveGateConfig({ preset: "poc" }),
        next_decision_seq: 2,
        next_task_seq: 1,
        next_outcome_seq: 1,
        pending_questions: [],
        gate_failures: [],
        last_event_at: NOW,
      };
      await store.writeProject(proj);
      await store.writeState(state);

      const proposed: Decision = DecisionSchema.parse({
        id: "0001-not-accepted",
        number: 1,
        slug: "not-accepted",
        title: "Not accepted yet",
        status: "proposed",
        template_variant: "canonical",
        created_at: NOW,
        updated_at: NOW,
        assumptions: [],
        constraints: [],
        positions: [],
        opinions: [],
        implications: [],
        depends_on: [],
        related_decisions: [],
        related_artifacts: [],
        review: [],
        tags: [],
      });
      await store.writeDecision(proposed);

      const res = await call("dr_record_outcome", {
        cwd: project.cwd,
        decision_id: "0001-not-accepted",
        observation: "should be rejected",
      });
      assert.equal(res.ok, false);
      assert.match(res.errors?.[0] ?? "", /accepted decisions/);
    } finally {
      project.dispose();
    }
  });
});
