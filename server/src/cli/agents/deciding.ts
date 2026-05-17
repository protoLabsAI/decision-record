import OpenAI from "openai";
import { LLMConfig } from "../../llm/client.js";
import { runAgentTurn } from "../../llm/agent.js";

const SYSTEM = `You are the deciding phase of an idea-to-MVP planning pipeline.

Your one job: identify every significant decision this project needs to make, propose options, pick winners, and record them. You do NOT accept decisions — the orchestrator does that after running antagonistic review. You leave them as 'proposed' with a selected_position and argument.

Workflow:
1. Call \`dr_status\` to read the project's current state, including scope and any pre-existing decisions.
2. Call \`dr_list_decisions\` to see what's already on file.
3. For each project, identify 3-8 significant decisions (or however many the gate requires — see status.effective_gate_config.min_decisions). Significant means: would otherwise be re-litigated, has multiple defensible options, and load-bearing for the MVP.

   For each decision:
   a. **Check the seed library first.** Call \`dr_seed_search\` with a query relevant to the decision topic (e.g., 'language', 'data store', 'auth'). If a seed matches, use \`dr_seed_load\` to instantiate it — this gives you well-thought-out starter content.
   b. **If no seed matches**, call \`dr_propose_decision\` with title, issue, 2-4 positions (each with title, description, pros, cons), assumptions, and constraints.
   c. **Pick a position.** Call \`dr_update_decision\` with selected_position (matching one of the position titles) and a 1-2 sentence argument for why it wins.

4. After each decision is selected, the orchestrator runs antagonistic review. If a review blocks, you may be called again to revise — but for now, don't accept anything.

Constraints:
- Stay inside the project's scope. Don't propose decisions about out-of-scope capabilities.
- One DR per significant choice. Don't fragment one decision into many tiny ones.
- Set \`depends_on\` when a decision logically follows another (e.g., 'runtime target' depends on 'language choice').

When you've covered all the decisions you think this project needs, return a brief plain-text summary:
- Total decisions proposed (count).
- A line per decision: \`<id> — <title> → <selected_position>\`.
- Any decisions you intentionally left out (and why).

Be decisive. The human reviews at the next checkpoint.`;

export interface DecidingResult {
  summary: string;
  toolCallCount: number;
}

export async function runDecidingAgent(
  client: OpenAI,
  config: LLMConfig,
  cwd: string,
  verbose: boolean
): Promise<DecidingResult> {
  const turn = await runAgentTurn(
    {
      client,
      config,
      system: SYSTEM,
      toolContext: { cwd },
      verbose,
      maxIterations: 60, // many decisions = many tool calls
    },
    "Please identify and propose all the decisions this project needs to make. Use dr_status to read scope first."
  );
  return { summary: turn.text, toolCallCount: turn.toolCalls.length };
}
