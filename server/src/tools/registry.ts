import { z } from "zod";

export interface ToolDefinition<TInput extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string;
  description: string;
  inputSchema: TInput;
  handler: (input: z.infer<TInput>) => Promise<ToolResult> | ToolResult;
}

export interface ToolResult {
  ok: boolean;
  data?: unknown;
  errors?: string[];
  warnings?: string[];
}

const tools = new Map<string, ToolDefinition>();

export function registerTool<T extends z.ZodTypeAny>(def: ToolDefinition<T>): void {
  if (tools.has(def.name)) {
    throw new Error(`Tool already registered: ${def.name}`);
  }
  tools.set(def.name, def as unknown as ToolDefinition);
}

export function listTools(): ToolDefinition[] {
  return Array.from(tools.values());
}

export function getTool(name: string): ToolDefinition | undefined {
  return tools.get(name);
}

export function toToolResult(result: ToolResult): {
  content: { type: "text"; text: string }[];
  isError?: boolean;
} {
  return {
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    isError: !result.ok ? true : undefined,
  };
}

export function ok(data?: unknown, warnings?: string[]): ToolResult {
  const result: ToolResult = { ok: true };
  if (data !== undefined) result.data = data;
  if (warnings && warnings.length > 0) result.warnings = warnings;
  return result;
}

export function fail(...errors: string[]): ToolResult {
  return { ok: false, errors };
}
