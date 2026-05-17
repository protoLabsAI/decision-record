import { readFile } from "node:fs/promises";

export interface PRDDigest {
  /** Raw PRD content. */
  raw: string;
  /** First H1 if present — used as a title hint. */
  title_hint?: string;
  /** First paragraph after title — used as a description hint. */
  description_hint?: string;
}

export async function readPRD(path: string): Promise<PRDDigest> {
  const raw = await readFile(path, "utf8");
  return digest(raw);
}

export function digest(raw: string): PRDDigest {
  const lines = raw.split("\n");
  let title_hint: string | undefined;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("# ") && !trimmed.startsWith("##")) {
      title_hint = trimmed.replace(/^#+\s*/, "").trim();
      break;
    }
  }
  // Take first non-heading, non-empty paragraph as description hint
  let description_hint: string | undefined;
  const blocks = raw.split(/\n\s*\n/).map((b) => b.trim()).filter((b) => b.length > 0);
  for (const block of blocks) {
    if (block.startsWith("#")) continue;
    description_hint = block.length > 800 ? block.slice(0, 800) + "…" : block;
    break;
  }
  return { raw, ...(title_hint && { title_hint }), ...(description_hint && { description_hint }) };
}
