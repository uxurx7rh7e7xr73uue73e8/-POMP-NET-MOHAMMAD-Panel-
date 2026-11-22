# POMP NET MOHAMMAD — Remote Node Agent

This directory contains the real remote-node worker used by the panel's managed_nodes registry.

## Requirements

- Linux server with a public IP and the inbound ports assigned in the panel open in its firewall/provider firewall.
- Node.js 22 or newer.
- Node.js 22+. Xray-core is required only for Xray protocols; Hysteria2/TUIC-only nodes run without Xray. The installer downloads sing-box v1.14.4 for supported Linux architectures.
- Controller reachable over HTTPS.
- One node token created from the panel. The token is displayed once; rotate it if lost.

## Install

On Ubuntu/Debian, after installing Node.js 22+ and Xray-core, copy this directory to the node and run `sudo bash install.sh`. The installer asks for the panel HTTPS URL, one-time node token and Xray binary path, then installs the agent and systemd service.

Manual installation is also supported:

1. Copy `agent.mjs` to `/opt/pompnet-node/agent.mjs`.
2. Create `/etc/pompnet-node.env` with mode 0600:

```env
POMP_CONTROLLER_URL=https://YOUR-PANEL-DOMAIN
POMP_NODE_TOKEN=PASTE_ONE_TIME_NODE_TOKEN
POMP_NODE_POLL_MS=30000
POMP_NODE_DATA_DIR=/var/lib/pompnet-node
XRAY_BIN=/usr/local/bin/xray
XRAY_VERSION=installed-by-operator
# Required only when assigning VLESS, VMess or Trojan inbounds:
POMP_NODE_TLS_CERT_FILE=/etc/letsencrypt/live/YOUR-NODE-DOMAIN/fullchain.pem
POMP_NODE_TLS_KEY_FILE=/etc/letsencrypt/live/YOUR-NODE-DOMAIN/privkey.pem
```

3. Install `pompnet-node.service` as `/etc/systemd/system/pompnet-node.service`.
4. Run `systemctl daemon-reload && systemctl enable --now pompnet-node`.
5. Check `journalctl -u pompnet-node -f` and the node status in the owner panel.

The agent fetches node-scoped Xray and sing-box configurations over HTTPS. When assigned, Xray supports VLESS, VMess, Trojan, WireGuard, SOCKS and HTTP; sing-box supports Hysteria2 and TUIC. A sing-box-only UDP node does not start Xray. The agent applies the node-local TLS certificate to VLESS/VMess/Trojan and Hysteria2/TUIC, validates both configurations, supervises both engine processes, writes logs under `/var/lib/pompnet-node`, and sends authenticated health heartbeats. For TLS protocols, configure both `POMP_NODE_TLS_CERT_FILE` and `POMP_NODE_TLS_KEY_FILE`; the certificate SAN must cover every configured TLS/SNI hostname assigned to the node. If a required binary or certificate is missing, the agent reports an error and the controller does not publish links for that unhealthy node. The token is never written to the config file or sent in query parameters.

## Security and limitations

- Keep the token private. It grants access to node configuration and heartbeat reporting.
- The agent applies only the inbounds assigned in the node registry. An empty legacy assignment means all supported Xray and sing-box inbounds; new UI registrations select WireGuard by default. Hysteria2/TUIC also require the sing-box binary installed by the installer and the node certificate/key paths above.
- Node status is based on authenticated heartbeat. It does not prove a client has successfully connected.
- Do not expose the Xray API port publicly.
- Configure firewall rules on the node for the assigned TCP/UDP listener ports.
- The controller must be deployed on an HTTPS endpoint. Do not disable TLS verification.
- This is a TCP/UDP-capable self-hosted node worker; it does not bypass Railway's lack of public UDP ingress on the controller service.
