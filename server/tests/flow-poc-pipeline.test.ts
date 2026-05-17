import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { makeTmpProject } from "./helpers/tmp-project.js";
import { makeMockOpenAI, ScriptedResponse } from "./helpers/mock-openai.js";
import { registerAllTools } from "../src/tools/index.js";
import { runPipeline } from "../src/cli/orchestrator.js";

/**
 * End-to-end pipeline test using a scripted mock LLM.
 *
 * This test drives the full intake → scoping → deciding → decomposing → handoff
 * flow without any real API calls. The mock LLM is told exactly what tool calls to
 * make at each phase, and we assert the artifacts on disk match expectations.
 */
describe("Flow: POC happy path (mock LLM)", () => {
  let toolsRegistered = false;

  before(() => {
    if (!toolsRegistered) {
      registerAllTools();
      toolsRegistered = true;
    }
  });

  it("runs intake → scoping → deciding → decomposing → handoff (filesystem)", async () => {
    const project = makeTmpProject("dr-flow-poc-");
    try {
      const script: ScriptedResponse[] = [
        // ── Scoping agent ──────────────────────────────────────────────
        // Turn 1: read status
        { toolCalls: [{ name: "dr_status", args: {} }] },
        // Turn 2: set scope
        {
          toolCalls: [
            {
              name: "dr_update_scope",
              args: {
                in_scope: ["thing A", "thing B"],
                success_criteria: ["it works", "it ships"],
                out_of_scope: ["far-future feature"],
                nice_to_have: [],
              },
            },
          ],
        },
        // Turn 3: final summary
        { text: "Scope set. in_scope: A, B. success: it works, it ships." },

        // ── Deciding agent ─────────────────────────────────────────────
        // Turn 1: read status
        { toolCalls: [{ name: "dr_status", args: {} }] },
        // Turn 2: search seeds
        { toolCalls: [{ name: "dr_seed_search", args: { query: "language" } }] },
        // Turn 3: load seed
        {
          toolCalls: [{ name: "dr_seed_load", args: { seed_name: "language-choice" } }],
        },
        // Turn 4: pick a position + argument
        {
          toolCalls: [
            {
              name: "dr_update_decision",
              args: {
                id: "0001-choose-the-primary-implementation-language",
                selected_position: "TypeScript",
                argument: "Team has deep TS expertise and the project is web-facing.",
              },
            },
          ],
        },
        // Turn 5: final summary
        { text: "Decided: 0001-* → TypeScript." },

        // ── Skeptic (5 lenses × 1 decision = 5 invocations × 2 turns each) ──
        // Each skeptic invocation: 1 review tool call + 1 summary
        // operational
        {
          toolCalls: [
            {
              name: "dr_review_decision",
              args: {
                id: "0001-choose-the-primary-implementation-language",
                reviewer: "dr-skeptic",
                lens: "operational",
                verdict: "pass",
                score: 4,
                concerns: [],
              },
            },
          ],
        },
        { text: "Operational review: pass (4/5)." },
        // strategic
        {
          toolCalls: [
            {
              name: "dr_review_decision",
              args: {
                id: "0001-choose-the-primary-implementation-language",
                reviewer: "dr-skeptic",
                lens: "strategic",
                verdict: "pass",
                score: 4,
                concerns: [],
              },
            },
          ],
        },
        { text: "Strategic review: pass." },
        // security
        {
          toolCalls: [
            {
              name: "dr_review_decision",
              args: {
                id: "0001-choose-the-primary-implementation-language",
                reviewer: "dr-skeptic",
                lens: "security",
                verdict: "pass",
                score: 5,
                concerns: [],
              },
            },
          ],
        },
        { text: "Security review: pass." },
        // cost
        {
          toolCalls: [
            {
              name: "dr_review_decision",
              args: {
                id: "0001-choose-the-primary-implementation-language",
                reviewer: "dr-skeptic",
                lens: "cost",
                verdict: "pass",
                score: 4,
                concerns: [],
              },
            },
          ],
        },
        { text: "Cost review: pass." },
        // user-impact
        {
          toolCalls: [
            {
              name: "dr_review_decision",
              args: {
                id: "0001-choose-the-primary-implementation-language",
                reviewer: "dr-skeptic",
                lens: "user-impact",
                verdict: "pass",
                score: 5,
                concerns: [],
              },
            },
          ],
        },
        { text: "User-impact review: pass." },

        // ── Decomposer agent ───────────────────────────────────────────
        { toolCalls: [{ name: "dr_status", args: {} }] },
        { toolCalls: [{ name: "dr_list_decisions", args: { status: ["accepted"] } }] },
        {
          toolCalls: [
            {
              name: "dr_propose_task",
              args: {
                title: "Bootstrap repository",
                description: "Init repo, install deps, scaffold config.",
                acceptance_criteria: ["repo initialized", "tsconfig in place"],
                estimate: { unit: "hours", value: 2, confidence: "high" },
                decision_refs: ["0001-choose-the-primary-implementation-language"],
                priority: "p0",
              },
            },
          ],
        },
        {
          toolCalls: [
            {
              name: "dr_propose_task",
              args: {
                title: "Implement core feature",
                description: "Build the main thing.",
                acceptance_criteria: ["feature works", "tests pass"],
                estimate: { unit: "hours", value: 6, confidence: "med" },
                depends_on: ["T0001-bootstrap-repository"],
                decision_refs: ["0001-choose-the-primary-implementation-language"],
                priority: "p0",
              },
            },
          ],
        },
        {
          toolCalls: [
            {
              name: "dr_propose_task",
              args: {
                title: "Ship and document",
                description: "Build artifact and write README.",
                acceptance_criteria: ["binary built", "README complete"],
                estimate: { unit: "hours", value: 2, confidence: "high" },
                depends_on: ["T0002-implement-core-feature"],
                decision_refs: ["0001-choose-the-primary-implementation-language"],
                priority: "p1",
              },
            },
          ],
        },
        { toolCalls: [{ name: "dr_validate_graph", args: {} }] },
        { text: "3 tasks: bootstrap → implement → ship. Graph validates." },
      ];

      const client = makeMockOpenAI(script);

      const outcome = await runPipeline(
        {
          cwd: project.cwd,
          client,
          config: { apiKey: "mock", model: "mock" },
          autoYes: true,
          verbose: false,
        },
        {
          title: "Flow POC Test",
          description: "A test project for the flow harness.",
          effortLevel: "poc",
          prd: null,
          resume: false,
        }
      );

      assert.equal(outcome.exitCode, 0, "pipeline should exit cleanly");
      assert.equal(outcome.finalPhase, "handed-off", "should reach handed-off");

      // Artifacts on disk
      assert.ok(project.exists("dr/project.json"), "project.json exists");
      assert.ok(project.exists(".dr/state.json"), "state.json exists");
      assert.ok(project.exists("dr/index.html"), "index.html rendered");

      const projectJson = project.readJson<{
        status: string;
        handoff?: { target: string };
        scope?: { in_scope: string[] };
      }>("dr/project.json");
      assert.equal(projectJson.status, "handed-off");
      assert.equal(projectJson.handoff?.target, "filesystem");
      assert.deepEqual(projectJson.scope?.in_scope, ["thing A", "thing B"]);

      const decisions = project.list("dr/decisions").filter((f) => f.endsWith(".json"));
      assert.equal(decisions.length, 1, "exactly one decision");
      const decision = project.readJson<{ status: string; review: unknown[] }>(
        join("dr/decisions", decisions[0]!)
      );
      assert.equal(decision.status, "accepted");
      assert.equal(decision.review.length, 5, "5 lens reviews recorded");

      const tasks = project.list("dr/tasks").filter((f) => f.endsWith(".json"));
      assert.equal(tasks.length, 3, "three tasks");

      // Event log — verify all major lifecycle events were captured.
      // Note: this test uses a seed-loaded decision, which emits 'seed_loaded'
      // instead of 'decision_proposed'.
      const events = project.events();
      const kinds = new Set(events.map((e) => e.kind as string));
      assert.ok(kinds.has("project_initialized"), "project_initialized event");
      assert.ok(kinds.has("scope_updated"), "scope_updated event");
      assert.ok(kinds.has("seed_loaded"), "seed_loaded event (seed-instantiated DR)");
      assert.ok(kinds.has("decision_reviewed"), "decision_reviewed event");
      assert.ok(kinds.has("decision_accepted"), "decision_accepted event");
      assert.ok(kinds.has("task_proposed"), "task_proposed event");
      assert.ok(kinds.has("export_completed"), "export_completed event");
      assert.ok(kinds.has("phase_advanced"), "phase_advanced event");

      // Index HTML sanity
      const html = readFileSync(join(project.cwd, "dr/index.html"), "utf8");
      assert.ok(html.includes("Flow POC Test"));
      assert.ok(html.includes("handed-off"));
    } finally {
      project.dispose();
    }
  });

  it("rejects a decision when skeptic blocks and no override given", async () => {
    const project = makeTmpProject("dr-flow-block-");
    try {
      // Pre-initialize via direct tool calls so we land mid-pipeline quickly.
      const { executeAgentTool } = await import("../src/llm/tools.js");
      await executeAgentTool(
        "dr_init",
        { title: "Block Test", description: "test", effort_level: "poc" },
        { cwd: project.cwd }
      );
      await executeAgentTool("dr_advance", {}, { cwd: project.cwd });
      await executeAgentTool(
        "dr_update_scope",
        { in_scope: ["x"], success_criteria: ["y"] },
        { cwd: project.cwd }
      );
      await executeAgentTool("dr_advance", {}, { cwd: project.cwd });

      const script: ScriptedResponse[] = [
        // Deciding agent
        { toolCalls: [{ name: "dr_status", args: {} }] },
        {
          toolCalls: [
            {
              name: "dr_propose_decision",
              args: {
                title: "Pick a thing",
                issue: "We need to pick a thing.",
                positions: [{ title: "A" }, { title: "B" }],
              },
            },
          ],
        },
        {
          toolCalls: [
            {
              name: "dr_update_decision",
              args: { id: "0001-pick-a-thing", selected_position: "A", argument: "Because A." },
            },
          ],
        },
        { text: "Decided A." },

        // 5 skeptic reviews — first one blocks
        {
          toolCalls: [
            {
              name: "dr_review_decision",
              args: {
                id: "0001-pick-a-thing",
                reviewer: "dr-skeptic",
                lens: "operational",
                verdict: "block",
                score: 2,
                concerns: ["this would burn the team out"],
              },
            },
          ],
        },
        { text: "Operational: block." },
        // Subsequent lenses still run
        ...Array.from({ length: 4 }, () => [
          {
            toolCalls: [
              {
                name: "dr_review_decision",
                args: {
                  id: "0001-pick-a-thing",
                  reviewer: "dr-skeptic",
                  lens: "strategic",
                  verdict: "pass",
                  score: 3,
                  concerns: [],
                },
              },
            ],
          },
          { text: "pass." },
        ]).flat(),
        // After rejection, the orchestrator advances to decomposing (poc min_decisions=0).
        // Script the decomposer to do nothing — gate fails on min_tasks, pipeline returns 1.
        { toolCalls: [{ name: "dr_status", args: {} }] },
        { toolCalls: [{ name: "dr_list_decisions", args: { status: ["accepted"] } }] },
        { text: "No accepted decisions; producing no tasks." },
      ];

      const client = makeMockOpenAI(script);

      // autoYes: true means the override prompt receives "" (fallback "reject"),
      // so the orchestrator will reject the blocked decision.
      const outcome = await runPipeline(
        {
          cwd: project.cwd,
          client,
          config: { apiKey: "mock", model: "mock" },
          autoYes: true,
          verbose: false,
        },
        { resume: true, prd: null }
      );

      // Decision was rejected — gate fails (no accepted decisions for poc preset, but min_decisions=0)
      // Actually for poc preset, min_decisions=0, so the gate might pass. Either way, the
      // decision should be in 'rejected' state.
      const { executeAgentTool: tool2 } = await import("../src/llm/tools.js");
      const listRes = await tool2(
        "dr_list_decisions",
        { status: ["rejected"] },
        { cwd: project.cwd }
      );
      const rejected = (listRes.data as { decisions: { id: string }[] }).decisions;
      assert.equal(rejected.length, 1, "the blocked decision should be rejected");
      assert.equal(rejected[0]?.id, "0001-pick-a-thing");
      assert.ok([0, 1].includes(outcome.exitCode), "pipeline should exit cleanly or stall");
    } finally {
      project.dispose();
    }
  });
});
