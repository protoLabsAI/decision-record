import { mkdtempSync, rmSync, existsSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface TmpProject {
  cwd: string;
  dispose: () => void;
  exists: (relative: string) => boolean;
  read: (relative: string) => string;
  readJson: <T = unknown>(relative: string) => T;
  list: (relative: string) => string[];
  events: () => Array<Record<string, unknown>>;
}

export function makeTmpProject(prefix = "dr-test-"): TmpProject {
  const cwd = mkdtempSync(join(tmpdir(), prefix));
  return {
    cwd,
    dispose: () => rmSync(cwd, { recursive: true, force: true }),
    exists: (relative) => existsSync(join(cwd, relative)),
    read: (relative) => readFileSync(join(cwd, relative), "utf8"),
    readJson: (relative) => JSON.parse(readFileSync(join(cwd, relative), "utf8")),
    list: (relative) => readdirSync(join(cwd, relative)),
    events: () => {
      if (!existsSync(join(cwd, ".dr/events.jsonl"))) return [];
      return readFileSync(join(cwd, ".dr/events.jsonl"), "utf8")
        .split("\n")
        .filter((l) => l.trim().length > 0)
        .map((l) => JSON.parse(l));
    },
  };
}

export async function withTmpProject<T>(
  fn: (project: TmpProject) => Promise<T>,
  prefix?: string
): Promise<T> {
  const project = makeTmpProject(prefix);
  try {
    return await fn(project);
  } finally {
    project.dispose();
  }
}
