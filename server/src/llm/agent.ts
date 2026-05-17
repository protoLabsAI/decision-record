import OpenAI from "openai";
import { LLMConfig } from "./client.js";
import {
  executeAgentTool,
  listOpenAITools,
  ToolFilter,
  ToolInvocationContext,
} from "./tools.js";
import { log } from "../log.js";

export interface AgentOptions {
  client: OpenAI;
  config: LLMConfig;
  system: string;
  toolFilter?: ToolFilter;
  toolContext: ToolInvocationContext;
  /** Max tool-use iterations before giving up. */
  maxIterations?: number;
  /** Stream agent reasoning to stderr. */
  verbose?: boolean;
}

export interface AgentTurn {
  /** Final assistant text after the loop ends. */
  text: string;
  /** Tool calls executed during the loop. */
  toolCalls: { name: string; args: Record<string, unknown>; resultText: string }[];
  /** Reason the loop terminated. */
  stopReason: "end_turn" | "max_iterations" | "refusal" | "length";
  /** Total iterations consumed. */
  iterations: number;
  /** Approximate token usage (sum across all turns). */
  usage: { prompt: number; completion: number };
}

/** Run a single agent turn — initial user message plus full tool-using loop until the model has nothing more to do. */
export async function runAgentTurn(
  options: AgentOptions,
  userMessage: string
): Promise<AgentTurn> {
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: options.system },
    { role: "user", content: userMessage },
  ];
  return runAgentLoop(options, messages);
}

/** Continue an agent conversation with a new user message. Messages are mutated in place. */
export async function continueAgentConversation(
  options: AgentOptions,
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
  userMessage: string
): Promise<AgentTurn> {
  messages.push({ role: "user", content: userMessage });
  return runAgentLoop(options, messages);
}

async function runAgentLoop(
  options: AgentOptions,
  messages: OpenAI.Chat.ChatCompletionMessageParam[]
): Promise<AgentTurn> {
  const tools = listOpenAITools(options.toolFilter);
  const maxIter = options.maxIterations ?? 32;
  const toolCalls: AgentTurn["toolCalls"] = [];
  const usage = { prompt: 0, completion: 0 };

  for (let i = 0; i < maxIter; i++) {
    const completion = await options.client.chat.completions.create({
      model: options.config.model,
      messages,
      tools: tools.length > 0 ? tools : undefined,
      max_tokens: options.config.maxTokens,
      temperature: options.config.temperature,
    });
    if (completion.usage) {
      usage.prompt += completion.usage.prompt_tokens;
      usage.completion += completion.usage.completion_tokens;
    }
    const choice = completion.choices[0];
    if (!choice) {
      throw new Error("LLM returned no choices");
    }
    const msg = choice.message;
    messages.push(msg as OpenAI.Chat.ChatCompletionMessageParam);

    if (options.verbose && msg.content) {
      process.stderr.write(`\n[agent] ${msg.content}\n`);
    }

    if (choice.finish_reason === "length") {
      return {
        text: msg.content ?? "",
        toolCalls,
        stopReason: "length",
        iterations: i + 1,
        usage,
      };
    }
    if (choice.finish_reason === "content_filter") {
      return {
        text: msg.content ?? "[content filtered]",
        toolCalls,
        stopReason: "refusal",
        iterations: i + 1,
        usage,
      };
    }
    const calls = msg.tool_calls ?? [];
    if (calls.length === 0) {
      return {
        text: msg.content ?? "",
        toolCalls,
        stopReason: "end_turn",
        iterations: i + 1,
        usage,
      };
    }

    for (const call of calls) {
      if (call.type !== "function") continue;
      const name = call.function.name;
      const argsStr = call.function.arguments;
      if (options.verbose) {
        process.stderr.write(`[agent→${name}] ${argsStr}\n`);
      }
      const result = await executeAgentTool(name, argsStr, options.toolContext);
      const resultText = JSON.stringify(result, null, 2);
      toolCalls.push({
        name,
        args: safeJson(argsStr),
        resultText,
      });
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: resultText,
      });
      if (options.verbose) {
        const head = resultText.length > 300 ? resultText.slice(0, 300) + "…" : resultText;
        process.stderr.write(`[tool→${name}] ${head}\n`);
      }
    }
  }

  log.warn(`Agent loop hit max_iterations=${maxIter} without ending`);
  return {
    text: "[agent stopped: max iterations reached]",
    toolCalls,
    stopReason: "max_iterations",
    iterations: maxIter,
    usage,
  };
}

function safeJson(s: string): Record<string, unknown> {
  try {
    return JSON.parse(s);
  } catch {
    return { _raw: s };
  }
}
