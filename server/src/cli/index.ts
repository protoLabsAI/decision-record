import { resolve } from "node:path";
import { makeClient, resolveConfig } from "../llm/client.js";
import { registerAllTools } from "../tools/index.js";
import { runPipeline } from "./orchestrator.js";
import { readPRD, PRDDigest } from "./prd.js";
import { error, header, info } from "./checkpoints.js";

interface ParsedArgs {
  idea?: string;
  title?: string;
  description?: string;
  prdPath?: string;
  cwd: string;
  effortLevel: "poc" | "mvp" | "full";
  model?: string;
  apiKey?: string;
  baseURL?: string;
  resume: boolean;
  autoYes: boolean;
  verbose: boolean;
  help: boolean;
  version: boolean;
}

const VERSION = "0.1.0";

const HELP = `decision-record — idea-to-MVP planning CLI

Usage:
  decision-record [options]                 Start a new project (interactive)
  decision-record --idea "..."              Start with a free-form idea
  decision-record --prd <file>              Start from a PRD markdown file
  decision-record --resume                  Resume the project in --cwd (or process.cwd())

Options:
  --idea TEXT             Free-form one-line idea (will derive title + description).
  --title TEXT            Explicit project title.
  --description TEXT      Explicit project description.
  --prd PATH              Read a Markdown PRD as scope context. Combinable with --idea.
  --cwd PATH              Target project directory (default: cwd). State lands under .dr/ and dr/.
  --effort poc|mvp|full   Gate strictness preset (default: mvp).
  --model NAME            LLM model name (default: $OPENAI_MODEL or gpt-4o).
  --api-key KEY           OpenAI-compat API key (default: $OPENAI_API_KEY).
  --base-url URL          OpenAI-compat base URL (default: $OPENAI_BASE_URL or api.openai.com).
  --resume                Skip intake; pick up the existing project in --cwd.
  --yes, -y               Bypass interactive checkpoints (fully autonomous).
  --verbose, -v           Stream agent reasoning and tool calls to stderr.
  --help, -h              Show this help.
  --version               Print version.

Environment:
  OPENAI_API_KEY          Required unless --api-key is passed.
  OPENAI_BASE_URL         Optional. Set for OpenRouter, vLLM, Ollama, LiteLLM, etc.
  OPENAI_MODEL            Optional. Default model name.
  OPENAI_EMBEDDING_MODEL  Optional. Default text-embedding-3-small. Set to "none" to disable
                          semantic search (falls back to substring match).
  LINEAR_API_KEY          Optional. Enables Linear handoff target.
  LINEAR_TEAM_ID          Optional. Pre-fills the Linear team ID prompt.

Examples:
  decision-record --idea "a CLI for QuickBooks CSV → ledger normalization" --effort poc
  decision-record --prd ./docs/idea.md --effort mvp --yes
  decision-record --cwd ./my-project --resume
`;

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = {
    cwd: process.cwd(),
    effortLevel: "mvp",
    resume: false,
    autoYes: false,
    verbose: false,
    help: false,
    version: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`Missing value for ${a}`);
      return v;
    };
    switch (a) {
      case "--idea":
        out.idea = next();
        break;
      case "--title":
        out.title = next();
        break;
      case "--description":
        out.description = next();
        break;
      case "--prd":
        out.prdPath = next();
        break;
      case "--cwd":
        out.cwd = resolve(next());
        break;
      case "--effort": {
        const v = next();
        if (v !== "poc" && v !== "mvp" && v !== "full") {
          throw new Error(`--effort must be poc | mvp | full (got ${v})`);
        }
        out.effortLevel = v;
        break;
      }
      case "--model":
        out.model = next();
        break;
      case "--api-key":
        out.apiKey = next();
        break;
      case "--base-url":
        out.baseURL = next();
        break;
      case "--resume":
        out.resume = true;
        break;
      case "--yes":
      case "-y":
        out.autoYes = true;
        break;
      case "--verbose":
      case "-v":
        out.verbose = true;
        break;
      case "--help":
      case "-h":
        out.help = true;
        break;
      case "--version":
        out.version = true;
        break;
      default:
        // First positional is treated as --idea when --idea isn't set.
        if (a && !a.startsWith("--") && !out.idea && !out.title) {
          out.idea = a;
        } else if (a) {
          throw new Error(`Unknown argument: ${a}`);
        }
    }
  }
  return out;
}

async function main(): Promise<number> {
  let args: ParsedArgs;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    error(err instanceof Error ? err.message : String(err));
    process.stderr.write(HELP);
    return 2;
  }
  if (args.help) {
    process.stdout.write(HELP);
    return 0;
  }
  if (args.version) {
    process.stdout.write(`decision-record ${VERSION}\n`);
    return 0;
  }

  registerAllTools();

  let prd: PRDDigest | null = null;
  if (args.prdPath) {
    try {
      prd = await readPRD(args.prdPath);
      info(`Loaded PRD: ${args.prdPath} (${prd.raw.length} chars).`);
    } catch (err) {
      error(`Could not read PRD at ${args.prdPath}: ${err instanceof Error ? err.message : String(err)}`);
      return 1;
    }
  }

  let title = args.title;
  let description = args.description;
  if (!args.resume) {
    if (!title && prd?.title_hint) title = prd.title_hint;
    if (!title && args.idea) {
      title = args.idea.length > 80 ? args.idea.slice(0, 77) + "…" : args.idea;
    }
    if (!description) {
      if (args.idea) description = args.idea;
      else if (prd?.description_hint) description = prd.description_hint;
    }
  }

  let config;
  let client;
  try {
    config = resolveConfig({
      ...(args.model !== undefined && { model: args.model }),
      ...(args.apiKey !== undefined && { apiKey: args.apiKey }),
      ...(args.baseURL !== undefined && { baseURL: args.baseURL }),
    });
    client = makeClient(config);
  } catch (err) {
    error(err instanceof Error ? err.message : String(err));
    return 2;
  }

  header(`decision-record v${VERSION}`);
  info(`Target: ${args.cwd}`);
  info(`Model: ${config.model}${config.baseURL ? ` @ ${config.baseURL}` : ""}`);
  if (args.autoYes) info("Mode: autonomous (--yes; checkpoints bypassed)");

  const outcome = await runPipeline(
    {
      cwd: args.cwd,
      client,
      config,
      autoYes: args.autoYes,
      verbose: args.verbose,
    },
    {
      ...(title !== undefined && { title }),
      ...(description !== undefined && { description }),
      effortLevel: args.effortLevel,
      prd,
      resume: args.resume,
    }
  );

  return outcome.exitCode;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
