import { z } from "zod";
import { Store } from "../storage/store.js";
import { fail, ok, registerTool } from "./registry.js";
import { nowIso } from "../util.js";
import { buildExportPlan, executeLinearExport } from "../handoff/linear.js";
import { Task, TaskSchema, PipelineState, Project } from "../schemas/index.js";

function resolveCwd(cwd: string | undefined): string {
  return cwd && cwd.length > 0 ? cwd : process.cwd();
}

const SignOffShape = {
  sign_off_by: z.enum(["agent", "human"]).default("human"),
  sign_off_actor: z.string().optional(),
  sign_off_notes: z.string().optional(),
} as const;

async function finalizeHandoff(
  store: Store,
  project: Project,
  state: PipelineState,
  target: "linear" | "filesystem",
  result: {
    target_id?: string;
    target_url?: string;
    issue_count?: number;
    document_count?: number;
  },
  signOff: { by: "agent" | "human"; actor?: string; notes?: string }
): Promise<{ project: Project; state: PipelineState }> {
  const now = nowIso();
  const handoff = {
    target,
    exported_at: now,
    target_id: result.target_id,
    target_url: result.target_url,
    issue_count: result.issue_count,
    document_count: result.document_count,
  };
  const updatedProject: Project = {
    ...project,
    status: "handed-off",
    updated_at: now,
    handoff,
    sign_offs: [
      ...project.sign_offs,
      {
        phase: "handing-off" as const,
        by: signOff.by,
        actor: signOff.actor,
        at: now,
        notes: signOff.notes,
      },
    ],
  };
  const updatedState: PipelineState = {
    ...state,
    phase: "handed-off",
    last_event_at: now,
  };
  await store.writeProject(updatedProject);
  await store.writeState(updatedState);
  await store.appendEvent({
    at: now,
    actor: signOff.by,
    actor_name: signOff.actor,
    kind: "export_completed",
    entity_kind: "project",
    entity_id: project.id,
    payload: { target, ...result },
  });
  return { project: updatedProject, state: updatedState };
}

export function registerHandoffTools(): void {
  registerTool({
    name: "dr_export_filesystem",
    description:
      "Finalize the project to filesystem-only — records handoff metadata, transitions to 'handed-off', and prevents further phase changes. Use this when there's no Linear (or any other) target.",
    inputSchema: z.object({
      cwd: z.string().optional(),
      ...SignOffShape,
    }),
    async handler(input) {
      const cwd = resolveCwd(input.cwd);
      const store = new Store(cwd);
      if (!(await store.hasProject())) {
        return fail(`No project initialized at ${cwd}.`);
      }
      const project = await store.readProject();
      const state = await store.readState();
      if (project.status !== "handing-off") {
        return fail(
          `Project must be in 'handing-off' phase to export. Currently '${project.status}'. Run dr_advance first.`
        );
      }
      const decisions = await store.listDecisions();
      const tasks = await store.listTasks();
      const now = nowIso();
      await store.appendEvent({
        at: now,
        actor: input.sign_off_by,
        actor_name: input.sign_off_actor,
        kind: "export_started",
        entity_kind: "project",
        entity_id: project.id,
        payload: { target: "filesystem" },
      });
      const result = await finalizeHandoff(
        store,
        project,
        state,
        "filesystem",
        {
          issue_count: tasks.length,
          document_count: decisions.length,
        },
        {
          by: input.sign_off_by,
          actor: input.sign_off_actor,
          notes: input.sign_off_notes,
        }
      );
      return ok({
        target: "filesystem",
        decisions: decisions.length,
        tasks: tasks.length,
        project: result.project,
      });
    },
  });

  registerTool({
    name: "dr_export_linear",
    description:
      "Export the project to Linear. Creates a Linear Project, an Issue per decision (labeled 'decision') and per task, with 'blocks' relations matching depends_on. Requires LINEAR_API_KEY env var or 'api_key' arg, plus a Linear team_id. Use dry_run=true to preview the export plan without calling the API.",
    inputSchema: z.object({
      cwd: z.string().optional(),
      team_id: z
        .string()
        .describe("Linear team UUID. Find this in Linear settings or via the GraphQL API."),
      api_key: z
        .string()
        .optional()
        .describe(
          "Linear personal API key. If omitted, reads from env LINEAR_API_KEY."
        ),
      dry_run: z
        .boolean()
        .default(false)
        .describe("Preview the export plan without calling Linear."),
      ...SignOffShape,
    }),
    async handler(input) {
      const cwd = resolveCwd(input.cwd);
      const store = new Store(cwd);
      if (!(await store.hasProject())) {
        return fail(`No project initialized at ${cwd}.`);
      }
      const project = await store.readProject();
      const state = await store.readState();
      const decisions = await store.listDecisions();
      const tasks = await store.listTasks();

      const apiKey = input.api_key ?? process.env.LINEAR_API_KEY;
      if (!apiKey && !input.dry_run) {
        return fail(
          "Linear API key not provided. Pass 'api_key' or set LINEAR_API_KEY env var. (Or call with dry_run=true to preview.)"
        );
      }

      const plan = buildExportPlan(project, decisions, tasks);
      if (input.dry_run) {
        return ok({
          dry_run: true,
          team_id: input.team_id,
          plan,
          totals: {
            issues: plan.issues.length,
            decisions: plan.issues.filter((i) => i.is_decision).length,
            tasks: plan.issues.filter((i) => !i.is_decision).length,
          },
        });
      }
      if (project.status !== "handing-off") {
        return fail(
          `Project must be in 'handing-off' phase to export. Currently '${project.status}'. Run dr_advance first.`
        );
      }

      const now = nowIso();
      await store.appendEvent({
        at: now,
        actor: input.sign_off_by,
        actor_name: input.sign_off_actor,
        kind: "export_started",
        entity_kind: "project",
        entity_id: project.id,
        payload: { target: "linear", team_id: input.team_id, issue_count: plan.issues.length },
      });

      let exportResult;
      try {
        exportResult = await executeLinearExport({ api_key: apiKey! }, input.team_id, plan);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await store.appendEvent({
          at: nowIso(),
          actor: "system",
          kind: "export_failed",
          entity_kind: "project",
          entity_id: project.id,
          payload: { target: "linear", error: message },
        });
        return fail(`Linear export failed: ${message}`);
      }

      // Patch tasks with their Linear external_ref.
      for (const issue of exportResult.issues) {
        if (issue.dr_id.startsWith("T")) {
          const task = await store.readTask(issue.dr_id);
          const updated: Task = TaskSchema.parse({
            ...task,
            external_ref: {
              system: "linear",
              id: issue.linear.identifier,
              url: issue.linear.url,
            },
            updated_at: nowIso(),
          });
          await store.writeTask(updated);
        }
      }

      const finalized = await finalizeHandoff(
        store,
        project,
        state,
        "linear",
        {
          target_id: exportResult.project.id,
          target_url: exportResult.project.url,
          issue_count: exportResult.issues.length,
          document_count: decisions.length,
        },
        {
          by: input.sign_off_by,
          actor: input.sign_off_actor,
          notes: input.sign_off_notes,
        }
      );
      return ok({
        target: "linear",
        linear_project: exportResult.project,
        issues_created: exportResult.issues.length,
        relations_created: exportResult.relations_created,
        project: finalized.project,
      });
    },
  });
}
