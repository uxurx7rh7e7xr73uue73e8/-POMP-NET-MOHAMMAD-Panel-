/**
 * SideRail - Xray-core VPN management panel
 * Copyright (c) 2025 icubaby. All rights reserved.
 * Official repository: https://github.com/icubaby/SideRail
 *
 * Licensed under the SideRail Proprietary License (see LICENSE).
 * Unauthorized selling, white-labeling, or removal of attribution,
 * branding, or the embedded authorship identifiers is prohibited.
 * Watermark: sr-icubaby-2025-9f4c1a7e
 */
import { Router } from "express";
import { z } from "zod";
import {
  isSetupDone,
  completeSetup,
  verifyCredentials,
  signToken,
  authGuard,
  changeCredentials,
  requirePermission,
  requireOwner,
  createAdmin,
  updateAdmin,
  deleteAdmin,
  listAdminsWithStats,
  ALL_PERMISSIONS,
  type Permission,
  type AuthedRequest,
} from "./auth.js";
import { db, getSetting, setSetting } from "./db.js";
import { getSystemStats } from "./system.js";
import { listInbounds, setInboundEnabled, getInbound, createInbound, deleteInbound, renewInbound } from "./inbounds.js";
import {
  listUsers,
  createUser,
  updateUser,
  deleteUser,
  setUserEnabled,
  resetUserTraffic,
  rotateSubToken,
  getUser,
  summarize,
} from "./users.js";
import { getClientIps, restartXray, getServerTraffic, getInboundTraffic } from "./xray.js";
import { listActivity, logActivity, clearActivity } from "./activity.js";
import { exportData, importData } from "./backup.js";
import { loginRateLimit } from "./ratelimit.js";
import {
  listRoutingRules,
  addRoutingRule,
  updateRoutingRule,
  deleteRoutingRule,
} from "./routing.js";
import { DOMAIN_PRESETS, COUNTRY_IP_PRESETS } from "./routing-presets.js";
import { getBotConfig, saveBotConfig, testBot, sendBroadcastToLinkedUsers, sendTelegramToChat } from "./bot.js";

export const api = Router();

const trafficReset = z.enum(["never", "daily", "weekly", "monthly"]);
const permissionEnum = z.enum([
  "dashboard",
  "users",
  "inbounds",
  "routing",
  "activity",
  "bot",
  "settings",
]);

const userSchema = z.object({
  email: z.string().min(1),
  uuid: z.string().optional(),
  password: z.string().optional(),
  fingerprint: z.string().optional(),
  alpn: z.string().optional(),
  dataLimit: z.number().min(0).optional(),
  ipLimit: z.number().min(0).optional(),
  expireDays: z.number().min(0).optional(),
  subExpireDays: z.number().min(0).optional(),
  trafficReset: trafficReset.optional(),
  telegramId: z.string().optional(),
  comment: z.string().optional(),
  inboundIds: z.array(z.number()).optional(),
});

const updateSchema = userSchema.partial().extend({ enabled: z.boolean().optional() });

function setAuthCookie(res: import("express").Response, token: string): void {
  res.cookie("sr_token", token, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 7 * 86_400_000,
  });
}

api.get("/status", (_req, res) => {
  res.json({ setup: isSetupDone(), name: "POMP NET MOHAMMAD — QUANTUM NEXUS" });
});

api.post("/setup", (req, res) => {
  if (isSetupDone()) {
    res.status(400).json({ error: "already set up" });
    return;
  }
  const body = z
    .object({ username: z.string().min(3), password: z.string().min(6) })
    .safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "invalid input" });
    return;
  }
  completeSetup(body.data.username, body.data.password);
  logActivity(body.data.username, "setup", "panel initialized");
  const admin = verifyCredentials(body.data.username, body.data.password)!;
  const token = signToken(admin);
  setAuthCookie(res, token);
  res.json({ ok: true, token });
});

