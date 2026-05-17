import OpenAI from "openai";

export interface EmbedConfig {
  enabled: boolean;
  model: string;
  apiKey?: string;
  baseURL?: string;
}

const DEFAULT_MODEL = "text-embedding-3-small";

export function resolveEmbedConfig(overrides: Partial<EmbedConfig> = {}): EmbedConfig {
  const rawModel = overrides.model ?? process.env.OPENAI_EMBEDDING_MODEL ?? DEFAULT_MODEL;
  if (rawModel === "none" || rawModel === "") {
    return { enabled: false, model: rawModel };
  }
  return {
    enabled: true,
    model: rawModel,
    apiKey: overrides.apiKey ?? process.env.OPENAI_API_KEY,
    baseURL: overrides.baseURL ?? process.env.OPENAI_BASE_URL,
  };
}

let cached: OpenAI | null = null;
let override: OpenAI | null = null;

export function getDefaultEmbedClient(cfg: EmbedConfig): OpenAI {
  if (override) return override;
  if (cached) return cached;
  cached = new OpenAI({
    apiKey: cfg.apiKey,
    baseURL: cfg.baseURL,
  });
  return cached;
}

export function resetDefaultEmbedClient(): void {
  cached = null;
  override = null;
}

/** Test-only — replace the embed client with a mock. Call resetDefaultEmbedClient() to clear. */
export function setEmbedClientForTesting(client: OpenAI | null): void {
  override = client;
}

export async function embed(
  client: OpenAI,
  cfg: EmbedConfig,
  input: string
): Promise<number[]> {
  if (!cfg.enabled) {
    throw new Error("embedding disabled (OPENAI_EMBEDDING_MODEL=none)");
  }
  const resp = await client.embeddings.create({ model: cfg.model, input });
  const data = resp.data?.[0];
  if (!data?.embedding) {
    throw new Error("embedding response missing vector");
  }
  return data.embedding;
}

export function cosineSim(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const ai = a[i] ?? 0;
    const bi = b[i] ?? 0;
    dot += ai * bi;
    na += ai * ai;
    nb += bi * bi;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  if (denom === 0) return 0;
  return dot / denom;
}
