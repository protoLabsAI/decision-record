import { Decision, Project, Task } from "../schemas/index.js";

/**
 * Configuration for rendering a Symphony WORKFLOW.md. Mirrors the front-matter
 * schema in https://github.com/openai/symphony/blob/main/SPEC.md §5.3.
 *
 * Designed to be a one-shot snapshot: at handoff time we freeze the runtime
 * config and the prompt template so Symphony can consume the result without
 * any further coordination. Operators edit WORKFLOW.md after the fact; the
 * spec mandates dynamic reload.
 */
export interface SymphonyWorkflowInputs {
  project: Project;
  decisions: Decision[];
  tasks: Task[];
  /** Issue tracker config. Defaults to Linear because that's the only tracker
   *  the current spec version (Draft v1) lists as supported (§5.3.1). */
  tracker?: {
    kind?: "linear";
    endpoint?: string;
    api_key_var?: string;
    project_slug?: string;
    active_states?: string[];
    terminal_states?: string[];
  };
  polling?: {
    interval_ms?: number;
  };
  workspace?: {
    root?: string;
    after_create?: string;
    before_run?: string;
    after_run?: string;
    before_remove?: string;
    timeout_ms?: number;
  };
  agent?: {
    max_concurrent_agents?: number;
    max_turns?: number;
    max_retry_backoff_ms?: number;
  };
  codex?: {
    command?: string;
    turn_timeout_ms?: number;
    read_timeout_ms?: number;
    stall_timeout_ms?: number;
  };
}

const DEFAULTS = {
  tracker: {
    kind: "linear" as const,
    endpoint: "https://api.linear.app/graphql",
    api_key_var: "LINEAR_API_KEY",
    active_states: ["Todo", "In Progress"],
    terminal_states: ["Closed", "Cancelled", "Canceled", "Duplicate", "Done"],
  },
  polling: { interval_ms: 30_000 },
  workspace: {
    root: "./.symphony-workspaces",
    timeout_ms: 60_000,
  },
  agent: {
    max_concurrent_agents: 5,
    max_turns: 20,
    max_retry_backoff_ms: 300_000,
  },
  codex: {
    command: "codex app-server",
    turn_timeout_ms: 3_600_000,
    read_timeout_ms: 5_000,
    stall_timeout_ms: 300_000,
  },
};

/**
 * Render a Symphony-compliant WORKFLOW.md. The output has YAML front matter
 * (§5.2 of the spec) plus a Markdown prompt body using Liquid template syntax
 * for `{{ issue.* }}` and `{{ attempt }}` (§5.4).
 */
export function renderSymphonyWorkflow(inputs: SymphonyWorkflowInputs): string {
  const front = renderFrontMatter(inputs);
  const prompt = renderPromptTemplate(inputs);
  return `${front}\n${prompt}\n`;
}

