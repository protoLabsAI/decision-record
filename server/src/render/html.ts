import { Decision, Outcome, Project, Task } from "../schemas/index.js";
import { escapeHtml } from "../util.js";

const STYLE = `:root {
  --bg: #fafafa;
  --fg: #1a1a1a;
  --muted: #6b7280;
  --border: #e5e7eb;
  --accent: #4f46e5;
  --status-rfc: #fbbf24;
  --status-proposed: #60a5fa;
  --status-accepted: #34d399;
  --status-rejected: #f87171;
  --status-deprecated: #9ca3af;
  --status-superseded: #c084fc;
  --task-open: #9ca3af;
  --task-ready: #60a5fa;
  --task-in_progress: #fbbf24;
  --task-done: #34d399;
  --task-blocked: #f87171;
  --task-deferred: #c084fc;
  --outcome-pending: #fbbf24;
  --outcome-validated: #34d399;
  --outcome-invalidated: #f87171;
  --outcome-inconclusive: #9ca3af;
}
* { box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.5; margin: 0; padding: 2rem; background: var(--bg); color: var(--fg); }
h1, h2, h3 { margin-top: 1.5rem; }
.container { max-width: 1100px; margin: 0 auto; }
.header { border-bottom: 1px solid var(--border); padding-bottom: 1rem; margin-bottom: 1.5rem; }
.meta { display: flex; flex-wrap: wrap; gap: 0.5rem 1rem; color: var(--muted); font-size: 0.9rem; }
.meta b { color: var(--fg); }
.pill { display: inline-block; padding: 0.15rem 0.6rem; border-radius: 999px; font-size: 0.75rem; font-weight: 600; color: white; }
.pill-rfc { background: var(--status-rfc); }
.pill-proposed { background: var(--status-proposed); }
.pill-accepted { background: var(--status-accepted); }
.pill-rejected { background: var(--status-rejected); }
.pill-deprecated { background: var(--status-deprecated); }
.pill-superseded { background: var(--status-superseded); }
.pill-task-open { background: var(--task-open); }
.pill-task-ready { background: var(--task-ready); }
.pill-task-in_progress { background: var(--task-in_progress); }
.pill-task-done { background: var(--task-done); }
.pill-task-blocked { background: var(--task-blocked); }
.pill-task-deferred { background: var(--task-deferred); }
.pill-outcome-pending { background: var(--outcome-pending); }
.pill-outcome-validated { background: var(--outcome-validated); }
.pill-outcome-invalidated { background: var(--outcome-invalidated); }
.pill-outcome-inconclusive { background: var(--outcome-inconclusive); }
table { width: 100%; border-collapse: collapse; margin-top: 1rem; background: white; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
th, td { text-align: left; padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--border); font-size: 0.9rem; vertical-align: top; }
th { background: #f3f4f6; font-weight: 600; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted); }
tr:last-child td { border-bottom: none; }
.scope { background: white; border: 1px solid var(--border); border-radius: 8px; padding: 1rem; margin-top: 1rem; }
.scope-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem; }
.scope-list section { background: #f9fafb; padding: 0.75rem; border-radius: 6px; }
.scope-list h4 { margin: 0 0 0.5rem; font-size: 0.85rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.04em; }
.scope-list ul { margin: 0; padding-left: 1.25rem; }
.scope-list li { margin: 0.15rem 0; font-size: 0.9rem; }
.empty { color: var(--muted); font-style: italic; }
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }
.dep-list { color: var(--muted); font-size: 0.8rem; }
.code { font-family: ui-monospace, "SF Mono", monospace; font-size: 0.85em; background: #f3f4f6; padding: 0.1rem 0.4rem; border-radius: 4px; }
.handoff { background: #eef2ff; border: 1px solid #c7d2fe; border-radius: 8px; padding: 1rem; margin-top: 1rem; }
.handoff h3 { margin-top: 0; color: var(--accent); }
.footer { margin-top: 3rem; padding-top: 1rem; border-top: 1px solid var(--border); color: var(--muted); font-size: 0.8rem; }`;

