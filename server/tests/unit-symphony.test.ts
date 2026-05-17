import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  Decision,
  DecisionSchema,
  Project,
  Task,
  TaskSchema,
} from "../src/schemas/index.js";
import { renderSymphonyWorkflow } from "../src/handoff/symphony.js";

const NOW = "2026-05-17T00:00:00.000Z";

const project: Project = {
  id: "demo",
  title: "Demo project",
  description: "An example",
  created_at: NOW,
  updated_at: NOW,
  effort_level: "poc",
  status: "handing-off",
  sign_offs: [],
  gate_config: { preset: "poc" },
  tags: [],
  scope: {
    in_scope: ["thing A"],
    out_of_scope: ["distant feature"],
    success_criteria: ["it ships"],
    nice_to_have: [],
  },
};

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

const proposedDecision: Decision = DecisionSchema.parse({
  ...decision,
  id: "0002-pick-postgres",
  number: 2,
  slug: "pick-postgres",
  title: "Pick Postgres",
  status: "proposed",
  selected_position: undefined,
  sign_off: undefined,
});

const task: Task = TaskSchema.parse({
  id: "T0001-bootstrap",
  number: 1,
  slug: "bootstrap",
  title: "Bootstrap",
  description: "Wire up the project",
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

describe("renderSymphonyWorkflow — front matter", () => {
  it("emits required tracker, polling, workspace, agent, codex blocks", () => {
    const out = renderSymphonyWorkflow({
      project,
      decisions: [decision],
      tasks: [task],
      tracker: { project_slug: "demo-slug" },
    });
    assert.match(out, /^---\ntracker:\n/);
    assert.match(out, /^\s*kind: linear$/m);
    assert.match(out, /endpoint: https:\/\/api\.linear\.app\/graphql/);
    assert.match(out, /api_key: \$LINEAR_API_KEY/);
    assert.match(out, /project_slug: demo-slug/);
    assert.match(out, /active_states: \[Todo, "In Progress"\]/);
    assert.match(out, /terminal_states: \[Closed, Cancelled, Canceled, Duplicate, Done\]/);
    assert.match(out, /^polling:\n  interval_ms: 30000$/m);
    assert.match(out, /^workspace:\n  root: \.\/\.symphony-workspaces$/m);
    assert.match(out, /^agent:\n/m);
    assert.match(out, /max_concurrent_agents: 5/);
    assert.match(out, /max_turns: 20/);
    assert.match(out, /^codex:\n/m);
    assert.match(out, /command: "codex app-server"/);
    assert.match(out, /turn_timeout_ms: 3600000/);
  });

  it("includes hooks block when after_create is provided, formatted as multiline scalar", () => {
    const out = renderSymphonyWorkflow({
      project,
      decisions: [decision],
      tasks: [task],
      workspace: {
        after_create:
          "git clone https://github.com/example/demo .\nnpm install",
      },
    });
    assert.match(out, /^hooks:\n  after_create: \|\n/m);
    assert.match(out, /^    git clone https:\/\/github\.com\/example\/demo \.$/m);
    assert.match(out, /^    npm install$/m);
  });

  it("respects custom overrides", () => {
    const out = renderSymphonyWorkflow({
      project,
      decisions: [decision],
      tasks: [task],
      polling: { interval_ms: 60_000 },
      workspace: { root: "/var/tmp/sym" },
      agent: { max_concurrent_agents: 2, max_turns: 5 },
      codex: { command: "codex app-server --verbose" },
    });
    assert.match(out, /interval_ms: 60000/);
    assert.match(out, /root: \/var\/tmp\/sym/);
    assert.match(out, /max_concurrent_agents: 2/);
    assert.match(out, /max_turns: 5/);
    assert.match(out, /command: "codex app-server --verbose"/);
  });
});

describe("renderSymphonyWorkflow — prompt body", () => {
  it("includes project context, standing decisions, per-issue instructions with Liquid", () => {
    const out = renderSymphonyWorkflow({
      project,
      decisions: [decision, proposedDecision],
      tasks: [task],
      tracker: { project_slug: "demo-slug" },
    });
    // Title
    assert.match(out, /^# Symphony workflow: Demo project$/m);
    // Scope is included (rendered with bold markdown labels)
    assert.match(out, /\*\*In scope:\*\*\n- thing A/);
    assert.match(out, /\*\*Success criteria:\*\*\n- it ships/);
    // Only accepted decisions appear under Standing decisions
    assert.match(out, /`0001-pick-typescript` Pick TypeScript → \*\*TypeScript\*\*/);
    assert.doesNotMatch(out, /0002-pick-postgres/);
    // Liquid variables present
    assert.match(out, /\{\{ issue\.identifier \}\}/);
    assert.match(out, /\{\{ issue\.title \}\}/);
    assert.match(out, /\{% if attempt %\}retry #\{\{ attempt \}\}\{% else %\}first run\{% endif %\}/);
    // Anti-litigation guard
    assert.match(out, /Do not re-litigate accepted decisions/);
    // Outcome handoff note
    assert.match(out, /dr_record_outcome/);
  });

  it("notes when there are zero accepted decisions", () => {
    const out = renderSymphonyWorkflow({
      project: { ...project, scope: undefined },
      decisions: [],
      tasks: [task],
    });
    assert.match(out, /No accepted decisions at handoff/);
  });

  it("uses CHANGEME-style placeholder when no project_slug is set", () => {
    const out = renderSymphonyWorkflow({
      project,
      decisions: [decision],
      tasks: [task],
    });
    // No project_slug line at all when omitted
    assert.doesNotMatch(out, /project_slug:/);
  });
});
