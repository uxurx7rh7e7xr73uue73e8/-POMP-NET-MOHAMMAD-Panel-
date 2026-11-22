import { createCipheriv, createDecipheriv, createHash, createPrivateKey, createPublicKey, randomBytes } from "node:crypto";
import { config } from "./config.js";
import { db, getSetting, setSetting } from "./db.js";
import type { UserWithInbounds } from "./types.js";

const PKCS8_X25519_PREFIX = Buffer.from("302e020100300506032b656e04220420", "hex");
const encryptionKey = createHash("sha256").update(config.jwtSecret).digest();

function seal(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `enc:v1:${iv.toString("base64")}:${cipher.getAuthTag().toString("base64")}:${encrypted.toString("base64")}`;
}

function openSecret(value: string): string {
  if (!value.startsWith("enc:v1:")) return value;
  const [, , iv, tag, body] = value.split(":");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey, Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(body, "base64")), decipher.final()]).toString("utf8");
}

function makeKeyPair(): { privateKey: string; publicKey: string } {
  const raw = randomBytes(32);
  raw[0] &= 248;
  raw[31] &= 127;
  raw[31] |= 64;
  const privateObject = createPrivateKey({
    key: Buffer.concat([PKCS8_X25519_PREFIX, raw]),
    format: "der",
    type: "pkcs8",
  });
  const publicDer = createPublicKey(privateObject).export({ format: "der", type: "spki" }) as Buffer;
  return {
    privateKey: raw.toString("base64"),
    publicKey: publicDer.subarray(-32).toString("base64"),
  };
}

export function ensureWireGuardServerKeys(): { privateKey: string; publicKey: string } {
  let privateKey = getSetting("wireguard_server_private_key");
  let publicKey = getSetting("wireguard_server_public_key");
  if (!privateKey || !publicKey) {
    const pair = makeKeyPair();
    privateKey = pair.privateKey;
    publicKey = pair.publicKey;
    setSetting("wireguard_server_private_key", seal(privateKey));
    setSetting("wireguard_server_public_key", publicKey);
  }
  if (!privateKey.startsWith("enc:v1:")) setSetting("wireguard_server_private_key", seal(privateKey));
  return { privateKey: openSecret(privateKey), publicKey };
}

export interface WireGuardPeer {
  private_key: string;
  public_key: string;
  preshared_key: string;
  address: string;
}

export function ensureWireGuardPeer(user: UserWithInbounds): WireGuardPeer {
  const existing = db.prepare("SELECT private_key, public_key, preshared_key, address FROM wireguard_peers WHERE user_id = ?")
    .get(user.id) as WireGuardPeer | undefined;
  if (existing) {
    if (!existing.private_key.startsWith("enc:v1:")) {
      db.prepare("UPDATE wireguard_peers SET private_key = ? WHERE user_id = ?").run(seal(existing.private_key), user.id);
    }
    return { ...existing, private_key: openSecret(existing.private_key) };
  }

  const pair = makeKeyPair();
  const psk = randomBytes(32).toString("base64");
  const rows = db.prepare("SELECT address FROM wireguard_peers").all() as { address: string }[];
  const used = new Set(rows.map((row) => row.address));
  let slot = 2;
  while (used.has(`10.77.0.${slot}`) && slot < 255) slot++;
  if (slot >= 255) throw new Error("WireGuard IPv4 peer pool is full");
  const address = `10.77.0.${slot}`;
  db.prepare("INSERT INTO wireguard_peers (user_id, private_key, public_key, preshared_key, address, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(user.id, seal(pair.privateKey), pair.publicKey, psk, address, Date.now());
  return { private_key: pair.privateKey, public_key: pair.publicKey, preshared_key: psk, address };
}

export function listWireGuardPeers(users: UserWithInbounds[]) {
  const get = db.prepare("SELECT public_key, preshared_key, address FROM wireguard_peers WHERE user_id = ?");
  return users.map((user) => {
    const peer = get.get(user.id) as Omit<WireGuardPeer, "private_key"> | undefined;
    if (!peer) return null;
    return { ...peer, email: user.email };
  }).filter((peer): peer is NonNullable<typeof peer> => peer !== null);
}
