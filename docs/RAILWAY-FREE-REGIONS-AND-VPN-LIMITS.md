# Railway Free plan: real region and VPN limits

POMP NET reports the actual Railway replica region from `RAILWAY_REPLICA_REGION` and replica identity from `RAILWAY_REPLICA_ID`. These values describe the instance Railway actually started; the panel never fabricates a region list.

## What the permanent Free plan provides

According to Railway's current Free-plan documentation:

- One project with up to three services.
- One replica per service (up to 0.5 GB RAM per service).
- No region selection on the permanent Free plan; Railway chooses the region.
- Services sleep after roughly 5–10 minutes without outbound activity.
- $1 of usage credit per month; services stop when the credit is exhausted.

The initial 30-day Trial is temporary and has different limits. Do not build a permanent multi-region design around trial-only features.

## Edge locations are not VPN nodes

Railway Edge POPs are ingress points. They receive traffic and forward it to the service's deployment region; they are not independent compute instances with their own VPN listener, UDP socket, or public IP.

A permanent Free workspace cannot turn all Railway locations into separate VPN nodes. Multi-region replicas and region selection require an eligible paid/trial plan, and this application currently uses SQLite on a local data volume. Multiple independent replicas must not be enabled until the database and session state are moved to a shared, multi-instance-safe architecture.

## Protocol reality

- VLESS/VMess/Trojan over HTTP/WebSocket can use Railway's HTTP edge.
- Public UDP listeners are not provided by Railway's ordinary HTTP service ingress. WireGuard, Hysteria2, and TUIC cannot be advertised as direct Railway UDP endpoints.
- A TCP Proxy is not a UDP proxy.
- A generated subscription link is not proof of a working connection. CI now performs protocol-client round-trip tests for VLESS/WS, VMess/WS, Trojan/WS, Hysteria2 and TUIC against real Xray/sing-box processes. A physical Android import and mobile-network test still must be performed separately.

Never register an Edge POP or an unstarted replica as a healthy node.
