/**
 * SideRail - Xray-core VPN management panel
 * Copyright (c) 2025 icubaby. All rights reserved.
 * Official repository: https://github.com/icubaby/SideRail
 *
 * Licensed under the SideRail Proprietary License (see LICENSE).
 * Unauthorized selling, white-labeling, or removal of attribution,
 * branding, or the embedded authorship identifiers is prohibited.
 * Watermark: sr-icubaby-2025-9f4c1a7e
 */
import { config } from "./config.js";
import { listEnabledInbounds } from "./inbounds.js";
import { listUsers, isUserActive } from "./users.js";
import { listRoutingRules } from "./routing.js";
import type { Inbound, UserWithInbounds } from "./types.js";
import { ensureWireGuardPeer, ensureWireGuardServerKeys } from "./wireguard.js";

function streamSettings(inbound: Inbound) {
  const base: Record<string, unknown> = { network: inbound.transport };
  if (inbound.transport === "ws") {
    base.wsSettings = { path: inbound.path, host: inbound.host || undefined };
  } else if (inbound.transport === "httpupgrade") {
    base.httpupgradeSettings = { path: inbound.path, host: inbound.host || undefined };
  } else if (inbound.transport === "xhttp") {
    base.xhttpSettings = { path: inbound.path, host: inbound.host || undefined, mode: "auto" };
  }
  return base;
}

function inboundClients(inbound: Inbound, users: UserWithInbounds[]) {
  return users.filter((u) => isUserActive(u) && u.inbound_ids.includes(inbound.id));
}

function protocolSettings(inbound: Inbound, users: UserWithInbounds[]) {
  const clients = inboundClients(inbound, users);
  if (inbound.protocol === "wireguard") {
    const server = ensureWireGuardServerKeys();
    return {
      secretKey: server.privateKey,
      peers: clients.map((client) => {
        const peer = ensureWireGuardPeer(client);
        return {
          publicKey: peer.public_key,
          preSharedKey: peer.preshared_key,
          allowedIPs: [`${peer.address}/32`],
          email: client.email,
          level: 0,
        };
      }),
      mtu: 1420,
    };
  }
  if (inbound.protocol === "socks") {
    return {
      auth: "password",
      accounts: clients.map((client) => ({ user: client.email, pass: client.password })),
      udp: true,
      ip: "127.0.0.1",
    };
  }
  if (inbound.protocol === "http") {
    return {
      accounts: clients.map((client) => ({ user: client.email, pass: client.password })),
      allowTransparent: false,
      userLevel: 0,
    };
  }
  if (inbound.protocol === "vless") {
    return {
      clients: clients.map((c) => ({ id: c.uuid, email: c.email, flow: "" })),
      decryption: "none",
    };
  }
  if (inbound.protocol === "vmess") {
    return {
      clients: clients.map((c) => ({ id: c.uuid, email: c.email })),
    };
  }
  return {
    clients: clients.map((c) => ({ password: c.password, email: c.email })),
  };
}

function buildRoutingRules(inbounds: Inbound[]) {
  const rules: Record<string, unknown>[] = [
    { type: "field", inboundTag: ["api"], outboundTag: "api" },
  ];
  const tagById = new Map(inbounds.map((i) => [i.id, i.tag]));
  const routingRules = listRoutingRules();

  for (const rule of routingRules) {
    const values = rule.domain
      .split(/[\s,]+/)
      .map((d) => d.trim())
      .filter(Boolean);
    if (values.length === 0) continue;
    const targetTags =
      rule.inbound_ids.length === 0
        ? inbounds.map((i) => i.tag)
        : rule.inbound_ids.map((id) => tagById.get(id)).filter((t): t is string => !!t);
    if (targetTags.length === 0) continue;
    const base: Record<string, unknown> = {
      type: "field",
      inboundTag: targetTags,
      outboundTag: "blocked",
    };
    if (rule.kind === "ip") base.ip = values;
    else base.domain = values;
    rules.push(base);
  }

  // The game profile uses its own direct freedom outbound with TCP Fast Open.
  // It can reduce connection setup overhead on compatible kernels, but cannot
  // guarantee a lower geographic/network RTT.
  const gameTags = inbounds.filter((i) => i.tag.startsWith("POMP-GAME-")).map((i) => i.tag);
  if (gameTags.length) {
    rules.push({ type: "field", inboundTag: gameTags, outboundTag: "game-direct" });
  }
  return rules;
}

export function buildXrayConfig() {
  const inbounds = listEnabledInbounds();
  const users = listUsers();

  const inboundConfigs = inbounds.map((ib) => ({
    tag: ib.tag,
    listen: ib.protocol === "wireguard" || ib.protocol === "socks" || ib.protocol === "http" ? "0.0.0.0" : "127.0.0.1",
    port: ib.port,
    protocol: ib.protocol,
    settings: protocolSettings(ib, users),
    ...(ib.protocol === "wireguard" || ib.protocol === "socks" || ib.protocol === "http" ? {} : { streamSettings: streamSettings(ib) }),
    sniffing: { enabled: false, destOverride: [] },
  }));

  return {
    log: { loglevel: "warning", access: config.xrayAccessLog },
    api: {
      tag: "api",
      services: ["HandlerService", "StatsService", "LoggerService"],
    },
    stats: {},
    policy: {
      levels: { "0": { statsUserUplink: true, statsUserDownlink: true } },
      system: {
        statsInboundUplink: true,
        statsInboundDownlink: true,
      },
    },
    inbounds: [
      {
        tag: "api",
        listen: "127.0.0.1",
        port: config.xrayApiPort,
        protocol: "dokodemo-door",
        settings: { address: "127.0.0.1" },
      },
      ...inboundConfigs,
    ],
    outbounds: [
      { tag: "direct", protocol: "freedom", settings: {} },
      {
        tag: "game-direct",
        protocol: "freedom",
        settings: {},
        streamSettings: { sockopt: { tcpFastOpen: true, tcpNoDelay: true } },
      },
      { tag: "blocked", protocol: "blackhole", settings: {} },
    ],
    routing: {
      domainStrategy: "AsIs",
      rules: buildRoutingRules(inbounds),
    },
  };
}