api.post("/login", loginRateLimit, (req, res) => {
  const body = z.object({ username: z.string(), password: z.string() }).safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "invalid input" });
    return;
  }
  const admin = verifyCredentials(body.data.username, body.data.password);
  if (!admin) {
    logActivity(body.data.username, "login_failed", "");
    res.status(401).json({ error: "invalid credentials" });
    return;
  }
  const token = signToken(admin);
  setAuthCookie(res, token);
  logActivity(admin.username, "login", "");
  res.json({ ok: true, token });
});

api.post("/logout", (_req, res) => {
  res.clearCookie("sr_token");
  res.json({ ok: true });
});

api.use(authGuard);

api.get("/me", (req: AuthedRequest, res) => {
  res.json({ admin: req.admin });
});

api.get("/system", requirePermission("dashboard"), (_req, res) => {
  res.json(getSystemStats());
});

api.post("/system/restart-xray", requirePermission("dashboard"), (req: AuthedRequest, res) => {
  restartXray();
  logActivity(req.admin!.username, "xray_restart", "");
  res.json({ ok: true });
});

api.get("/inbounds", requirePermission("inbounds"), (_req, res) => {
  res.json(listInbounds());
});

api.post("/inbounds", requirePermission("inbounds"), (req: AuthedRequest, res) => {
  const body = z.object({
    tag: z.string().trim().min(2).max(48),
    protocol: z.enum(["vless", "vmess", "trojan", "wireguard", "socks", "http"]),
    transport: z.enum(["ws", "xhttp", "httpupgrade", "udp", "tcp"]).optional().default("xhttp"),
    expireDays: z.number().int().min(0).max(3650).optional(),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "invalid inbound settings" }); return; }
  try {
    const inbound = createInbound(body.data);
    logActivity(req.admin!.username, "inbound_create", `${inbound.tag} : ${inbound.port}`);
    restartXray();
    res.json(inbound);
  } catch (e) { res.status(400).json({ error: (e as Error).message }); }
});

api.delete("/inbounds/:id", requirePermission("inbounds"), (req: AuthedRequest, res) => {
  try {
    if (!deleteInbound(Number(req.params.id))) { res.status(404).json({ error: "not found" }); return; }
    logActivity(req.admin!.username, "inbound_delete", `#${req.params.id}`);
    restartXray();
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: (e as Error).message }); }
});

api.patch("/inbounds/:id", requirePermission("inbounds"), async (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const body = z.object({
    enabled: z.boolean().optional(),
    expireDays: z.number().int().min(0).max(3650).optional(),
  }).refine((v) => v.enabled !== undefined || v.expireDays !== undefined).safeParse(req.body);
  if (!body.success || !getInbound(id)) {
    res.status(400).json({ error: "invalid" });
    return;
  }
  if (body.data.expireDays !== undefined) {
    const inbound = renewInbound(id, body.data.expireDays);
    logActivity(req.admin!.username, "inbound_renew", `#${id} ${body.data.expireDays} days`);
    restartXray();
    res.json(inbound);
    return;
  }
  setInboundEnabled(id, body.data.enabled!);
  logActivity(req.admin!.username, "inbound_toggle", `#${id} -> ${body.data.enabled}`);
  restartXray();
  res.json({ ok: true });
});

function scopeFor(req: AuthedRequest): number | undefined {
  return req.admin!.role === "owner" ? undefined : req.admin!.id;
}

function canAccessUser(req: AuthedRequest, userId: number): boolean {
  if (req.admin!.role === "owner") return true;
  const user = getUser(userId);
  return !!user && user.created_by === req.admin!.id;
}

function quotaExceeded(req: AuthedRequest): boolean {
  if (req.admin!.role === "owner" || req.admin!.dataLimit <= 0) return false;
  const users = listUsers(req.admin!.id);
  const used = users.reduce((sum, u) => sum + u.total, 0);
  return used >= req.admin!.dataLimit;
}

api.get("/users", requirePermission("users"), (req: AuthedRequest, res) => {
  const users = listUsers(scopeFor(req));
  res.json({ users, summary: summarize(users) });
});

