import OpenAI from "openai";
import { Decision, EmbeddingCache, EmbeddingCacheEntry } from "../schemas/index.js";
import { Store } from "../storage/store.js";
import { nowIso } from "../util.js";
import {
  EmbedConfig,
  embed,
  getDefaultEmbedClient,
  resolveEmbedConfig,
} from "./client.js";
import { composeEmbeddingText, sha256Hash } from "./text.js";

export type IndexResult =
  | { status: "indexed"; entry: EmbeddingCacheEntry }
  | { status: "skipped"; reason: "disabled" | "unchanged" }
  | { status: "failed"; error: string };

export async function indexDecision(
  store: Store,
  decision: Decision,
  options: {
    config?: EmbedConfig;
    client?: OpenAI;
  } = {}
): Promise<IndexResult> {
  const cfg = options.config ?? resolveEmbedConfig();
  if (!cfg.enabled) {
    return { status: "skipped", reason: "disabled" };
  }

  const text = composeEmbeddingText(decision);
  const hash = sha256Hash(text);

  let cache = await store.readEmbeddings();
  const existing = cache?.entries[decision.id];
  if (existing && existing.hash === hash && existing.model === cfg.model) {
    return { status: "skipped", reason: "unchanged" };
  }

  try {
    const client = options.client ?? getDefaultEmbedClient(cfg);
    const vector = await embed(client, cfg, text);
    const entry: EmbeddingCacheEntry = {
      decision_id: decision.id,
      model: cfg.model,
      dim: vector.length,
      hash,
      vector,
      embedded_at: nowIso(),
    };
    const newCache: EmbeddingCache = {
      version: "1",
      default_model: cfg.model,
      entries: {
        ...(cache?.entries ?? {}),
        [decision.id]: entry,
      },
    };
    await store.writeEmbeddings(newCache);
    await store.appendEvent({
      at: entry.embedded_at,
      actor: "agent",
      kind: "embeddings_indexed",
      entity_kind: "decision",
      entity_id: decision.id,
      payload: { model: cfg.model, dim: vector.length },
    });
    return { status: "indexed", entry };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await store.appendEvent({
      at: nowIso(),
      actor: "agent",
      kind: "embeddings_index_failed",
      entity_kind: "decision",
      entity_id: decision.id,
      payload: { error: msg, model: cfg.model },
    });
    return { status: "failed", error: msg };
  }
}

export { composeEmbeddingText, sha256Hash } from "./text.js";
export { cosineSim, resolveEmbedConfig, type EmbedConfig } from "./client.js";
