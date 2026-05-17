import { spawn, ChildProcessWithoutNullStreams } from "node:child_process";
import { resolve } from "node:path";

interface PendingCall {
  resolve: (value: ToolResponse) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

export interface ToolResponse<T = unknown> {
  ok: boolean;
  data?: T;
  errors?: string[];
  warnings?: string[];
}

export interface McpClientOptions {
  /** Absolute path to the built server entrypoint. Defaults to ../../dist/index.js relative to this file. */
  serverPath?: string;
  /** Per-call timeout in ms. Defaults to 8000. */
  timeoutMs?: number;
  /** Forward server stderr to parent (debugging). Defaults to false. */
  verboseStderr?: boolean;
  /** Environment for the spawned server. Merged with process.env. */
  env?: Record<string, string>;
}

const DEFAULT_SERVER_PATH = resolve(
  new URL(".", import.meta.url).pathname,
  "..",
  "..",
  "..",
  "dist",
  "index.js"
);

export class McpClient {
  private proc: ChildProcessWithoutNullStreams;
  private nextId = 1;
  private pending = new Map<number, PendingCall>();
  private buf = "";
  private readonly timeoutMs: number;
  private closed = false;

  constructor(opts: McpClientOptions = {}) {
    this.timeoutMs = opts.timeoutMs ?? 8000;
    const serverPath = opts.serverPath ?? DEFAULT_SERVER_PATH;
    this.proc = spawn("node", [serverPath], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, ...(opts.env ?? {}) },
    });
    this.proc.stdout.on("data", (d) => this.onStdout(d.toString()));
    this.proc.stderr.on("data", (d) => {
      if (opts.verboseStderr) process.stderr.write(d);
    });
    this.proc.on("exit", () => {
      this.closed = true;
      for (const [, p] of this.pending) {
        clearTimeout(p.timeout);
        p.reject(new Error("MCP server exited before responding"));
      }
      this.pending.clear();
    });
  }

  private onStdout(chunk: string): void {
    this.buf += chunk;
    let idx: number;
    while ((idx = this.buf.indexOf("\n")) >= 0) {
      const line = this.buf.slice(0, idx).trim();
      this.buf = this.buf.slice(idx + 1);
      if (!line) continue;
      let msg: { id?: number; result?: { content?: { text: string }[]; isError?: boolean }; error?: { message: string } };
      try {
        msg = JSON.parse(line);
      } catch {
        continue;
      }
      if (typeof msg.id !== "number") continue;
      const pending = this.pending.get(msg.id);
      if (!pending) continue;
      this.pending.delete(msg.id);
      clearTimeout(pending.timeout);
      if (msg.error) {
        pending.reject(new Error(`JSON-RPC error: ${msg.error.message}`));
        continue;
      }
      const text = msg.result?.content?.[0]?.text;
      if (text === undefined) {
        pending.reject(new Error("Tool response had no content text"));
        continue;
      }
      try {
        pending.resolve(JSON.parse(text) as ToolResponse);
      } catch {
        pending.resolve({ ok: false, errors: ["non-JSON response"], data: text } as ToolResponse);
      }
    }
  }

  private send(method: string, params: Record<string, unknown>): number {
    if (this.closed) throw new Error("MCP client is closed");
    const id = this.nextId++;
    this.proc.stdin.write(
      JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n"
    );
    return id;
  }

  async initialize(): Promise<void> {
    return new Promise((resolveFn, rejectFn) => {
      const id = this.send("initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "dr-test-harness", version: "0" },
      });
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        rejectFn(new Error("initialize timed out"));
      }, this.timeoutMs);
      this.pending.set(id, {
        resolve: () => resolveFn(),
        reject: rejectFn,
        timeout,
      });
    });
  }

  async call<T = unknown>(
    tool: string,
    args: Record<string, unknown> = {}
  ): Promise<ToolResponse<T>> {
    return new Promise<ToolResponse<T>>((resolveFn, rejectFn) => {
      const id = this.send("tools/call", { name: tool, arguments: args });
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        rejectFn(new Error(`tool '${tool}' timed out after ${this.timeoutMs}ms`));
      }, this.timeoutMs);
      this.pending.set(id, {
        resolve: (v) => resolveFn(v as ToolResponse<T>),
        reject: rejectFn,
        timeout,
      });
    });
  }

  /** Same as call(), but throws when ok=false (test ergonomics). */
  async callOk<T = unknown>(
    tool: string,
    args: Record<string, unknown> = {}
  ): Promise<T> {
    const res = await this.call<T>(tool, args);
    if (!res.ok) {
      throw new Error(
        `Expected ok call for ${tool}, got errors: ${(res.errors ?? []).join("; ")}`
      );
    }
    return res.data as T;
  }

  /** Same as call(), but throws when ok=true (used to assert gate failures). */
  async callFail(
    tool: string,
    args: Record<string, unknown> = {}
  ): Promise<string[]> {
    const res = await this.call(tool, args);
    if (res.ok) {
      throw new Error(
        `Expected ${tool} to fail, but it succeeded with: ${JSON.stringify(res.data).slice(0, 200)}`
      );
    }
    return res.errors ?? [];
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.proc.kill("SIGTERM");
    await new Promise<void>((r) => this.proc.on("exit", () => r()));
  }
}

export async function withMcp<T>(
  fn: (mcp: McpClient) => Promise<T>,
  opts?: McpClientOptions
): Promise<T> {
  const mcp = new McpClient(opts);
  try {
    await mcp.initialize();
    return await fn(mcp);
  } finally {
    await mcp.close();
  }
}