api.get("/users/summary", requirePermission("users"), (req: AuthedRequest, res) => {
  res.json(summarize(listUsers(scopeFor(req))));
});

api.get("/users/:id/ips", requirePermission("users"), (req: AuthedRequest, res) => {
  if (!canAccessUser(req, Number(req.params.id))) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  res.json(getClientIps(Number(req.params.id)));
});

api.get("/users/:id", requirePermission("users"), (req: AuthedRequest, res) => {
  if (!canAccessUser(req, Number(req.params.id))) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  const user = getUser(Number(req.params.id));
  if (!user) {
    res.status(404).json({ error: "not found" });
    return;
  }
  res.json(user);
});

api.post("/users", requirePermission("users"), async (req: AuthedRequest, res) => {
  const body = userSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "invalid input", detail: body.error.flatten() });
    return;
  }
  if (quotaExceeded(req)) {
    res.status(403).json({ error: "data quota exceeded" });
    return;
  }
  try {
    const user = createUser({ ...body.data, createdBy: req.admin!.id });
    logActivity(req.admin!.username, "user_create", user.email);
    restartXray();
    res.json(user);
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

api.put("/users/:id", requirePermission("users"), async (req: AuthedRequest, res) => {
  if (!canAccessUser(req, Number(req.params.id))) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  const body = updateSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "invalid input" });
    return;
  }
  const user = updateUser(Number(req.params.id), body.data);
  if (!user) {
    res.status(404).json({ error: "not found" });
    return;
  }
  logActivity(req.admin!.username, "user_update", user.email);
  restartXray();
  res.json(user);
});

api.delete("/users/:id", requirePermission("users"), async (req: AuthedRequest, res) => {
  if (!canAccessUser(req, Number(req.params.id))) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  const user = getUser(Number(req.params.id));
  deleteUser(Number(req.params.id));
  logActivity(req.admin!.username, "user_delete", user?.email || String(req.params.id));
  restartXray();
  res.json({ ok: true });
});

api.post("/users/:id/toggle", requirePermission("users"), async (req: AuthedRequest, res) => {
  if (!canAccessUser(req, Number(req.params.id))) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  const body = z.object({ enabled: z.boolean() }).safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "invalid" });
    return;
  }
  setUserEnabled(Number(req.params.id), body.data.enabled);
  logActivity(req.admin!.username, "user_toggle", `#${req.params.id} -> ${body.data.enabled}`);
  restartXray();
  res.json({ ok: true });
});

api.post("/users/:id/reset-traffic", requirePermission("users"), (req: AuthedRequest, res) => {
  if (!canAccessUser(req, Number(req.params.id))) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  resetUserTraffic(Number(req.params.id));
  logActivity(req.admin!.username, "user_reset_traffic", `#${req.params.id}`);
  res.json({ ok: true });
});

api.post("/users/:id/rotate-token", requirePermission("users"), (req: AuthedRequest, res) => {
  if (!canAccessUser(req, Number(req.params.id))) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  rotateSubToken(Number(req.params.id));
  logActivity(req.admin!.username, "user_rotate_token", `#${req.params.id}`);
  res.json(getUser(Number(req.params.id)));
});

api.get("/activity", requirePermission("activity"), (_req, res) => {
  res.json(listActivity(300));
});

api.delete("/activity", requirePermission("activity"), (req: AuthedRequest, res) => {
  clearActivity();
  logActivity(req.admin!.username, "activity_clear", "");
  res.json({ ok: true });
});

api.get("/settings", requirePermission("settings"), (_req, res) => {
  res.json({
    xrayVersion: getSetting("xray_version") || "",
    subTitle: getSetting("sub_title") || "POMP NET MOHAMMAD — QUANTUM NEXUS",
  });
});

api.put("/settings", requirePermission("settings"), (req: AuthedRequest, res) => {
  const body = z
    .object({ subTitle: z.string().optional() })
    .safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "invalid" });
    return;
  }
  if (body.data.subTitle !== undefined) setSetting("sub_title", body.data.subTitle);
  logActivity(req.admin!.username, "settings_update", "");
  res.json({ ok: true });
});

