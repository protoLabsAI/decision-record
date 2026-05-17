import { getTool, listTools } from "../tools/registry.js";
import { zodToJsonSchema } from "../jsonSchema.js";
import { z } from "zod";
import OpenAI from "openai";

export interface ToolFilter {
  /** If set, only tools whose name is in this list are exposed. */
  include?: string[];
  /** If set, tools whose name is in this list are hidden. */
  exclude?: string[];
}

export function listOpenAITools(filter: ToolFilter = {}): OpenAI.Chat.ChatCompletionTool[] {
  return listTools()
    .filter((t) => (filter.include ? filter.include.includes(t.name) : true))
    .filter((t) => (filter.exclude ? !filter.exclude.includes(t.name) : true))
    .map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: zodToJsonSchema(t.inputSchema) as Record<string, unknown>,
      },
    }));
}

export interface ToolInvocationContext {
  /** Target project cwd. Injected into every tool call that accepts `cwd`. */
  cwd: string;
}

export interface ToolCallResult {
  ok: boolean;
  data?: unknown;
  errors?: string[];
  warnings?: string[];
}

/**
 * Execute a tool by name with the agent's chosen input. Injects `cwd` from the
 * orchestrator's context if the tool accepts it and the agent didn't supply one.
 * Validation errors are returned as ok:false so the agent can recover.
 */
export async function executeAgentTool(
  name: string,
  rawArgs: string | Record<string, unknown>,
  ctx: ToolInvocationContext
): Promise<ToolCallResult> {
  const tool = getTool(name);
  if (!tool) {
    return { ok: false, errors: [`Unknown tool: ${name}`] };
  }
  let args: Record<string, unknown>;
  try {
    args = typeof rawArgs === "string" ? JSON.parse(rawArgs) : rawArgs;
  } catch (err) {
    return {
      ok: false,
      errors: [
        `Failed to parse tool arguments as JSON: ${err instanceof Error ? err.message : String(err)}`,
      ],
    };
  }

  // Inject cwd automatically when the tool has a `cwd` field in its schema
  // and the agent didn't pass one.
  if (toolAcceptsCwd(tool.inputSchema) && !("cwd" in args)) {
    args.cwd = ctx.cwd;
  }

  try {
    const validated = tool.inputSchema.parse(args);
    const result = await tool.handler(validated);
    return result as ToolCallResult;
  } catch (err) {
    if (err instanceof z.ZodError) {
      return {
        ok: false,
        errors: err.errors.map((e) => `${e.path.join(".") || "(root)"}: ${e.message}`),
      };
    }
    return {
      ok: false,
      errors: [err instanceof Error ? err.message : String(err)],
    };
  }
}

function toolAcceptsCwd(schema: z.ZodTypeAny): boolean {
  const def = (schema as unknown as { _def: { typeName: string; shape?: () => Record<string, unknown> } })._def;
  if (def.typeName !== "ZodObject") return false;
  const obj = schema as z.ZodObject<z.ZodRawShape>;
  return "cwd" in obj.shape;
}
