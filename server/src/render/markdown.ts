import { Decision, Project, Task } from "../schemas/index.js";

function h1(text: string): string {
  return `# ${text}\n`;
}
function h2(text: string): string {
  return `\n## ${text}\n`;
}
function h3(text: string): string {
  return `\n### ${text}\n`;
}
function paragraph(text?: string): string {
  if (!text || text.trim().length === 0) return "";
  return `\n${text.trim()}\n`;
}
function bulletList(items: string[]): string {
  if (items.length === 0) return "";
  return "\n" + items.map((i) => `- ${i}`).join("\n") + "\n";
}
function table(rows: { key: string; value: string }[]): string {
  if (rows.length === 0) return "";
  let out = "\n| Field | Value |\n| --- | --- |\n";
  for (const r of rows) out += `| ${r.key} | ${r.value} |\n`;
  return out;
}

export function renderDecisionMarkdown(decision: Decision): string {
  let out = "";
  out += h1(`${decision.id} — ${decision.title}`);
  out += table([
    { key: "Status", value: `\`${decision.status}\`` },
    { key: "Template", value: `\`${decision.template_variant}\`` },
    { key: "Updated", value: decision.updated_at },
    decision.selected_position
      ? { key: "Selected", value: `**${decision.selected_position}**` }
      : { key: "Selected", value: "_(undecided)_" },
    decision.depends_on.length > 0
      ? { key: "Depends on", value: decision.depends_on.map((d) => `\`${d}\``).join(", ") }
      : { key: "Depends on", value: "_(none)_" },
  ]);

  if (decision.summary) {
    out += h2("Summary");
    out += paragraph(decision.summary);
  }
  if (decision.issue) {
    out += h2("Issue");
    out += paragraph(decision.issue);
  }
  if (decision.assumptions.length > 0) {
    out += h2("Assumptions");
    out += bulletList(decision.assumptions);
  }
  if (decision.constraints.length > 0) {
    out += h2("Constraints");
    out += bulletList(decision.constraints);
  }
  if (decision.positions.length > 0) {
    out += h2("Positions");
    for (const pos of decision.positions) {
      const marker = pos.title === decision.selected_position ? " ✅" : "";
      out += h3(`${pos.title}${marker}`);
      if (pos.description) out += paragraph(pos.description);
      if (pos.pros.length > 0) {
        out += "\n**Pros**\n";
        out += bulletList(pos.pros);
      }
      if (pos.cons.length > 0) {
        out += "\n**Cons**\n";
        out += bulletList(pos.cons);
      }
      if (pos.links && pos.links.length > 0) {
        out += "\n**Links**\n";
        out += bulletList(pos.links.map((l) => `<${l}>`));
      }
    }
  }
  if (decision.opinions.length > 0) {
    out += h2("Opinions");
    for (const op of decision.opinions) {
      const ref = op.position_ref ? ` _(re: ${op.position_ref})_` : "";
      out += `\n**${op.author}** (${op.by}, ${op.at})${ref}\n\n${op.body}\n`;
    }
  }
  if (decision.argument) {
    out += h2("Argument");
    out += paragraph(decision.argument);
  }
  if (decision.implications.length > 0) {
    out += h2("Implications");
    out += bulletList(decision.implications);
  }
  if (decision.review.length > 0) {
    out += h2("Review");
    for (const r of decision.review) {
      const score = r.score !== undefined ? ` — score ${r.score}/5` : "";
      out += `\n- **${r.reviewer}** (${r.lens}) ⇒ \`${r.verdict}\`${score} _(at ${r.at})_\n`;
      if (r.concerns.length > 0) {
        out += "  - Concerns:\n";
        for (const c of r.concerns) out += `    - ${c}\n`;
      }
    }
  }
  if (decision.sign_off) {
    out += h2("Sign-off");
    out += `\n- **By:** ${decision.sign_off.actor ?? decision.sign_off.by} (${decision.sign_off.by})\n`;
    out += `- **At:** ${decision.sign_off.at}\n`;
    if (decision.sign_off.notes) out += `- **Notes:** ${decision.sign_off.notes}\n`;
  }
  if (decision.related_decisions.length > 0 || decision.related_artifacts.length > 0) {
    out += h2("Related");
    if (decision.related_decisions.length > 0) {
      out += "\n**Decisions**\n";
      out += bulletList(decision.related_decisions.map((d) => `\`${d}\``));
    }
    if (decision.related_artifacts.length > 0) {
      out += "\n**Artifacts**\n";
      out += bulletList(decision.related_artifacts);
    }
  }
  if (decision.seed_origin) {
    out += `\n---\n\n_Instantiated from seed: \`${decision.seed_origin}\`_\n`;
  }
  return out;
}

