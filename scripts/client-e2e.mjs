#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { spawn, spawnSync } from "node:child_process";

const [subscriptionFile, xrayBinary] = process.argv.slice(2);
if (!subscriptionFile || !xrayBinary) {
  console.error("Usage: node scripts/client-e2e.mjs <subscription.txt> <xray-binary>");
  process.exit(2);
}
const lines = fs.readFileSync(subscriptionFile, "utf8").trim().split(/\\r?\\n/);
const decodeBase64 = (value) => Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
const vmess = lines.find((line) => line.startsWith("vmess://"));
const trojan = lines.find((line) => line.startsWith("trojan://"));
const vless = lines.find((line) => line.startsWith("vless://") && new URL(line).searchParams.get("type") === "ws");
if (!vmess || !trojan || !vless) throw new Error("Subscription must contain VMess/WS, Trojan/WS and VLESS/WS links");

const vm = JSON.parse(decodeBase64(vmess.slice("vmess://".length)));
const vl = new URL(vless);
const tr = new URL(trojan);
const protocols = [
  {
    name: "VLESS",
    outbound: {
      protocol: "vless",
      settings: { vnext: [{ address: "127.0.0.1", port: 18080, users: [{ id: vl.username, encryption: "none" }] }] },
      streamSettings: { network: "ws", security: "none", wsSettings: { path: vl.searchParams.get("path"), headers: { Host: vl.searchParams.get("host") || "localhost" } } },
    },
  },
  {
    name: "VMess",
    outbound: {
      protocol: "vmess",
      settings: { vnext: [{ address: "127.0.0.1", port: 18080, users: [{ id: vm.id, alterId: Number(vm.aid || 0), security: vm.scy || "auto" }] }] },
      streamSettings: { network: "ws", security: "none", wsSettings: { path: vm.path, headers: { Host: vm.host || "localhost" } } },
    },
  },
  {
    name: "Trojan",
    outbound: {
      protocol: "trojan",
      settings: { servers: [{ address: "127.0.0.1", port: 18080, password: decodeURIComponent(tr.password) }] },
      streamSettings: { network: "ws", security: "none", wsSettings: { path: tr.searchParams.get("path"), headers: { Host: tr.searchParams.get("host") || "localhost" } } },
    },
  },
];

function waitForPort(port, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const attempt = () => {
      const socket = net.createConnection({ host: "127.0.0.1", port });
      socket.once("connect", () => { socket.destroy(); resolve(); });
      socket.once("error", () => {
        socket.destroy();
        if (Date.now() >= deadline) reject(new Error("Xray local SOCKS listener did not start"));
        else setTimeout(attempt, 150);
      });
    };
    attempt();
  });
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pompnet-client-e2e-"));
try {
  for (let i = 0; i < protocols.length; i++) {
    const item = protocols[i];
    const socksPort = 10981 + i;
    const configPath = path.join(dir, `${item.name.toLowerCase()}.json`);
    const config = {
      log: { loglevel: "warning" },
      inbounds: [{ listen: "127.0.0.1", port: socksPort, protocol: "socks", settings: { auth: "noauth", udp: false } }],
      outbounds: [item.outbound, { protocol: "freedom", tag: "direct" }],
    };
    fs.writeFileSync(configPath, JSON.stringify(config));
    const validation = spawnSync(xrayBinary, ["run", "-test", "-config", configPath], { encoding: "utf8", timeout: 10000 });
    if (validation.status !== 0) throw new Error(`${item.name} client config invalid: ${validation.stderr || validation.stdout}`);
    const child = spawn(xrayBinary, ["run", "-config", configPath], { stdio: ["ignore", "pipe", "pipe"] });
    let diagnostics = "";
    child.stdout.on("data", (chunk) => { diagnostics = (diagnostics + chunk).slice(-4000); });
    child.stderr.on("data", (chunk) => { diagnostics = (diagnostics + chunk).slice(-4000); });
    try {
      await waitForPort(socksPort);
      const probe = spawnSync("curl", [
        "--silent", "--show-error", "--fail", "--connect-timeout", "10", "--max-time", "30",
        "--socks5-hostname", `127.0.0.1:${socksPort}`, "https://example.com/",
        "--output", path.join(dir, "response.html"), "--write-out", "%{http_code}",
      ], { encoding: "utf8", timeout: 35000 });
      if (probe.status !== 0 || probe.stdout.trim() !== "200") {
        throw new Error(`${item.name} end-to-end internet probe failed: ${probe.stderr || probe.stdout || diagnostics}`);
      }
      const body = fs.readFileSync(path.join(dir, "response.html"), "utf8");
      if (!body.includes("Example Domain")) throw new Error(`${item.name} proxy returned unexpected page content`);
      console.log(`${item.name}/WS authenticated client -> Railway-style HTTP ingress -> Xray -> public HTTPS passed.`);
    } finally {
      child.kill("SIGTERM");
      await new Promise((resolve) => {
        if (child.exitCode !== null) resolve();
        else { child.once("exit", resolve); setTimeout(() => { child.kill("SIGKILL"); resolve(); }, 2000).unref(); }
      });
    }
  }
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
