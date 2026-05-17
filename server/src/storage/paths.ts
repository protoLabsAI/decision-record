import { join, resolve } from "node:path";

export interface ProjectPaths {
  cwd: string;
  internal: string;
  state: string;
  events: string;
  cache: string;
  embeddings_cache: string;
  tracked: string;
  project: string;
  decisions: string;
  tasks: string;
  outcomes: string;
  index_html: string;
  gitignore: string;
}

export function pathsFor(cwd: string): ProjectPaths {
  const root = resolve(cwd);
  const internal = join(root, ".dr");
  const tracked = join(root, "dr");
  return {
    cwd: root,
    internal,
    state: join(internal, "state.json"),
    events: join(internal, "events.jsonl"),
    cache: join(internal, "cache"),
    embeddings_cache: join(internal, "cache", "embeddings.json"),
    tracked,
    project: join(tracked, "project.json"),
    decisions: join(tracked, "decisions"),
    tasks: join(tracked, "tasks"),
    outcomes: join(tracked, "outcomes"),
    index_html: join(tracked, "index.html"),
    gitignore: join(internal, ".gitignore"),
  };
}

export function decisionFile(paths: ProjectPaths, id: string): string {
  return join(paths.decisions, `${id}.json`);
}

export function decisionMarkdown(paths: ProjectPaths, id: string): string {
  return join(paths.decisions, `${id}.md`);
}

export function taskFile(paths: ProjectPaths, id: string): string {
  return join(paths.tasks, `${id}.json`);
}

export function taskMarkdown(paths: ProjectPaths, id: string): string {
  return join(paths.tasks, `${id}.md`);
}

export function outcomeFile(paths: ProjectPaths, id: string): string {
  return join(paths.outcomes, `${id}.json`);
}

export function outcomeMarkdown(paths: ProjectPaths, id: string): string {
  return join(paths.outcomes, `${id}.md`);
}
