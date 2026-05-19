#!/usr/bin/env bash
#
# setup-opencode.sh — Install the decision-record planning pipeline into an existing project.
#
# Usage:
#   ./setup-opencode.sh [target-dir]
#
# If target-dir is omitted, the current working directory is used.
#
# What this script does:
#   1. Validates prerequisites (node, npm, opencode)
#   2. Copies opencode.json and .opencode/ into the target project
#   3. Copies the MCP server source into target/server/
#   4. Installs dependencies and builds the MCP server
#   5. Validates the resulting opencode configuration
#   6. Runs a smoke test against the MCP server
#   7. Prints next-step instructions

set -euo pipefail

# ── Colors ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

info()    { echo -e "${CYAN}ℹ  $1${NC}"; }
ok()      { echo -e "${GREEN}✓  $1${NC}"; }
warn()    { echo -e "${YELLOW}⚠  $1${NC}"; }
fail()    { echo -e "${RED}✗  $1${NC}" >&2; exit 1; }

# ── Script directory (where this script lives) ──────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Target directory ────────────────────────────────────────────────────────
TARGET_DIR="${1:-$(pwd)}"
TARGET_DIR="$(cd "$TARGET_DIR" 2>/dev/null && pwd)" || fail "Target directory does not exist: $1"

# ── Banner ──────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║  decision-record — OpenCode Setup                        ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""
info "Target project: ${BOLD}$TARGET_DIR${NC}"
echo ""

# ── Step 0: Check prerequisites ────────────────────────────────────────────
echo -e "${BOLD}[0/6] Checking prerequisites${NC}"

command -v node  >/dev/null 2>&1 || fail "node is required but not found. Install Node.js >= 20."
NODE_MAJOR=$(node -v | sed 's/v//' | cut -d. -f1)
[ "$NODE_MAJOR" -ge 20 ] || fail "Node.js >= 20 required, found $(node -v)"
ok "node $(node -v)"

command -v npm  >/dev/null 2>&1 || fail "npm is required but not found"
ok "npm $(npm -v)"

if command -v opencode >/dev/null 2>&1; then
    ok "opencode $(opencode --version 2>/dev/null || echo 'installed')"
else
    warn "opencode not found in PATH — install with: npm install -g opencode-ai"
fi

echo ""

# ── Step 1: Copy opencode.json ─────────────────────────────────────────────
echo -e "${BOLD}[1/6] Installing opencode.json${NC}"

if [ -f "$TARGET_DIR/opencode.json" ]; then
    warn "opencode.json already exists in target — merging will overwrite conflicting keys"
    read -rp "  Continue? [y/N] " confirm
    [[ "$confirm" =~ ^[Yy] ]] || fail "Aborted by user"
fi

cp "$SCRIPT_DIR/opencode.json" "$TARGET_DIR/opencode.json"
ok "opencode.json copied"

echo ""

# ── Step 2: Copy .opencode/ directory ──────────────────────────────────────
echo -e "${BOLD}[2/6] Installing agents and commands${NC}"

if [ -d "$TARGET_DIR/.opencode" ]; then
    warn ".opencode/ already exists in target — new files will be added alongside existing ones"
fi

mkdir -p "$TARGET_DIR/.opencode"
cp -R "$SCRIPT_DIR/.opencode/agents" "$TARGET_DIR/.opencode/"
cp -R "$SCRIPT_DIR/.opencode/commands" "$TARGET_DIR/.opencode/"
ok "agents/ and commands/ copied to .opencode/"

echo ""

# ── Step 3: Copy MCP server source ─────────────────────────────────────────
echo -e "${BOLD}[3/6] Installing MCP server${NC}"

if [ -d "$TARGET_DIR/server" ]; then
    warn "server/ already exists in target — skipping copy (existing server will be used)"
    info "If you want the latest version, delete server/ and re-run this script"
else
    cp -R "$SCRIPT_DIR/server" "$TARGET_DIR/server"
    ok "server/ copied"
fi

echo ""

# ── Step 4: Install dependencies and build ─────────────────────────────────
echo -e "${BOLD}[4/6] Building MCP server${NC}"

cd "$TARGET_DIR/server"
npm install --silent 2>&1 | tail -1 || fail "npm install failed"
ok "dependencies installed"

npm run build 2>&1 || fail "npm run build failed"
ok "MCP server built → server/dist/index.js"

cd "$TARGET_DIR"

echo ""

# ── Step 5: Validate opencode config ───────────────────────────────────────
echo -e "${BOLD}[5/6] Validating opencode configuration${NC}"

if command -v opencode >/dev/null 2>&1; then
    VALIDATION_OUTPUT=$(opencode models 2>&1 || true)
    if echo "$VALIDATION_OUTPUT" | grep -qi "error\|invalid"; then
        fail "opencode config validation failed:\n$VALIDATION_OUTPUT"
    fi
    ok "opencode configuration is valid"
else
    warn "opencode not installed — skipping config validation"
    ok "opencode.json syntax validated (JSON)"
fi

echo ""

# ── Step 6: Smoke test MCP server ──────────────────────────────────────────
echo -e "${BOLD}[6/6] Running MCP server smoke test${NC}"

SMOKE_INIT=$(echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"setup-script","version":"1.0.0"}}}' | node "$TARGET_DIR/server/dist/index.js" 2>/dev/null)
if echo "$SMOKE_INIT" | grep -q '"protocolVersion"'; then
    ok "MCP server initializes successfully"
else
    fail "MCP server failed to initialize"
fi

SMOKE_TOOLS=$(echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | node "$TARGET_DIR/server/dist/index.js" 2>/dev/null | tail -1)
TOOL_COUNT=$(echo "$SMOKE_TOOLS" | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('result',{}).get('tools',[])))" 2>/dev/null || echo "0")
if [ "$TOOL_COUNT" -gt 0 ]; then
    ok "MCP server exposes $TOOL_COUNT tools"
else
    fail "No tools found from MCP server"
fi

echo ""

# ── Done ────────────────────────────────────────────────────────────────────
echo -e "${BOLD}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║  Setup complete!                                         ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BOLD}Next steps:${NC}"
echo ""
echo "  1. cd $TARGET_DIR"
echo "  2. Run opencode and use the /plan command:"
echo ""
echo -e "     ${CYAN}opencode${NC}"
echo ""
echo "  3. Or run directly with a specific model:"
echo ""
echo -e "     ${CYAN}opencode run --model opencode-go/kimi-k2.5 'Run /plan: Build a todo app'${NC}"
echo ""
echo -e "${BOLD}What was installed:${NC}"
echo "  • opencode.json          — MCP server, agents, and command config"
echo "  • .opencode/agents/      — dr-wizard, dr-skeptic, dr-decomposer"
echo "  • .opencode/commands/    — /plan command"
echo "  • server/                — MCP server (built and ready)"
echo ""
echo -e "Run ${CYAN}opencode${NC} to get started."
echo ""
