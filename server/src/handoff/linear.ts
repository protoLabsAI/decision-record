import { Decision, Project, Task } from "../schemas/index.js";

const LINEAR_API = "https://api.linear.app/graphql";

export interface LinearAuth {
  api_key: string;
}

interface LinearProject {
  id: string;
  url?: string;
  identifier?: string;
}

interface LinearIssue {
  id: string;
  identifier: string;
  url?: string;
}

interface ExportPlan {
  project: {
    name: string;
    description: string;
  };
  issues: {
    dr_id: string;
    title: string;
    description: string;
    priority: number;
    estimate?: number;
    labels: string[];
    blocked_by_dr_ids: string[];
    is_decision: boolean;
  }[];
}

const PRIORITY_TO_LINEAR: Record<"p0" | "p1" | "p2" | "p3", number> = {
  p0: 1, // urgent
  p1: 2, // high
  p2: 3, // medium
  p3: 4, // low
};

export function buildExportPlan(
  project: Project,
  decisions: Decision[],
  tasks: Task[]
): ExportPlan {
  const description = renderProjectDescription(project, decisions, tasks);
  const issues: ExportPlan["issues"] = [];

  for (const d of decisions) {
    issues.push({
      dr_id: d.id,
      title: `[Decision] ${d.title}`,
      description: renderDecisionDescription(d),
      priority: 3,
      labels: ["decision", `dr:${d.template_variant}`],
      blocked_by_dr_ids: d.depends_on,
      is_decision: true,
    });
  }
  for (const t of tasks) {
    const hours =
      t.estimate?.unit === "days"
        ? t.estimate.value * 8
        : t.estimate?.value;
    issues.push({
      dr_id: t.id,
      title: t.title,
      description: renderTaskDescription(t, decisions),
      priority: PRIORITY_TO_LINEAR[t.priority],
      estimate: hours,
      labels: ["task", ...t.labels],
      blocked_by_dr_ids: t.depends_on,
      is_decision: false,
    });
  }

  return {
    project: {
      name: project.title,
      description,
    },
    issues,
  };
}

function renderProjectDescription(
  project: Project,
  decisions: Decision[],
  tasks: Task[]
): string {
  const lines: string[] = [];
  lines.push(`**${project.title}** — exported from \`decision-record\``);
  lines.push("");
  if (project.description) {
    lines.push(project.description);
    lines.push("");
  }
  if (project.scope) {
    if (project.scope.in_scope.length > 0) {
      lines.push("**In scope**");
      for (const item of project.scope.in_scope) lines.push(`- ${item}`);
      lines.push("");
    }
    if (project.scope.success_criteria.length > 0) {
      lines.push("**Success criteria**");
      for (const item of project.scope.success_criteria) lines.push(`- ${item}`);
      lines.push("");
    }
    if (project.scope.out_of_scope.length > 0) {
      lines.push("**Out of scope**");
      for (const item of project.scope.out_of_scope) lines.push(`- ${item}`);
      lines.push("");
    }
  }
  lines.push(
    `${decisions.length} decision(s) · ${tasks.length} task(s) · effort \`${project.effort_level}\``
  );
  return lines.join("\n");
}

function renderDecisionDescription(d: Decision): string {
  const lines: string[] = [];
  if (d.summary) {
    lines.push(d.summary);
    lines.push("");
  }
  if (d.issue) {
    lines.push("**Issue**");
    lines.push(d.issue);
    lines.push("");
  }
  if (d.selected_position) {
    lines.push(`**Selected:** ${d.selected_position}`);
    lines.push("");
  }
  if (d.argument) {
    lines.push("**Argument**");
    lines.push(d.argument);
    lines.push("");
  }
  if (d.implications.length > 0) {
    lines.push("**Implications**");
    for (const impl of d.implications) lines.push(`- ${impl}`);
    lines.push("");
  }
  lines.push(`_DR id: \`${d.id}\` · status: \`${d.status}\` · variant: \`${d.template_variant}\`_`);
  return lines.join("\n");
}

function renderTaskDescription(t: Task, decisions: Decision[]): string {
  const lines: string[] = [];
  if (t.description) {
    lines.push(t.description);
    lines.push("");
  }
  if (t.acceptance_criteria.length > 0) {
    lines.push("**Acceptance criteria**");
    for (const c of t.acceptance_criteria) lines.push(`- [ ] ${c}`);
    lines.push("");
  }
  if (t.decision_refs.length > 0) {
    lines.push("**Decisions**");
    for (const ref of t.decision_refs) {
      const dec = decisions.find((d) => d.id === ref);
      lines.push(`- \`${ref}\`${dec ? ` — ${dec.title}` : ""}`);
    }
    lines.push("");
  }
  lines.push(`_Task id: \`${t.id}\`_`);
  return lines.join("\n");
}

