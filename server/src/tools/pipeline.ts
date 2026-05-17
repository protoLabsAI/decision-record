import { z } from "zod";
import { Store } from "../storage/store.js";
import {
  EffortLevelSchema,
  GateOverridesSchema,
  PipelineState,
  Project,
  SCHEMA_VERSION,
  ScopeSchema,
} from "../schemas/index.js";
import { resolveEffectiveGateConfig } from "../gate.js";
import { fail, ok, registerTool } from "./registry.js";
import { nowIso, slugify } from "../util.js";
import { evaluateAdvance, nextPhaseOf } from "../gateEval.js";

const CwdInput = z.object({
  cwd: z
    .string()
    .optional()
    .describe(
      "Target repo working directory. Defaults to the server's process.cwd()."
    ),
});

function resolveCwd(cwd: string | undefined): string {
  return cwd && cwd.length > 0 ? cwd : process.cwd();
}

export function registerPipelineTools(): void {
  registerTool({
  name: "dr_init",
  description:
    "Initialize the decision-record pipeline in a target repo. Creates `.dr/` and `dr/` layout, writes state.json and project.json. Fails if already initialized.",
  inputSchema: z.object({
    cwd: z
      .string()
      .optional()
      .describe(
        "Target repo working directory. Defaults to the server's process.cwd()."
      ),
    title: z.string().min(1).max(120).describe("Project title."),
    description: z
      .string()
      .optional()
      .describe("Intake-phase idea description. Can be refined later."),
    effort_level: EffortLevelSchema.default("mvp").describe(
      "Calibrates gate strictness. 'poc' is loosest; 'full' is strictest."
    ),
    gate_overrides: GateOverridesSchema.optional().describe(
      "Override individual gate knobs on top of the preset."
    ),
    tags: z.array(z.string()).default([]),
    project_id: z
      .string()
      .optional()
      .describe(
        "Optional explicit slug. If omitted, derived from title via slugify."
      ),
  }),
  async handler(input) {
    const cwd = resolveCwd(input.cwd);
    const store = new Store(cwd);
    if (await store.hasProject()) {
      return fail(
        `A project is already initialized at ${cwd}. Use dr_status to inspect it.`
      );
    }
    await store.ensureLayout();
    const id = input.project_id ?? slugify(input.title);
    if (!/^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$/.test(id)) {
      return fail(
        `Derived id '${id}' is not a valid slug. Pass a custom 'project_id' (kebab-case, 3-64 chars).`
      );
    }
    const now = nowIso();
    const effective = resolveEffectiveGateConfig({
      preset: input.effort_level,
      overrides: input.gate_overrides,
    });
    const project: Project = {
      id,
      title: input.title,
      description: input.description ?? "",
      created_at: now,
      updated_at: now,
      effort_level: input.effort_level,
      status: "intake",
      sign_offs: [],
      gate_config: {
        preset: input.effort_level,
        overrides: input.gate_overrides,
      },
      tags: input.tags,
    };
    const state: PipelineState = {
      schema_version: SCHEMA_VERSION,
      project_id: id,
      phase: "intake",
      effective_gate_config: effective,
      next_decision_seq: 1,
      next_task_seq: 1,
      pending_questions: [],
      gate_failures: [],
      last_event_at: now,
    };
    await store.writeProject(project);
    await store.writeState(state);
    await store.appendEvent({
      at: now,
      actor: "agent",
      kind: "project_initialized",
      entity_kind: "project",
      entity_id: id,
      payload: { effort_level: input.effort_level },
    });
    return ok({
      project_id: id,
      paths: store.paths,
      project,
      state,
      next_phase: nextPhaseOf("intake"),
    });
  },
});

registerTool({
  name: "dr_status",
  description:
    "Read pipeline status: project metadata, current phase, gate evaluation against the next phase (what's blocking advance), counts.",
  inputSchema: CwdInput,
  async handler(input) {
    const cwd = resolveCwd(input.cwd);
    const store = new Store(cwd);
    if (!(await store.hasProject())) {
      return fail(`No project initialized at ${cwd}. Run dr_init first.`);
    }
    const project = await store.readProject();
    const state = await store.readState();
    const decisions = await store.listDecisions();
    const tasks = await store.listTasks();
    const gate = evaluateAdvance(project, state, decisions, tasks, null);
    return ok({
      project: {
        id: project.id,
        title: project.title,
        status: project.status,
        effort_level: project.effort_level,
        updated_at: project.updated_at,
      },
      state: {
        phase: state.phase,
        next_phase: gate.next_phase,
        last_event_at: state.last_event_at,
        last_render_at: state.last_render_at,
      },
      gate_to_next: gate,
      counts: {
        decisions: decisions.length,
        decisions_accepted: decisions.filter((d) => d.status === "accepted").length,
        tasks: tasks.length,
        tasks_ready: tasks.filter((t) => t.status === "ready").length,
      },
      pending_questions: state.pending_questions.filter((q) => !q.answered),
      effective_gate_config: state.effective_gate_config,
    });
  },
});

registerTool({
  name: "dr_advance",
  description:
    "Advance to the next pipeline phase if the gate passes. Records a sign-off and emits a 'phase_advanced' event. If the gate fails, returns reasons without changing phase.",
  inputSchema: z.object({
    cwd: z.string().optional(),
    sign_off_by: z
      .enum(["agent", "human"])
      .optional()
      .describe(
        "Who is signing off the transition. Required when the next phase needs human sign-off (see gate_config.require_human_signoff_phases)."
      ),
    sign_off_actor: z.string().optional(),
    sign_off_notes: z.string().optional(),
  }),
  async handler(input) {
    const cwd = resolveCwd(input.cwd);
    const store = new Store(cwd);
    if (!(await store.hasProject())) {
      return fail(`No project initialized at ${cwd}. Run dr_init first.`);
    }
    const project = await store.readProject();
    const state = await store.readState();
    const decisions = await store.listDecisions();
    const tasks = await store.listTasks();
    const signOff = input.sign_off_by
      ? {
          by: input.sign_off_by,
          actor: input.sign_off_actor,
          notes: input.sign_off_notes,
        }
      : null;
    const gate = evaluateAdvance(project, state, decisions, tasks, signOff);
    const now = nowIso();
    if (!gate.pass || !gate.next_phase) {
      const failure = {
        phase_from: state.phase,
        phase_to: gate.next_phase ?? state.phase,
        at: now,
        reasons: gate.reasons,
      };
      const newState: PipelineState = {
        ...state,
        gate_failures: [...state.gate_failures, failure],
        last_event_at: now,
      };
      await store.writeState(newState);
      await store.appendEvent({
        at: now,
        actor: "agent",
        kind: "phase_advance_blocked",
        entity_kind: "phase",
        entity_id: state.phase,
        payload: { reasons: gate.reasons, attempted_target: gate.next_phase },
      });
      return fail(...gate.reasons);
    }

    const next = gate.next_phase;
    const transitionLabel =
      next === "scoping" || next === "deciding" || next === "decomposing" || next === "handing-off"
        ? next
        : null;
    const updatedSignOffs = transitionLabel && signOff
      ? [
          ...project.sign_offs,
          {
            phase: transitionLabel,
            by: signOff.by,
            actor: signOff.actor,
            at: now,
            notes: signOff.notes,
          },
        ]
      : project.sign_offs;

    const updatedProject: Project = {
      ...project,
      status: next,
      updated_at: now,
      sign_offs: updatedSignOffs,
    };
    const newState: PipelineState = {
      ...state,
      phase: next,
      last_event_at: now,
    };
    await store.writeProject(updatedProject);
    await store.writeState(newState);
    await store.appendEvent({
      at: now,
      actor: signOff?.by ?? "agent",
      actor_name: signOff?.actor,
      kind: "phase_advanced",
      entity_kind: "phase",
      entity_id: next,
      payload: { from: state.phase, to: next, notes: signOff?.notes },
    });
    if (signOff && transitionLabel) {
      await store.appendEvent({
        at: now,
        actor: signOff.by,
        actor_name: signOff.actor,
        kind: "sign_off_recorded",
        entity_kind: "phase",
        entity_id: transitionLabel,
      });
    }
    return ok({
      phase: next,
      project: updatedProject,
      state: newState,
    });
  },
});

registerTool({
  name: "dr_update_project",
  description:
    "Patch project metadata: title, description, tags, and gate-override knobs. Cannot change effort_level preset (re-init for that).",
  inputSchema: z.object({
    cwd: z.string().optional(),
    title: z.string().min(1).max(120).optional(),
    description: z.string().optional(),
    tags: z.array(z.string()).optional(),
    gate_overrides: GateOverridesSchema.optional(),
  }),
  async handler(input) {
    const cwd = resolveCwd(input.cwd);
    const store = new Store(cwd);
    if (!(await store.hasProject())) {
      return fail(`No project initialized at ${cwd}.`);
    }
    const project = await store.readProject();
    const state = await store.readState();
    const now = nowIso();
    const newOverrides = input.gate_overrides ?? project.gate_config.overrides;
    const updated: Project = {
      ...project,
      title: input.title ?? project.title,
      description: input.description ?? project.description,
      tags: input.tags ?? project.tags,
      gate_config: {
        preset: project.gate_config.preset,
        overrides: newOverrides,
      },
      updated_at: now,
    };
    const effective = resolveEffectiveGateConfig(updated.gate_config);
    const newState: PipelineState = {
      ...state,
      effective_gate_config: effective,
      last_event_at: now,
    };
    await store.writeProject(updated);
    await store.writeState(newState);
    await store.appendEvent({
      at: now,
      actor: "agent",
      kind: "scope_updated",
      entity_kind: "project",
      entity_id: updated.id,
      payload: { changed: Object.keys(input).filter((k) => k !== "cwd") },
    });
    return ok({ project: updated, effective_gate_config: effective });
  },
});

registerTool({
  name: "dr_update_scope",
  description:
    "Update the project's MVP scope (in_scope, out_of_scope, success_criteria, nice_to_have). Used during the scoping phase. Each list replaces in full when provided.",
  inputSchema: z.object({
    cwd: z.string().optional(),
    in_scope: z.array(z.string()).optional(),
    out_of_scope: z.array(z.string()).optional(),
    success_criteria: z.array(z.string()).optional(),
    nice_to_have: z.array(z.string()).optional(),
  }),
  async handler(input) {
    const cwd = resolveCwd(input.cwd);
    const store = new Store(cwd);
    if (!(await store.hasProject())) {
      return fail(`No project initialized at ${cwd}.`);
    }
    const project = await store.readProject();
    const existing = project.scope ?? {
      in_scope: [],
      out_of_scope: [],
      success_criteria: [],
      nice_to_have: [],
    };
    const updatedScope = ScopeSchema.parse({
      in_scope: input.in_scope ?? existing.in_scope,
      out_of_scope: input.out_of_scope ?? existing.out_of_scope,
      success_criteria: input.success_criteria ?? existing.success_criteria,
      nice_to_have: input.nice_to_have ?? existing.nice_to_have,
    });
    const now = nowIso();
    const updated: Project = {
      ...project,
      scope: updatedScope,
      updated_at: now,
    };
    await store.writeProject(updated);
    await store.appendEvent({
      at: now,
      actor: "agent",
      kind: "scope_updated",
      entity_kind: "project",
      entity_id: project.id,
      payload: { scope: updatedScope },
    });
    return ok({ scope: updatedScope });
  },
});
}
