type Level = "debug" | "info" | "warn" | "error";

const LEVELS: Level[] = ["debug", "info", "warn", "error"];

function currentLevel(): Level {
  const env = process.env.DR_LOG_LEVEL?.toLowerCase() as Level | undefined;
  if (env && LEVELS.includes(env)) return env;
  return "info";
}

function shouldEmit(level: Level): boolean {
  return LEVELS.indexOf(level) >= LEVELS.indexOf(currentLevel());
}

function emit(level: Level, message: string, extra?: Record<string, unknown>): void {
  if (!shouldEmit(level)) return;
  // MCP stdio uses stdout for protocol; logs must go to stderr.
  const line = extra
    ? `[dr:${level}] ${message} ${JSON.stringify(extra)}`
    : `[dr:${level}] ${message}`;
  process.stderr.write(line + "\n");
}

export const log = {
  debug: (msg: string, extra?: Record<string, unknown>) => emit("debug", msg, extra),
  info: (msg: string, extra?: Record<string, unknown>) => emit("info", msg, extra),
  warn: (msg: string, extra?: Record<string, unknown>) => emit("warn", msg, extra),
  error: (msg: string, extra?: Record<string, unknown>) => emit("error", msg, extra),
};
