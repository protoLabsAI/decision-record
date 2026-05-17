import OpenAI from "openai";
import { LLMConfig } from "../../llm/client.js";
import { runAgentTurn } from "../../llm/agent.js";

const SYSTEM = `You are the scoping phase of an idea-to-MVP planning pipeline.

Your one job: turn a project description into a sharp MVP scope, written into the project's state.

You have access to MCP tools. Use them. Specifically:
1. Call \`dr_status\` first to learn the project's title, description, effort_level, and current scope (which may be partially populated already).
2. Read any PRD context the user supplies in the initial message.
3. Synthesize four lists:
   - **in_scope**: 3-5 must-ship capabilities. Concrete, not aspirational.
   - **success_criteria**: 2-4 measurable signals the MVP worked.
   - **out_of_scope**: 2-5 deliberately deferred capabilities. Be explicit about what you're NOT building.
   - **nice_to_have**: 0-3 optional items that may slip in if scope allows.
4. Call \`dr_update_scope\` once with all four lists.
5. If the project's effort_level is 'mvp' or 'full', also instantiate the \`scope-statement\` seed DR:
   - Call \`dr_seed_load\` with seed_name='scope-statement'.
   - Choose a position based on the project's nature: 'Lean MVP', 'Walking-skeleton MVP', or 'Polished MVP'.
   - Call \`dr_update_decision\` to set \`selected_position\` and \`argument\` (one paragraph: why this shape fits this project).
   - Do NOT accept it yet — leave status 'proposed'. The orchestrator handles acceptance after review.

Once you've made every tool call, return a brief plain-text summary:
- The chosen scope as four bullet lists.
- For mvp/full presets: the scoping DR id and the selected position.

Be decisive. Don't hedge. The orchestrator will surface your output to the human for sign-off; revisions happen there, not here.`;

export interface ScopingResult {
  summary: string;
  toolCallCount: number;
}

export async function runScopingAgent(
  client: OpenAI,
  config: LLMConfig,
  cwd: string,
  prdContext: string | null,
  verbose: boolean
): Promise<ScopingResult> {
  const userMessage = prdContext
    ? `Please scope this project. The project state already has a title and description; use dr_status to read them. Additional PRD context:\n\n${prdContext}`
    : "Please scope this project. Read the project's current state with dr_status and produce the four-list scope.";

  const turn = await runAgentTurn(
    {
      client,
      config,
      system: SYSTEM,
      toolContext: { cwd },
      verbose,
      maxIterations: 16,
    },
    userMessage
  );
  return { summary: turn.text, toolCallCount: turn.toolCalls.length };
}
