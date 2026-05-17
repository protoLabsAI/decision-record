import { z } from "zod";
import { Store } from "../storage/store.js";
import { fail, ok, registerTool } from "./registry.js";
import { nowIso } from "../util.js";
import {
  renderDecisionMarkdown,
  renderOutcomeMarkdown,
  renderProjectMarkdown,
  renderTaskMarkdown,
} from "../render/markdown.js";
import { renderIndexHtml } from "../render/html.js";

function resolveCwd(cwd: string | undefined): string {
  return cwd && cwd.length > 0 ? cwd : process.cwd();
}

export function registerRenderTools(): void {
  registerTool({
    name: "dr_render",
    description:
      "Regenerate human-readable artifacts: per-decision Markdown, per-task Markdown, project.md, and dr/index.html. Idempotent — JSON is the source of truth.",
    inputSchema: z.object({
      cwd: z.string().optional(),
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
      const outcomes = await store.listOutcomes();
      const decisionsById = new Map(decisions.map((d) => [d.id, d]));

      for (const decision of decisions) {
        await store.writeDecisionMarkdown(decision.id, renderDecisionMarkdown(decision, outcomes));
      }
      for (const task of tasks) {
        await store.writeTaskMarkdown(task.id, renderTaskMarkdown(task, decisionsById));
      }
      for (const outcome of outcomes) {
        await store.writeOutcomeMarkdown(
          outcome.id,
          renderOutcomeMarkdown(outcome, decisionsById.get(outcome.decision_id))
        );
      }
      await store.writeIndexHtml(renderIndexHtml(project, decisions, tasks, outcomes));
      // Also emit a project.md alongside project.json for git readers.
      const projectMd = renderProjectMarkdown(
        project,
        decisions.length,
        tasks.length,
        outcomes.length
      );
      const { writeFile } = await import("node:fs/promises");
      const { join } = await import("node:path");
      await writeFile(join(store.paths.tracked, "project.md"), projectMd, "utf8");

      const now = nowIso();
      await store.writeState({ ...state, last_render_at: now, last_event_at: now });
      await store.appendEvent({
        at: now,
        actor: "agent",
        kind: "render_run",
        payload: {
          decisions: decisions.length,
          tasks: tasks.length,
          outcomes: outcomes.length,
        },
      });
      return ok({
        decisions_rendered: decisions.length,
        tasks_rendered: tasks.length,
        outcomes_rendered: outcomes.length,
        index_html: store.paths.index_html,
      });
    },
  });
}