function renderFrontMatter(inputs: SymphonyWorkflowInputs): string {
  const tracker = mergeDefaults(DEFAULTS.tracker, inputs.tracker);
  const polling = mergeDefaults(DEFAULTS.polling, inputs.polling);
  const workspace = mergeDefaults(DEFAULTS.workspace, inputs.workspace);
  const agent = mergeDefaults(DEFAULTS.agent, inputs.agent);
  const codex = mergeDefaults(DEFAULTS.codex, inputs.codex);

  const lines: string[] = ["---"];
  lines.push("tracker:");
  lines.push(`  kind: ${tracker.kind}`);
  lines.push(`  endpoint: ${tracker.endpoint}`);
  lines.push(`  api_key: $${tracker.api_key_var}`);
  if (tracker.project_slug) {
    lines.push(`  project_slug: ${yamlString(tracker.project_slug)}`);
  }
  lines.push(`  active_states: ${yamlList(tracker.active_states ?? [])}`);
  lines.push(`  terminal_states: ${yamlList(tracker.terminal_states ?? [])}`);

  lines.push("polling:");
  lines.push(`  interval_ms: ${polling.interval_ms}`);

  lines.push("workspace:");
  lines.push(`  root: ${yamlString(workspace.root!)}`);

  const hooks: [string, string | undefined][] = [
    ["after_create", workspace.after_create],
    ["before_run", workspace.before_run],
    ["after_run", workspace.after_run],
    ["before_remove", workspace.before_remove],
  ];
  const presentHooks = hooks.filter(([, v]) => v && v.trim().length > 0);
  if (presentHooks.length > 0 || workspace.timeout_ms !== DEFAULTS.workspace.timeout_ms) {
    lines.push("hooks:");
    for (const [name, body] of presentHooks) {
      lines.push(`  ${name}: |`);
      for (const ln of (body as string).split("\n")) {
        lines.push(`    ${ln}`);
      }
    }
    if (workspace.timeout_ms !== undefined) {
      lines.push(`  timeout_ms: ${workspace.timeout_ms}`);
    }
  }

  lines.push("agent:");
  lines.push(`  max_concurrent_agents: ${agent.max_concurrent_agents}`);
  lines.push(`  max_turns: ${agent.max_turns}`);
  lines.push(`  max_retry_backoff_ms: ${agent.max_retry_backoff_ms}`);

  lines.push("codex:");
  lines.push(`  command: ${yamlString(codex.command!)}`);
  lines.push(`  turn_timeout_ms: ${codex.turn_timeout_ms}`);
  lines.push(`  read_timeout_ms: ${codex.read_timeout_ms}`);
  lines.push(`  stall_timeout_ms: ${codex.stall_timeout_ms}`);

  lines.push("---");
  return lines.join("\n");
}

