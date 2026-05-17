import OpenAI from "openai";
import { LLMConfig } from "../llm/client.js";
import { executeAgentTool } from "../llm/tools.js";
import {
  CheckpointOptions,
  ask,
  bullet,
  confirm,
  divider,
  error,
  header,
  info,
  success,
  warn,
} from "./checkpoints.js";
import { PRDDigest } from "./prd.js";
import { runScopingAgent } from "./agents/scoping.js";
import { runDecidingAgent } from "./agents/deciding.js";
import { ALL_LENSES, runSkepticAgent } from "./agents/skeptic.js";
import { runDecomposerAgent } from "./agents/decomposer.js";

export interface OrchestratorOptions extends CheckpointOptions {
  cwd: string;
  client: OpenAI;
  config: LLMConfig;
  verbose: boolean;
}

export interface RunOutcome {
  exitCode: number;
  finalPhase: string;
}

export async function runPipeline(
  opts: OrchestratorOptions,
  ctx: {
    title?: string;
    description?: string;
    effortLevel?: "poc" | "mvp" | "full";
    prd?: PRDDigest | null;
    resume: boolean;
  }
): Promise<RunOutcome> {
  // 1. Resume check
  const status = await callTool(opts.cwd, "dr_status", {});
  const hasProject = status.ok;

  if (hasProject) {
    if (!ctx.resume) {
      warn(
        `A project is already initialized in ${opts.cwd}. Treating this as a resume.`
      );
    } else {
      info(`Resuming existing project in ${opts.cwd}.`);
    }
  } else {
    if (ctx.resume) {
      error(`No project found in ${opts.cwd}. Nothing to resume.`);
      return { exitCode: 2, finalPhase: "(none)" };
    }
    if (!ctx.title) {
      error("Title is required to start a new project (pass --title or --idea).");
      return { exitCode: 2, finalPhase: "(none)" };
    }
    header("Phase: Intake");
    const initRes = await callTool(opts.cwd, "dr_init", {
      title: ctx.title,
      description: ctx.description ?? "",
      effort_level: ctx.effortLevel ?? "mvp",
    });
    if (!initRes.ok) {
      error(`dr_init failed: ${(initRes.errors ?? []).join("; ")}`);
      return { exitCode: 1, finalPhase: "intake" };
    }
    const initData = initRes.data as { project: { id: string; effort_level: string } };
    success(`Initialized '${initData.project.id}' at effort_level=${initData.project.effort_level}`);
  }

  // 2. Walk forward through phases.
  while (true) {
    const cur = await getStatus(opts.cwd);
    const phase = cur.state.phase as string;
    const nextPhase = cur.state.next_phase as string | null;
    if (!nextPhase || phase === "handed-off") {
      success(`Pipeline complete. Final phase: ${phase}`);
      return { exitCode: 0, finalPhase: phase };
    }

    info(`Current phase: ${phase} → next: ${nextPhase}`);
    let workResult: { exitCode: number } | null = null;
    switch (phase) {
      case "intake":
        workResult = await advanceIntake(opts, cur, nextPhase as string);
        break;
      case "scoping":
        workResult = await advanceScoping(opts, ctx.prd ?? null);
        break;
      case "deciding":
        workResult = await advanceDeciding(opts);
        break;
      case "decomposing":
        workResult = await advanceDecomposing(opts);
        break;
      case "handing-off":
        workResult = await advanceHandoff(opts);
        break;
      default:
        error(`Unknown phase '${phase}'`);
        return { exitCode: 1, finalPhase: phase };
    }
    if (workResult && workResult.exitCode !== 0) {
      return { exitCode: workResult.exitCode, finalPhase: phase };
    }
  }
}

async function advanceIntake(
  opts: OrchestratorOptions,
  status: StatusData,
  nextPhase: string
): Promise<{ exitCode: number }> {
  const needsHumanSignoff = status.effective_gate_config.require_human_signoff_phases.includes(
    nextPhase
  );
  return advancePhase(opts, "intake → scoping", needsHumanSignoff);
}

async function advanceScoping(
  opts: OrchestratorOptions,
  prd: PRDDigest | null
): Promise<{ exitCode: number }> {
  header("Phase: Scoping");
  info("Running scoping agent…");
  const prdContext = prd
    ? `PRD (excerpt):\n${prd.raw.slice(0, 4000)}${prd.raw.length > 4000 ? "\n…[truncated]" : ""}`
    : null;
  const result = await runScopingAgent(opts.client, opts.config, opts.cwd, prdContext, opts.verbose);
  success(`Scoping agent finished (${result.toolCallCount} tool calls).`);
  divider();
  process.stderr.write(result.summary + "\n");
  divider();

  const project = (await callTool(opts.cwd, "dr_status", {})).data as StatusData;
  const failures = realGateFailures(project);
  if (failures.length > 0) {
    warn("Scoping gate is not yet passable. The agent's output was:");
    for (const r of failures) bullet(r);
    return { exitCode: 1 };
  }
  return advancePhase(opts, "scoping → deciding", needsHumanSignoffFor(project, "deciding"));
}

