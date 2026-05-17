import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  EmbeddingCacheSchema,
  Outcome,
  OutcomeIdSchema,
  OutcomeSchema,
  OutcomeStatusSchema,
} from "../src/schemas/index.js";
import { outcomeId, pad4 } from "../src/util.js";
import { Store } from "../src/storage/store.js";
import { makeTmpProject } from "./helpers/tmp-project.js";

const NOW = "2026-05-17T00:00:00.000Z";

const validOutcome: Outcome = {
  id: "O0001-latency-held-up",
  number: 1,
  slug: "latency-held-up",
  decision_id: "0001-choose-data-store",
  status: "validated",
  observation: "After 30 days in production, p99 query latency is 280ms — within the 350ms budget.",
  evidence: [],
  recorded_by: "human",
  recorded_at: NOW,
  updated_at: NOW,
  tags: [],
};

describe("OutcomeStatusSchema", () => {
  it("accepts the four canonical statuses", () => {
    for (const s of ["pending", "validated", "invalidated", "inconclusive"]) {
      assert.doesNotThrow(() => OutcomeStatusSchema.parse(s));
    }
  });
  it("rejects unknown statuses", () => {
    assert.throws(() => OutcomeStatusSchema.parse("rolled-back"));
    assert.throws(() => OutcomeStatusSchema.parse(""));
  });
});

describe("OutcomeIdSchema", () => {
  it("accepts O0000-slug format", () => {
    assert.doesNotThrow(() => OutcomeIdSchema.parse("O0001-x1"));
    assert.doesNotThrow(() => OutcomeIdSchema.parse("O9999-some-long-observation-slug"));
  });
  it("rejects decision/task style ids", () => {
    assert.throws(() => OutcomeIdSchema.parse("0001-foo"));
    assert.throws(() => OutcomeIdSchema.parse("T0001-foo"));
    assert.throws(() => OutcomeIdSchema.parse("o0001-foo")); // lower-case O
    assert.throws(() => OutcomeIdSchema.parse("O1-foo")); // not 4-padded
  });
});

describe("outcomeId helper", () => {
  it("produces O<pad4>-<slug>", () => {
    assert.equal(outcomeId(1, "abc"), "O0001-abc");
    assert.equal(outcomeId(42, "long-slug-here"), "O0042-long-slug-here");
    assert.equal(pad4(7), "0007");
  });
});

describe("OutcomeSchema", () => {
  it("round-trips a minimal valid outcome", () => {
    const parsed = OutcomeSchema.parse(validOutcome);
    assert.equal(parsed.id, validOutcome.id);
    assert.equal(parsed.status, "validated");
    assert.deepEqual(parsed.evidence, []);
  });

  it("rejects empty observation", () => {
    assert.throws(() => OutcomeSchema.parse({ ...validOutcome, observation: "" }));
  });

  it("rejects mismatched decision_id format", () => {
    assert.throws(() => OutcomeSchema.parse({ ...validOutcome, decision_id: "T0001-foo" }));
  });

  it("accepts optional metric, evidence, tags", () => {
    const parsed = OutcomeSchema.parse({
      ...validOutcome,
      metric: "p99 latency 280ms",
      evidence: ["https://example.com/dashboard"],
      tags: ["perf", "prod"],
    });
    assert.equal(parsed.metric, "p99 latency 280ms");
    assert.equal(parsed.evidence.length, 1);
    assert.deepEqual(parsed.tags, ["perf", "prod"]);
  });

  it("defaults recorded_by to 'human'", () => {
    const { recorded_by: _recorded_by, ...rest } = validOutcome;
    const parsed = OutcomeSchema.parse(rest);
    assert.equal(parsed.recorded_by, "human");
  });
});

describe("EmbeddingCacheSchema", () => {
  it("accepts a well-formed cache", () => {
    const parsed = EmbeddingCacheSchema.parse({
      version: "1",
      default_model: "text-embedding-3-small",
      entries: {
        "0001-choose-data-store": {
          decision_id: "0001-choose-data-store",
          model: "text-embedding-3-small",
          dim: 1536,
          hash: "abc123",
          vector: [0.1, 0.2, 0.3],
          embedded_at: NOW,
        },
      },
    });
    assert.equal(parsed.version, "1");
    assert.equal(parsed.entries["0001-choose-data-store"]?.dim, 1536);
  });

  it("rejects wrong version", () => {
    assert.throws(() =>
      EmbeddingCacheSchema.parse({
        version: "2",
        default_model: "x",
        entries: {},
      })
    );
  });
});

describe("Store outcome CRUD", () => {
  it("writes, reads, lists outcomes", async () => {
    const project = makeTmpProject("dr-outcome-store-");
    try {
      const store = new Store(project.cwd);
      await store.ensureLayout();

      // Initially empty
      assert.deepEqual(await store.listOutcomes(), []);

      await store.writeOutcome(validOutcome);

      const list = await store.listOutcomes();
      assert.equal(list.length, 1);
      assert.equal(list[0]?.id, validOutcome.id);

      const read = await store.readOutcome(validOutcome.id);
      assert.equal(read.observation, validOutcome.observation);

      // Layout creates outcomes directory
      assert.ok(project.exists("dr/outcomes"));
      assert.ok(project.exists(`dr/outcomes/${validOutcome.id}.json`));
    } finally {
      project.dispose();
    }
  });

  it("writeOutcomeMarkdown writes a sibling .md file", async () => {
    const project = makeTmpProject("dr-outcome-md-");
    try {
      const store = new Store(project.cwd);
      await store.ensureLayout();
      await store.writeOutcome(validOutcome);
      await store.writeOutcomeMarkdown(validOutcome.id, "# rendered");
      assert.equal(
        project.read(`dr/outcomes/${validOutcome.id}.md`).trim(),
        "# rendered"
      );
    } finally {
      project.dispose();
    }
  });

  it("embeddings cache returns null when missing, round-trips when written", async () => {
    const project = makeTmpProject("dr-embed-cache-");
    try {
      const store = new Store(project.cwd);
      await store.ensureLayout();

      assert.equal(await store.readEmbeddings(), null);

      await store.writeEmbeddings({
        version: "1",
        default_model: "text-embedding-3-small",
        entries: {},
      });

      const cache = await store.readEmbeddings();
      assert.equal(cache?.version, "1");
      assert.equal(cache?.default_model, "text-embedding-3-small");
      assert.deepEqual(cache?.entries, {});
    } finally {
      project.dispose();
    }
  });
});
