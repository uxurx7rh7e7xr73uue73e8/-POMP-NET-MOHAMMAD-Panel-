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

Railway public networking supports HTTP/HTTPS and WebSockets, and offers one public TCP Proxy per service instance. Its public TCP Proxy is TCP-only; it does not expose UDP.

Therefore:

- Native public WireGuard is **not supported** by this single-service Railway deployment. A UDP listener inside the container or a successful Docker smoke test does not make it reachable from a phone on the public internet.
- SOCKS5 and raw HTTP proxy listeners are TCP services, not HTTP websites. They need a dedicated TCP Proxy. Railway allows only one TCP Proxy per service instance, so do not expose several separate SOCKS/HTTP inbound ports from this one service or generate public links for ports that are not actually mapped.
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
5. Set `NODE_ENV=production`, `PORT=8080`, and a long random `JWT_SECRET`. Keep `SIDERAIL_DATA_DIR=/data`.
6. Deploy and wait for `/healthz` to return HTTP 200 with `ok: true` and `xray: true`.
7. Open the generated domain and complete the one-time Owner setup. Use a unique password; do not reuse a password from another service.
8. Verify that users, settings and login survive a redeploy before adding real customers.

## What CI currently proves

The latest successful GitHub Actions run on this branch (commit `fdcbc6347f11fa43df916d686e41c69334671767`) completed:
- TypeScript typecheck
- Production web/server build
- Production Docker image build
- Container startup
- API health and live Xray process
- Initial owner setup and authenticated `/api/me`
- Local Xray TCP listeners and a local UDP socket-table check
- Subscription output containing WireGuard/SOCKS/HTTP URI schemes

Important: the UDP socket-table test only proves that a UDP socket exists inside the CI container. It does **not** prove Railway public UDP reachability. Likewise, checking generated URI schemes does not prove a phone can connect to them. End-to-end tests from a real client and from the deployed Railway domain are still required.

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
- [ ] Do not advertise WireGuard, SOCKS5 or raw HTTP proxy as public Railway features unless their actual public network path has been provisioned and tested.

A green CI run is necessary, but it is not a substitute for a live Railway deployment and real-client connection tests.
