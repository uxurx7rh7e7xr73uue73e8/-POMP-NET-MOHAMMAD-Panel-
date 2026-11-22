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
import { db, getSetting } from "./db.js";
import type { Inbound, UserWithInbounds } from "./types.js";
import { isUserActive } from "./users.js";
import { ensureWireGuardPeer, ensureWireGuardServerKeys } from "./wireguard.js";
import { getPublicTcpProxyEndpoint, isPubliclyReachableInbound } from "./railway-capabilities.js";

interface LinkContext {
  host: string;
  address: string;
  user: UserWithInbounds;
  inbound: Inbound;
  allInbounds: Inbound[];
  port?: number;
}

const GB = 1024 * 1024 * 1024;

function persianDate(timestamp: number): string {
  const parts = new Intl.DateTimeFormat("en-u-ca-persian-nu-latn", {
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date(timestamp));
  const part = (type: string) => parts.find((p) => p.type === type)?.value || "00";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function firstTwoInboundIds(inbounds: Inbound[]): { first: number | undefined; second: number | undefined } {
  const ordered = [...inbounds].sort((a, b) => a.id - b.id);
  return {
    first: ordered.find((ib) => ib.tag === "VLESS-WS")?.id ?? ordered[0]?.id,
    second: ordered.find((ib) => ib.tag === "VLESS-XHTTP")?.id ?? ordered[1]?.id,
  };
}

export function inboundDisplayLabel(inbound: Inbound, user: UserWithInbounds, allInbounds: Inbound[]): string {
  const { first, second } = firstTwoInboundIds(allInbounds);
  if (inbound.id === first) {
    const remaining = user.data_limit > 0
      ? `${Math.max(0, (user.data_limit - user.total) / GB).toFixed(2)} GB`
      : "نامحدود";
    // Use the earliest real deadline: account expiry or subscription-token
    // lifetime measured from the first subscription fetch.
    const tokenExpiry = user.sub_expire_days > 0
      ? (user.sub_first_seen ?? Date.now()) + user.sub_expire_days * 86_400_000
      : null;
    const deadlines = [user.expire_at, tokenExpiry].filter((value): value is number => value !== null);
    const actualExpiry = deadlines.length ? Math.min(...deadlines) : null;
    const days = actualExpiry
      ? Math.max(0, Math.ceil((actualExpiry - Date.now()) / 86_400_000))
      : null;
    const expiry = actualExpiry ? persianDate(actualExpiry) : "بدون انقضا";
    const dayText = days === null ? "∞" : `${days}d`;
    const active = isUserActive(user);
    return `🚀 𝐏𝐎𝐌𝐏 𝐍𝐄𝐓 ⚡ 𝐍𝐄𝐗𝐔𝐒  👤 ${user.email} | 📦 ${remaining} ⏳ ${dayText} | 📅 ${expiry} 🛡️ ${active ? "✅" : "⛔"}  👑 𝐏𝐎𝐖𝐄𝐑𝐄𝐃 𝐁𝐘 𝐏𝐎𝐌𝐏 𝐍𝐄𝐓 🔥`;
  }
  if (inbound.id === second) {
    return "😈 𝐅𝐔𝐄𝐋 𝐓𝐇𝐄 𝐅𝐈𝐑𝐄 • 𝐈𝐆𝐍𝐈𝐓𝐄 𝐘𝐎𝐔𝐑 𝐏𝐎𝐖𝐄𝐑 🚀 👑 𝐏𝐎𝐌𝐏 𝐍𝐄𝐓 • 𝐁𝐎𝐑𝐍 𝐓𝐎 𝐃𝐎𝐌𝐈𝐍𝐀𝐓𝐄 ⚡";
  }
  return `⚡ POMP NET NEXUS • ${inbound.tag}`;
}

export function subscriptionProfileTitle(user: UserWithInbounds, inbounds: Inbound[]): string {
  const first = [...inbounds].sort((a, b) => a.id - b.id)[0];
  return first ? inboundDisplayLabel(first, user, inbounds) : `POMP NET NEXUS • ${user.email}`;
}

function commonQuery(ctx: LinkContext): Record<string, string> {
  const { inbound, user, host } = ctx;
  const q: Record<string, string> = {
    security: "tls",
    sni: host,
    host,
    fp: user.fingerprint || "chrome",
  };
  q.type = inbound.transport === "xhttp" ? "xhttp" : inbound.transport;
  q.path = inbound.path;
  if (inbound.transport === "ws" || inbound.transport === "httpupgrade") {
    q.alpn = "http/1.1";
    q.headerType = "none";
  } else {
    q.alpn = user.alpn || "h2,http/1.1";
  }
  return q;
}

function qs(params: Record<string, string>): string {
  return Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");
}

function vlessLink(ctx: LinkContext): string {
  const { user, address } = ctx;
  const query = qs({ ...commonQuery(ctx), encryption: "none" });
  return `vless://${user.uuid}@${address}:${ctx.port ?? 443}?${query}#${encodeURIComponent(inboundDisplayLabel(ctx.inbound, user, ctx.allInbounds))}`;
}

function trojanLink(ctx: LinkContext): string {
  const { user, address } = ctx;
  const query = qs(commonQuery(ctx));
  return `trojan://${encodeURIComponent(user.password)}@${address}:${ctx.port ?? 443}?${query}#${encodeURIComponent(
    inboundDisplayLabel(ctx.inbound, user, ctx.allInbounds),
  )}`;
}

function wireGuardLink(ctx: LinkContext): string {
  const { user, inbound, address } = ctx;
  const peer = ensureWireGuardPeer(user);
  const server = ensureWireGuardServerKeys();
  const params = qs({
    address: `${peer.address}/32`,
    publickey: server.publicKey,
    presharedkey: peer.preshared_key,
    mtu: "1420",
    dns: "1.1.1.1",
    reserved: "0,0,0",
  });
  const label = inboundDisplayLabel(inbound, user, ctx.allInbounds);
  return `wireguard://${peer.private_key}@${address}:${ctx.port ?? inbound.port}?${params}#${encodeURIComponent(label)}`;
}

function hysteria2Link(ctx: LinkContext): string {
  const { user, inbound, address, host } = ctx;
  const serverName = inbound.host || host;
  const query = qs({ sni: serverName, alpn: "h3", obfs: "" });
  return `hysteria2://${encodeURIComponent(user.password)}@${address}:${inbound.port}/?${query}#${encodeURIComponent(inboundDisplayLabel(inbound, user, ctx.allInbounds))}`;
}

function tuicLink(ctx: LinkContext): string {
  const { user, inbound, address, host } = ctx;
  const serverName = inbound.host || host;
  const query = qs({ congestion_control: "bbr", udp_relay_mode: "native", alpn: "h3", sni: serverName });
  return `tuic://${user.uuid}:${encodeURIComponent(user.password)}@${address}:${inbound.port}?${query}#${encodeURIComponent(inboundDisplayLabel(inbound, user, ctx.allInbounds))}`;
}

function proxyLink(ctx: LinkContext): string {
  const { user, inbound, address } = ctx;
  const scheme = inbound.protocol === "socks" ? "socks" : "http";
  const endpoint = getPublicTcpProxyEndpoint(inbound);
  const proxyAddress = ctx.port !== undefined ? address : (endpoint?.host || address);
  const proxyPort = ctx.port ?? endpoint?.port ?? inbound.port;
  const label = encodeURIComponent(inboundDisplayLabel(inbound, user, ctx.allInbounds));
  return `${scheme}://${encodeURIComponent(user.email)}:${encodeURIComponent(user.password)}@${proxyAddress}:${proxyPort}#${label}`;
}

function vmessLink(ctx: LinkContext): string {
  const { user, inbound, host, address } = ctx;
  const isXhttp = inbound.transport === "xhttp";
  const obj = {
    v: "2",
    ps: inboundDisplayLabel(inbound, user, ctx.allInbounds),
    add: address,
    port: String(ctx.port ?? 443),
    id: user.uuid,
    aid: "0",
    scy: "auto",
    net: isXhttp ? "xhttp" : inbound.transport,
    type: "none",
    host,
    path: inbound.path,
    tls: "tls",
    sni: host,
    alpn: isXhttp ? "h2,http/1.1" : "http/1.1",
    fp: user.fingerprint || "chrome",
  };
  return "vmess://" + Buffer.from(JSON.stringify(obj)).toString("base64");
}

export function buildLink(ctx: LinkContext): string {
  switch (ctx.inbound.protocol) {
    case "vless":
      return vlessLink(ctx);
    case "trojan":
      return trojanLink(ctx);
    case "vmess":
      return vmessLink(ctx);
    case "wireguard":
      return wireGuardLink(ctx);
    case "hysteria2":
      return hysteria2Link(ctx);
    case "tuic":
      return tuicLink(ctx);
    case "socks":
    case "http":
      return proxyLink(ctx);
  }
}

function resolveAddress(host: string): string {
  const clean = (getSetting("clean_address") || "").trim();
  return clean || host;
}

function activeNodeTargets(inboundId: number): { name: string; host: string; port: number | null }[] {
  const rows = db.prepare("SELECT name, endpoint, inbound_ids, last_seen FROM managed_nodes WHERE enabled = 1 AND status = 'online' AND last_seen > ?")
    .all(Date.now() - 90_000) as { name: string; endpoint: string; inbound_ids: string; last_seen: number }[];
  return rows.flatMap((row) => {
    if (!row.endpoint) return [];
    let ids: number[] = [];
    try { ids = JSON.parse(row.inbound_ids) as number[]; } catch { return []; }
    if (ids.length > 0 && !ids.includes(inboundId)) return [];
    try {
      const url = new URL(row.endpoint);
      return [{ name: row.name, host: url.hostname, port: url.port ? Number(url.port) : null }];
    } catch {
      return [];
    }
  });
}

export function buildUserLinks(
  host: string,
  user: UserWithInbounds,
  inbounds: Inbound[],
): { tag: string; protocol: string; transport: string; link: string }[] {
  const address = resolveAddress(host);
  return inbounds
    .filter((ib) => ib.enabled && (!ib.expires_at || ib.expires_at > Date.now()) && user.inbound_ids.includes(ib.id))
    .flatMap((inbound) => {
      const links: { tag: string; protocol: string; transport: string; link: string }[] = [];
      if (isPubliclyReachableInbound(inbound)) {
        links.push({
          tag: inboundDisplayLabel(inbound, user, inbounds),
          protocol: inbound.protocol,
          transport: inbound.transport,
          link: buildLink({ host, address, user, inbound, allInbounds: inbounds }),
        });
      }
      // Healthy authenticated nodes publish their own endpoint for each
      // explicitly assigned Xray inbound. This also provides a real fallback
      // for WireGuard when the controller itself runs on Railway (no public UDP).
      for (const node of activeNodeTargets(inbound.id)) {
        const nodeInbound = { ...inbound, id: -inbound.id, tag: `${inbound.tag}-${node.name}` };
        const nodePort = inbound.protocol === "wireguard" ? inbound.port : (node.port ?? inbound.port);
        links.push({
          tag: inboundDisplayLabel(nodeInbound, user, inbounds),
          protocol: inbound.protocol,
          transport: inbound.transport,
          link: buildLink({ host: node.host, address: node.host, port: nodePort, user, inbound: nodeInbound, allInbounds: inbounds }),
        });
      }
      return links;
    });
}
