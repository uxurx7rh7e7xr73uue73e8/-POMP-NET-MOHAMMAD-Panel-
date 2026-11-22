/**
 * POMP NET MOHAMMAD — sing-box runtime for native Hysteria2 and TUIC UDP inbounds.
 * Uses the upstream sing-box engine; these protocols are never passed to Xray-core.
 */
import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { config } from "./config.js";
import { listEnabledInbounds } from "./inbounds.js";
import { listUsers, isUserActive } from "./users.js";

let proc: ChildProcess | null = null;
let restartTimer: NodeJS.Timeout | null = null;
let startedAt = 0;
let lastError = "";

function udpInbounds() {
  return listEnabledInbounds().filter((inbound) => inbound.protocol === "hysteria2" || inbound.protocol === "tuic");
}

function serverName(inbound: ReturnType<typeof udpInbounds>[number]): string {
  return inbound.host.trim() || config.publicDomain;
}

export function singBoxSetupError(host = config.publicDomain): string | null {
  if (process.env.RAILWAY_PROJECT_ID || process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_SERVICE_ID) {
    return "Public UDP is unavailable on Railway. Deploy Hysteria2/TUIC on a UDP-capable node.";
  }
  if (!config.singBoxTlsCert || !config.singBoxTlsKey) return "Set SINGBOX_TLS_CERT_FILE and SINGBOX_TLS_KEY_FILE before creating Hysteria2/TUIC inbounds.";
  if (!fs.existsSync(config.singBoxTlsCert) || !fs.existsSync(config.singBoxTlsKey)) return "The configured sing-box TLS certificate or private-key file does not exist.";
  if (!host.trim()) return "Set PUBLIC_DOMAIN or provide a TLS server name for this inbound.";
  const bin = spawnSync(config.singBoxBin, ["version"], { encoding: "utf8", timeout: 5000 });
  if (bin.error || bin.status !== 0) return `sing-box executable is unavailable: ${bin.error?.message || bin.stderr || "version check failed"}`;
  return null;
}

export function buildSingBoxServerConfig() {
  const inbounds = udpInbounds();
  if (!inbounds.length) return null;
  const users = listUsers();
  const generated = inbounds.map((inbound) => {
    const host = serverName(inbound);
    const clients = users.filter((user) => isUserActive(user) && user.inbound_ids.includes(inbound.id));
    const tls = {
      enabled: true,
      certificate_path: config.singBoxTlsCert,
      key_path: config.singBoxTlsKey,
      alpn: inbound.protocol === "tuic" ? ["h3"] : undefined,
    };
    if (inbound.protocol === "hysteria2") {
      return {
        type: "hysteria2",
        tag: inbound.tag,
        listen: "::",
        listen_port: inbound.port,
        users: clients.map((client) => ({ name: client.email, password: client.password })),
        tls,
      };
    }
    return {
      type: "tuic",
      tag: inbound.tag,
      listen: "::",
      listen_port: inbound.port,
      users: clients.map((client) => ({ name: client.email, uuid: client.uuid, password: client.password })),
      congestion_control: "bbr",
      zero_rtt_handshake: false,
      tls,
    };
  });
  return {
    log: { level: "warn", output: path.join(config.xrayDir, "sing-box.log"), timestamp: true },
    inbounds: generated,
    outbounds: [{ type: "direct", tag: "direct" }],
    route: { final: "direct", auto_detect_interface: true },
  };
}

function configPath(): string {
  return path.join(config.xrayDir, "sing-box-server.json");
}

function stop(): void {
  if (!proc) return;
  const old = proc;
  proc = null;
  old.kill("SIGTERM");
  setTimeout(() => { if (old.exitCode === null) old.kill("SIGKILL"); }, 5000).unref();
}

export function singBoxStatus() {
  return {
    running: !!proc && proc.exitCode === null && !proc.killed,
    uptime: proc && startedAt ? Math.floor((Date.now() - startedAt) / 1000) : 0,
    inbounds: udpInbounds().length,
    version: process.env.SING_BOX_VERSION || "1.14.4",
    error: lastError,
  };
}

export function startSingBox(): void {
  const inbounds = udpInbounds();
  if (!inbounds.length) {
    stop();
    lastError = "";
    return;
  }
  const host = inbounds.every((inbound) => !!serverName(inbound));
  const setupError = singBoxSetupError(host ? serverName(inbounds[0]) : "");
  if (setupError) {
    lastError = setupError;
    console.error("[POMP NET sing-box]", setupError);
    return;
  }
  const cfg = buildSingBoxServerConfig();
  if (!cfg) { stop(); return; }
  const file = configPath();
  const temp = file + ".next";
  fs.writeFileSync(temp, JSON.stringify(cfg, null, 2), { mode: 0o600 });
  const check = spawnSync(config.singBoxBin, ["check", "-c", temp], { encoding: "utf8", timeout: 20000 });
  if (check.status !== 0) {
    fs.rmSync(temp, { force: true });
    lastError = (check.stderr || check.stdout || "sing-box config validation failed").slice(0, 1200);
    console.error("[POMP NET sing-box config]", lastError);
    return;
  }
  fs.renameSync(temp, file);
  stop();
  const child = spawn(config.singBoxBin, ["run", "-c", file], { cwd: config.xrayDir, stdio: "ignore" });
  proc = child;
  startedAt = Date.now();
  lastError = "";
  child.on("error", (error) => {
    if (proc === child) proc = null;
    lastError = error.message;
    console.error("[POMP NET sing-box process]", error.message);
  });
  child.on("exit", (code, signal) => {
    if (proc === child) proc = null;
    if (code !== 0 && code !== null) {
      lastError = `sing-box exited with code ${code} (${signal || "no signal"})`;
      console.error("[POMP NET sing-box]", lastError);
    }
  });
}

export function restartSingBox(): void {
  if (restartTimer) clearTimeout(restartTimer);
  restartTimer = setTimeout(() => {
    restartTimer = null;
    startSingBox();
  }, 900);
}
