import { describe, it, before, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { makeTmpProject } from "./helpers/tmp-project.js";
import { registerAllTools } from "../src/tools/index.js";
import { getTool } from "../src/tools/registry.js";
import { Store } from "../src/storage/store.js";
import {
  Decision,
  DecisionSchema,
  PipelineState,
  Project,
} from "../src/schemas/index.js";
import { resolveEffectiveGateConfig } from "../src/gate.js";
import { indexDecision } from "../src/embeddings/index.js";
import {
  resetDefaultEmbedClient,
  setEmbedClientForTesting,
} from "../src/embeddings/client.js";
import { makeMockOpenAI } from "./helpers/mock-openai.js";

const NOW = "2026-05-17T00:00:00.000Z";

async function call(name: string, args: Record<string, unknown>) {
  const tool = getTool(name);
  if (!tool) throw new Error(`tool not registered: ${name}`);
  const parsed = tool.inputSchema.parse(args);
  return tool.handler(parsed);
}

function makeDecision(seq: number, slug: string, overrides: Partial<Decision> = {}): Decision {
  const id = `${String(seq).padStart(4, "0")}-${slug}`;
  return DecisionSchema.parse({
    id,
    number: seq,
    slug,
    title: overrides.title ?? slug,
    status: "accepted",
    template_variant: "canonical",
    created_at: NOW,
    updated_at: NOW,
    summary: overrides.summary,
    issue: overrides.issue,
    argument: "stub",
    selected_position: "A",
    positions: [{ title: "A", pros: [], cons: [], links: [] }],
    assumptions: [],
    constraints: [],
    opinions: [],
    implications: [],
    depends_on: [],
    related_decisions: [],
    related_artifacts: [],
    review: [],
    tags: overrides.tags ?? [],
    sign_off: { by: "human", at: NOW },
  });
}

async function seedProject(cwd: string): Promise<void> {
  const store = new Store(cwd);
  await store.ensureLayout();
  const proj: Project = {
    id: "p1",
    title: "Search project",
    description: "",
    created_at: NOW,
    updated_at: NOW,
    effort_level: "poc",
    status: "handed-off",
    sign_offs: [],
    gate_config: { preset: "poc" },
    tags: [],
  };
  const state: PipelineState = {
    schema_version: "0.1.0",
    project_id: "p1",
    phase: "handed-off",
    effective_gate_config: resolveEffectiveGateConfig({ preset: "poc" }),
    next_decision_seq: 100,
    next_task_seq: 1,
    next_outcome_seq: 1,
    pending_questions: [],
    gate_failures: [],
    last_event_at: NOW,
  };
  await store.writeProject(proj);
  await store.writeState(state);
}

describe("Flow: dr_search_decisions", () => {
  const originalEnv = { ...process.env };
  before(() => {
    if (!getTool("dr_search_decisions")) {
      registerAllTools();
    }
  });
  beforeEach(() => {
    delete process.env.OPENAI_EMBEDDING_MODEL;
    delete process.env.OPENAI_API_KEY;
    resetDefaultEmbedClient();
  });
  afterEach(() => {
    process.env = { ...originalEnv };
    resetDefaultEmbedClient();
  });

  it("falls back to substring search when no embeddings cache exists", async () => {
    const project = makeTmpProject("dr-search-substr-");
    try {
      process.env.OPENAI_EMBEDDING_MODEL = "none";
      await seedProject(project.cwd);
      const store = new Store(project.cwd);
      await store.writeDecision(
        makeDecision(1, "use-postgres-for-primary-store", {
          title: "Use Postgres for primary store",
          summary: "Postgres handles our load with room to spare.",
        })
      );
      await store.writeDecision(
        makeDecision(2, "ship-via-vercel", {
          title: "Ship via Vercel",
          summary: "Vercel for the static frontend.",
        })
      );

      const res = await call("dr_search_decisions", {
        cwd: project.cwd,
        query: "postgres",
      });
      assert.equal(res.ok, true);
      const data = res.data as {
        mode: string;
        results: { id: string }[];
        warnings: string[];
      };
      assert.equal(data.mode, "substring");
      assert.equal(data.results.length, 1);
      assert.match(data.results[0]!.id, /postgres/);
      assert.ok(data.warnings.length > 0);
    } finally {
      project.dispose();
    }
  });

  it("ranks semantically when a populated cache exists", async () => {
    const project = makeTmpProject("dr-search-semantic-");
    try {
      process.env.OPENAI_EMBEDDING_MODEL = "fake-model";
      process.env.OPENAI_API_KEY = "fake-key";
      await seedProject(project.cwd);
      const store = new Store(project.cwd);

      const dDb = makeDecision(1, "pick-postgres", {
        title: "Pick Postgres",
        summary: "Choose Postgres as the data store",
        tags: ["data"],
      });
      const dHost = makeDecision(2, "host-on-vercel", {
        title: "Host on Vercel",
        summary: "Static hosting via Vercel",
        tags: ["hosting"],
      });
      const dAuth = makeDecision(3, "auth-via-clerk", {
        title: "Auth via Clerk",
        summary: "Drop-in auth provider",
        tags: ["auth"],
      });
      await store.writeDecision(dDb);
      await store.writeDecision(dHost);
      await store.writeDecision(dAuth);

      // Deterministic embeddings: queries containing certain keywords lean
      // toward the matching decision's vector.
      const pickVector = (input: string): number[] => {
        const lower = input.toLowerCase();
        if (lower.includes("postgres") || lower.includes("data store"))
          return [1, 0, 0];
        if (lower.includes("vercel") || lower.includes("hosting"))
          return [0, 1, 0];
        if (lower.includes("clerk") || lower.includes("auth"))
          return [0, 0, 1];
        return [0.33, 0.33, 0.33];
      };
      const mock = makeMockOpenAI([], { embeddingsFor: pickVector });
      setEmbedClientForTesting(mock);

      // Populate the cache through the public path.
      await indexDecision(store, dDb, {
        config: { enabled: true, model: "fake-model" },
        client: mock,
      });
      await indexDecision(store, dHost, {
        config: { enabled: true, model: "fake-model" },
        client: mock,
      });
      await indexDecision(store, dAuth, {
        config: { enabled: true, model: "fake-model" },
        client: mock,
      });

      const res = await call("dr_search_decisions", {
        cwd: project.cwd,
        query: "Which database should I pick? Postgres maybe?",
      });
      assert.equal(res.ok, true);
      const data = res.data as {
        mode: string;
        model?: string;
        results: { id: string; score: number | null }[];
      };
      assert.equal(data.mode, "semantic");
      assert.equal(data.model, "fake-model");
      assert.ok(data.results.length >= 1);
      assert.equal(data.results[0]!.id, "0001-pick-postgres");
      assert.ok(data.results[0]!.score! > 0.99);

      // Hosting query lands on the hosting decision instead.
      const hostRes = await call("dr_search_decisions", {
        cwd: project.cwd,
        query: "Where should I deploy? Maybe Vercel.",
      });
      const hostData = hostRes.data as { results: { id: string }[] };
      assert.equal(hostData.results[0]!.id, "0002-host-on-vercel");
    } finally {
      project.dispose();
    }
  });

  it("returns mode='empty' when no decisions match the status filter", async () => {
    const project = makeTmpProject("dr-search-empty-");
    try {
      process.env.OPENAI_EMBEDDING_MODEL = "none";
      await seedProject(project.cwd);
      const res = await call("dr_search_decisions", {
        cwd: project.cwd,
        query: "anything",
      });
      assert.equal(res.ok, true);
      const data = res.data as { mode: string; results: unknown[] };
      assert.equal(data.mode, "empty");
      assert.equal(data.results.length, 0);
    } finally {
      project.dispose();
    }
  });

  it("dr_reindex_embeddings populates the cache for every accepted decision", async () => {
    const project = makeTmpProject("dr-search-reindex-");
    try {
      process.env.OPENAI_EMBEDDING_MODEL = "fake-model";
      process.env.OPENAI_API_KEY = "fake-key";
      await seedProject(project.cwd);
      const store = new Store(project.cwd);

      await store.writeDecision(makeDecision(1, "alpha", { title: "Alpha" }));
      await store.writeDecision(makeDecision(2, "beta", { title: "Beta" }));
      const proposed = makeDecision(3, "gamma", { title: "Gamma" });
      const proposedNotAccepted = DecisionSchema.parse({
        ...proposed,
        status: "proposed",
        sign_off: undefined,
      });
      await store.writeDecision(proposedNotAccepted);

      const mock = makeMockOpenAI([], {
        embeddingsFor: (text) => [text.length, 0, 0],
      });
      setEmbedClientForTesting(mock);

      const res = await call("dr_reindex_embeddings", { cwd: project.cwd });
      assert.equal(res.ok, true);
      const data = res.data as {
        accepted_total: number;
        indexed: number;
        failed: number;
      };
      assert.equal(data.accepted_total, 2);
      assert.equal(data.indexed, 2);
      assert.equal(data.failed, 0);

      const cache = await store.readEmbeddings();
      assert.equal(Object.keys(cache!.entries).length, 2);
      assert.ok(cache!.entries["0001-alpha"]);
      assert.ok(cache!.entries["0002-beta"]);
      assert.ok(!cache!.entries["0003-gamma"]);
    } finally {
      project.dispose();
    }
  });

  it("dr_reindex_embeddings fails cleanly when embeddings are disabled", async () => {
    const project = makeTmpProject("dr-search-reindex-disabled-");
    try {
      process.env.OPENAI_EMBEDDING_MODEL = "none";
      await seedProject(project.cwd);
      const res = await call("dr_reindex_embeddings", { cwd: project.cwd });
      assert.equal(res.ok, false);
      assert.match(res.errors?.[0] ?? "", /disabled/);
    } finally {
      project.dispose();
    }
  });

  it("emits embeddings_indexed events when dr_accept_decision integrates", async () => {
    const project = makeTmpProject("dr-search-hook-");
    try {
      process.env.OPENAI_EMBEDDING_MODEL = "fake-model";
      process.env.OPENAI_API_KEY = "fake-key";
      const store = new Store(project.cwd);

      // dr_init via tool
      const initRes = await call("dr_init", {
        cwd: project.cwd,
        title: "Hook test",
        effort_level: "poc",
      });
      assert.equal(initRes.ok, true);

      const mock = makeMockOpenAI([], {
        embeddingsFor: () => [0.5, 0.5],
      });
      setEmbedClientForTesting(mock);

      const propRes = await call("dr_propose_decision", {
        cwd: project.cwd,
        title: "Use TypeScript",
        positions: [{ title: "TypeScript", pros: [], cons: [], links: [] }],
      });
      assert.equal(propRes.ok, true);

      // Set selected position + argument so accept passes
      await call("dr_update_decision", {
        cwd: project.cwd,
        id: "0001-use-typescript",
        selected_position: "TypeScript",
        argument: "Team has deep TS experience.",
      });

      const acceptRes = await call("dr_accept_decision", {
        cwd: project.cwd,
        id: "0001-use-typescript",
        sign_off_by: "human",
      });
      assert.equal(acceptRes.ok, true);

      const events = project.events();
      const kinds = events.map((e) => e.kind);
      assert.ok(kinds.includes("decision_accepted"));
      assert.ok(kinds.includes("embeddings_indexed"));

      const cache = await store.readEmbeddings();
      assert.ok(cache?.entries["0001-use-typescript"]);
    } finally {
      project.dispose();
    }
  });
});
