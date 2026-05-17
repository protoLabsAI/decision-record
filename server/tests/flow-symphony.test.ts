import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { makeTmpProject, TmpProject } from "./helpers/tmp-project.js";
import { registerAllTools } from "../src/tools/index.js";
import { getTool } from "../src/tools/registry.js";
import { Store } from "../src/storage/store.js";
import {
  Decision,
  DecisionSchema,
  PipelineState,
  Project,
  Task,
  TaskSchema,
} from "../src/schemas/index.js";
import { resolveEffectiveGateConfig } from "../src/gate.js";

const NOW = "2026-05-17T00:00:00.000Z";

async function call(name: string, args: Record<string, unknown>) {
  const tool = getTool(name);
  if (!tool) throw new Error(`tool not registered: ${name}`);
  const parsed = tool.inputSchema.parse(args);
  return tool.handler(parsed);
}

async function seedHandingOff(project: TmpProject): Promise<void> {
  const store = new Store(project.cwd);
  await store.ensureLayout();
  const proj: Project = {
    id: "demo",
    title: "Demo",
    description: "for symphony tests",
    created_at: NOW,
    updated_at: NOW,
    effort_level: "poc",
    status: "handing-off",
    sign_offs: [],
    gate_config: { preset: "poc" },
    tags: [],
    scope: {
      in_scope: ["x"],
      out_of_scope: [],
      success_criteria: ["y"],
      nice_to_have: [],
    },
  };
  const state: PipelineState = {
    schema_version: "0.1.0",
    project_id: "demo",
    phase: "handing-off",
    effective_gate_config: resolveEffectiveGateConfig({ preset: "poc" }),
    next_decision_seq: 2,
    next_task_seq: 2,
    next_outcome_seq: 1,
    pending_questions: [],
    gate_failures: [],
    last_event_at: NOW,
  };
  await store.writeProject(proj);
  await store.writeState(state);

  const decision: Decision = DecisionSchema.parse({
    id: "0001-pick-typescript",
    number: 1,
    slug: "pick-typescript",
    title: "Pick TypeScript",
    status: "accepted",
    template_variant: "canonical",
    created_at: NOW,
    updated_at: NOW,
    positions: [{ title: "TypeScript", pros: [], cons: [], links: [] }],
    selected_position: "TypeScript",
    argument: "Team expertise.",
    assumptions: [],
    constraints: [],
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

  const task: Task = TaskSchema.parse({
    id: "T0001-bootstrap",
    number: 1,
    slug: "bootstrap",
    title: "Bootstrap",
    status: "ready",
    estimate: { unit: "hours", value: 2 },
    acceptance_criteria: ["npm test passes"],
    depends_on: [],
    decision_refs: ["0001-pick-typescript"],
    priority: "p1",
    labels: [],
    created_at: NOW,
    updated_at: NOW,
  });
  await store.writeTask(task);
}

describe("Flow: dr_export_symphony", () => {
  before(() => {
    if (!getTool("dr_export_symphony")) {
      registerAllTools();
    }
  });

  it("rejects when project is not in 'handing-off' phase", async () => {
    const project = makeTmpProject("dr-symphony-phase-");
    try {
      const store = new Store(project.cwd);
      await store.ensureLayout();
      const proj: Project = {
        id: "wip",
        title: "wip",
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
        project_id: "wip",
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

      const res = await call("dr_export_symphony", { cwd: project.cwd });
      assert.equal(res.ok, false);
      assert.match(res.errors?.[0] ?? "", /handing-off/);
    } finally {
      project.dispose();
    }
  });

  it("writes WORKFLOW.md at project root by default and finalizes to handed-off", async () => {
    const project = makeTmpProject("dr-symphony-default-");
    try {
      await seedHandingOff(project);

      const res = await call("dr_export_symphony", { cwd: project.cwd });
      assert.equal(res.ok, true);
      const data = res.data as {
        target: string;
        workflow_path: string;
        tracker_project_slug: string;
        decisions: number;
        tasks: number;
      };
      assert.equal(data.target, "symphony");
      assert.equal(data.tracker_project_slug, "CHANGEME");
      assert.equal(data.decisions, 1);
      assert.equal(data.tasks, 1);

      // File on disk
      assert.ok(existsSync(data.workflow_path));
      assert.equal(data.workflow_path, join(project.cwd, "WORKFLOW.md"));
      const body = readFileSync(data.workflow_path, "utf8");
      assert.match(body, /^---\ntracker:/);
      assert.match(body, /\{\{ issue\.identifier \}\}/);

      // Project transitioned to handed-off with symphony target
      const proj = project.readJson<Project>("dr/project.json");
      assert.equal(proj.status, "handed-off");
      assert.equal(proj.handoff?.target, "symphony");
      assert.equal(proj.handoff?.workflow_path, data.workflow_path);
      assert.equal(proj.handoff?.issue_count, 1);
      assert.equal(proj.handoff?.document_count, 1);

      // export_started + export_completed events
      const kinds = project.events().map((e) => e.kind);
      assert.ok(kinds.includes("export_started"));
      assert.ok(kinds.includes("export_completed"));
    } finally {
      project.dispose();
    }
  });

  it("honors explicit workflow_path (relative resolves against cwd)", async () => {
    const project = makeTmpProject("dr-symphony-path-");
    try {
      await seedHandingOff(project);
      const res = await call("dr_export_symphony", {
        cwd: project.cwd,
        workflow_path: "config/SYM.md",
      });
      assert.equal(res.ok, true);
      const data = res.data as { workflow_path: string };
      assert.equal(data.workflow_path, join(project.cwd, "config/SYM.md"));
    } finally {
      project.dispose();
    }
  });

  it("propagates override fields into the WORKFLOW.md front matter", async () => {
    const project = makeTmpProject("dr-symphony-overrides-");
    try {
      await seedHandingOff(project);
      const res = await call("dr_export_symphony", {
        cwd: project.cwd,
        tracker_project_slug: "explicit-slug",
        polling_interval_ms: 15000,
        workspace_root: "./symphony-ws",
        after_create_hook: "echo hello",
        max_concurrent_agents: 3,
        max_turns: 7,
      });
      assert.equal(res.ok, true);
      const body = readFileSync(
        (res.data as { workflow_path: string }).workflow_path,
        "utf8"
      );
      assert.match(body, /project_slug: explicit-slug/);
      assert.match(body, /interval_ms: 15000/);
      assert.match(body, /root: \.\/symphony-ws/);
      assert.match(body, /max_concurrent_agents: 3/);
      assert.match(body, /max_turns: 7/);
      assert.match(body, /after_create: \|/);
      assert.match(body, /^    echo hello$/m);
    } finally {
      project.dispose();
    }
  });

  it("reuses Linear handoff slug when present and no override given", async () => {
    const project = makeTmpProject("dr-symphony-reuse-linear-");
    try {
      await seedHandingOff(project);
      // Manually set a prior Linear handoff record, but reset status to handing-off
      const store = new Store(project.cwd);
      const proj = await store.readProject();
      await store.writeProject({
        ...proj,
        status: "handing-off",
        handoff: {
          target: "linear",
          target_id: "the-linear-slug",
          exported_at: NOW,
        },
      });

      const res = await call("dr_export_symphony", { cwd: project.cwd });
      assert.equal(res.ok, true);
      const body = readFileSync(
        (res.data as { workflow_path: string }).workflow_path,
        "utf8"
      );
      assert.match(body, /project_slug: the-linear-slug/);
    } finally {
      project.dispose();
    }
  });

  it("fails when linear_team_id is set but no API key is available", async () => {
    const originalEnv = process.env.LINEAR_API_KEY;
    delete process.env.LINEAR_API_KEY;
    const project = makeTmpProject("dr-symphony-missing-key-");
    try {
      await seedHandingOff(project);
      const res = await call("dr_export_symphony", {
        cwd: project.cwd,
        linear_team_id: "team-123",
      });
      assert.equal(res.ok, false);
      assert.match(res.errors?.[0] ?? "", /API key/);
      // Project remains in handing-off
      const proj = project.readJson<Project>("dr/project.json");
      assert.equal(proj.status, "handing-off");
    } finally {
      if (originalEnv !== undefined) process.env.LINEAR_API_KEY = originalEnv;
      project.dispose();
    }
  });
});
