import { z } from "zod";
import { Store } from "../storage/store.js";
import {
  DecisionIdSchema,
  Task,
  TaskIdSchema,
  TaskSchema,
  TaskStatusSchema,
} from "../schemas/index.js";
import { fail, ok, registerTool } from "./registry.js";
import { nowIso, slugify, taskId } from "../util.js";

function resolveCwd(cwd: string | undefined): string {
  return cwd && cwd.length > 0 ? cwd : process.cwd();
}

function estimateHours(estimate: Task["estimate"]): number | null {
  if (!estimate) return null;
  return estimate.unit === "days" ? estimate.value * 8 : estimate.value;
}

interface GraphValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
  cycles: string[][];
  orphans: string[];
  oversized: { id: string; hours: number | null; limit: number }[];
  missing_decision_refs: { task_id: string; missing: string[] }[];
}

function validateTaskGraph(
  tasks: Task[],
  decisionIds: Set<string>,
  maxHours: number
): GraphValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const ids = new Set(tasks.map((t) => t.id));
  const orphans: string[] = [];
  for (const t of tasks) {
    for (const dep of t.depends_on) {
      if (!ids.has(dep)) orphans.push(`${t.id} → ${dep}`);
    }
  }
  if (orphans.length > 0) {
    errors.push(`Orphan dependencies: ${orphans.join(", ")}`);
  }
  const cycles = findCycles(tasks);
  if (cycles.length > 0) {
    errors.push(
      `Cycles in task graph: ${cycles.map((c) => c.join(" → ")).join("; ")}`
    );
  }
  const oversized = tasks
    .map((t) => {
      const h = estimateHours(t.estimate);
      return { id: t.id, hours: h, limit: maxHours };
    })
    .filter((x) => x.hours === null || (x.hours as number) > maxHours);
  if (oversized.length > 0) {
    errors.push(
      `Tasks over estimate limit (${maxHours}h) or missing estimates: ${oversized
        .map((o) => `${o.id}${o.hours === null ? " (no estimate)" : ` (${o.hours}h)`}`)
        .join(", ")}`
    );
  }
  const missingDecisionRefs = tasks
    .map((t) => ({
      task_id: t.id,
      missing: t.decision_refs.filter((d) => !decisionIds.has(d)),
    }))
    .filter((x) => x.missing.length > 0);
  if (missingDecisionRefs.length > 0) {
    errors.push(
      `Tasks reference missing decisions: ${missingDecisionRefs
        .map((m) => `${m.task_id} → [${m.missing.join(", ")}]`)
        .join("; ")}`
    );
  }
  const tasksWithoutDecisionRefs = tasks.filter((t) => t.decision_refs.length === 0);
  if (tasksWithoutDecisionRefs.length > 0) {
    warnings.push(
      `${tasksWithoutDecisionRefs.length} task(s) have no decision_refs — they will ship without explicit decision traceability: ${tasksWithoutDecisionRefs
        .map((t) => t.id)
        .join(", ")}`
    );
  }
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    cycles,
    orphans,
    oversized,
    missing_decision_refs: missingDecisionRefs,
  };
}

function findCycles(tasks: Task[]): string[][] {
  const ids = new Set(tasks.map((t) => t.id));
  const adj = new Map<string, string[]>();
  for (const t of tasks) {
    adj.set(t.id, t.depends_on.filter((d) => ids.has(d)));
  }
  const cycles: string[][] = [];
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  for (const id of adj.keys()) color.set(id, WHITE);

  const stack: string[] = [];
  function dfs(u: string) {
    color.set(u, GRAY);
    stack.push(u);
    for (const v of adj.get(u) ?? []) {
      const c = color.get(v);
      if (c === GRAY) {
        const startIdx = stack.indexOf(v);
        if (startIdx >= 0) cycles.push([...stack.slice(startIdx), v]);
      } else if (c === WHITE) {
        dfs(v);
      }
    }
    stack.pop();
    color.set(u, BLACK);
  }

  for (const id of adj.keys()) {
    if (color.get(id) === WHITE) dfs(id);
  }
  return cycles;
}