export function renderTaskMarkdown(task: Task, decisionsById: Map<string, Decision>): string {
  let out = "";
  out += h1(`${task.id} — ${task.title}`);
  const rows = [
    { key: "Status", value: `\`${task.status}\`` },
    { key: "Priority", value: `\`${task.priority}\`` },
    { key: "Estimate", value: task.estimate ? `${task.estimate.value} ${task.estimate.unit}${task.estimate.confidence ? ` (${task.estimate.confidence} confidence)` : ""}` : "_(missing)_" },
    {
      key: "Depends on",
      value: task.depends_on.length > 0 ? task.depends_on.map((t) => `\`${t}\``).join(", ") : "_(none)_",
    },
    {
      key: "Decision refs",
      value:
        task.decision_refs.length > 0
          ? task.decision_refs
              .map((d) => {
                const dec = decisionsById.get(d);
                return dec ? `\`${d}\` — ${dec.title}` : `\`${d}\``;
              })
              .join("; ")
          : "_(none)_",
    },
    { key: "Assignee hint", value: task.assignee_hint ?? "_(unspecified)_" },
    { key: "Labels", value: task.labels.length > 0 ? task.labels.map((l) => `\`${l}\``).join(", ") : "_(none)_" },
    { key: "Updated", value: task.updated_at },
  ];
  if (task.external_ref) {
    rows.push({ key: "External", value: `\`${task.external_ref.system}\` ${task.external_ref.id}` });
  }
  out += table(rows);
  if (task.description) {
    out += h2("Description");
    out += paragraph(task.description);
  }
  if (task.acceptance_criteria.length > 0) {
    out += h2("Acceptance criteria");
    out += bulletList(task.acceptance_criteria.map((c) => `[ ] ${c}`));
  }
  return out;
}

export function renderProjectMarkdown(project: Project, decisionCount: number, taskCount: number): string {
  let out = "";
  out += h1(project.title);
  out += table([
    { key: "ID", value: `\`${project.id}\`` },
    { key: "Status", value: `\`${project.status}\`` },
    { key: "Effort level", value: `\`${project.effort_level}\`` },
    { key: "Created", value: project.created_at },
    { key: "Updated", value: project.updated_at },
    { key: "Decisions", value: decisionCount.toString() },
    { key: "Tasks", value: taskCount.toString() },
  ]);
  if (project.description) {
    out += h2("Description");
    out += paragraph(project.description);
  }
  if (project.scope) {
    out += h2("Scope");
    if (project.scope.in_scope.length > 0) {
      out += "\n**In scope**\n";
      out += bulletList(project.scope.in_scope);
    }
    if (project.scope.success_criteria.length > 0) {
      out += "\n**Success criteria**\n";
      out += bulletList(project.scope.success_criteria);
    }
    if (project.scope.out_of_scope.length > 0) {
      out += "\n**Out of scope**\n";
      out += bulletList(project.scope.out_of_scope);
    }
    if (project.scope.nice_to_have.length > 0) {
      out += "\n**Nice to have**\n";
      out += bulletList(project.scope.nice_to_have);
    }
  }
  if (project.sign_offs.length > 0) {
    out += h2("Sign-offs");
    for (const s of project.sign_offs) {
      out += `\n- **${s.phase}** by ${s.actor ?? s.by} (${s.by}) at ${s.at}${s.notes ? ` — ${s.notes}` : ""}\n`;
    }
  }
  if (project.handoff) {
    out += h2("Handoff");
    out += table([
      { key: "Target", value: `\`${project.handoff.target}\`` },
      { key: "Exported at", value: project.handoff.exported_at },
      project.handoff.target_id ? { key: "Target ID", value: project.handoff.target_id } : { key: "Target ID", value: "—" },
      project.handoff.target_url ? { key: "Target URL", value: project.handoff.target_url } : { key: "Target URL", value: "—" },
    ]);
  }
  return out;
}
