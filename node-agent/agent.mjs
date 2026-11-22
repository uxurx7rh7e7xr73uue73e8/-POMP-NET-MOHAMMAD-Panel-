#!/usr/bin/env node
/**
 * POMP NET MOHAMMAD — QUANTUM NEXUS remote node agent.
 * Requires Node.js >= 22 and an installed Xray-core binary.
 * The controller token is read only from the process environment.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { spawn, spawnSync } from "node:child_process";

const required = ["POMP_CONTROLLER_URL", "POMP_NODE_TOKEN"];
for (const key of required) {
  if (!process.env[key]) {
    console.error(`[POMP NODE] Missing required environment variable: ${key}`);
    process.exit(1);
  }
}
const controller = process.env.POMP_CONTROLLER_URL.replace(/\/+$/, "");
if (!controller.startsWith("https://") && !["localhost", "127.0.0.1"].includes(new URL(controller).hostname)) {
  console.error("[POMP NODE] Controller URL must use HTTPS.");
  process.exit(1);
}
const token = process.env.POMP_NODE_TOKEN;
const xrayBin = process.env.XRAY_BIN || "/usr/local/bin/xray";
const singBoxBin = process.env.SING_BOX_BIN || "/usr/local/bin/sing-box";
const dataDir = process.env.POMP_NODE_DATA_DIR || "/var/lib/pompnet-node";
const configFile = path.join(dataDir, "config.json");
const singBoxConfigFile = path.join(dataDir, "sing-box.json");
const pollMs = Math.max(10000, Number(process.env.POMP_NODE_POLL_MS || 30000));
const agentVersion = "1.0.0";
let child = null;
let xrayExpected = false;
let singBoxChild = null;
let singBoxExpected = false;
let currentSingBoxHash = "";
let currentHash = "";
let stopping = false;

fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

async function request(route, options = {}) {
  const response = await fetch(controller + route, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`${route}: HTTP ${response.status} ${(await response.text()).slice(0, 300)}`);
  return response.json();
}

function stopXray() {
  if (!child) return Promise.resolve();
  const old = child;
  child = null;
  return new Promise(resolve => {
    if (old.exitCode !== null) return resolve();
    const timer = setTimeout(() => {
      if (old.exitCode === null) old.kill("SIGKILL");
      resolve();
    }, 5000);
    timer.unref();
    old.once("exit", () => { clearTimeout(timer); resolve(); });
    old.kill("SIGTERM");
  });
}

function stopSingBox() {
  if (!singBoxChild) return Promise.resolve();
  const old = singBoxChild;
  singBoxChild = null;
  return new Promise(resolve => {
    if (old.exitCode !== null) return resolve();
    const timer = setTimeout(() => {
      if (old.exitCode === null) old.kill("SIGKILL");
      resolve();
    }, 5000);
    timer.unref();
    old.once("exit", () => { clearTimeout(timer); resolve(); });
    old.kill("SIGTERM");
  });
}

async function startSingBox(source) {
  const inbounds = source?.inbounds || [];
  if (!inbounds.length) {
    singBoxExpected = false;
    currentSingBoxHash = "";
    await stopSingBox();
    return;
  }
  const cert = process.env.POMP_NODE_TLS_CERT_FILE || "";
  const key = process.env.POMP_NODE_TLS_KEY_FILE || "";
  if (!cert || !key || !fs.existsSync(cert) || !fs.existsSync(key)) {
    throw new Error("Hysteria2/TUIC node inbounds require valid POMP_NODE_TLS_CERT_FILE and POMP_NODE_TLS_KEY_FILE.");
  }
  if (!fs.existsSync(singBoxBin)) throw new Error(`sing-box binary not found at ${singBoxBin}; install sing-box v1.14.4.`);
  const cfg = structuredClone(source);
  cfg.log = { ...(cfg.log || {}), output: path.join(dataDir, "sing-box.log") };
  for (const inbound of cfg.inbounds) {
    inbound.tls = { ...(inbound.tls || {}), enabled: true, certificate_path: cert, key_path: key };
  }
  const serialized = JSON.stringify(cfg);
  const hash = sha256(serialized);
  singBoxExpected = true;
  if (hash === currentSingBoxHash && singBoxChild && singBoxChild.exitCode === null) return;
  const temp = singBoxConfigFile + ".next";
  fs.writeFileSync(temp, JSON.stringify(cfg, null, 2), { mode: 0o600 });
  const check = spawnSync(singBoxBin, ["check", "-c", temp], { encoding: "utf8", timeout: 20000 });
  if (check.status !== 0) {
    fs.rmSync(temp, { force: true });
    throw new Error(`sing-box config validation failed: ${(check.stderr || check.stdout || "unknown error").slice(0, 700)}`);
  }
  fs.renameSync(temp, singBoxConfigFile);
  await stopSingBox();
  const proc = spawn(singBoxBin, ["run", "-c", singBoxConfigFile], { cwd: dataDir, stdio: "inherit" });
  singBoxChild = proc;
  proc.on("error", error => { if (singBoxChild === proc) singBoxChild = null; console.error("[POMP NODE] sing-box spawn error:", error.message); });
  proc.on("exit", (code, signal) => {
    if (singBoxChild === proc) singBoxChild = null;
    if (!stopping) console.error(`[POMP NODE] sing-box exited (code=${code}, signal=${signal}). Next poll will retry.`);
  });
  await new Promise((resolve, reject) => {
    let settled = false;
    proc.once("error", error => { if (!settled) { settled = true; reject(error); } });
    proc.once("exit", (code, signal) => { if (!settled) { settled = true; reject(new Error(`sing-box exited during startup (code=${code}, signal=${signal})`)); } });
    proc.once("spawn", () => {
      setTimeout(() => {
        if (!settled) {
          settled = true;
          if (proc.exitCode !== null) reject(new Error(`sing-box exited during startup (code=${proc.exitCode})`));
          else resolve();
        }
      }, 500);
    });
  });
  currentSingBoxHash = hash;
}

async function startXray() {
  if (!fs.existsSync(xrayBin)) throw new Error(`Xray binary not found at ${xrayBin}; install Xray-core and set XRAY_BIN.`);
  const test = spawnSync(xrayBin, ["run", "-test", "-config", configFile], { encoding: "utf8", timeout: 20000 });
  if (test.status !== 0) throw new Error(`Xray config validation failed: ${(test.stderr || test.stdout || "unknown error").slice(0, 700)}`);
  const proc = spawn(xrayBin, ["run", "-config", configFile], { stdio: "inherit", detached: false });
  child = proc;
  proc.on("error", error => { if (child === proc) child = null; console.error("[POMP NODE] Xray spawn error:", error.message); });
  proc.on("exit", (code, signal) => {
    if (child === proc) child = null;
    if (!stopping) console.error(`[POMP NODE] Xray exited (code=${code}, signal=${signal}). Next poll will retry.`);
  });
  await new Promise((resolve, reject) => {
    let settled = false;
    proc.once("error", error => { if (!settled) { settled = true; reject(error); } });
    proc.once("exit", (code, signal) => { if (!settled) { settled = true; reject(new Error(`Xray exited during startup (code=${code}, signal=${signal})`)); } });
    proc.once("spawn", () => {
      setTimeout(() => {
        if (!settled) {
          settled = true;
          if (proc.exitCode !== null) reject(new Error(`Xray exited during startup (code=${proc.exitCode})`));
          else resolve();
        }
      }, 500);
    });
  });
}

function prepareNodeConfig(source) {
  const cfg = structuredClone(source);
  const cert = process.env.POMP_NODE_TLS_CERT_FILE || "";
  const key = process.env.POMP_NODE_TLS_KEY_FILE || "";
  for (const inbound of cfg.inbounds || []) {
    if (inbound.tag === "api" || ["wireguard", "socks", "http"].includes(inbound.protocol)) continue;
    if (!cert || !key || !fs.existsSync(cert) || !fs.existsSync(key)) {
      throw new Error(`Inbound ${inbound.tag} requires POMP_NODE_TLS_CERT_FILE and POMP_NODE_TLS_KEY_FILE pointing to a valid node certificate and key.`);
    }
    const network = inbound.streamSettings?.network;
    if (!["ws", "httpupgrade", "xhttp"].includes(network)) {
      throw new Error(`Inbound ${inbound.tag} uses unsupported remote TLS transport: ${network || "unknown"}.`);
    }
    inbound.streamSettings.security = "tls";
    inbound.streamSettings.tlsSettings = {
      certificates: [{ certificateFile: cert, keyFile: key }],
      alpn: network === "xhttp" ? ["h2", "http/1.1"] : ["http/1.1"],
    };
  }
  return cfg;
}

async function applyConfig() {
  const result = await request("/api/node-agent/config");
  const nodeConfig = prepareNodeConfig(result.config);
  nodeConfig.log = { ...(nodeConfig.log || {}), loglevel: "warning", access: path.join(dataDir, "access.log"), error: path.join(dataDir, "error.log") };
  const serialized = JSON.stringify(nodeConfig);
  const hash = result.configHash || sha256(serialized);
  xrayExpected = (nodeConfig.inbounds || []).some(inbound => inbound.tag !== "api");
  if (!xrayExpected) {
    await stopXray();
    currentHash = hash;
    await startSingBox(result.singBoxConfig);
    return hash;
  }
  if (hash === currentHash && child && child.exitCode === null) { await startSingBox(result.singBoxConfig); return hash; }

  const temp = configFile + ".next";
  fs.writeFileSync(temp, JSON.stringify(nodeConfig, null, 2), { mode: 0o600 });
  const previous = fs.existsSync(configFile) ? fs.readFileSync(configFile) : null;
  fs.renameSync(temp, configFile);
  try {
    await stopXray();
    await startXray();
    currentHash = hash;
    await startSingBox(result.singBoxConfig);
    console.log(`[POMP NODE] Applied controller configuration ${hash.slice(0, 12)}`);
  } catch (error) {
    if (previous) {
      fs.writeFileSync(configFile, previous, { mode: 0o600 });
      try { await startXray(); }
      catch (rollbackError) { console.error("[POMP NODE] Previous Xray config could not be restarted:", rollbackError); }
    }
    currentHash = "";
    throw error;
  }
  return hash;
}

async function heartbeat(error = "") {
  const runtimeError = error || (xrayExpected && (!child || child.exitCode !== null) ? "Xray process is not running" : (singBoxExpected && (!singBoxChild || singBoxChild.exitCode !== null) ? "sing-box process is not running" : ""));
  return request("/api/node-agent/heartbeat", {
    method: "POST",
    body: JSON.stringify({
      agentVersion,
      xrayVersion: process.env.XRAY_VERSION || (xrayExpected ? "system-installed" : "not-required"),
      platform: os.platform(),
      arch: os.arch(),
      configHash: currentHash,
      error: runtimeError ? String(runtimeError).slice(0, 900) : "",
    }),
  });
}

async function cycle() {
  let error = "";
  try {
    await applyConfig();
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
    console.error("[POMP NODE]", error);
  }
  try {
    await heartbeat(error);
  } catch (e) {
    console.error("[POMP NODE] Controller heartbeat failed:", e instanceof Error ? e.message : e);
  }
}

async function shutdown() {
  stopping = true;
  await stopXray();
  await stopSingBox();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await cycle();
setInterval(() => { void cycle(); }, pollMs);
console.log(`[POMP NODE] Agent online; polling every ${pollMs}ms.`);