export function renderIndexHtml(
  project: Project,
  decisions: Decision[],
  tasks: Task[],
  outcomes: Outcome[] = []
): string {
  const decisionsByStatus = groupBy(decisions, (d) => d.status);
  const tasksByStatus = groupBy(tasks, (t) => t.status);
  const outcomesByStatus = groupBy(outcomes, (o) => o.status);
  const sortedDecisions = [...decisions].sort((a, b) => a.number - b.number);
  const sortedTasks = [...tasks].sort((a, b) => a.priority.localeCompare(b.priority) || a.number - b.number);
  const sortedOutcomes = [...outcomes].sort((a, b) => a.number - b.number);
  const decisionsById = new Map(decisions.map((d) => [d.id, d]));

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(project.title)} — Decision Record</title>
<style>${STYLE}</style>
</head>
<body>
<div class="container">

  <header class="header">
    <div class="meta"><span class="code">${escapeHtml(project.id)}</span></div>
    <h1>${escapeHtml(project.title)}</h1>
    <div class="meta">
      <span><b>Phase:</b> <span class="code">${escapeHtml(project.status)}</span></span>
      <span><b>Effort:</b> <span class="code">${escapeHtml(project.effort_level)}</span></span>
      <span><b>Updated:</b> ${escapeHtml(project.updated_at)}</span>
      <span><b>Decisions:</b> ${decisions.length} (${decisionsByStatus.get("accepted")?.length ?? 0} accepted)</span>
      <span><b>Tasks:</b> ${tasks.length} (${tasksByStatus.get("done")?.length ?? 0} done)</span>
      <span><b>Outcomes:</b> ${outcomes.length} (${outcomesByStatus.get("validated")?.length ?? 0} validated)</span>
    </div>
  </header>

  ${project.description ? `<p>${escapeHtml(project.description)}</p>` : ""}

  ${renderScope(project)}
  ${renderHandoff(project)}

  <h2>Decisions</h2>
  ${renderDecisionTable(sortedDecisions)}

  <h2>Task graph</h2>
  ${renderTaskTable(sortedTasks, decisionsById)}

  <h2>Outcomes</h2>
  ${renderOutcomeTable(sortedOutcomes, decisionsById)}

  <footer class="footer">
    Generated by <a href="https://github.com/protoLabsAI/decision-record">decision-record</a> ·
    Last render: ${escapeHtml(new Date().toISOString())}
  </footer>