api.post("/settings/credentials", requirePermission("settings"), (req: AuthedRequest, res) => {
  const body = z
    .object({
      currentPassword: z.string().min(1),
      newUsername: z.string().min(3).optional(),
      newPassword: z.string().min(6).optional(),
    })
    .safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "invalid input" });
    return;
  }
  const result = changeCredentials(
    req.admin!.id,
    body.data.currentPassword,
    body.data.newUsername,
    body.data.newPassword,
  );
  if (!result.ok) {
    res.status(400).json({ error: result.error });
    return;
  }
  // The change bumped this admin's token_version, invalidating every session
  // (including other people logged in as the same user). Re-issue a fresh
  // cookie for the admin who made the change so they stay signed in.
  setAuthCookie(res, signToken({ id: req.admin!.id }));
  logActivity(req.admin!.username, "credentials_change", "");
  res.json({ ok: true });
});

api.get("/admins", requireOwner, (_req, res) => {
  res.json({ admins: listAdminsWithStats(), permissions: ALL_PERMISSIONS });
});

api.post("/admins", requireOwner, (req: AuthedRequest, res) => {
  const body = z
    .object({
      username: z.string().min(3),
      password: z.string().min(6),
      permissions: z.array(permissionEnum),
      dataLimit: z.number().min(0).default(0),
    })
    .safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "invalid input" });
    return;
  }
  const result = createAdmin(
    body.data.username,
    body.data.password,
    body.data.permissions as Permission[],
    body.data.dataLimit,
  );
  if (!result.ok) {
    res.status(400).json({ error: result.error });
    return;
  }
  logActivity(req.admin!.username, "admin_create", body.data.username);
  res.json({ ok: true });
});

api.put("/admins/:id", requireOwner, (req: AuthedRequest, res) => {
  const body = z
    .object({
      permissions: z.array(permissionEnum).optional(),
      dataLimit: z.number().min(0).optional(),
      password: z.string().min(6).optional(),
    })
    .safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "invalid input" });
    return;
  }
  const result = updateAdmin(Number(req.params.id), {
    permissions: body.data.permissions as Permission[] | undefined,
    dataLimit: body.data.dataLimit,
    password: body.data.password,
  });
  if (!result.ok) {
    res.status(400).json({ error: result.error });
    return;
  }
  logActivity(req.admin!.username, "admin_update", `#${req.params.id}`);
  res.json({ ok: true });
});

api.delete("/admins/:id", requireOwner, (req: AuthedRequest, res) => {
  const result = deleteAdmin(Number(req.params.id));
  if (!result.ok) {
    res.status(400).json({ error: result.error });
    return;
  }
  logActivity(req.admin!.username, "admin_delete", `#${req.params.id}`);
  res.json({ ok: true });
});

api.get("/backup/export", requirePermission("dashboard"), (req: AuthedRequest, res) => {
  logActivity(req.admin!.username, "backup_export", "");
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", `attachment; filename="siderail-backup-${Date.now()}.json"`);
  res.send(JSON.stringify(exportData(), null, 2));
});

api.post("/backup/import", requirePermission("dashboard"), async (req: AuthedRequest, res) => {
  try {
    const result = importData(req.body);
    logActivity(
      req.admin!.username,
      "backup_import",
      `${result.users} users, ${result.inbounds} inbounds`,
    );
    restartXray();
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

api.get("/stats/traffic", requirePermission("dashboard"), (_req, res) => {
  res.json({ server: getServerTraffic(), inbounds: getInboundTraffic() });
});

api.get("/routing", requirePermission("routing"), (_req, res) => {
  res.json(listRoutingRules());
});

api.get("/routing/presets", requirePermission("routing"), (_req, res) => {
  res.json({ domains: DOMAIN_PRESETS, ips: COUNTRY_IP_PRESETS });
});

api.post("/routing", requirePermission("routing"), async (req: AuthedRequest, res) => {
  const body = z
    .object({
      domain: z.string().min(1),
      inboundIds: z.array(z.number()).default([]),
      kind: z.enum(["domain", "ip"]).default("domain"),
      label: z.string().optional(),
    })
    .safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "invalid input" });
    return;
  }
  const rule = addRoutingRule(
    body.data.domain,
    body.data.inboundIds,
    body.data.kind,
    body.data.label || "",
  );
  logActivity(req.admin!.username, "routing_add", body.data.label || body.data.domain);
  restartXray();
  res.json(rule);
});

