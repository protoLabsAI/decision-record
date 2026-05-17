import { readFile, readdir, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";
import { TemplateVariantSchema } from "../schemas/index.js";

export const SeedEntrySchema = z.object({
  name: z.string(),
  title: z.string(),
  template_variant: TemplateVariantSchema,
  description: z.string(),
  tags: z.array(z.string()).default([]),
  keywords: z.array(z.string()).default([]),
  starter: z.object({
    summary: z.string().optional(),
    issue: z.string().optional(),
    assumptions: z.array(z.string()).default([]),
    constraints: z.array(z.string()).default([]),
    positions: z
      .array(
        z.object({
          title: z.string(),
          description: z.string().optional(),
          pros: z.array(z.string()).default([]),
          cons: z.array(z.string()).default([]),
        })
      )
      .default([]),
    implications: z.array(z.string()).default([]),
  }),
  notes_for_agent: z.string().optional(),
});
export type SeedEntry = z.infer<typeof SeedEntrySchema>;

function defaultSeedDir(): string {
  const env = process.env.DR_SEED_DIR;
  if (env) return resolve(env);
  const here = dirname(fileURLToPath(import.meta.url));
  // From dist/ or src/, walk up to the package root and find seed/.
  const candidates = [
    join(here, "..", "..", "seed"),
    join(here, "..", "seed"),
    join(here, "seed"),
  ];
  return candidates[0]!;
}

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function resolveSeedDir(): Promise<string> {
  const env = process.env.DR_SEED_DIR;
  if (env) return resolve(env);
  const here = dirname(fileURLToPath(import.meta.url));
  for (const candidate of [
    join(here, "..", "..", "seed"),
    join(here, "..", "seed"),
    join(here, "seed"),
  ]) {
    if (await exists(candidate)) return candidate;
  }
  // Fall back to default; caller will see ENOENT if missing.
  return defaultSeedDir();
}

export async function listSeeds(): Promise<SeedEntry[]> {
  const dir = await resolveSeedDir();
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }
  const out: SeedEntry[] = [];
  for (const entry of entries) {
    if (!entry.endsWith(".json") || entry === "index.json") continue;
    const raw = await readFile(join(dir, entry), "utf8");
    try {
      out.push(SeedEntrySchema.parse(JSON.parse(raw)));
    } catch {
      // Skip malformed seed silently; the agent will not see broken seeds.
    }
  }
  return out;
}

export async function getSeed(name: string): Promise<SeedEntry | null> {
  const dir = await resolveSeedDir();
  try {
    const raw = await readFile(join(dir, `${name}.json`), "utf8");
    return SeedEntrySchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function scoreSeed(seed: SeedEntry, query: string): number {
  if (!query) return 0;
  const q = query.toLowerCase();
  const terms = q.split(/\s+/).filter((t) => t.length > 0);
  if (terms.length === 0) return 0;
  let score = 0;
  for (const term of terms) {
    if (seed.name.toLowerCase().includes(term)) score += 4;
    if (seed.title.toLowerCase().includes(term)) score += 3;
    if (seed.description.toLowerCase().includes(term)) score += 1;
    for (const kw of seed.keywords) {
      if (kw.toLowerCase().includes(term)) score += 2;
    }
    for (const tag of seed.tags) {
      if (tag.toLowerCase().includes(term)) score += 2;
    }
  }
  return score;
}