async function gql<T>(auth: LinearAuth, query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch(LINEAR_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: auth.api_key,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) {
    throw new Error(`Linear API HTTP ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (json.errors && json.errors.length > 0) {
    throw new Error(`Linear API error: ${json.errors.map((e) => e.message).join("; ")}`);
  }
  if (!json.data) {
    throw new Error("Linear API returned no data.");
  }
  return json.data;
}

const CREATE_PROJECT = `mutation CreateProject($name: String!, $description: String, $teamIds: [String!]!) {
  projectCreate(input: { name: $name, description: $description, teamIds: $teamIds }) {
    success
    project { id url }
  }
}`;

const CREATE_ISSUE = `mutation CreateIssue($title: String!, $description: String, $teamId: String!, $projectId: String, $priority: Int, $estimate: Float, $labelIds: [String!]) {
  issueCreate(input: { title: $title, description: $description, teamId: $teamId, projectId: $projectId, priority: $priority, estimate: $estimate, labelIds: $labelIds }) {
    success
    issue { id identifier url }
  }
}`;

const CREATE_BLOCK_RELATION = `mutation CreateRelation($issueId: String!, $relatedIssueId: String!) {
  issueRelationCreate(input: { issueId: $issueId, relatedIssueId: $relatedIssueId, type: blocks }) {
    success
  }
}`;

const LIST_TEAM_LABELS = `query TeamLabels($teamId: String!) {
  team(id: $teamId) {
    labels { nodes { id name } }
  }
}`;

const CREATE_LABEL = `mutation CreateLabel($name: String!, $teamId: String!) {
  issueLabelCreate(input: { name: $name, teamId: $teamId }) {
    success
    issueLabel { id name }
  }
}`;

export interface LinearExportResult {
  project: LinearProject;
  issues: { dr_id: string; linear: LinearIssue }[];
  relations_created: number;
}

export async function executeLinearExport(
  auth: LinearAuth,
  teamId: string,
  plan: ExportPlan
): Promise<LinearExportResult> {
  const projectRes = await gql<{ projectCreate: { success: boolean; project: LinearProject } }>(
    auth,
    CREATE_PROJECT,
    { name: plan.project.name, description: plan.project.description, teamIds: [teamId] }
  );
  if (!projectRes.projectCreate.success || !projectRes.projectCreate.project) {
    throw new Error("Linear projectCreate did not succeed.");
  }
  const linearProject = projectRes.projectCreate.project;

  // Resolve labels — create any missing ones.
  const labelNames = new Set<string>();
  for (const issue of plan.issues) for (const l of issue.labels) labelNames.add(l);
  const labelIds = await ensureLabels(auth, teamId, labelNames);

  // Create all issues, capturing their Linear IDs.
  const issueResults: { dr_id: string; linear: LinearIssue }[] = [];
  const drToLinearId = new Map<string, string>();
  for (const issue of plan.issues) {
    const issueLabelIds = issue.labels
      .map((name) => labelIds.get(name))
      .filter((id): id is string => Boolean(id));
    const res = await gql<{ issueCreate: { success: boolean; issue: LinearIssue } }>(
      auth,
      CREATE_ISSUE,
      {
        title: issue.title,
        description: issue.description,
        teamId,
        projectId: linearProject.id,
        priority: issue.priority,
        estimate: issue.estimate,
        labelIds: issueLabelIds,
      }
    );
    if (!res.issueCreate.success || !res.issueCreate.issue) {
      throw new Error(`Linear issueCreate failed for ${issue.dr_id}`);
    }
    issueResults.push({ dr_id: issue.dr_id, linear: res.issueCreate.issue });
    drToLinearId.set(issue.dr_id, res.issueCreate.issue.id);
  }

  // Create blocked-by relations: an issue's `depends_on` X means X blocks this.
  let relations = 0;
  for (const issue of plan.issues) {
    const issueLinearId = drToLinearId.get(issue.dr_id);
    if (!issueLinearId) continue;
    for (const blocker of issue.blocked_by_dr_ids) {
      const blockerLinearId = drToLinearId.get(blocker);
      if (!blockerLinearId) continue;
      await gql<{ issueRelationCreate: { success: boolean } }>(auth, CREATE_BLOCK_RELATION, {
        issueId: blockerLinearId,
        relatedIssueId: issueLinearId,
      });
      relations += 1;
    }
  }

  return { project: linearProject, issues: issueResults, relations_created: relations };
}

async function ensureLabels(
  auth: LinearAuth,
  teamId: string,
  names: Set<string>
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (names.size === 0) return out;
  const existing = await gql<{ team: { labels: { nodes: { id: string; name: string }[] } } }>(
    auth,
    LIST_TEAM_LABELS,
    { teamId }
  );
  for (const node of existing.team.labels.nodes) {
    if (names.has(node.name)) out.set(node.name, node.id);
  }
  for (const name of names) {
    if (out.has(name)) continue;
    const res = await gql<{ issueLabelCreate: { success: boolean; issueLabel: { id: string; name: string } } }>(
      auth,
      CREATE_LABEL,
      { name, teamId }
    );
    if (res.issueLabelCreate.success && res.issueLabelCreate.issueLabel) {
      out.set(name, res.issueLabelCreate.issueLabel.id);
    }
  }
  return out;
}
