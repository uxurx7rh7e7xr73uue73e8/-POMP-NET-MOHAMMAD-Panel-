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
import net from "node:net";
import httpProxy from "http-proxy";
import type { Server, IncomingMessage } from "node:http";
import type { Socket } from "node:net";
import { listEnabledInbounds } from "./inbounds.js";
import { db } from "./db.js";
import type { Inbound } from "./types.js";
import { isPubliclyReachableInbound } from "./railway-capabilities.js";

const xhttpProxy = httpProxy.createProxyServer({ ws: false, xfwd: true });

function tunnelDebug(event: string, details: Record<string, unknown> = {}): void {
  if (process.env.POMP_TUNNEL_DEBUG === "1") console.log("[POMP tunnel]", event, JSON.stringify(details));
}
xhttpProxy.on("error", () => {});

const portToIp = new Map<number, { ip: string; ts: number }>();
const activeTunnels = new Set<object>();
const drainCallbacks = new Set<() => void>();
let tunnelMaintenance = false;

export function beginTunnelMaintenance(callback: () => void): void {
  tunnelMaintenance = true;
  if (activeTunnels.size === 0) callback();
  else drainCallbacks.add(callback);
}

export function endTunnelMaintenance(): void {
  tunnelMaintenance = false;
}

function releaseTunnel(socket: object): void {
  activeTunnels.delete(socket);
  if (activeTunnels.size === 0) {
    for (const callback of drainCallbacks) callback();
    drainCallbacks.clear();
  }
}

export function realIpForPort(port: number): string | null {
  const entry = portToIp.get(port);
  return entry ? entry.ip : null;
}

function prunePortMap(): void {
  const now = Date.now();
  for (const [port, entry] of portToIp) {
    if (now - entry.ts > 300_000) portToIp.delete(port);
  }
}
setInterval(prunePortMap, 60_000).unref?.();

function clientIp(req: IncomingMessage): string {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length > 0) return fwd.split(",")[0].trim();
  return req.socket.remoteAddress || "";
}

function matchInbound(url: string | undefined): Inbound | null {
  if (!url) return null;
  const pathname = url.split("?")[0];
  const inbounds = listEnabledInbounds().filter(isPubliclyReachableInbound);
  for (const ib of inbounds) {
    if (pathname === ib.path || pathname.startsWith(ib.path + "/")) return ib;
  }
  return null;
}

const ipLimitCache = new Map<string, { limited: boolean; ts: number }>();

function ipAllowed(inbound: Inbound, ip: string): boolean {
  if (!ip) return true;
  const cacheKey = `${inbound.id}:${ip}`;
  const cached = ipLimitCache.get(cacheKey);
  const now = Date.now();
  if (cached && now - cached.ts < 15_000) return !cached.limited;

  const row = db
    .prepare(
      `SELECT u.id AS user_id, u.ip_limit AS ip_limit
       FROM users u
       JOIN user_inbounds ui ON ui.user_id = u.id
       WHERE ui.inbound_id = ? AND u.enabled = 1 AND u.ip_limit > 0`,
    )
    .all(inbound.id) as { user_id: number; ip_limit: number }[];

  if (row.length === 0) {
    ipLimitCache.set(cacheKey, { limited: false, ts: now });
    return true;
  }

  let limited = false;
  for (const r of row) {
    const active = db
      .prepare("SELECT ip FROM client_ips WHERE user_id = ? AND last_seen > ?")
      .all(r.user_id, now - 120_000) as { ip: string }[];
    const known = active.some((a) => a.ip === ip);
    if (!known && active.length >= r.ip_limit) {
      limited = true;
      break;
    }
  }
  ipLimitCache.set(cacheKey, { limited, ts: now });
  return !limited;
}

function pipeToXray(req: IncomingMessage, clientSocket: Socket, head: Buffer, inbound: Inbound) {
  activeTunnels.add(clientSocket);
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    releaseTunnel(clientSocket);
  };
  clientSocket.once("close", release);
  clientSocket.once("error", release);
  const realIp = clientIp(req);
  tunnelDebug("matched inbound", { protocol: inbound.protocol, transport: inbound.transport, port: inbound.port, method: req.method });
  const upstream = net.connect(inbound.port, "127.0.0.1", () => {
    if (realIp && upstream.localPort) {
      portToIp.set(upstream.localPort, { ip: realIp, ts: Date.now() });
    }
    const headers = [`${req.method} ${req.url} HTTP/${req.httpVersion}`];
    for (let i = 0; i < req.rawHeaders.length; i += 2) {
      headers.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`);
    }
    headers.push("\r\n");
    upstream.write(headers.join("\r\n"));
    if (head && head.length) upstream.write(head);
    clientSocket.pipe(upstream);
    upstream.pipe(clientSocket);
  });
  upstream.once("close", (hadError) => {
    release();
    tunnelDebug("xray upstream closed", { port: inbound.port, hadError, clientDestroyed: clientSocket.destroyed });
    // A TCP close without a FIN must not leave the public WebSocket hanging.
    if (!clientSocket.destroyed && !clientSocket.writableEnded) clientSocket.end();
  });
  clientSocket.once("close", (hadError) => {
    release();
    tunnelDebug("client tunnel closed", { port: inbound.port, hadError, upstreamDestroyed: upstream.destroyed });
    if (!upstream.destroyed) upstream.destroy();
  });
  const kill = (source: string, error?: Error) => {
    release();
    tunnelDebug("socket error", { source, port: inbound.port, code: (error as NodeJS.ErrnoException | undefined)?.code || "", message: error?.message || "" });
    upstream.destroy();
    clientSocket.destroy();
  };
  upstream.on("error", (error) => kill("xray-upstream", error));
  clientSocket.on("error", (error) => kill("client", error));
  upstream.on("connect", () => tunnelDebug("connected to xray inbound", { port: inbound.port }));
  upstream.on("end", () => tunnelDebug("xray upstream ended", { port: inbound.port }));
  clientSocket.on("end", () => tunnelDebug("client ended tunnel", { port: inbound.port }));
}

export function attachTunnel(server: Server): void {
  server.on("upgrade", (req, socket, head) => {
    if (tunnelMaintenance) {
      socket.end("HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\nRetry-After: 2\r\nContent-Length: 0\r\n\r\n");
      return;
    }
    const inbound = matchInbound(req.url);
    if (!inbound) {
      tunnelDebug("no inbound matched", { method: req.method, path: (req.url || "").split("?")[0] });
      socket.destroy();
      return;
    }
    if (!ipAllowed(inbound, clientIp(req))) {
      tunnelDebug("ip limit rejected upgrade", { inboundId: inbound.id });
      socket.destroy();
      return;
    }
    pipeToXray(req, socket as Socket, head, inbound);
  });
}

export function tryTunnelHttp(req: IncomingMessage, res: import("node:http").ServerResponse): boolean {
  if (tunnelMaintenance) {
    res.statusCode = 503;
    res.setHeader("Retry-After", "2");
    res.setHeader("Connection", "close");
    res.end();
    return true;
  }
  const inbound = matchInbound(req.url);
  if (!inbound || inbound.transport !== "xhttp") return false;
  if (!ipAllowed(inbound, clientIp(req))) {
    res.statusCode = 403;
    res.end();
    return true;
  }
  const token = {};
  activeTunnels.add(token);
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    releaseTunnel(token);
  };
  res.once("finish", release);
  res.once("close", release);
  req.once("aborted", release);
  xhttpProxy.web(req, res, { target: `http://127.0.0.1:${inbound.port}` });
  return true;
}