api.put("/routing/:id", requirePermission("routing"), async (req: AuthedRequest, res) => {
  const body = z.object({ inboundIds: z.array(z.number()) }).safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "invalid input" });
    return;
  }
  updateRoutingRule(Number(req.params.id), body.data.inboundIds);
  logActivity(req.admin!.username, "routing_update", `#${req.params.id}`);
  restartXray();
  res.json({ ok: true });
});

api.delete("/routing/:id", requirePermission("routing"), async (req: AuthedRequest, res) => {
  deleteRoutingRule(Number(req.params.id));
  logActivity(req.admin!.username, "routing_delete", `#${req.params.id}`);
  restartXray();
  res.json({ ok: true });
});

api.get("/bot", requirePermission("bot"), (_req, res) => {
  const cfg = getBotConfig();
  res.json({
    enabled: cfg.enabled,
    tokenConfigured: Boolean(cfg.token),
    tokenHint: cfg.token ? `••••••${cfg.token.slice(-4)}` : "",
    chatIds: cfg.chatIds,
    dailyBackup: cfg.dailyBackup,
  });
});

api.put("/bot", requirePermission("bot"), (req: AuthedRequest, res) => {
  const body = z
    .object({
      enabled: z.boolean().optional(),
      token: z.string().optional(),
      chatIds: z.array(z.string()).optional(),
      dailyBackup: z.boolean().optional(),
    })
    .safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "invalid input" });
    return;
  }
  saveBotConfig(body.data);
  logActivity(req.admin!.username, "bot_update", "");
  res.json({ ok: true });
});

api.post("/bot/test", requirePermission("bot"), async (req: AuthedRequest, res) => {
  const body = z
    .object({ token: z.string().optional(), chatIds: z.array(z.string()).min(1) })
    .safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "token and at least one chat id are required" });
    return;
  }
  const savedToken = getBotConfig().token;
  const token = body.data.token?.trim() || savedToken;
  if (!token) {
    res.status(400).json({ error: "Configure a Telegram bot token first" });
    return;
  }
  const result = await testBot(token, body.data.chatIds);
  if (!result.ok) {
    res.status(400).json({ error: result.error });
    return;
  }
  logActivity(req.admin!.username, "bot_test", "");
  res.json({ ok: true });
});


api.post("/users/:id/renew", requirePermission("users"), (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0 || !canAccessUser(req, id)) {
    res.status(403).json({ error: "forbidden" }); return;
  }
  const body = z.object({ days: z.number().int().min(1).max(3650), note: z.string().max(500).optional() }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "invalid renewal" }); return; }
  const user = getUser(id);
  if (!user) { res.status(404).json({ error: "not found" }); return; }
  const now = Date.now();
  const previous = user.expire_at;
  const base = previous && previous > now ? previous : now;
  const next = base + body.data.days * 86_400_000;
  db.prepare("UPDATE users SET expire_at = ?, enabled = 1 WHERE id = ?").run(next, id);
  db.prepare("INSERT INTO renewal_history (user_id, days, previous_expire_at, new_expire_at, actor, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(id, body.data.days, previous, next, req.admin!.username, body.data.note || "", now);
  logActivity(req.admin!.username, "user_renew", `#${id} +${body.data.days} days`);
  restartXray();
  res.json({ ok: true, user: getUser(id), expireAt: next });
});

