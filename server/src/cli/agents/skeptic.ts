import OpenAI from "openai";
import { LLMConfig } from "../../llm/client.js";
import { runAgentTurn } from "../../llm/agent.js";

const LENSES = ["operational", "strategic", "security", "cost", "user-impact"] as const;
export type Lens = (typeof LENSES)[number];

export const ALL_LENSES = LENSES;

function systemFor(lens: Lens): string {
  const lensGuidance: Record<Lens, string> = {
    operational:
      "Can the team actually maintain this? What's the on-call cost? What breaks at 3am? Who owns each operational concern?",
    strategic:
      "Does this advance the business goal? Is it differentiated? Is the timing right? What's the opportunity cost?",
    security:
      "What's the attack surface? What data is exposed? What new compliance hooks? What's the worst-case breach impact?",
    cost:
      "Total cost of ownership over 12 months. Hidden costs (people, time, licenses). Migration costs if we're wrong.",
    "user-impact":
      "How does this feel to the user? Does it create friction? Could it break trust? Is the upgrade/migration painful?",
  };

  return `You are dr-skeptic — an antagonistic reviewer applying the ${lens} lens.

${lensGuidance[lens]}

Your job: stress-test the decision. Find what's wrong before it's locked in. You're NOT here to be nice — you're here to make sure the team didn't just pick the first option that sounded reasonable.

Workflow:
1. Call \`dr_get_decision\` with the decision id you're given.
2. Examine: title, issue, assumptions, constraints, positions, selected_position, argument, implications.
3. Stress-test the argument through the ${lens} lens:
   - What assumptions are unstated?
   - What positions were dismissed without serious consideration?
   - What edge cases would break this choice?
   - What's the cost of being wrong, and how easily is the decision reversible?
4. Call \`dr_review_decision\` with:
   - \`reviewer: 'dr-skeptic'\`
   - \`lens: '${lens}'\`
   - \`verdict: 'pass' | 'block'\`
   - \`score: 1-5\` (1=blocking concerns, 5=enthusiastic)
   - \`concerns: [...]\` (crisp one-line statements — concrete, actionable, not vague)

Pass only if you genuinely tried to break the decision and failed. If \`argument\` is empty or weak, score it low and demand more.

After the tool call, return one or two sentences summarizing your verdict.`;
}

export interface SkepticReview {
  lens: Lens;
  verdict: "pass" | "block";
  score: number;
  concerns: string[];
  summary: string;
}

export async function runSkepticAgent(
  client: OpenAI,
  config: LLMConfig,
  cwd: string,
  decisionId: string,
  lens: Lens,
  verbose: boolean
): Promise<SkepticReview> {
  const turn = await runAgentTurn(
    {
      client,
      config,
      system: systemFor(lens),
      toolContext: { cwd },
      verbose,
      maxIterations: 8,
      toolFilter: {
        include: ["dr_get_decision", "dr_review_decision", "dr_list_decisions"],
      },
    },
    `Review decision \`${decisionId}\` through the ${lens} lens. Record your verdict via dr_review_decision.`
  );

  const reviewCall = turn.toolCalls.find((c) => c.name === "dr_review_decision");
  if (!reviewCall) {
    return {
      lens,
      verdict: "block",
      score: 1,
      concerns: ["Skeptic agent did not call dr_review_decision — review missing."],
      summary: turn.text || "Skeptic produced no output.",
    };
  }
  const args = reviewCall.args as {
    verdict?: "pass" | "block";
    score?: number;
    concerns?: string[];
  };
  return {
    lens,
    verdict: args.verdict ?? "block",
    score: args.score ?? 0,
    concerns: args.concerns ?? [],
    summary: turn.text,
  };
}
