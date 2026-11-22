import type { Inbound } from "./types.js";

export interface PublicTcpProxyEndpoint {
  host: string;
  port: number;
}

function positivePort(value: string | undefined): number | null {
  if (!value) return null;
  const port = Number(value);
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : null;
}

export function isRailwayRuntime(): boolean {
  return Boolean(
    process.env.RAILWAY_PROJECT_ID ||
    process.env.RAILWAY_ENVIRONMENT ||
    process.env.RAILWAY_SERVICE_ID,
  );
}

/**
 * Railway's HTTP edge supports the panel and its HTTP/WebSocket transports.
 * A raw TCP inbound is public only after a Railway TCP Proxy has been created
 * for that exact internal port and its generated public endpoint is configured.
 * Set these variables only after creating that mapping in Railway:
 *   RAILWAY_TCP_PROXY_INTERNAL_PORT
 *   PUBLIC_TCP_PROXY_HOST
 *   PUBLIC_TCP_PROXY_PORT
 */
export function getPublicTcpProxyEndpoint(inbound: Inbound): PublicTcpProxyEndpoint | null {
  if (!isRailwayRuntime() || (inbound.protocol !== "socks" && inbound.protocol !== "http")) return null;
  const internalPort = positivePort(process.env.RAILWAY_TCP_PROXY_INTERNAL_PORT);
  const publicPort = positivePort(process.env.PUBLIC_TCP_PROXY_PORT);
  const host = (process.env.PUBLIC_TCP_PROXY_HOST || "").trim();
  if (!internalPort || inbound.port !== internalPort || !publicPort || !host) return null;
  return { host, port: publicPort };
}

export function isPubliclyReachableInbound(inbound: Inbound): boolean {
  const railway = isRailwayRuntime();
  if (inbound.protocol === "wireguard") return !railway;
  if (inbound.protocol === "hysteria2" || inbound.protocol === "tuic") {
    return !railway && Boolean(process.env.SINGBOX_TLS_CERT_FILE && process.env.SINGBOX_TLS_KEY_FILE);
  }
  if (!railway) return true;
  if (inbound.protocol === "socks" || inbound.protocol === "http") {
    return getPublicTcpProxyEndpoint(inbound) !== null;
  }
  return true;
}

export function getRuntimeCapabilities() {
  const railway = isRailwayRuntime();
  const internalPort = positivePort(process.env.RAILWAY_TCP_PROXY_INTERNAL_PORT);
  const publicPort = positivePort(process.env.PUBLIC_TCP_PROXY_PORT);
  const publicHost = (process.env.PUBLIC_TCP_PROXY_HOST || "").trim();
  const tcpProxyConfigured = Boolean(railway && internalPort && publicPort && publicHost);
  return {
    platform: railway ? "railway" as const : "self-hosted" as const,
    railway,
    railwayReplica: {
      id: railway ? (process.env.RAILWAY_REPLICA_ID || null) : null,
      region: railway ? (process.env.RAILWAY_REPLICA_REGION || null) : null,
      note: "Identifies this running replica only; it does not create extra regions or public UDP endpoints.",
    },
    tcpProxy: {
      configured: tcpProxyConfigured,
      internalPort: tcpProxyConfigured ? internalPort : null,
      publicHost: tcpProxyConfigured ? publicHost : null,
      publicPort: tcpProxyConfigured ? publicPort : null,
      note: "A Railway TCP Proxy exposes one internal TCP port per service instance.",
    },
    wireguardPublicUdp: !railway,
    publicUdpProtocols: !railway,
  };
}
