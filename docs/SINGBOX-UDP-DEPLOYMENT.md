# Native Hysteria2 and TUIC deployment

POMP NET uses the upstream sing-box engine for Hysteria2 and TUIC. Xray-core does not receive these inbound types.

## Requirements

- A Linux/Docker host with public UDP ingress.
- A DNS name whose A/AAAA records point to that host.
- A valid TLS certificate and private key whose SAN includes the hostname entered as the inbound TLS/SNI name.
- The production image containing sing-box v1.14.4.
- A firewall rule allowing the selected UDP listener ports. Docker `EXPOSE` does not open host/provider firewalls.

## Environment

Mount the certificate directory read-only into the container and set:

```env
SING_BOX_BIN=/usr/local/bin/sing-box
SING_BOX_VERSION=1.14.4
SINGBOX_TLS_CERT_FILE=/run/pompnet-certs/fullchain.pem
SINGBOX_TLS_KEY_FILE=/run/pompnet-certs/privkey.pem
PUBLIC_DOMAIN=vpn.example.com
```

Keep the private key outside the Git repository. Do not paste certificate private keys into the panel UI or commit them.

## Create the inbounds

1. Deploy/restart the container with the certificate paths configured.
2. Open **Inbounds** and select Hysteria2 or TUIC. Those options stay disabled until the sing-box binary and certificate files are detected.
3. Enter the TLS/SNI hostname covered by the certificate.
4. Create the inbound. The panel stores it in SQLite, builds a native sing-box config, runs `sing-box check`, and starts/restarts the sing-box process.
5. Open the inbound's UDP port on the host and provider firewalls.
6. Confirm `/healthz` reports `singBox.running: true` and `singBox.inbounds` matches the configured UDP inbound count.
7. Import a generated subscription into a client that supports Hysteria2/TUIC and test from an external network.

## Platform limits

- Railway's public edge does not provide UDP ingress. The panel rejects Hysteria2/TUIC creation in Railway runtime and does not publish these subscription links there.
- The remote node agent currently manages WireGuard UDP inbounds only. It does not yet install or run sing-box on remote nodes.
- A green Docker CI check validates the sing-box config, local UDP listeners and URI generation. It does not prove that a public firewall, DNS record, certificate chain or phone connection is correct.
