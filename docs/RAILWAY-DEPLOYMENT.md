# POMP NET MOHAMMAD — Railway deployment guide

This guide describes the actual network boundary of the current implementation. It deliberately does not advertise protocols that Railway cannot expose publicly.

## Supported deployment shape

- One Railway service runs the Node.js panel/API and Xray-core in the same container.
- Public panel and subscription traffic enters through Railway HTTPS on the configured HTTP port (8080).
- VLESS/WS, VMess/WS and Trojan/WS are routed through the HTTP Upgrade handler to Xray's loopback listeners.
- VLESS/XHTTP is routed through the HTTP proxy handler to its loopback Xray listener.
- Xray's inbound ports are internal to the container. Do not create public domains for each inbound port.
- Attach a Railway Volume at `/data`. Without persistent storage, SQLite users/settings and the generated JWT secret may be lost on redeploy/restart.

## Railway networking limits

Railway public networking supports HTTP/HTTPS and WebSockets, and offers one public TCP Proxy per service instance. Its public TCP Proxy is TCP-only; it does not expose UDP. The app can publish one selected SOCKS5 or HTTP inbound through that TCP Proxy when the exact internal/public endpoint is configured.

Therefore:

- Native public WireGuard is **not supported** by this single-service Railway deployment. When Railway runtime environment variables are detected, the app now omits WireGuard from the generated Xray runtime config and client subscriptions. Existing inbound records and peer data are retained; they are not deleted. A UDP listener inside the container or a successful Docker smoke test does not make it reachable from a phone on the public internet.
- SOCKS5 and raw HTTP proxy listeners are TCP services, not HTTP websites. Railway allows only one TCP Proxy per service instance, so only one of the panel's raw TCP inbounds can be published at a time. Existing SOCKS5/HTTP records are retained, but they are omitted from Xray runtime config and subscriptions unless the selected inbound's internal port matches the configured TCP Proxy mapping. After creating the TCP Proxy in Railway, set `RAILWAY_TCP_PROXY_INTERNAL_PORT` to its internal port, `PUBLIC_TCP_PROXY_HOST` to the generated proxy hostname, and `PUBLIC_TCP_PROXY_PORT` to its generated public port. The app then emits the correct public endpoint only for the matching inbound.
- Railway private networking can carry UDP between Railway services, but it is not a public UDP endpoint for end-user VPN clients.
- Do not use Docker `EXPOSE` as proof of public reachability. It is image metadata only.

Official references:
- https://docs.railway.com/networking/tcp-proxy
- https://docs.railway.com/networking/public-networking/specs-and-limits
- https://docs.railway.com/networking/private-networking/how-it-works

## Deploy

1. Push the `pompnet-quantum-redesign` branch to GitHub.
2. In Railway, create a project and deploy this GitHub repository using the Dockerfile builder.
3. In the service settings, generate an HTTPS domain for the web service and expose container port `8080`.
4. Add a Volume mounted at `/data`.
5. Set `NODE_ENV=production`, `PORT=8080`, and a long random `JWT_SECRET`. Keep `SIDERAIL_DATA_DIR=/data`. Do not set TCP Proxy variables until the TCP Proxy actually exists and its port mapping is confirmed.
6. Deploy and wait for `/healthz` to return HTTP 200 with `ok: true` and `xray: true`.
7. Open the generated domain and complete the one-time Owner setup. Use a unique password; do not reuse a password from another service.
8. (Optional) To publish one SOCKS5 or HTTP inbound, select its internal port, create a Railway TCP Proxy for that exact port, then set `RAILWAY_TCP_PROXY_INTERNAL_PORT`, `PUBLIC_TCP_PROXY_HOST`, and `PUBLIC_TCP_PROXY_PORT` from the Railway-generated mapping. Only that matching inbound will be included in subscriptions. Do not set these variables before the TCP Proxy exists.
9. Verify that users, settings and login survive a redeploy before adding real customers.

## What CI proves (and does not prove)

The CI workflow now has two separate paths:
- A non-Railway Docker smoke test for the general Xray inbound implementation.
- A Railway-mode smoke test that verifies WireGuard is omitted, only the selected TCP-proxy-mapped SOCKS/HTTP inbound is exported, and the generated proxy URI uses the configured public TCP endpoint.

The Railway-mode test uses simulated Railway environment variables inside GitHub Actions. It verifies application logic, **not** the existence of a real Railway TCP Proxy or public internet reachability. A successful CI run still does not prove that a phone can connect. End-to-end tests from a real client against the deployed Railway domain and, if enabled, the generated TCP Proxy endpoint are required. Do not describe the CI UDP socket check as public UDP support.

## Go-live checklist

- [ ] Confirm the source license/authorization in writing and retain any required attribution.
- [ ] Deploy with a persistent Volume at `/data`.
- [ ] Set a stable `JWT_SECRET` and Telegram bot token only if Telegram integration is enabled.
- [ ] Confirm `/healthz` is healthy after deployment and after a restart.
- [ ] Create a test user and verify create/disable/renew/delete behavior.
- [ ] Import the subscription into a real supported client and test on mobile data and Wi-Fi.
- [ ] Verify traffic counters increase during real traffic.
- [ ] Verify expired users/inbounds stop receiving usable subscription entries.
- [ ] Export a backup and test restore in a non-production environment.
- [ ] Do not advertise WireGuard as a public Railway feature. Advertise only the one SOCKS5 or HTTP inbound whose TCP Proxy mapping and real client connection have been verified.

A green CI run is necessary, but it is not a substitute for a live Railway deployment and real-client connection tests.