async function advanceDeciding(opts: OrchestratorOptions): Promise<{ exitCode: number }> {
  header("Phase: Deciding");
  info("Running deciding agent (proposing decisions)…");
  const result = await runDecidingAgent(opts.client, opts.config, opts.cwd, opts.verbose);
  success(`Deciding agent finished (${result.toolCallCount} tool calls).`);
  divider();
  process.stderr.write(result.summary + "\n");
  divider();

  // Lens-rotating review for every proposed decision.
  const proposed = await listDecisions(opts.cwd, "proposed");
  if (proposed.length === 0) {
    warn("No decisions in 'proposed' state to review.");
  } else {
    header(`Antagonistic review: ${proposed.length} decisions × ${ALL_LENSES.length} lenses`);
    for (const d of proposed) {
      info(`Reviewing ${d.id} — ${d.title}`);
      const lensVerdicts: { lens: string; verdict: string; score: number }[] = [];
      let anyBlock = false;
      for (const lens of ALL_LENSES) {
        const review = await runSkepticAgent(
          opts.client,
          opts.config,
          opts.cwd,
          d.id,
          lens,
          opts.verbose
        );
        lensVerdicts.push({ lens, verdict: review.verdict, score: review.score });
        if (review.verdict === "block") {
          anyBlock = true;
          warn(`  ${lens}: BLOCK (${review.score}/5) — ${review.concerns.join("; ")}`);
        } else {
          info(`  ${lens}: pass (${review.score}/5)`);
        }
      }
      if (anyBlock) {
        warn(`${d.id} has blocking concerns. Will not auto-accept.`);
        const decision = await ask(
          `Override and accept ${d.id} anyway? (type 'accept' to override, anything else to reject)`,
          opts,
          "reject"
        );
        if (decision === "accept") {
          await callTool(opts.cwd, "dr_accept_decision", {
            id: d.id,
            sign_off_by: "human",
            sign_off_actor: "cli-user",
            sign_off_notes: "Accepted with blocking review concerns overridden.",
          });
          success(`Accepted ${d.id} with human override.`);
        } else {
          await callTool(opts.cwd, "dr_reject_decision", {
            id: d.id,
            reason: "Skeptic review blocked; not overridden.",
            sign_off_by: "human",
            sign_off_actor: "cli-user",
          });
          warn(`Rejected ${d.id}.`);
        }
      } else {
        const accept = await callTool(opts.cwd, "dr_accept_decision", {
          id: d.id,
          sign_off_by: "human",
          sign_off_actor: "cli-user",
          sign_off_notes: `All ${ALL_LENSES.length} lens reviews passed.`,
        });
        if (accept.ok) {
          success(`Accepted ${d.id}.`);
        } else {
          warn(`Could not accept ${d.id}: ${(accept.errors ?? []).join("; ")}`);
        }
      }
    }
  }

  const status = await getStatus(opts.cwd);
  const failures = realGateFailures(status);
  if (failures.length > 0) {
    warn("Deciding gate still failing:");
    for (const r of failures) bullet(r);
    return { exitCode: 1 };
  }
  return advancePhase(opts, "deciding → decomposing", needsHumanSignoffFor(status, "decomposing"));
}

async function advanceDecomposing(opts: OrchestratorOptions): Promise<{ exitCode: number }> {
  header("Phase: Decomposing");
  info("Running decomposer agent (building task graph)…");
  const result = await runDecomposerAgent(opts.client, opts.config, opts.cwd, opts.verbose);
  if (result.validationPassed) {
    success(`Decomposer finished (${result.toolCallCount} tool calls). Graph validates.`);
  } else {
    warn(`Decomposer finished (${result.toolCallCount} tool calls) but graph did not validate.`);
  }
  divider();
  process.stderr.write(result.summary + "\n");
  divider();

  const status = await getStatus(opts.cwd);
  const failures = realGateFailures(status);
  if (failures.length > 0) {
    warn("Decomposing gate still failing:");
    for (const r of failures) bullet(r);
    return { exitCode: 1 };
  }
  return advancePhase(opts, "decomposing → handing-off", needsHumanSignoffFor(status, "handing-off"));
}

