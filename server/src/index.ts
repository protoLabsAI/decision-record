import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { zodToJsonSchema } from "./jsonSchema.js";
import { registerAllTools } from "./tools/index.js";
import { getTool, listTools, toToolResult } from "./tools/registry.js";
import { log } from "./log.js";

const SERVER_NAME = "decision-record";
const SERVER_VERSION = "0.1.0";

async function main() {
  registerAllTools();

  const server = new Server(
    {
      name: SERVER_NAME,
      version: SERVER_VERSION,
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: listTools().map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: zodToJsonSchema(tool.inputSchema),
      })),
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = getTool(request.params.name);
    if (!tool) {
      return toToolResult({ ok: false, errors: [`Unknown tool: ${request.params.name}`] });
    }
    try {
      const input = tool.inputSchema.parse(request.params.arguments ?? {});
      const result = await tool.handler(input);
      return toToolResult(result);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return toToolResult({
          ok: false,
          errors: err.errors.map((e) => `${e.path.join(".") || "(root)"}: ${e.message}`),
        });
      }
      const message = err instanceof Error ? err.message : String(err);
      log.error(`Tool ${tool.name} threw`, { message });
      return toToolResult({ ok: false, errors: [message] });
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  log.info(`${SERVER_NAME} v${SERVER_VERSION} listening on stdio`);
}

main().catch((err) => {
  log.error("Fatal", { message: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});