api.get("/users/:id/renewals", requirePermission("users"), (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  if (!canAccessUser(req, id)) { res.status(403).json({ error: "forbidden" }); return; }
  res.json(db.prepare("SELECT id, days, previous_expire_at, new_expire_at, actor, note, created_at FROM renewal_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 100").all(id));
});

api.get("/support/tickets", requirePermission("users"), (_req, res) => {
  const tickets = db.prepare(`SELECT t.*, u.email AS user_email,
    (SELECT COUNT(*) FROM support_messages m WHERE m.ticket_id=t.id) AS message_count
    FROM support_tickets t LEFT JOIN users u ON u.id=t.user_id
    ORDER BY CASE t.status WHEN 'open' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END, t.updated_at DESC LIMIT 300`).all();
  res.json({ tickets });
});

api.get("/support/tickets/:id", requirePermission("users"), (req, res) => {
  const id = Number(req.params.id);
  const ticket = db.prepare("SELECT t.*, u.email AS user_email FROM support_tickets t LEFT JOIN users u ON u.id=t.user_id WHERE t.id=?").get(id);
  if (!ticket) { res.status(404).json({ error: "not found" }); return; }
  const messages = db.prepare("SELECT * FROM support_messages WHERE ticket_id=? ORDER BY created_at ASC").all(id);
  res.json({ ticket, messages });
});

api.post("/support/tickets/:id/reply", requirePermission("users"), async (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const body = z.object({ message: z.string().trim().min(1).max(4000) }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "invalid message" }); return; }
  const ticket = db.prepare("SELECT * FROM support_tickets WHERE id=?").get(id) as { id:number; telegram_id:string; status:string } | undefined;
  if (!ticket) { res.status(404).json({ error: "not found" }); return; }
  const now = Date.now();
  db.prepare("INSERT INTO support_messages (ticket_id, sender_type, sender_id, message, created_at) VALUES (?, 'admin', ?, ?, ?)")
    .run(id, req.admin!.username, body.data.message, now);
  db.prepare("UPDATE support_tickets SET status='pending', updated_at=? WHERE id=?").run(now, id);
  let delivered = false;
  if (ticket.telegram_id) delivered = await sendTelegramToChat(ticket.telegram_id, `🎧 <b>پاسخ پشتیبانی POMP NET · تیکت #${id}</b>\\n\\n${body.data.message}`);
  logActivity(req.admin!.username, "support_reply", `ticket #${id}; telegram=${delivered}`);
  res.json({ ok: true, telegramDelivered: delivered });
});

api.patch("/support/tickets/:id", requirePermission("users"), (req, res) => {
  const body = z.object({ status: z.enum(["open", "pending", "closed"]), priority: z.enum(["low", "normal", "high"]).optional() }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "invalid ticket state" }); return; }
  const info = db.prepare("UPDATE support_tickets SET status=?, priority=COALESCE(?, priority), updated_at=? WHERE id=?")
    .run(body.data.status, body.data.priority || null, Date.now(), Number(req.params.id));
  if (Number(info.changes) === 0) { res.status(404).json({ error: "not found" }); return; }
  res.json({ ok: true });
});

api.post("/bot/broadcast", requirePermission("bot"), async (req: AuthedRequest, res) => {
  const body = z.object({ message: z.string().trim().min(1).max(4000) }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "message required (max 4000)" }); return; }
  try {
    const result = await sendBroadcastToLinkedUsers(body.data.message);
    logActivity(req.admin!.username, "telegram_broadcast", `sent=${result.sent}, failed=${result.failed}`);
    res.json({ ok: true, ...result });
  } catch (e) { res.status(400).json({ error: (e as Error).message }); }
});

api.get("/notifications/expiry-preview", requirePermission("users"), (_req, res) => {
  const now = Date.now();
  const rows = db.prepare("SELECT id, email, telegram_id, expire_at, enabled FROM users WHERE expire_at IS NOT NULL AND expire_at > ? AND expire_at <= ? ORDER BY expire_at ASC")
    .all(now, now + 7 * 86_400_000);
  res.json({ users: rows });
});

void db;
