import OpenAI from "openai";

/**
 * Scripted response — a single completion the mock will return.
 * If `toolCalls` is non-empty, the model is asking for those tools to be executed.
 * If `text` is non-empty AND no toolCalls, this terminates the agent loop.
 */
export interface ScriptedResponse {
  text?: string;
  toolCalls?: { name: string; args: Record<string, unknown> }[];
}

export interface MockOpenAIOptions {
  /**
   * Optional deterministic embedding function. Receives the input string,
   * returns a fixed-dim vector. When omitted, a default hash-based vector is
   * used so embedding-aware code paths remain exercisable without the model.
   */
  embeddingsFor?: (input: string) => number[];
}

function defaultEmbeddingsFor(input: string): number[] {
  // Lightweight deterministic vector. Not semantic — just stable per input.
  const DIM = 16;
  const out = new Array<number>(DIM).fill(0);
  for (let i = 0; i < input.length; i++) {
    out[i % DIM] += input.charCodeAt(i);
  }
  const max = Math.max(...out, 1);
  return out.map((v) => v / max);
}

/**
 * Build a mock OpenAI client that pops scripted responses off a queue.
 * Each call to chat.completions.create consumes one entry.
 */
export function makeMockOpenAI(
  script: ScriptedResponse[],
  options: MockOpenAIOptions = {}
): OpenAI {
  let i = 0;
  const queue = [...script];
  let nextId = 1;

  const create = async (params: OpenAI.Chat.ChatCompletionCreateParams) => {
    const entry = queue[i++];
    if (!entry) {
      const lastUser = [...params.messages]
        .reverse()
        .find((m) => m.role === "user" || m.role === "tool");
      const lastUserSummary = lastUser
        ? `last ${lastUser.role}: ${
            typeof lastUser.content === "string"
              ? lastUser.content.slice(0, 120)
              : "[structured content]"
          }`
        : "no user/tool messages found";
      throw new Error(
        `Mock OpenAI exhausted after ${i - 1} calls (${queue.length} scripted). ${lastUserSummary}`
      );
    }
    if (process.env.DR_MOCK_DEBUG) {
      process.stderr.write(`[mock #${i}] ${JSON.stringify(entry).slice(0, 200)}\n`);
    }
    const toolCalls = (entry.toolCalls ?? []).map((c) => ({
      id: `call_${nextId++}`,
      type: "function" as const,
      function: { name: c.name, arguments: JSON.stringify(c.args) },
    }));
    const message: OpenAI.Chat.ChatCompletionMessage = {
      role: "assistant",
      content: entry.text ?? null,
      refusal: null,
      ...(toolCalls.length > 0 && { tool_calls: toolCalls }),
    };
    return {
      id: `cmpl_mock_${i}`,
      object: "chat.completion",
      created: Date.now(),
      model: "mock",
      choices: [
        {
          index: 0,
          message,
          finish_reason: toolCalls.length > 0 ? "tool_calls" : "stop",
          logprobs: null,
        },
      ],
      usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
    } as unknown as OpenAI.Chat.ChatCompletion;
  };

  const embeddingsFor = options.embeddingsFor ?? defaultEmbeddingsFor;

  const createEmbedding = async (
    params: OpenAI.EmbeddingCreateParams
  ): Promise<OpenAI.CreateEmbeddingResponse> => {
    const inputs = Array.isArray(params.input)
      ? (params.input as string[])
      : [params.input as string];
    const data = inputs.map((text, index) => ({
      object: "embedding" as const,
      index,
      embedding: embeddingsFor(text),
    }));
    return {
      object: "list",
      model: typeof params.model === "string" ? params.model : "mock",
      data,
      usage: { prompt_tokens: 0, total_tokens: 0 },
    } as OpenAI.CreateEmbeddingResponse;
  };

  // Build a minimal object that quacks like OpenAI for our agent loop.
  const mock = {
    chat: {
      completions: { create },
    },
    embeddings: { create: createEmbedding },
  } as unknown as OpenAI;
  return mock;
}

export function remainingMockCalls(client: OpenAI, expectedTotal: number): number {
  // For tests that want to assert the script was fully consumed.
  return expectedTotal;
}
