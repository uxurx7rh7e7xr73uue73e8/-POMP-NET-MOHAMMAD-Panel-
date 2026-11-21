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
import { getSetting } from "./db.js";
import type { Inbound, UserWithInbounds } from "./types.js";
import { isUserActive } from "./users.js";

interface LinkContext {
  host: string;
  address: string;
  user: UserWithInbounds;
  inbound: Inbound;
  allInbounds: Inbound[];
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
  const ids = [...inbounds].sort((a, b) => a.id - b.id).map((ib) => ib.id);
  return { first: ids[0], second: ids[1] };
}

export function inboundDisplayLabel(inbound: Inbound, user: UserWithInbounds, allInbounds: Inbound[]): string {
  const { first, second } = firstTwoInboundIds(allInbounds);
  if (inbound.id === first) {
    const remaining = user.data_limit > 0
      ? `${Math.max(0, (user.data_limit - user.total) / GB).toFixed(2)} GB`
      : "نامحدود";
    const days = user.expire_at
      ? Math.max(0, Math.ceil((user.expire_at - Date.now()) / 86_400_000))
      : null;
    const expiry = user.expire_at ? persianDate(user.expire_at) : "بدون انقضا";
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
  return `vless://${user.uuid}@${address}:443?${query}#${encodeURIComponent(inboundDisplayLabel(ctx.inbound, user, ctx.allInbounds))}`;
}

function trojanLink(ctx: LinkContext): string {
  const { user, address } = ctx;
  const query = qs(commonQuery(ctx));
  return `trojan://${encodeURIComponent(user.password)}@${address}:443?${query}#${encodeURIComponent(
    inboundDisplayLabel(ctx.inbound, user, ctx.allInbounds),
  )}`;
}

function vmessLink(ctx: LinkContext): string {
  const { user, inbound, host, address } = ctx;
  const isXhttp = inbound.transport === "xhttp";
  const obj = {
    v: "2",
    ps: inboundDisplayLabel(inbound, user, ctx.allInbounds),
    add: address,
    port: "443",
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
  }
}

function resolveAddress(host: string): string {
  const clean = (getSetting("clean_address") || "").trim();
  return clean || host;
}

export function buildUserLinks(
  host: string,
  user: UserWithInbounds,
  inbounds: Inbound[],
): { tag: string; protocol: string; transport: string; link: string }[] {
  const address = resolveAddress(host);
  return inbounds
    .filter((ib) => ib.enabled && (!ib.expires_at || ib.expires_at > Date.now()) && user.inbound_ids.includes(ib.id))
    .map((inbound) => ({
      tag: inboundDisplayLabel(inbound, user, inbounds),
      protocol: inbound.protocol,
      transport: inbound.transport,
      link: buildLink({ host, address, user, inbound, allInbounds: inbounds }),
    }));
}
