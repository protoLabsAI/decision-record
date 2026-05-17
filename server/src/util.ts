export function nowIso(): string {
  return new Date().toISOString();
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function pad4(n: number): string {
  return n.toString().padStart(4, "0");
}

export function decisionId(seq: number, slug: string): string {
  return `${pad4(seq)}-${slug}`;
}

export function taskId(seq: number, slug: string): string {
  return `T${pad4(seq)}-${slug}`;
}

export function outcomeId(seq: number, slug: string): string {
  return `O${pad4(seq)}-${slug}`;
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + "…";
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
