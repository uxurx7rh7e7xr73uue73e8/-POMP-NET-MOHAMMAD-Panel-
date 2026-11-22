# POMP NET NEXUS — WireGuard and Proxy Inbounds

## What is implemented

- `POMP-WIREGUARD`: native Xray WireGuard inbound over UDP. Each active user assigned to this inbound receives a distinct Curve25519 key pair, pre-shared key, and non-overlapping `10.77.0.x/32` address.
- `POMP-SOCKS5-AUTH`: SOCKS5 inbound with per-user username/password authentication.
- `POMP-HTTP-PROXY-AUTH`: HTTP proxy inbound with per-user username/password authentication.
- WireGuard client credentials are encrypted at rest with AES-256-GCM using the panel's persistent JWT secret. Keep the data volume and JWT secret persistent; losing either invalidates saved WireGuard keys.

## Client compatibility

The WireGuard subscription URI uses the `wireguard://` format understood by v2rayNG builds that include its WireGuard profile parser. The normal VLESS/VMess/Trojan links remain unchanged.

## Required VPS networking

These inbounds listen directly on their assigned Xray ports. They do not pass through an HTTP reverse proxy.

With the default fresh-install seed order and `XRAY_INBOUND_BASE_PORT=20000`:
- WireGuard: UDP 20011
- SOCKS5: TCP 20012
- HTTP proxy: TCP 20013

Always confirm the actual port in the panel; existing databases or custom inbounds can change the allocated port.

On an Ubuntu VPS using UFW, open only the ports actually used:
```bash
sudo ufw allow 20011/udp
sudo ufw allow 20012/tcp
sudo ufw allow 20013/tcp
sudo ufw status
```

If running the container with Docker bridge networking, publish the same ports with `-p HOST_PORT:CONTAINER_PORT/udp` or `/tcp`. Host networking is another option on a dedicated Linux VPS. Dockerfile `EXPOSE` metadata alone does not publish ports.

Set `XRAY_VERSION=v26.11.9` or newer and keep `SIDERAIL_DATA_DIR` on persistent storage. Set the panel's clean/public address to the VPS public IP or a DNS-only hostname. A Cloudflare orange-cloud HTTP proxy is not a WireGuard UDP endpoint.

## Railway limitation

Railway public domains expose HTTP/HTTPS. Railway TCP Proxy exposes raw TCP, not public UDP. Railway private networking supports UDP only between services inside the same Railway environment. Therefore the WireGuard inbound cannot be reached by external phones through a normal Railway public domain; deploy the Xray service on a VPS with public UDP access for WireGuard. Railway TCP Proxy can expose one raw TCP port per service instance, but does not make the UDP WireGuard port public.

## Security notes

SOCKS5 and HTTP proxy authentication in this implementation is not TLS-wrapped. Usernames and passwords can be exposed on an untrusted network. Do not publish these two proxy ports to the public internet until they are protected by a trusted encrypted transport or restricted by firewall to trusted source IPs. WireGuard itself is encrypted.

## Verification status

The CI workflow checks Xray startup, TCP listeners, the WireGuard UDP socket, and generated subscription schemes. These checks are not a substitute for connecting a real Android phone over a separate network and testing traffic, DNS, IPv4/IPv6, expiry, and quota enforcement.
