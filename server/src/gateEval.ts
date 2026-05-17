import {
  Decision,
  EffectiveGateConfig,
  Phase,
  PipelineState,
  Project,
  SignOff,
  Task,
} from "./schemas/index.js";

export interface GateEvaluation {
  pass: boolean;
  reasons: string[];
  next_phase: Phase | null;
}

const NEXT_PHASE: Record<Phase, Phase | null> = {
  intake: "scoping",
  scoping: "deciding",
  deciding: "decomposing",
  decomposing: "handing-off",
  "handing-off": "handed-off",
  "handed-off": null,
};

export function nextPhaseOf(phase: Phase): Phase | null {
  return NEXT_PHASE[phase];
}

export function evaluateAdvance(
  project: Project,
  state: PipelineState,
  decisions: Decision[],
  tasks: Task[],
  signOff: { by: "agent" | "human"; actor?: string; notes?: string } | null
): GateEvaluation {
  const reasons: string[] = [];
  const config = state.effective_gate_config;
  const next = nextPhaseOf(state.phase);
  if (!next) {
    return {
      pass: false,
      reasons: [`Already at terminal phase '${state.phase}'.`],
      next_phase: null,
    };
  }

  const phaseChecks: Record<Phase, () => void> = {
    intake: () => checkIntake(project, reasons),
    scoping: () => checkScoping(project, decisions, config, reasons),
    deciding: () => checkDeciding(decisions, config, reasons),
    decomposing: () => checkDecomposing(tasks, decisions, config, reasons),
    "handing-off": () => checkHandingOff(project, reasons),
    "handed-off": () => reasons.push("Already handed off."),
  };

  phaseChecks[state.phase]();
  checkSignOff(project, state, next, signOff, reasons);

  return {
    pass: reasons.length === 0,
    reasons,
    next_phase: next,
  };
}

function checkIntake(project: Project, reasons: string[]): void {
  if (!project.title || project.title.trim().length === 0) {
    reasons.push("Project title is empty.");
  }
  if (!project.description || project.description.trim().length === 0) {
    reasons.push(
      "Intake gate: project.description is empty. Capture the idea before advancing to scoping."
    );
  }
}

function checkScoping(
  project: Project,
  decisions: Decision[],
  config: EffectiveGateConfig,
  reasons: string[]
): void {
  const scope = project.scope;
  if (!scope || scope.in_scope.length === 0) {
    reasons.push("Scoping gate: scope.in_scope is empty.");
  }
  if (!scope || scope.success_criteria.length === 0) {
    reasons.push("Scoping gate: scope.success_criteria is empty.");
  }
  if (config.review_required_phases.includes("scoping")) {
    const scopingDecision = decisions.find(
      (d) => d.template_variant === "scoping"
    );
    if (!scopingDecision) {
      reasons.push(
        "Scoping gate: review_required, but no scoping decision exists to review."
      );
    } else if (
      !scopingDecision.review.some((r) => r.verdict === "pass")
    ) {
      reasons.push(
        "Scoping gate: review_required, but the scoping decision has no passing review."
      );
    }
  }
}

function checkDeciding(
  decisions: Decision[],
  config: EffectiveGateConfig,
  reasons: string[]
): void {
  if (decisions.length < config.min_decisions) {
    reasons.push(
      `Deciding gate: have ${decisions.length} decisions, need >= ${config.min_decisions}.`
    );
  }
  const required = config.decisions_required_status;
  if (required === "accepted") {
    const unaccepted = decisions.filter((d) => d.status !== "accepted" && d.status !== "rejected");
    if (unaccepted.length > 0) {
      reasons.push(
        `Deciding gate: ${unaccepted.length} decision(s) are not 'accepted' or 'rejected': ${unaccepted
          .map((d) => d.id)
          .join(", ")}`
      );
    }
  }
  if (config.review_required_per_decision) {
    const unreviewed = decisions.filter(
      (d) => d.status === "accepted" && !d.review.some((r) => r.verdict === "pass")
    );
    if (unreviewed.length > 0) {
      reasons.push(
        `Deciding gate: review_required_per_decision=true, but ${unreviewed.length} accepted decision(s) lack a passing review: ${unreviewed
          .map((d) => d.id)
          .join(", ")}`
      );
    }
  }
  if (config.review_required_phases.includes("deciding")) {
    const anyReview = decisions.some((d) => d.review.some((r) => r.verdict === "pass"));
    if (!anyReview) {
      reasons.push("Deciding gate: review_required for 'deciding', but no decision has a passing review.");
    }
  }
  const danglingDeps = decisions.flatMap((d) =>
    d.depends_on.filter((dep) => !decisions.some((other) => other.id === dep))
  );
  if (danglingDeps.length > 0) {
    reasons.push(
      `Deciding gate: decisions reference missing dependencies: ${Array.from(new Set(danglingDeps)).join(", ")}`
    );
  }
}