</div>
</body>
</html>`;
}

function groupBy<T>(list: T[], key: (t: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const item of list) {
    const k = key(item);
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(item);
  }
  return m;
}

function renderScope(project: Project): string {
  if (!project.scope) return "";
  const sections: { title: string; items: string[] }[] = [
    { title: "In scope", items: project.scope.in_scope },
    { title: "Success criteria", items: project.scope.success_criteria },
    { title: "Out of scope", items: project.scope.out_of_scope },
    { title: "Nice to have", items: project.scope.nice_to_have },
  ];
  const hasAny = sections.some((s) => s.items.length > 0);
  if (!hasAny) return "";
  return `<div class="scope">
    <h3>Scope</h3>
    <div class="scope-list">
      ${sections
        .map(
          (s) => `<section>
        <h4>${escapeHtml(s.title)}</h4>
        ${
          s.items.length > 0
            ? `<ul>${s.items.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>`
            : `<div class="empty">none</div>`
        }
      </section>`
        )
        .join("")}
    </div>
  </div>`;
}

function renderHandoff(project: Project): string {
  if (!project.handoff) return "";
  return `<div class="handoff">
    <h3>Handed off</h3>
    <div class="meta">
      <span><b>Target:</b> <span class="code">${escapeHtml(project.handoff.target)}</span></span>
      <span><b>At:</b> ${escapeHtml(project.handoff.exported_at)}</span>
      ${project.handoff.target_id ? `<span><b>ID:</b> <span class="code">${escapeHtml(project.handoff.target_id)}</span></span>` : ""}
      ${project.handoff.target_url ? `<span><a href="${escapeHtml(project.handoff.target_url)}">Open in target →</a></span>` : ""}
    </div>
  </div>`;
}

function renderDecisionTable(decisions: Decision[]): string {
  if (decisions.length === 0) {
    return `<div class="empty">No decisions yet.</div>`;
  }
  return `<table>
    <thead>
      <tr>
        <th>ID</th>
        <th>Title</th>
        <th>Status</th>
        <th>Selected</th>
        <th>Depends on</th>
      </tr>
    </thead>
    <tbody>
      ${decisions
        .map(
          (d) => `<tr>
        <td><a href="decisions/${escapeHtml(d.id)}.md"><span class="code">${escapeHtml(d.id)}</span></a></td>
        <td>${escapeHtml(d.title)}${d.template_variant !== "canonical" ? ` <span class="dep-list">[${escapeHtml(d.template_variant)}]</span>` : ""}</td>
        <td><span class="pill pill-${escapeHtml(d.status)}">${escapeHtml(d.status)}</span></td>
        <td>${d.selected_position ? escapeHtml(d.selected_position) : `<span class="empty">—</span>`}</td>
        <td>${
          d.depends_on.length > 0
            ? d.depends_on.map((id) => `<span class="code">${escapeHtml(id)}</span>`).join(" ")
            : `<span class="empty">—</span>`
        }</td>
      </tr>`
        )
        .join("")}
    </tbody>
  </table>`;
}

function renderOutcomeTable(outcomes: Outcome[], decisionsById: Map<string, Decision>): string {
  if (outcomes.length === 0) {
    return `<div class="empty">No outcomes recorded yet. Outcomes are recorded post-handoff to close the feedback loop.</div>`;
  }
  return `<table>
    <thead>
      <tr>
        <th>ID</th>
        <th>Decision</th>
        <th>Status</th>
        <th>Observation</th>
        <th>Metric</th>
        <th>Recorded</th>
      </tr>
    </thead>
    <tbody>
      ${outcomes
        .map((o) => {
          const dec = decisionsById.get(o.decision_id);
          const decLink = dec
            ? `<a href="decisions/${escapeHtml(o.decision_id)}.md" title="${escapeHtml(dec.title)}"><span class="code">${escapeHtml(o.decision_id)}</span></a>`
            : `<span class="code">${escapeHtml(o.decision_id)}</span>`;
          return `<tr>
        <td><a href="outcomes/${escapeHtml(o.id)}.md"><span class="code">${escapeHtml(o.id)}</span></a></td>
        <td>${decLink}</td>
        <td><span class="pill pill-outcome-${escapeHtml(o.status)}">${escapeHtml(o.status)}</span></td>
        <td>${escapeHtml(o.observation)}</td>
        <td>${o.metric ? escapeHtml(o.metric) : `<span class="empty">—</span>`}</td>
        <td>${escapeHtml(o.recorded_at)}</td>
      </tr>`;
        })
        .join("")}
    </tbody>
  </table>`;
}

function renderTaskTable(tasks: Task[], decisionsById: Map<string, Decision>): string {
  if (tasks.length === 0) {
    return `<div class="empty">No tasks yet.</div>`;
  }
  return `<table>
    <thead>
      <tr>
        <th>ID</th>
        <th>Title</th>
        <th>Status</th>
        <th>Pri</th>
        <th>Estimate</th>
        <th>Depends on</th>
        <th>Decision refs</th>
      </tr>
    </thead>
    <tbody>
      ${tasks
        .map((t) => {
          const est = t.estimate ? `${t.estimate.value}${t.estimate.unit === "hours" ? "h" : "d"}` : `<span class="empty">—</span>`;
          const refs =
            t.decision_refs.length > 0
              ? t.decision_refs
                  .map((id) => {
                    const dec = decisionsById.get(id);
                    return dec
                      ? `<a href="decisions/${escapeHtml(id)}.md" title="${escapeHtml(dec.title)}"><span class="code">${escapeHtml(id)}</span></a>`
                      : `<span class="code">${escapeHtml(id)}</span>`;
                  })
                  .join(" ")
              : `<span class="empty">—</span>`;
          return `<tr>
        <td><a href="tasks/${escapeHtml(t.id)}.md"><span class="code">${escapeHtml(t.id)}</span></a></td>
        <td>${escapeHtml(t.title)}</td>
        <td><span class="pill pill-task-${escapeHtml(t.status)}">${escapeHtml(t.status)}</span></td>
        <td><span class="code">${escapeHtml(t.priority)}</span></td>
        <td>${est}</td>
        <td>${
          t.depends_on.length > 0
            ? t.depends_on.map((id) => `<span class="code">${escapeHtml(id)}</span>`).join(" ")
            : `<span class="empty">—</span>`
        }</td>
        <td>${refs}</td>
      </tr>`;
        })
        .join("")}
    </tbody>
  </table>`;
}
