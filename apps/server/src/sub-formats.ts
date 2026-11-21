import type { Inbound, UserWithInbounds } from "./types.js";
import { getSetting } from "./db.js";
import { inboundDisplayLabel } from "./links.js";

function cleanAddr(host: string): string {
  const clean = (getSetting("clean_address") || "").trim();
  return clean || host;
}

interface Ctx {
  host: string;
  user: UserWithInbounds;
  inbound: Inbound;
  allInbounds: Inbound[];
}

function net(inbound: Inbound): string {
  return inbound.transport === "xhttp" ? "xhttp" : inbound.transport;
}

function clashProxy(ctx: Ctx): Record<string, unknown> | null {
  const { user, inbound, host } = ctx;
  const addr = cleanAddr(host);
  const name = inboundDisplayLabel(inbound, user, ctx.allInbounds);
  const alpn = user.alpn ? user.alpn.split(",").map((a) => a.trim()) : undefined;
  const wsOpts = {
    path: inbound.path,
    headers: { Host: host },
  };

  if (inbound.protocol === "vless") {
    if (inbound.transport === "xhttp") return null;
    return {
      name,
      type: "vless",
      server: addr,
      port: 443,
      uuid: user.uuid,
      udp: true,
      tls: true,
      servername: host,
      network: inbound.transport === "httpupgrade" ? "ws" : "ws",
      "client-fingerprint": user.fingerprint || "chrome",
      alpn,
      "ws-opts": wsOpts,
    };
  }
  if (inbound.protocol === "vmess") {
    return {
      name,
      type: "vmess",
      server: addr,
      port: 443,
      uuid: user.uuid,
      alterId: 0,
      cipher: "auto",
      udp: true,
      tls: true,
      servername: host,
      network: "ws",
      "client-fingerprint": user.fingerprint || "chrome",
      alpn,
      "ws-opts": wsOpts,
    };
  }
  return {
    name,
    type: "trojan",
    server: addr,
    port: 443,
    password: user.password,
    udp: true,
    sni: host,
    network: "ws",
    "client-fingerprint": user.fingerprint || "chrome",
    alpn,
    "ws-opts": wsOpts,
  };
}

export function buildClashConfig(
  host: string,
  user: UserWithInbounds,
  inbounds: Inbound[],
): string {
  const proxies = inbounds
    .filter((ib) => ib.enabled && (!ib.expires_at || ib.expires_at > Date.now()) && user.inbound_ids.includes(ib.id))
    .map((inbound) => clashProxy({ host, user, inbound, allInbounds: inbounds }))
    .filter((p): p is Record<string, unknown> => p !== null);

  const names = proxies.map((p) => p.name as string);
  const yaml: string[] = [];
  yaml.push("proxies:");
  for (const p of proxies) {
    const parts = Object.entries(p)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => {
        if (typeof v === "object") return `${k}: ${JSON.stringify(v)}`;
        if (typeof v === "string") return `${k}: ${JSON.stringify(v)}`;
        return `${k}: ${v}`;
      });
    yaml.push(`  - { ${parts.join(", ")} }`);
  }
  yaml.push("proxy-groups:");
  yaml.push(`  - name: SideRail`);
  yaml.push(`    type: select`);
  yaml.push(`    proxies: [${names.join(", ")}]`);
  yaml.push("rules:");
  yaml.push("  - MATCH,SideRail");
  return yaml.join("\n");
}

function singboxOutbound(ctx: Ctx): Record<string, unknown> | null {
  const { user, inbound, host } = ctx;
  const addr = cleanAddr(host);
  const tag = inboundDisplayLabel(inbound, user, ctx.allInbounds);
  const tls = {
    enabled: true,
    server_name: host,
    utls: { enabled: true, fingerprint: user.fingerprint || "chrome" },
    alpn: user.alpn ? user.alpn.split(",").map((a) => a.trim()) : undefined,
  };
  const transport =
    inbound.transport === "xhttp"
      ? { type: "http", path: inbound.path, host: [host] }
      : { type: "ws", path: inbound.path, headers: { Host: host } };

  if (inbound.protocol === "vless") {
    return {
      type: "vless",
      tag,
      server: addr,
      server_port: 443,
      uuid: user.uuid,
      tls,
      transport,
    };
  }
  if (inbound.protocol === "vmess") {
    return {
      type: "vmess",
      tag,
      server: addr,
      server_port: 443,
      uuid: user.uuid,
      alter_id: 0,
      security: "auto",
      tls,
      transport,
    };
  }
  return {
    type: "trojan",
    tag,
    server: addr,
    server_port: 443,
    password: user.password,
    tls,
    transport,
  };
}

export function buildSingboxConfig(
  host: string,
  user: UserWithInbounds,
  inbounds: Inbound[],
): string {
  const outbounds = inbounds
    .filter((ib) => ib.enabled && (!ib.expires_at || ib.expires_at > Date.now()) && user.inbound_ids.includes(ib.id))
    .map((inbound) => singboxOutbound({ host, user, inbound, allInbounds: inbounds }))
    .filter((o): o is Record<string, unknown> => o !== null);

  const tags = outbounds.map((o) => o.tag as string);

  const config = {
    outbounds: [
      {
        type: "selector",
        tag: "SideRail",
        outbounds: [...tags, "direct"],
        default: tags[0],
      },
      ...outbounds,
      { type: "direct", tag: "direct" },
    ],
  };
  return JSON.stringify(config, null, 2);
}

void net;