function checkDecomposing(
  tasks: Task[],
  decisions: Decision[],
  config: EffectiveGateConfig,
  reasons: string[]
): void {
  if (tasks.length < config.min_tasks) {
    reasons.push(
      `Decomposing gate: have ${tasks.length} tasks, need >= ${config.min_tasks}.`
    );
  }
  const danglingDeps = tasks.flatMap((t) =>
    t.depends_on.filter((dep) => !tasks.some((other) => other.id === dep))
  );
  if (danglingDeps.length > 0) {
    reasons.push(
      `Decomposing gate: tasks reference missing dependencies: ${Array.from(new Set(danglingDeps)).join(", ")}`
    );
  }
  const cycles = findCycles(tasks);
  if (cycles.length > 0) {
    reasons.push(
      `Decomposing gate: task dependency graph has cycles: ${cycles
        .map((c) => c.join(" → "))
        .join("; ")}`
    );
  }
  const overEstimate = tasks.filter((t) => {
    if (!t.estimate) return true; // missing estimate counts as over
    const hours =
      t.estimate.unit === "days" ? t.estimate.value * 8 : t.estimate.value;
    return hours > config.max_task_estimate_hours;
  });
  if (overEstimate.length > 0) {
    reasons.push(
      `Decomposing gate: ${overEstimate.length} task(s) have missing or oversized estimates (max ${config.max_task_estimate_hours}h): ${overEstimate
        .map((t) => t.id)
        .join(", ")}`
    );
  }
  const danglingDecisionRefs = tasks.flatMap((t) =>
    t.decision_refs.filter((d) => !decisions.some((dec) => dec.id === d))
  );
  if (danglingDecisionRefs.length > 0) {
    reasons.push(
      `Decomposing gate: tasks reference missing decisions: ${Array.from(new Set(danglingDecisionRefs)).join(", ")}`
    );
  }
}

function checkHandingOff(project: Project, reasons: string[]): void {
  if (!project.handoff) {
    reasons.push(
      "Handing-off gate: no handoff record. Run dr_export_filesystem or dr_export_linear first."
    );
  }
}

function checkSignOff(
  project: Project,
  _state: PipelineState,
  nextPhase: Phase,
  signOff: { by: "agent" | "human" } | null,
  reasons: string[]
): void {
  const config = _state.effective_gate_config;
  const phaseLabelFromName: Record<Phase, string> = {
    intake: "intake",
    scoping: "scoping",
    deciding: "deciding",
    decomposing: "decomposing",
    "handing-off": "handing-off",
    "handed-off": "handed-off",
  };
  const transitionLabel = phaseLabelFromName[nextPhase];
  if (transitionLabel === "scoping" || transitionLabel === "deciding" ||
      transitionLabel === "decomposing" || transitionLabel === "handing-off") {
    if (config.require_human_signoff_phases.includes(transitionLabel)) {
      if (!signOff || signOff.by !== "human") {
        reasons.push(
          `Sign-off gate: phase '${transitionLabel}' requires human sign-off; pass sign_off={by:'human'} to dr_advance.`
        );
      }
    }
  }
  // Verify we haven't already signed off this phase
  if (signOff && project.sign_offs.some((s) => s.phase === transitionLabel)) {
    // Idempotent re-advance is fine; only warn via no-op (don't block)
  }
}

function findCycles(tasks: Task[]): string[][] {
  const ids = new Set(tasks.map((t) => t.id));
  const adj = new Map<string, string[]>();
  for (const t of tasks) {
    adj.set(
      t.id,
      t.depends_on.filter((d) => ids.has(d))
    );
  }
  const cycles: string[][] = [];
  const WHITE = 0,
    GRAY = 1,
    BLACK = 2;
  const color = new Map<string, number>();
  for (const id of adj.keys()) color.set(id, WHITE);

  const stack: string[] = [];
  function dfs(u: string): void {
    color.set(u, GRAY);
    stack.push(u);
    for (const v of adj.get(u) ?? []) {
      const c = color.get(v);
      if (c === GRAY) {
        const startIdx = stack.indexOf(v);
        if (startIdx >= 0) {
          cycles.push([...stack.slice(startIdx), v]);
        }
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
