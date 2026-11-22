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
2. Open **Inbounds** and select Hysteria2 or TUIC. On a self-hosted controller, those options require the local sing-box binary and certificate files. On Railway, provide the TLS/SNI hostname; public UDP will be served only after assigning the inbound to an authenticated remote node.
3. Enter the TLS/SNI hostname covered by the certificate.
4. Create the inbound. A self-hosted controller builds and validates a local sing-box config. For Railway, open **Node Manager**, register a UDP-capable Linux node, assign the Hysteria2/TUIC inbounds, and install the node agent; it installs sing-box v1.14.4, applies the node-local certificate/key, validates the config and supervises the process.
5. Open the inbound's UDP port on the actual serving host (controller or remote node) and provider firewalls.
6. For local self-hosted mode, confirm `/healthz` reports `singBox.running: true`. For remote-node mode, confirm the assigned node reports Online in **Node Manager** and has no agent error.
7. Import a generated subscription into a client that supports Hysteria2/TUIC and test from an external network.

## Platform limits

- Railway's public edge does not provide UDP ingress. The panel can store Hysteria2/TUIC inbounds on Railway and route their subscription links to a healthy assigned UDP-capable remote node; it never claims that Railway itself serves UDP.
- The remote node agent supports Xray protocols and installs/supervises sing-box v1.14.4 for Hysteria2/TUIC. The node must have public UDP reachability and a certificate SAN covering the configured SNI hostnames.
- A green Docker CI check validates the sing-box config, local UDP listeners and URI generation. It does not prove that a public firewall, DNS record, certificate chain or phone connection is correct.
