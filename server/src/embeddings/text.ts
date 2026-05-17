import { createHash } from "node:crypto";
import { Decision } from "../schemas/index.js";

export function composeEmbeddingText(decision: Decision): string {
  const parts: string[] = [];
  parts.push(`Title: ${decision.title}`);
  if (decision.summary) parts.push(`Summary: ${decision.summary}`);
  if (decision.issue) parts.push(`Issue: ${decision.issue}`);
  if (decision.argument) parts.push(`Argument: ${decision.argument}`);
  if (decision.selected_position) {
    parts.push(`Selected: ${decision.selected_position}`);
  }
  if (decision.positions.length > 0) {
    const titles = decision.positions.map((p) => p.title).join("; ");
    parts.push(`Positions: ${titles}`);
  }
  if (decision.implications.length > 0) {
    parts.push(`Implications: ${decision.implications.join("; ")}`);
  }
  if (decision.tags.length > 0) {
    parts.push(`Tags: ${decision.tags.join(", ")}`);
  }
  return parts.join("\n");
}

export function sha256Hash(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}
