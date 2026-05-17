import {
  mkdir,
  readFile,
  readdir,
  writeFile,
  access,
  appendFile,
} from "node:fs/promises";
import { existsSync } from "node:fs";
import {
  Decision,
  DecisionSchema,
  EmbeddingCache,
  EmbeddingCacheSchema,
  Event,
  EventSchema,
  Outcome,
  OutcomeSchema,
  PipelineState,
  PipelineStateSchema,
  Project,
  ProjectSchema,
  Task,
  TaskSchema,
} from "../schemas/index.js";
import {
  decisionFile,
  decisionMarkdown,
  outcomeFile,
  outcomeMarkdown,
  pathsFor,
  ProjectPaths,
  taskFile,
  taskMarkdown,
} from "./paths.js";

export class Store {
  readonly paths: ProjectPaths;

  constructor(cwd: string) {
    this.paths = pathsFor(cwd);
  }

  async ensureLayout(): Promise<void> {
    await mkdir(this.paths.internal, { recursive: true });
    await mkdir(this.paths.cache, { recursive: true });
    await mkdir(this.paths.tracked, { recursive: true });
    await mkdir(this.paths.decisions, { recursive: true });
    await mkdir(this.paths.tasks, { recursive: true });
    await mkdir(this.paths.outcomes, { recursive: true });
    if (!existsSync(this.paths.gitignore)) {
      await writeFile(this.paths.gitignore, "*\n!.gitignore\n", "utf8");
    }
  }

  async hasProject(): Promise<boolean> {
    try {
      await access(this.paths.project);
      return true;
    } catch {
      return false;
    }
  }

  async readProject(): Promise<Project> {
    const raw = await readFile(this.paths.project, "utf8");
    return ProjectSchema.parse(JSON.parse(raw));
  }

  async writeProject(project: Project): Promise<void> {
    const validated = ProjectSchema.parse(project);
    await writeFile(
      this.paths.project,
      JSON.stringify(validated, null, 2) + "\n",
      "utf8"
    );
  }

  async readState(): Promise<PipelineState> {
    const raw = await readFile(this.paths.state, "utf8");
    return PipelineStateSchema.parse(JSON.parse(raw));
  }

  async writeState(state: PipelineState): Promise<void> {
    const validated = PipelineStateSchema.parse(state);
    await writeFile(
      this.paths.state,
      JSON.stringify(validated, null, 2) + "\n",
      "utf8"
    );
  }

  async listDecisions(): Promise<Decision[]> {
    let entries: string[];
    try {
      entries = await readdir(this.paths.decisions);
    } catch {
      return [];
    }
    const out: Decision[] = [];
    for (const entry of entries) {
      if (!entry.endsWith(".json")) continue;
      const raw = await readFile(decisionFile(this.paths, entry.replace(/\.json$/, "")), "utf8");
      out.push(DecisionSchema.parse(JSON.parse(raw)));
    }
    out.sort((a, b) => a.number - b.number);
    return out;
  }

  async readDecision(id: string): Promise<Decision> {
    const raw = await readFile(decisionFile(this.paths, id), "utf8");
    return DecisionSchema.parse(JSON.parse(raw));
  }

  async writeDecision(decision: Decision): Promise<void> {
    const validated = DecisionSchema.parse(decision);
    await writeFile(
      decisionFile(this.paths, validated.id),
      JSON.stringify(validated, null, 2) + "\n",
      "utf8"
    );
  }

  async writeDecisionMarkdown(id: string, body: string): Promise<void> {
    await writeFile(decisionMarkdown(this.paths, id), body, "utf8");
  }

  async listTasks(): Promise<Task[]> {
    let entries: string[];
    try {
      entries = await readdir(this.paths.tasks);
    } catch {
      return [];
    }
    const out: Task[] = [];
    for (const entry of entries) {
      if (!entry.endsWith(".json")) continue;
      const raw = await readFile(taskFile(this.paths, entry.replace(/\.json$/, "")), "utf8");
      out.push(TaskSchema.parse(JSON.parse(raw)));
    }
    out.sort((a, b) => a.number - b.number);
    return out;
  }

  async readTask(id: string): Promise<Task> {
    const raw = await readFile(taskFile(this.paths, id), "utf8");
    return TaskSchema.parse(JSON.parse(raw));
  }

  async writeTask(task: Task): Promise<void> {
    const validated = TaskSchema.parse(task);
    await writeFile(
      taskFile(this.paths, validated.id),
      JSON.stringify(validated, null, 2) + "\n",
      "utf8"
    );
  }

  async writeTaskMarkdown(id: string, body: string): Promise<void> {
    await writeFile(taskMarkdown(this.paths, id), body, "utf8");
  }

  async listOutcomes(): Promise<Outcome[]> {
    let entries: string[];
    try {
      entries = await readdir(this.paths.outcomes);
    } catch {
      return [];
    }
    const out: Outcome[] = [];
    for (const entry of entries) {
      if (!entry.endsWith(".json")) continue;
      const raw = await readFile(outcomeFile(this.paths, entry.replace(/\.json$/, "")), "utf8");
      out.push(OutcomeSchema.parse(JSON.parse(raw)));
    }
    out.sort((a, b) => a.number - b.number);
    return out;
  }

  async readOutcome(id: string): Promise<Outcome> {
    const raw = await readFile(outcomeFile(this.paths, id), "utf8");
    return OutcomeSchema.parse(JSON.parse(raw));
  }

  async writeOutcome(outcome: Outcome): Promise<void> {
    const validated = OutcomeSchema.parse(outcome);
    await writeFile(
      outcomeFile(this.paths, validated.id),
      JSON.stringify(validated, null, 2) + "\n",
      "utf8"
    );
  }

  async writeOutcomeMarkdown(id: string, body: string): Promise<void> {
    await writeFile(outcomeMarkdown(this.paths, id), body, "utf8");
  }

  async readEmbeddings(): Promise<EmbeddingCache | null> {
    try {
      const raw = await readFile(this.paths.embeddings_cache, "utf8");
      return EmbeddingCacheSchema.parse(JSON.parse(raw));
    } catch {
      return null;
    }
  }

  async writeEmbeddings(cache: EmbeddingCache): Promise<void> {
    const validated = EmbeddingCacheSchema.parse(cache);
    await writeFile(
      this.paths.embeddings_cache,
      JSON.stringify(validated, null, 2) + "\n",
      "utf8"
    );
  }

  async writeIndexHtml(body: string): Promise<void> {
    await writeFile(this.paths.index_html, body, "utf8");
  }

  async appendEvent(event: Event): Promise<void> {
    const validated = EventSchema.parse(event);
    await appendFile(this.paths.events, JSON.stringify(validated) + "\n", "utf8");
  }

  async readEvents(): Promise<Event[]> {
    let raw: string;
    try {
      raw = await readFile(this.paths.events, "utf8");
    } catch {
      return [];
    }
    return raw
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => EventSchema.parse(JSON.parse(line)));
  }
}
