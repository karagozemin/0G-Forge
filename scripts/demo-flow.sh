#!/usr/bin/env bash
set -euo pipefail

# Minimal, reproducible demo flow.
# Usage examples:
#   ./scripts/demo-flow.sh --mode mock
#   ./scripts/demo-flow.sh --mode real --token "$OG_REAL_TOKEN" --endpoint "https://compute-network-4.integratenetwork.work/v1/proxy"

MODE="mock"
TOKEN="${OG_REAL_TOKEN:-}"
ENDPOINT="https://compute-network-4.integratenetwork.work/v1/proxy"
MODEL="deepseek/deepseek-chat-v3-0324"
PROMPT="Add a hero section with headline, short subtext, and CTA"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode)
      MODE="$2"
      shift 2
      ;;
    --token)
      TOKEN="$2"
      shift 2
      ;;
    --endpoint)
      ENDPOINT="$2"
      shift 2
      ;;
    --model)
      MODEL="$2"
      shift 2
      ;;
    --prompt)
      PROMPT="$2"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1"
      exit 1
      ;;
  esac
done

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CLI_ENTRY="$REPO_ROOT/apps/cli/dist/index.js"
WORK_DIR="$(mktemp -d)/og-demo"

# Keep the demo login isolated from the user's real `og login` session.
export XDG_CONFIG_HOME="$WORK_DIR/.config"
mkdir -p "$XDG_CONFIG_HOME"

# Keep the flow non-interactive when corepack needs to fetch the pinned pnpm.
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0

if [[ "$MODE" == "mock" ]]; then
  TOKEN="mock-token"
  ENDPOINT="mock://local"
  MODEL="0g-medium"
  export OG_ENABLE_MOCK_MODE=1
fi

if [[ -z "$TOKEN" ]]; then
  echo "Token is required for real mode. Pass --token or export OG_REAL_TOKEN."
  exit 1
fi

og() {
  node "$CLI_ENTRY" "$@"
}

echo "[1/7] Build"
(cd "$REPO_ROOT" && pnpm build >/dev/null)

echo "[2/7] Login"
og login --token "$TOKEN" --endpoint "$ENDPOINT"

echo "[3/7] Init"
og init --template react-vite --dir "$WORK_DIR/react" --model "$MODEL" --yes

cd "$WORK_DIR/react"

echo "[4/7] Install template dependencies"
pnpm install >/dev/null

echo "[5/7] Create (dry-run)"
og create --prompt "$PROMPT" --dry-run --yes

echo "[6/7] Preview command (manual run)"
echo "  node $CLI_ENTRY preview --port 4173"

echo "[7/7] Deploy + Sync commands (manual run)"
echo "  node $CLI_ENTRY deploy vercel --yes"
echo "  node $CLI_ENTRY sync push"

echo

echo "Demo workspace: $WORK_DIR/react"
echo "Mode: $MODE"
