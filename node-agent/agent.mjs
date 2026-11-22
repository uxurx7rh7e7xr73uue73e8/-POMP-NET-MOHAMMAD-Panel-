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
const dataDir = process.env.POMP_NODE_DATA_DIR || "/var/lib/pompnet-node";
const configFile = path.join(dataDir, "config.json");
const pollMs = Math.max(10000, Number(process.env.POMP_NODE_POLL_MS || 30000));
const agentVersion = "1.0.0";
let child = null;
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

function startXray() {
  if (!fs.existsSync(xrayBin)) throw new Error(`Xray binary not found at ${xrayBin}; install Xray-core and set XRAY_BIN.`);
  const test = spawnSync(xrayBin, ["run", "-test", "-config", configFile], { encoding: "utf8", timeout: 20000 });
  if (test.status !== 0) throw new Error(`Xray config validation failed: ${(test.stderr || test.stdout || "unknown error").slice(0, 700)}`);
  const proc = spawn(xrayBin, ["run", "-config", configFile], { stdio: "inherit", detached: false });
  child = proc;
  proc.on("exit", (code, signal) => {
    if (child === proc) child = null;
    if (!stopping) console.error(`[POMP NODE] Xray exited (code=${code}, signal=${signal}). Next poll will retry.`);
  });
}

async function applyConfig() {
  const result = await request("/api/node-agent/config");
  const serialized = JSON.stringify(result.config);
  const hash = result.configHash || sha256(serialized);
  if (hash === currentHash && child && child.exitCode === null) return hash;

  const temp = configFile + ".next";
  fs.writeFileSync(temp, JSON.stringify(result.config, null, 2), { mode: 0o600 });
  const previous = fs.existsSync(configFile) ? fs.readFileSync(configFile) : null;
  fs.renameSync(temp, configFile);
  try {
    await stopXray();
    startXray();
    currentHash = hash;
    console.log(`[POMP NODE] Applied controller configuration ${hash.slice(0, 12)}`);
  } catch (error) {
    if (previous) fs.writeFileSync(configFile, previous, { mode: 0o600 });
    throw error;
  }
  return hash;
}

async function heartbeat(error = "") {
  return request("/api/node-agent/heartbeat", {
    method: "POST",
    body: JSON.stringify({
      agentVersion,
      xrayVersion: process.env.XRAY_VERSION || "system-installed",
      platform: os.platform(),
      arch: os.arch(),
      configHash: currentHash,
      error: error ? String(error).slice(0, 900) : "",
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
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await cycle();
setInterval(() => { void cycle(); }, pollMs);
console.log(`[POMP NODE] Agent online; polling every ${pollMs}ms.`);
