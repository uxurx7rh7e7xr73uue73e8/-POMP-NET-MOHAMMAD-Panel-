# POMP NET MOHAMMAD — Remote Node Agent

This directory contains the real remote-node worker used by the panel's managed_nodes registry.

## Requirements

- Linux server with a public IP and the inbound ports assigned in the panel open in its firewall/provider firewall.
- Node.js 22 or newer.
- Xray-core installed at /usr/local/bin/xray (or set XRAY_BIN).
- Controller reachable over HTTPS.
- One node token created from the panel. The token is displayed once; rotate it if lost.

## Install

1. Copy `agent.mjs` to `/opt/pompnet-node/agent.mjs`.
2. Create `/etc/pompnet-node.env` with mode 0600:

```env
POMP_CONTROLLER_URL=https://YOUR-PANEL-DOMAIN
POMP_NODE_TOKEN=PASTE_ONE_TIME_NODE_TOKEN
POMP_NODE_POLL_MS=30000
POMP_NODE_DATA_DIR=/var/lib/pompnet-node
XRAY_BIN=/usr/local/bin/xray
XRAY_VERSION=installed-by-operator
```

3. Install `pompnet-node.service` as `/etc/systemd/system/pompnet-node.service`.
4. Run `systemctl daemon-reload && systemctl enable --now pompnet-node`.
5. Check `journalctl -u pompnet-node -f` and the node status in the owner panel.

The agent fetches the node-scoped Xray config over HTTPS, validates it with `xray run -test`, atomically writes it, starts/restarts Xray only when the config hash changes, and sends authenticated health heartbeats. In this release the remote agent deliberately applies only WireGuard UDP inbounds: the controller routes WireGuard subscription endpoints to healthy nodes. Other TCP protocols are not yet distributed to remote nodes. The token is never written to the config file or sent in query parameters.

## Security and limitations

- Keep the token private. It grants access to node configuration and heartbeat reporting.
- The agent currently applies the controller's enabled inbounds to this node; use inbound assignment in the node registry to scope the config. An empty assignment means all enabled inbounds.
- Node status is based on authenticated heartbeat. It does not prove a client has successfully connected.
- Do not expose the Xray API port publicly.
- Configure firewall rules on the node for the assigned TCP/UDP listener ports.
- The controller must be deployed on an HTTPS endpoint. Do not disable TLS verification.
- This is a TCP/UDP-capable self-hosted node worker; it does not bypass Railway's lack of public UDP ingress on the controller service.
