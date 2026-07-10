#!/usr/bin/env bash
set -Eeuo pipefail

SERVICE_NAME="mail-mcp.service"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
START_SCRIPT="$SCRIPT_DIR/start.sh"
ENV_FILE="${ENV_FILE:-$PROJECT_ROOT/.env.local}"
SERVICE_USER="${SERVICE_USER:-${SUDO_USER:-$USER}}"
SERVICE_HOME="$(getent passwd "$SERVICE_USER" 2>/dev/null | cut -d: -f6 || true)"

if [[ -z "$SERVICE_HOME" ]]; then
  SERVICE_HOME="/home/$SERVICE_USER"
fi

require_systemd() {
  if [[ "$(uname -s)" != "Linux" ]] || ! command -v systemctl >/dev/null 2>&1; then
    echo "Autostart is supported only on Linux systems with systemd (for example Raspberry Pi OS)." >&2
    exit 1
  fi
}

setup() {
  require_systemd
  if [[ ! -x "$START_SCRIPT" ]]; then
    echo "Start script is not executable: $START_SCRIPT" >&2
    exit 1
  fi
  if [[ ! -f "$ENV_FILE" ]]; then
    echo "Environment file not found: $ENV_FILE" >&2
    exit 1
  fi

  local unit_file
  unit_file="$(mktemp)"
  cat >"$unit_file" <<EOF
[Unit]
Description=Mail-MCP Secure MCP Tunnel
Wants=network-online.target
After=network-online.target

[Service]
Type=simple
User=$SERVICE_USER
WorkingDirectory=$PROJECT_ROOT
Environment=HOME=$SERVICE_HOME
Environment=PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
Environment=ENV_FILE=$ENV_FILE
ExecStart=/bin/bash $START_SCRIPT
Restart=always
RestartSec=5
KillMode=control-group
TimeoutStopSec=20

[Install]
WantedBy=multi-user.target
EOF

  sudo install -m 644 "$unit_file" "/etc/systemd/system/$SERVICE_NAME"
  rm -f "$unit_file"
  sudo systemctl daemon-reload
  sudo systemctl enable --now "$SERVICE_NAME"
  echo "Mail-MCP autostart is enabled."
  sudo systemctl --no-pager --full status "$SERVICE_NAME" || true
}

remove() {
  require_systemd
  sudo systemctl disable --now "$SERVICE_NAME" 2>/dev/null || true
  sudo rm -f "/etc/systemd/system/$SERVICE_NAME"
  sudo systemctl daemon-reload
  echo "Mail-MCP autostart has been removed."
}

detect() {
  require_systemd
  if [[ ! -f "/etc/systemd/system/$SERVICE_NAME" ]]; then
    echo "Mail-MCP autostart: not configured"
    return 0
  fi
  local enabled active
  enabled="$(systemctl is-enabled "$SERVICE_NAME" 2>/dev/null || true)"
  active="$(systemctl is-active "$SERVICE_NAME" 2>/dev/null || true)"
  echo "Mail-MCP autostart: configured ($enabled, $active)"
  systemctl --no-pager --full status "$SERVICE_NAME" || true
}

case "${1:-}" in
  setup) setup ;;
  remove) remove ;;
  detect) detect ;;
  *)
    echo "Usage: $0 {setup|remove|detect}" >&2
    exit 64
    ;;
esac