export function registerTaskTools(): void {
  registerTool({
    name: "dr_propose_task",
    description:
      "Create a new task node. Tasks should derive from accepted decisions — pass their IDs in decision_refs for traceability. Status starts as 'open' (or 'ready' if all deps are met at creation).",
    inputSchema: z.object({
      cwd: z.string().optional(),
      title: z.string().min(1).max(120),
      description: z.string().optional(),
      depends_on: z.array(TaskIdSchema).default([]),
      decision_refs: z.array(DecisionIdSchema).default([]),
      estimate: z
        .object({
          unit: z.enum(["hours", "days"]),
          value: z.number().min(0),
          confidence: z.enum(["low", "med", "high"]).optional(),
        })
        .optional(),
      acceptance_criteria: z.array(z.string()).default([]),
      priority: z.enum(["p0", "p1", "p2", "p3"]).default("p2"),
      labels: z.array(z.string()).default([]),
      assignee_hint: z.enum(["agent", "human", "either"]).optional(),
      slug: z.string().optional(),
    }),
    async handler(input) {
      const cwd = resolveCwd(input.cwd);
      const store = new Store(cwd);
      if (!(await store.hasProject())) {
        return fail(`No project initialized at ${cwd}.`);
      }
      const state = await store.readState();
      const seq = state.next_task_seq;
      const slug = input.slug ?? slugify(input.title);
      if (!/^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$/.test(slug)) {
        return fail(`Derived slug '${slug}' invalid. Pass 'slug' explicitly.`);
      }
      const id = taskId(seq, slug);
      const existing = await store.listTasks();
      if (existing.some((t) => t.id === id)) {
        return fail(`Task with id ${id} already exists.`);
      }
      const status = input.depends_on.length === 0 ? "ready" : "open";
      const now = nowIso();
      const task: Task = TaskSchema.parse({
        id,
        number: seq,
        slug,
        title: input.title,
        description: input.description,
        status,
        estimate: input.estimate,
        acceptance_criteria: input.acceptance_criteria,
        depends_on: input.depends_on,
        decision_refs: input.decision_refs,
        priority: input.priority,
        labels: input.labels,
        assignee_hint: input.assignee_hint,
        created_at: now,
        updated_at: now,
      });
      await store.writeTask(task);
      await store.writeState({ ...state, next_task_seq: seq + 1, last_event_at: now });
      await store.appendEvent({
        at: now,
        actor: "agent",
        kind: "task_proposed",
        entity_kind: "task",
        entity_id: id,
        payload: {
          decision_refs: input.decision_refs,
          depends_on: input.depends_on,
        },
      });
      return ok({ task });
    },
  });

  registerTool({
    name: "dr_update_task",
    description:
      "Patch fields on an existing task. Pass only the fields you want to change. Use dr_set_task_status to change lifecycle state.",
    inputSchema: z.object({
      cwd: z.string().optional(),
      id: TaskIdSchema,
      title: z.string().min(1).max(120).optional(),
      description: z.string().optional(),
      depends_on: z.array(TaskIdSchema).optional(),
      decision_refs: z.array(DecisionIdSchema).optional(),
      estimate: z
        .object({
          unit: z.enum(["hours", "days"]),
          value: z.number().min(0),
          confidence: z.enum(["low", "med", "high"]).optional(),
        })
        .optional(),
      acceptance_criteria: z.array(z.string()).optional(),
      priority: z.enum(["p0", "p1", "p2", "p3"]).optional(),
      labels: z.array(z.string()).optional(),
      assignee_hint: z.enum(["agent", "human", "either"]).optional(),
    }),
    async handler(input) {
      const cwd = resolveCwd(input.cwd);
      const store = new Store(cwd);
      const task = await store.readTask(input.id);
      const now = nowIso();
      const updated: Task = TaskSchema.parse({
        ...task,
        title: input.title ?? task.title,
        description: input.description ?? task.description,
        depends_on: input.depends_on ?? task.depends_on,
        decision_refs: input.decision_refs ?? task.decision_refs,
        estimate: input.estimate ?? task.estimate,
        acceptance_criteria: input.acceptance_criteria ?? task.acceptance_criteria,
        priority: input.priority ?? task.priority,
        labels: input.labels ?? task.labels,
        assignee_hint: input.assignee_hint ?? task.assignee_hint,
        updated_at: now,
      });
      await store.writeTask(updated);
      await store.appendEvent({
        at: now,
        actor: "agent",
        kind: "task_updated",
        entity_kind: "task",
        entity_id: updated.id,
        payload: { changed: Object.keys(input).filter((k) => k !== "cwd" && k !== "id") },
      });
      return ok({ task: updated });
    },
  });

  registerTool({
    name: "dr_set_task_status",
    description:
      "Change a task's lifecycle status. Pre-handoff statuses only: open, ready, in_progress, done, blocked, deferred. Post-handoff status is managed in the target system.",
    inputSchema: z.object({
      cwd: z.string().optional(),
      id: TaskIdSchema,
      status: TaskStatusSchema,
    }),
    async handler(input) {
      const cwd = resolveCwd(input.cwd);
      const store = new Store(cwd);
      const task = await store.readTask(input.id);
      const now = nowIso();
      const updated: Task = TaskSchema.parse({
        ...task,
        status: input.status,
        updated_at: now,
      });
      await store.writeTask(updated);
      await store.appendEvent({
        at: now,
        actor: "agent",
        kind: "task_status_changed",
        entity_kind: "task",
        entity_id: updated.id,
        payload: { from: task.status, to: input.status },
      });
      return ok({ task: updated });
    },
  });

  registerTool({
    name: "dr_list_tasks",
    description:
      "List tasks with optional status/priority/label filters. Returns summaries; call dr_get_task for full content.",
    inputSchema: z.object({
      cwd: z.string().optional(),
      status: z.array(TaskStatusSchema).optional(),
      priority: z.array(z.enum(["p0", "p1", "p2", "p3"])).optional(),
      label: z.string().optional(),
    }),
    async handler(input) {
      const cwd = resolveCwd(input.cwd);
      const store = new Store(cwd);
      const tasks = await store.listTasks();
      const filtered = tasks.filter((t) => {
        if (input.status && !input.status.includes(t.status)) return false;
        if (input.priority && !input.priority.includes(t.priority)) return false;
        if (input.label && !t.labels.includes(input.label)) return false;
        return true;
      });
      return ok({
        tasks: filtered.map((t) => ({
          id: t.id,
          title: t.title,
          status: t.status,
          priority: t.priority,
          depends_on: t.depends_on,
          decision_refs: t.decision_refs,
          estimate: t.estimate,
          labels: t.labels,
          updated_at: t.updated_at,
        })),
        total: filtered.length,
        grand_total: tasks.length,
      });
    },
  });

  registerTool({
    name: "dr_get_task",
    description: "Fetch the full content of a task by id.",
    inputSchema: z.object({
      cwd: z.string().optional(),
      id: TaskIdSchema,
    }),
    async handler(input) {
      const cwd = resolveCwd(input.cwd);
      const store = new Store(cwd);
      const task = await store.readTask(input.id);
      return ok({ task });
    },
  });

  registerTool({
    name: "dr_ready_tasks",
    description:
      "Return tasks whose dependencies are all 'done' (or which have no deps), sorted by priority. The beads-style 'what's next' query.",
    inputSchema: z.object({
      cwd: z.string().optional(),
      include_open: z
        .boolean()
        .default(true)
        .describe("Include 'open' tasks whose deps are now satisfied (recompute readiness on read)."),
    }),
    async handler(input) {
      const cwd = resolveCwd(input.cwd);
      const store = new Store(cwd);
      const tasks = await store.listTasks();
      const doneIds = new Set(tasks.filter((t) => t.status === "done").map((t) => t.id));
      const ready = tasks
        .filter((t) => {
          const candidate = t.status === "ready" || (input.include_open && t.status === "open");
          if (!candidate) return false;
          return t.depends_on.every((dep) => doneIds.has(dep));
        })
        .sort((a, b) => a.priority.localeCompare(b.priority) || a.number - b.number);
      return ok({
        ready: ready.map((t) => ({
          id: t.id,
          title: t.title,
          status: t.status,
          priority: t.priority,
          estimate: t.estimate,
          depends_on: t.depends_on,
          assignee_hint: t.assignee_hint,
        })),
        count: ready.length,
      });
    },
  });

  registerTool({
    name: "dr_validate_graph",
    description:
      "Validate the full task graph: no cycles, no orphan dependencies, all estimates present and within the project's max_task_estimate_hours, all decision_refs point to existing decisions. Emits 'graph_validated' event.",
    inputSchema: z.object({
      cwd: z.string().optional(),
    }),
    async handler(input) {
      const cwd = resolveCwd(input.cwd);
      const store = new Store(cwd);
      const state = await store.readState();
      const tasks = await store.listTasks();
      const decisions = await store.listDecisions();
      const decisionIds = new Set(decisions.map((d) => d.id));
      const result = validateTaskGraph(
        tasks,
        decisionIds,
        state.effective_gate_config.max_task_estimate_hours
      );
      const now = nowIso();
      await store.appendEvent({
        at: now,
        actor: "agent",
        kind: "graph_validated",
        payload: {
          valid: result.valid,
          task_count: tasks.length,
          error_count: result.errors.length,
          warning_count: result.warnings.length,
        },
      });
      return ok(result);
    },
  });
}