async function advanceHandoff(opts: OrchestratorOptions): Promise<{ exitCode: number }> {
  header("Phase: Handoff");
  info("Rendering Markdown + HTML artifacts…");
  const renderRes = await callTool(opts.cwd, "dr_render", {});
  if (!renderRes.ok) {
    error(`Render failed: ${(renderRes.errors ?? []).join("; ")}`);
    return { exitCode: 1 };
  }
  success("Artifacts rendered.");

  const linearAvailable = Boolean(process.env.LINEAR_API_KEY);
  let target: "linear" | "filesystem" = "filesystem";
  if (linearAvailable) {
    const wantsLinear = await confirm(
      "LINEAR_API_KEY detected. Push the plan to Linear?",
      opts,
      true
    );
    target = wantsLinear ? "linear" : "filesystem";
  }

  if (target === "linear") {
    const teamId = await ask(
      "Linear team ID:",
      opts,
      process.env.LINEAR_TEAM_ID ?? ""
    );
    if (!teamId) {
      error("Linear team ID is required.");
      return { exitCode: 2 };
    }
    info("Running dry-run preview…");
    const dry = await callTool(opts.cwd, "dr_export_linear", {
      team_id: teamId,
      dry_run: true,
    });
    if (!dry.ok) {
      error(`Linear dry-run failed: ${(dry.errors ?? []).join("; ")}`);
      return { exitCode: 1 };
    }
    const totals = (dry.data as { totals: { issues: number; decisions: number; tasks: number } }).totals;
    info(`Dry-run plan: ${totals.issues} issues (${totals.decisions} decisions + ${totals.tasks} tasks)`);
    const proceed = await confirm("Push to Linear now?", opts, true);
    if (!proceed) {
      warn("Linear push cancelled. Project remains in 'handing-off'.");
      return { exitCode: 0 };
    }
    const push = await callTool(opts.cwd, "dr_export_linear", {
      team_id: teamId,
      dry_run: false,
      sign_off_by: "human",
      sign_off_actor: "cli-user",
    });
    if (!push.ok) {
      error(`Linear export failed: ${(push.errors ?? []).join("; ")}`);
      return { exitCode: 1 };
    }
    const data = push.data as { linear_project: { url?: string }; issues_created: number };
    success(`Pushed ${data.issues_created} issues to Linear.`);
    if (data.linear_project.url) info(`Project URL: ${data.linear_project.url}`);
  } else {
    const proceed = await confirm("Finalize plan to filesystem?", opts, true);
    if (!proceed) {
      warn("Filesystem export cancelled. Project remains in 'handing-off'.");
      return { exitCode: 0 };
    }
    const fs = await callTool(opts.cwd, "dr_export_filesystem", {
      sign_off_by: "human",
      sign_off_actor: "cli-user",
    });
    if (!fs.ok) {
      error(`Filesystem export failed: ${(fs.errors ?? []).join("; ")}`);
      return { exitCode: 1 };
    }
    success("Plan finalized to filesystem.");
  }
  // Re-render so artifacts reflect the final 'handed-off' state.
  await callTool(opts.cwd, "dr_render", {});
  return { exitCode: 0 };
}

async function advancePhase(
  opts: OrchestratorOptions,
  label: string,
  needsHumanSignoff: boolean
): Promise<{ exitCode: number }> {
  if (needsHumanSignoff) {
    divider();
    info(`Next transition (${label}) requires human sign-off.`);
    const proceed = await confirm("Advance?", opts, true);
    if (!proceed) {
      warn(`Halting before ${label}. Re-run to resume.`);
      return { exitCode: 0 };
    }
  }
  const args = needsHumanSignoff
    ? { sign_off_by: "human", sign_off_actor: "cli-user" }
    : {};
  const adv = await callTool(opts.cwd, "dr_advance", args);
  if (!adv.ok) {
    error(`dr_advance failed for ${label}:`);
    for (const r of adv.errors ?? []) bullet(r);
    return { exitCode: 1 };
  }
  success(`Advanced: ${label}`);
  return { exitCode: 0 };
}

function needsHumanSignoffFor(status: StatusData, nextPhase: string): boolean {
  return status.effective_gate_config.require_human_signoff_phases.includes(nextPhase);
}

/**
 * Return gate-failure reasons excluding sign-off failures.
 * The orchestrator handles sign-off itself in advancePhase, so a sign-off-only
 * "failure" from dr_status (which is called without sign-off context) is not
 * a real blocker.
 */
function realGateFailures(status: StatusData): string[] {
  return status.gate_to_next.reasons.filter((r) => !r.startsWith("Sign-off gate:"));
}

interface StatusData {
  state: { phase: string; next_phase: string | null };
  gate_to_next: { pass: boolean; reasons: string[]; next_phase: string | null };
  effective_gate_config: {
    require_human_signoff_phases: string[];
    [k: string]: unknown;
  };
  counts: { decisions: number; tasks: number };
}

async function getStatus(cwd: string): Promise<StatusData> {
  const res = await callTool(cwd, "dr_status", {});
  if (!res.ok) throw new Error(`dr_status failed: ${(res.errors ?? []).join("; ")}`);
  return res.data as StatusData;
}

async function listDecisions(
  cwd: string,
  status: "rfc" | "proposed" | "accepted" | "rejected" | "deprecated" | "superseded"
): Promise<{ id: string; title: string }[]> {
  const res = await callTool(cwd, "dr_list_decisions", { status: [status] });
  if (!res.ok) return [];
  return ((res.data as { decisions?: { id: string; title: string }[] }).decisions) ?? [];
}

async function callTool(
  cwd: string,
  name: string,
  args: Record<string, unknown>
): Promise<{ ok: boolean; data?: unknown; errors?: string[] }> {
  return executeAgentTool(name, { ...args, cwd }, { cwd });
}
