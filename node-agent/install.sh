#!/usr/bin/env bash
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Run this installer as root: sudo bash install.sh"
  exit 1
fi

NODE_BIN="$(command -v node || true)"
if [ -z "$NODE_BIN" ]; then
  echo "Node.js 22+ is required. Install Node.js first."
  exit 1
fi
NODE_MAJOR="$("$NODE_BIN" -p 'Number(process.versions.node.split(".")[0])')"
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "Node.js 22+ is required; found $("$NODE_BIN" --version)."
  exit 1
fi

read -r -p "Panel HTTPS URL (for example https://panel.example.com): " CONTROLLER
case "$CONTROLLER" in
  https://*) ;;
  http://127.0.0.1*|http://localhost*) ;;
  *) echo "Controller URL must use HTTPS (HTTP is allowed only for localhost)."; exit 1 ;;
esac
read -r -s -p "One-time node token from the POMP NET owner panel: " NODE_TOKEN
echo
if [ "${#NODE_TOKEN}" -lt 40 ]; then
  echo "The node token looks too short."
  exit 1
fi
read -r -p "Xray binary path [/usr/local/bin/xray]: " XRAY_BIN
XRAY_BIN="${XRAY_BIN:-/usr/local/bin/xray}"
read -r -p "TLS certificate path for VLESS/VMess/Trojan (leave empty if not used): " TLS_CERT
read -r -p "TLS private-key path for VLESS/VMess/Trojan (leave empty if not used): " TLS_KEY
if [ -n "$TLS_CERT" ] || [ -n "$TLS_KEY" ]; then
  if [ ! -f "$TLS_CERT" ] || [ ! -f "$TLS_KEY" ]; then echo "Both TLS certificate and key files must exist."; exit 1; fi
fi
SING_BOX_BIN="/usr/local/bin/sing-box"
if [ ! -x "$SING_BOX_BIN" ]; then
  case "$(uname -m)" in
    x86_64|amd64) SING_ARCH="amd64" ;;
    aarch64|arm64) SING_ARCH="arm64" ;;
    armv7l|armv7) SING_ARCH="armv7" ;;
    *) echo "Unsupported CPU architecture for automatic sing-box install: $(uname -m)"; exit 1 ;;
  esac
  TMP_SING="$(mktemp -d)"
  trap 'rm -rf "$TMP_SING"' EXIT
  SING_URL="https://github.com/SagerNet/sing-box/releases/download/v1.14.4/sing-box-1.14.4-linux-$SING_ARCH.tar.gz"
  curl -fsSL "$SING_URL" -o "$TMP_SING/sing-box.tar.gz"
  tar -xzf "$TMP_SING/sing-box.tar.gz" -C "$TMP_SING"
  SING_SOURCE="$(find "$TMP_SING" -type f -name sing-box -print -quit)"
  if [ -z "$SING_SOURCE" ]; then echo "Could not locate the downloaded sing-box executable."; exit 1; fi
  install -m 755 "$SING_SOURCE" "$SING_BOX_BIN"
fi
"$SING_BOX_BIN" version >/dev/null
if [ ! -x "$XRAY_BIN" ]; then
  echo "Xray is not installed at $XRAY_BIN. Hysteria2/TUIC-only nodes can still run sing-box; install Xray before assigning VLESS/VMess/Trojan/WireGuard/SOCKS/HTTP."
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
install -d -m 700 /opt/pompnet-node /var/lib/pompnet-node
install -m 700 "$SCRIPT_DIR/agent.mjs" /opt/pompnet-node/agent.mjs
install -m 644 "$SCRIPT_DIR/pompnet-node.service" /etc/systemd/system/pompnet-node.service

umask 077
cat > /etc/pompnet-node.env <<EOF
POMP_CONTROLLER_URL=$CONTROLLER
POMP_NODE_TOKEN=$NODE_TOKEN
POMP_NODE_POLL_MS=30000
POMP_NODE_DATA_DIR=/var/lib/pompnet-node
XRAY_BIN=$XRAY_BIN
SING_BOX_BIN=$SING_BOX_BIN
SING_BOX_VERSION=1.14.4
POMP_NODE_TLS_CERT_FILE=$TLS_CERT
POMP_NODE_TLS_KEY_FILE=$TLS_KEY
EOF
sed -i "s|^ExecStart=.*|ExecStart=$NODE_BIN /opt/pompnet-node/agent.mjs|" /etc/systemd/system/pompnet-node.service

systemctl daemon-reload
systemctl enable --now pompnet-node
sleep 2
systemctl --no-pager --full status pompnet-node || true

echo
echo "POMP NET node agent installed."
echo "Check logs with: journalctl -u pompnet-node -f"
echo "Open the assigned WireGuard UDP port(s) in both host and provider firewalls."
