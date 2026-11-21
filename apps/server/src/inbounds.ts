import { nanoid } from "nanoid";
import { db } from "./db.js";
import { config } from "./config.js";
import type { Inbound, Protocol, Transport } from "./types.js";

interface SeedDef {
  tag: string;
  protocol: Protocol;
  transport: Transport;
}

const SEED_INBOUNDS: SeedDef[] = [
  { tag: "VLESS-WS", protocol: "vless", transport: "ws" },
  { tag: "VLESS-XHTTP", protocol: "vless", transport: "xhttp" },
  { tag: "VMess-WS", protocol: "vmess", transport: "ws" },
  { tag: "Trojan-WS", protocol: "trojan", transport: "ws" },
  { tag: "VLESS-HTTPUpgrade", protocol: "vless", transport: "httpupgrade" },
];

export function seedInbounds(): void {
  const count = (db.prepare("SELECT COUNT(*) AS c FROM inbounds").get() as { c: number }).c;
  if (count > 0) return;
  let offset = 0;
  const insert = db.prepare(
    `INSERT INTO inbounds (tag, protocol, transport, port, path, host, enabled, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
  );
  for (const s of SEED_INBOUNDS) {
    const port = config.inboundBasePort + offset;
    const path = `/pompnet/${s.transport}-${nanoid(8)}`;
    insert.run(s.tag, s.protocol, s.transport, port, path, "", Date.now());
    offset += 1;
  }
}

export function listInbounds(): Inbound[] {
  return db.prepare("SELECT * FROM inbounds ORDER BY id ASC").all() as unknown as Inbound[];
}

export function listEnabledInbounds(): Inbound[] {
  return db
    .prepare("SELECT * FROM inbounds WHERE enabled = 1 AND (expires_at IS NULL OR expires_at > ?) ORDER BY id ASC")
    .all(Date.now()) as unknown as Inbound[];
}

export function getInbound(id: number): Inbound | undefined {
  return db.prepare("SELECT * FROM inbounds WHERE id = ?").get(id) as unknown as
    | Inbound
    | undefined;
}

export function setInboundEnabled(id: number, enabled: boolean): void {
  db.prepare("UPDATE inbounds SET enabled = ? WHERE id = ?").run(enabled ? 1 : 0, id);
}

export function renewInbound(id: number, days: number): Inbound | undefined {
  const expiresAt = days > 0 ? Date.now() + days * 86_400_000 : null;
  db.prepare("UPDATE inbounds SET expires_at = ?, enabled = 1 WHERE id = ?").run(expiresAt, id);
  return getInbound(id);
}


export interface CreateInboundInput {
  tag: string;
  protocol: Protocol;
  transport: Transport;
  expireDays?: number;
}

export function createInbound(input: CreateInboundInput): Inbound {
  const tag = input.tag.trim().replace(/[^a-zA-Z0-9_-]/g, "-").replace(/-+/g, "-").slice(0, 48);
  if (!tag) throw new Error("Inbound tag is required");
  if (db.prepare("SELECT 1 FROM inbounds WHERE tag = ?").get(tag)) throw new Error("Inbound tag already exists");
  const used = new Set((db.prepare("SELECT port FROM inbounds").all() as { port: number }[]).map((r) => r.port));
  let port = config.inboundBasePort;
  while (used.has(port) && port < config.inboundBasePort + 10000) port++;
  if (used.has(port)) throw new Error("No free inbound port in configured range");
  const path = `/pompnet/${input.transport}-${nanoid(10)}`;
  const now = Date.now();
  const expiresAt = input.expireDays && input.expireDays > 0 ? now + input.expireDays * 86_400_000 : null;
  const info = db.prepare(
    "INSERT INTO inbounds (tag, protocol, transport, port, path, host, enabled, created_at, expires_at) VALUES (?, ?, ?, ?, ?, '', 1, ?, ?)",
  ).run(tag, input.protocol, input.transport, port, path, now, expiresAt);
  return getInbound(Number(info.lastInsertRowid))!;
}

export function deleteInbound(id: number): boolean {
  const users = db.prepare("SELECT COUNT(*) AS c FROM user_inbounds WHERE inbound_id = ?").get(id) as { c: number };
  if (users.c > 0) throw new Error("Inbound is assigned to users. Unassign it before deleting.");
  return Number(db.prepare("DELETE FROM inbounds WHERE id = ?").run(id).changes) > 0;
}

export function expireInbounds(): number {
  const result = db.prepare("UPDATE inbounds SET enabled = 0 WHERE enabled = 1 AND expires_at IS NOT NULL AND expires_at <= ?").run(Date.now());
  return Number(result.changes);
}
