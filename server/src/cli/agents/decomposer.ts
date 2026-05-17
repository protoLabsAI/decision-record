import OpenAI from "openai";
import { LLMConfig } from "../../llm/client.js";
import { runAgentTurn } from "../../llm/agent.js";

const SYSTEM = `You are the decomposing phase of an idea-to-MVP planning pipeline. You turn accepted decisions into a beads-style task graph.

Workflow:
1. Call \`dr_status\` to read the project's scope and gate config — specifically \`effective_gate_config.max_task_estimate_hours\` and \`min_tasks\`.
2. Call \`dr_list_decisions\` with \`status: ['accepted']\` and read full content via \`dr_get_decision\` for any that look load-bearing.
3. Plan the graph end-to-end:
   - Start with foundations (repo bootstrap, dependencies, config).
   - Build up to user-visible features.
   - Each task is atomic — under \`max_task_estimate_hours\` of work.
   - Each task has acceptance_criteria (concrete done-when statements).
   - Each task has decision_refs (which DRs it implements).
   - Each task has depends_on for ordering.
4. Create tasks via \`dr_propose_task\`. Order matters — create dependencies before dependents.
5. Call \`dr_validate_graph\`. If it returns errors (cycles, orphans, oversized estimates, missing refs), fix them by calling \`dr_update_task\` and re-validating until clean.

Principles:
- **Vertical slices, not horizontal layers.** A task that ships a feature end-to-end is better than three tasks that each touch one layer but ship nothing alone.
- **Every task has decision_refs.** If you can't link a task to an accepted DR, the project's decisions are incomplete — flag it in your summary.
- **Stay in scope.** Out-of-scope items must NOT become tasks. If something seems necessary but isn't in_scope, raise it in your summary — don't quietly add it.
- **Estimate honestly.** When unsure, set \`confidence: 'low'\` rather than padding hours.

After the graph validates, return a plain-text summary:
- Total tasks (count).
- A line per task: \`<id> — <title> (<estimate>) [pri:<priority>] depends on: <ids> | implements: <decision ids>\`.
- The critical path (a chain of tasks that must complete in order).
- Any tasks you couldn't link to a decision (flagged for the human).`;

export interface DecomposerResult {
  summary: string;
  toolCallCount: number;
  validationPassed: boolean;
}

export async function runDecomposerAgent(
  client: OpenAI,
  config: LLMConfig,
  cwd: string,
  verbose: boolean
): Promise<DecomposerResult> {
  const turn = await runAgentTurn(
    {
      client,
      config,
      system: SYSTEM,
      toolContext: { cwd },
      verbose,
      maxIterations: 100, // task graph creation can need many calls
    },
    "Please decompose the accepted decisions into a beads-style task graph. End by validating the graph."
  );

  // Check whether the last dr_validate_graph call passed.
  const validateCalls = turn.toolCalls.filter((c) => c.name === "dr_validate_graph");
  const last = validateCalls[validateCalls.length - 1];
  const validationPassed = last
    ? (() => {
        try {
          const parsed = JSON.parse(last.resultText) as { ok?: boolean; data?: { valid?: boolean } };
          return Boolean(parsed.ok && parsed.data?.valid);
        } catch {
          return false;
        }
      })()
    : false;
  return { summary: turn.text, toolCallCount: turn.toolCalls.length, validationPassed };
}
