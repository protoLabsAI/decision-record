import OpenAI from "openai";

export interface LLMConfig {
  apiKey?: string;
  baseURL?: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
}

export function resolveConfig(overrides: Partial<LLMConfig> = {}): LLMConfig {
  const apiKey = overrides.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is required (or pass --api-key). Set OPENAI_BASE_URL for non-default endpoints (Ollama, vLLM, OpenRouter, LiteLLM, etc.)."
    );
  }
  const baseURL = overrides.baseURL ?? process.env.OPENAI_BASE_URL;
  const model = overrides.model ?? process.env.OPENAI_MODEL ?? "gpt-4o";
  return {
    apiKey,
    baseURL,
    model,
    maxTokens: overrides.maxTokens,
    temperature: overrides.temperature,
  };
}

export function makeClient(config: LLMConfig): OpenAI {
  return new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
  });
}
