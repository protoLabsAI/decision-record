import { createInterface } from "node:readline/promises";

const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const BLUE = "\x1b[34m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

export interface CheckpointOptions {
  /** Skip interactive prompt and auto-confirm (for --yes / fully autonomous mode). */
  autoYes: boolean;
}

export async function confirm(
  prompt: string,
  options: CheckpointOptions,
  defaultYes = true
): Promise<boolean> {
  if (options.autoYes) {
    process.stderr.write(`${BLUE}>${RESET} ${prompt} ${DIM}[auto-yes]${RESET}\n`);
    return true;
  }
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    const hint = defaultYes ? "[Y/n]" : "[y/N]";
    const answer = (await rl.question(`${BLUE}>${RESET} ${prompt} ${hint} `))
      .trim()
      .toLowerCase();
    if (answer === "") return defaultYes;
    return answer === "y" || answer === "yes";
  } finally {
    rl.close();
  }
}

export async function ask(
  prompt: string,
  options: CheckpointOptions,
  fallback = ""
): Promise<string> {
  if (options.autoYes) {
    process.stderr.write(`${BLUE}>${RESET} ${prompt} ${DIM}[auto: '${fallback}']${RESET}\n`);
    return fallback;
  }
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    const answer = await rl.question(`${BLUE}>${RESET} ${prompt} `);
    return answer.trim() || fallback;
  } finally {
    rl.close();
  }
}

export function header(text: string): void {
  process.stderr.write(`\n${BOLD}${BLUE}━━━ ${text} ━━━${RESET}\n`);
}

export function info(text: string): void {
  process.stderr.write(`${DIM}${text}${RESET}\n`);
}

export function success(text: string): void {
  process.stderr.write(`${GREEN}✓${RESET} ${text}\n`);
}

export function warn(text: string): void {
  process.stderr.write(`${YELLOW}!${RESET} ${text}\n`);
}

export function error(text: string): void {
  process.stderr.write(`${RED}✗${RESET} ${text}\n`);
}

export function bullet(text: string): void {
  process.stderr.write(`  ${DIM}•${RESET} ${text}\n`);
}

export function divider(): void {
  process.stderr.write(`${DIM}${"─".repeat(60)}${RESET}\n`);
}
