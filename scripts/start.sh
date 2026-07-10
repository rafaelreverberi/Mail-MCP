#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

ENV_FILE="${ENV_FILE:-.env.local}"

if [[ -f "$ENV_FILE" && "${MAIL_MCP_ENV_LOADED:-}" != "1" ]]; then
  export ENV_FILE
  export MAIL_MCP_ENV_LOADED=1
  exec node --env-file="$ENV_FILE" -e '
    const { spawn } = require("node:child_process");
    const child = spawn(process.argv[1], process.argv.slice(2), { env: process.env, stdio: "inherit" });
    child.on("error", (error) => { console.error(error.message); process.exit(1); });
    child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
  ' "$0" "$@"
fi

require_value() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required environment variable: $name" >&2
    exit 1
  fi
}

require_value CONTROL_PLANE_API_KEY
require_value CONTROL_PLANE_TUNNEL_ID

MCP_HOST="${MCP_HOST:-127.0.0.1}"
MCP_PORT="${MCP_PORT:-3000}"
MCP_URL="http://${MCP_HOST}:${MCP_PORT}/api/mcp"
HEALTH_URL="http://${MCP_HOST}:${MCP_PORT}/api/health"
SERVER_PID=""

cleanup() {
  local status="$?"
  trap - EXIT INT TERM
  if [[ -n "$SERVER_PID" ]] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  exit "$status"
}

trap cleanup EXIT
trap 'exit 0' INT TERM

npm run start &
SERVER_PID="$!"

for _ in {1..30}; do
  if node -e 'fetch(process.argv[1]).then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))' "$HEALTH_URL" >/dev/null 2>&1; then
    break
  fi
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "Mail-MCP stopped before it became healthy." >&2
    exit 1
  fi
  sleep 1
done

if ! node -e 'fetch(process.argv[1]).then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))' "$HEALTH_URL" >/dev/null 2>&1; then
  echo "Mail-MCP did not become healthy at $HEALTH_URL." >&2
  exit 1
fi

tunnel-client doctor \
  --control-plane.tunnel-id "$CONTROL_PLANE_TUNNEL_ID" \
  --mcp.server-url "$MCP_URL" \
  --explain

tunnel-client run \
  --control-plane.tunnel-id "$CONTROL_PLANE_TUNNEL_ID" \
  --mcp.server-url "$MCP_URL"