function renderPromptTemplate(inputs: SymphonyWorkflowInputs): string {
  const { project, decisions, tasks } = inputs;
  const acceptedDecisions = decisions.filter((d) => d.status === "accepted");
  const taskTotal = tasks.length;
  const decisionTotal = acceptedDecisions.length;

  const sections: string[] = [];

  sections.push(`# Symphony workflow: ${project.title}`);
  sections.push("");
  sections.push(
    "This WORKFLOW.md is generated by [decision-record](https://github.com/protoLabsAI/protoLedger). Edit it; Symphony reloads on change. The full plan that produced this workflow lives in `dr/` in the repo workspace."
  );
  sections.push("");
  sections.push("## Project context");
  sections.push("");
  sections.push(`- **Project**: \`${project.id}\` — ${project.title}`);
  if (project.description) sections.push(`- **Description**: ${project.description}`);
  sections.push(`- **Effort level**: \`${project.effort_level}\``);
  sections.push(`- **Decisions accepted**: ${decisionTotal}`);
  sections.push(`- **Tasks at handoff**: ${taskTotal}`);
  sections.push("");
  if (project.scope) {
    if (project.scope.in_scope.length > 0) {
      sections.push("**In scope:**");
      for (const s of project.scope.in_scope) sections.push(`- ${s}`);
      sections.push("");
    }
    if (project.scope.success_criteria.length > 0) {
      sections.push("**Success criteria:**");
      for (const s of project.scope.success_criteria) sections.push(`- ${s}`);
      sections.push("");
    }
    if (project.scope.out_of_scope.length > 0) {
      sections.push("**Out of scope:**");
      for (const s of project.scope.out_of_scope) sections.push(`- ${s}`);
      sections.push("");
    }
  }

  sections.push("## Standing decisions");
  sections.push("");
  if (acceptedDecisions.length === 0) {
    sections.push("_No accepted decisions at handoff. Re-run the planning pipeline if a task requires architectural context._");
  } else {
    for (const d of acceptedDecisions) {
      const pos = d.selected_position ? ` → **${d.selected_position}**` : "";
      sections.push(`- \`${d.id}\` ${d.title}${pos}`);
    }
    sections.push("");
    sections.push(
      "Full content for each decision: read `dr/decisions/<id>.md` in the workspace. **Do not re-litigate accepted decisions** without recording a superseding DR."
    );
  }
  sections.push("");

  sections.push("## Per-issue instructions");
  sections.push("");
  sections.push(
    "You are picking up an issue from the project tracker. The issue corresponds to a `decision-record` task. Your job is to implement it inside this workspace and hand it back via the tracker."
  );
  sections.push("");
  sections.push(`Attempt: {% if attempt %}retry #{{ attempt }}{% else %}first run{% endif %}`);
  sections.push("");
  sections.push("**Issue:** `{{ issue.identifier }}` — {{ issue.title }}");
  sections.push("");
  sections.push("{% if issue.description %}");
  sections.push("**Description:**");
  sections.push("");
  sections.push("{{ issue.description }}");
  sections.push("{% endif %}");
  sections.push("");
  sections.push("{% if issue.labels and issue.labels.size > 0 %}");
  sections.push("**Labels:** {% for label in issue.labels %}`{{ label }}`{% unless forloop.last %}, {% endunless %}{% endfor %}");
  sections.push("{% endif %}");
  sections.push("");
  sections.push("{% if issue.branch_name %}");
  sections.push("**Branch:** `{{ issue.branch_name }}`");
  sections.push("{% endif %}");
  sections.push("");
  sections.push("### Workflow");
  sections.push("");
  sections.push(
    "1. Resolve this Symphony issue to the underlying decision-record task. Find the task file in `dr/tasks/` whose `external_ref.id` matches `{{ issue.identifier }}` (look at `dr/tasks/T*.json`)."
  );
  sections.push(
    "2. Read the task's `decision_refs` and load each referenced decision from `dr/decisions/<id>.md`. Honor the selected position and argument as load-bearing constraints."
  );
  sections.push(
    "3. Check the task's `depends_on` list. If any predecessors are not yet `done` in this workspace, stop and surface that as a blocker rather than working ahead."
  );
  sections.push(
    "4. Implement the task. Stay inside this workspace; never modify files outside `cwd`. Match the project's existing conventions — read a few neighboring files before writing."
  );
  sections.push(
    "5. Satisfy the `acceptance_criteria` from the task. If you cannot, surface why; do not silently weaken them."
  );
  sections.push(
    "6. Run the project's test suite (if any). If tests don't exist, add the minimum that proves your change works."
  );
  sections.push(
    "7. Open a PR. The PR description MUST cite the task id and the accepted decisions you relied on (`dr:T0001-foo`, `dr:0003-bar`). Move the tracker issue into the project's review/handoff state via the tracker tool."
  );
  sections.push("");
  sections.push("### What you MUST NOT do");
  sections.push("");
  sections.push(
    "- Modify or delete files in `dr/decisions/` or `dr/outcomes/`. Those are append-only sources of truth. If you believe a decision is wrong, surface it as a comment on the issue and stop."
  );
  sections.push(
    "- Mark an issue Done if work is partial. Move it to the project's review state instead, and call out gaps explicitly."
  );
  sections.push("- Modify files outside this workspace's working directory.");
  sections.push("");
  sections.push("### Outcome recording");
  sections.push("");
  sections.push(
    "After your change has merged, the project's planning surface records an Outcome record (`dr_record_outcome`) for any decision your work tested. You don't author the Outcome; you provide the evidence — a PR link, a metric, a measured result — in the issue's review comment so the planner can pick it up."
  );

  return sections.join("\n");
}

function mergeDefaults<
  D extends Record<string, unknown>,
  O extends Record<string, unknown>,
>(defaults: D, overrides: O | undefined): D & O {
  const out: Record<string, unknown> = { ...defaults };
  if (overrides) {
    for (const [k, v] of Object.entries(overrides)) {
      if (v !== undefined) out[k] = v;
    }
  }
  return out as D & O;
}

function yamlString(s: string): string {
  if (s.length === 0) return `""`;
  if (/^[A-Za-z0-9_\-./~$]+$/.test(s)) return s;
  // Quote if it contains anything that could confuse YAML.
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function yamlList(items: string[]): string {
  if (items.length === 0) return "[]";
  return `[${items.map(yamlString).join(", ")}]`;
}
