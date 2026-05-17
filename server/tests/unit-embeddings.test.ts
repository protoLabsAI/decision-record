import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import OpenAI from "openai";
import {
  composeEmbeddingText,
  cosineSim,
  resolveEmbedConfig,
  sha256Hash,
} from "../src/embeddings/index.js";
import { indexDecision } from "../src/embeddings/index.js";
import { Decision, DecisionSchema } from "../src/schemas/index.js";
import { Store } from "../src/storage/store.js";
import { makeTmpProject } from "./helpers/tmp-project.js";

const NOW = "2026-05-17T00:00:00.000Z";

function makeDecision(overrides: Partial<Decision> = {}): Decision {
  return DecisionSchema.parse({
    id: "0001-pick-a-data-store",
    number: 1,
    slug: "pick-a-data-store",
    title: "Pick a data store",
    status: "accepted",
    template_variant: "canonical",
    created_at: NOW,
    updated_at: NOW,
    summary: "We need a primary store.",
    issue: "Several options exist.",
    argument: "Postgres balances simplicity and durability.",
    selected_position: "Postgres",
    positions: [
      { title: "Postgres", pros: [], cons: [], links: [] },
      { title: "SQLite", pros: [], cons: [], links: [] },
    ],
    assumptions: [],
    constraints: [],
    opinions: [],
    implications: ["operate a Postgres cluster"],
    depends_on: [],
    related_decisions: [],
    related_artifacts: [],
    review: [],
    tags: ["data", "infra"],
    ...overrides,
  });
}

describe("cosineSim", () => {
  it("returns 1 for identical vectors", () => {
    assert.ok(Math.abs(cosineSim([1, 0, 0], [1, 0, 0]) - 1) < 1e-9);
  });
  it("returns 0 for orthogonal vectors", () => {
    assert.ok(Math.abs(cosineSim([1, 0], [0, 1])) < 1e-9);
  });
  it("returns -1 for opposite vectors", () => {
    assert.ok(Math.abs(cosineSim([1, 0], [-1, 0]) + 1) < 1e-9);
  });
  it("returns 0 for empty or mismatched vectors", () => {
    assert.equal(cosineSim([], [1, 2, 3]), 0);
    assert.equal(cosineSim([1, 2], [1, 2, 3]), 0);
  });
  it("returns 0 when one vector is all zero (no NaN)", () => {
    assert.equal(cosineSim([0, 0, 0], [1, 2, 3]), 0);
  });
});

describe("composeEmbeddingText", () => {
  it("includes title, summary, issue, argument, selected position, positions, implications, tags", () => {
    const text = composeEmbeddingText(makeDecision());
    assert.match(text, /Title: Pick a data store/);
    assert.match(text, /Summary: We need a primary store\./);
    assert.match(text, /Issue: Several options exist\./);
    assert.match(text, /Argument: Postgres balances/);
    assert.match(text, /Selected: Postgres/);
    assert.match(text, /Positions: Postgres; SQLite/);
    assert.match(text, /Implications: operate a Postgres cluster/);
    assert.match(text, /Tags: data, infra/);
  });

  it("omits absent optional fields", () => {
    const text = composeEmbeddingText(
      makeDecision({
        summary: undefined,
        issue: undefined,
        argument: undefined,
        selected_position: undefined,
        positions: [],
        implications: [],
        tags: [],
      })
    );
    assert.doesNotMatch(text, /Summary:/);
    assert.doesNotMatch(text, /Issue:/);
    assert.doesNotMatch(text, /Argument:/);
    assert.doesNotMatch(text, /Selected:/);
    assert.doesNotMatch(text, /Positions:/);
    assert.doesNotMatch(text, /Implications:/);
    assert.doesNotMatch(text, /Tags:/);
    assert.match(text, /^Title: Pick a data store$/);
  });

  it("hash changes when a field changes", () => {
    const a = sha256Hash(composeEmbeddingText(makeDecision()));
    const b = sha256Hash(
      composeEmbeddingText(makeDecision({ title: "Pick a different store" }))
    );
    assert.notEqual(a, b);
  });
});

describe("resolveEmbedConfig", () => {
  const originalEnv = { ...process.env };
  beforeEach(() => {
    delete process.env.OPENAI_EMBEDDING_MODEL;
  });
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("defaults to text-embedding-3-small", () => {
    const cfg = resolveEmbedConfig();
    assert.equal(cfg.enabled, true);
    assert.equal(cfg.model, "text-embedding-3-small");
  });

  it("respects OPENAI_EMBEDDING_MODEL env", () => {
    process.env.OPENAI_EMBEDDING_MODEL = "text-embedding-3-large";
    const cfg = resolveEmbedConfig();
    assert.equal(cfg.model, "text-embedding-3-large");
    assert.equal(cfg.enabled, true);
  });

  it("disables when OPENAI_EMBEDDING_MODEL=none", () => {
    process.env.OPENAI_EMBEDDING_MODEL = "none";
    const cfg = resolveEmbedConfig();
    assert.equal(cfg.enabled, false);
  });
});

describe("indexDecision", () => {
  it("skips when embeddings are disabled", async () => {
    const project = makeTmpProject("dr-embed-disabled-");
    try {
      const store = new Store(project.cwd);
      await store.ensureLayout();
      const result = await indexDecision(store, makeDecision(), {
        config: { enabled: false, model: "none" },
      });
      assert.equal(result.status, "skipped");
      if (result.status === "skipped") assert.equal(result.reason, "disabled");
      // No cache should be written
      assert.equal(await store.readEmbeddings(), null);
    } finally {
      project.dispose();
    }
  });

  it("indexes a decision via injected client, then skips on unchanged hash", async () => {
    const project = makeTmpProject("dr-embed-happy-");
    try {
      const store = new Store(project.cwd);
      await store.ensureLayout();
      let calls = 0;
      const client = {
        embeddings: {
          create: async () => {
            calls++;
            return { data: [{ embedding: [0.1, 0.2, 0.3] }] };
          },
        },
      } as unknown as OpenAI;
      const cfg = { enabled: true, model: "fake-model" } as const;

      const a = await indexDecision(store, makeDecision(), { config: cfg, client });
      assert.equal(a.status, "indexed");
      assert.equal(calls, 1);

      // Same decision again ⇒ cache hit, no extra call
      const b = await indexDecision(store, makeDecision(), { config: cfg, client });
      assert.equal(b.status, "skipped");
      if (b.status === "skipped") assert.equal(b.reason, "unchanged");
      assert.equal(calls, 1);

      // Change a field ⇒ re-embed
      const c = await indexDecision(
        store,
        makeDecision({ title: "Pick a totally new store" }),
        { config: cfg, client }
      );
      assert.equal(c.status, "indexed");
      assert.equal(calls, 2);

      const cache = await store.readEmbeddings();
      assert.equal(cache?.entries["0001-pick-a-data-store"]?.dim, 3);
    } finally {
      project.dispose();
    }
  });

  it("records embeddings_index_failed when embedding throws", async () => {
    const project = makeTmpProject("dr-embed-fail-");
    try {
      const store = new Store(project.cwd);
      await store.ensureLayout();
      const client = {
        embeddings: {
          create: async () => {
            throw new Error("boom");
          },
        },
      } as unknown as OpenAI;
      const result = await indexDecision(store, makeDecision(), {
        config: { enabled: true, model: "fake-model" },
        client,
      });
      assert.equal(result.status, "failed");
      const events = project.events();
      assert.ok(events.some((e) => e.kind === "embeddings_index_failed"));
    } finally {
      project.dispose();
    }
  });
});
