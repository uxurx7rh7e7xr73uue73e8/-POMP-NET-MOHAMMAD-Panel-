import type { Inbound } from "./types.js";

/**
 * Railway's public ingress in this single-service deployment is HTTP(S)/WebSocket.
 * It does not provide a public UDP endpoint, and this project has not provisioned
 * a TCP Proxy for raw SOCKS/HTTP listeners. Keep those inbounds out of live
 * Xray configuration and client subscriptions while running on Railway.
 */
export function isRailwayRuntime(): boolean {
  return Boolean(
    process.env.RAILWAY_PROJECT_ID ||
    process.env.RAILWAY_ENVIRONMENT ||
    process.env.RAILWAY_SERVICE_ID,
  );
}

export function isPubliclyReachableInbound(inbound: Inbound): boolean {
  if (!isRailwayRuntime()) return true;
  return inbound.protocol !== "wireguard" &&
    inbound.protocol !== "socks" &&
    inbound.protocol !== "http";
}
