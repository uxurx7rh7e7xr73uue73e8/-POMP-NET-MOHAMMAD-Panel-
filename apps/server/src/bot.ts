import https from "node:https";
import { getSetting, setSetting } from "./db.js";
import { exportData } from "./backup.js";
import { createUser, listUsers, isUserActive } from "./users.js";
import { listInbounds, listEnabledInbounds } from "./inbounds.js";
import { buildUserLinks } from "./links.js";
import { config } from "./config.js";
import { restartXray } from "./xray.js";

interface TgResult {
  ok: boolean;
  description?: string;
  result?: unknown;
}

function apiCall(token: string, method: string, payload: Record<string, unknown>): Promise<TgResult> {
  return new Promise((resolve) => {
    const body = JSON.stringify(payload);
    const req = https.request(
      {
        hostname: "api.telegram.org",
        path: `/bot${token}/${method}`,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
        timeout: 15000,
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(data) as TgResult);
          } catch {
            resolve({ ok: false, description: "invalid response" });
          }
        });
      },
    );
    req.on("error", (e) => resolve({ ok: false, description: e.message }));
    req.on("timeout", () => {
      req.destroy();
      resolve({ ok: false, description: "timeout" });
    });
    req.write(body);
    req.end();
  });
}

function sendDocument(
  token: string,
  chatId: string,
  filename: string,
  content: string,
  caption: string,
): Promise<TgResult> {
  return new Promise((resolve) => {
    const boundary = `----PompNet${Date.now()}`;
    const parts: Buffer[] = [];
    const push = (s: string) => parts.push(Buffer.from(s, "utf8"));

    push(`--${boundary}\r\n`);
    push('Content-Disposition: form-data; name="chat_id"\r\n\r\n');
    push(`${chatId}\r\n`);

    push(`--${boundary}\r\n`);
    push('Content-Disposition: form-data; name="caption"\r\n\r\n');
    push(`${caption}\r\n`);

    push(`--${boundary}\r\n`);
    push('Content-Disposition: form-data; name="parse_mode"\r\n\r\n');
    push(`HTML\r\n`);

    push(`--${boundary}\r\n`);
    push(
      `Content-Disposition: form-data; name="document"; filename="${filename}"\r\n` +
        "Content-Type: application/json\r\n\r\n",
    );
    push(content);
    push(`\r\n--${boundary}--\r\n`);

    const payload = Buffer.concat(parts);
    const req = https.request(
      {
        hostname: "api.telegram.org",
        path: `/bot${token}/sendDocument`,
        method: "POST",
        headers: {
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
          "Content-Length": payload.length,
        },
        timeout: 30000,
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(data) as TgResult);
          } catch {
            resolve({ ok: false, description: "invalid response" });
          }
        });
      },
    );
    req.on("error", (e) => resolve({ ok: false, description: e.message }));
    req.on("timeout", () => {
      req.destroy();
      resolve({ ok: false, description: "timeout" });
    });
    req.write(payload);
    req.end();
  });
}

export interface BotConfig {
  enabled: boolean;
  token: string;
  chatIds: string[];
  dailyBackup: boolean;
}

export function getBotConfig(): BotConfig {
  return {
    enabled: getSetting("bot_enabled") === "1",
    token: getSetting("bot_token") || "",
    chatIds: JSON.parse(getSetting("bot_chat_ids") || "[]") as string[],
    dailyBackup: getSetting("bot_daily_backup") !== "0",
  };
}

export function saveBotConfig(cfg: Partial<BotConfig>): void {
  if (cfg.enabled !== undefined) setSetting("bot_enabled", cfg.enabled ? "1" : "0");
  if (cfg.token !== undefined) setSetting("bot_token", cfg.token.trim());
  if (cfg.chatIds !== undefined)
    setSetting("bot_chat_ids", JSON.stringify(cfg.chatIds.map((c) => c.trim()).filter(Boolean)));
  if (cfg.dailyBackup !== undefined) setSetting("bot_daily_backup", cfg.dailyBackup ? "1" : "0");
}

export async function broadcast(html: string): Promise<void> {
  const cfg = getBotConfig();
  if (!cfg.enabled || !cfg.token || cfg.chatIds.length === 0) return;
  for (const chatId of cfg.chatIds) {
    await apiCall(cfg.token, "sendMessage", {
      chat_id: chatId,
      text: html,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    });
  }
}

export async function testBot(
  token: string,
  chatIds: string[],
): Promise<{ ok: boolean; error?: string }> {
  if (!token || chatIds.length === 0) return { ok: false, error: "token and chat id required" };
  const branded = await apiCall(token, "setMyName", { name: "POMP NET MOHAMMAD" });
  if (!branded.ok) return { ok: false, error: branded.description || "Could not set Telegram bot display name" };
  await apiCall(token, "setMyDescription", {
    description: "POMP NET MOHAMMAD — QUANTUM NEXUS | Official panel notifications and secure backups."
  });
  const message =
    "<b>🚀 POMP NET MOHAMMAD BOT</b>\n" +
    "<b>QUANTUM NEXUS · اتصال ربات برقرار شد</b>\n\n" +
    "✅ ربات رسمی پنل پمپ‌نت محمد با موفقیت متصل شد.\n" +
    "قدرت ساخت، آزادی انتخاب، کنترل در دستان تو.";
  let anyOk = false;
  let lastError = "";
  for (const chatId of chatIds) {
    const res = await apiCall(token, "sendMessage", {
      chat_id: chatId,
      text: message,
      parse_mode: "HTML",
    });
    if (res.ok) anyOk = true;
    else lastError = res.description || "failed";
  }
  return anyOk ? { ok: true } : { ok: false, error: lastError };
}

export async function sendDailyBackup(): Promise<void> {
  const cfg = getBotConfig();
  if (!cfg.enabled || !cfg.token || cfg.chatIds.length === 0 || !cfg.dailyBackup) return;
  const data = JSON.stringify(exportData(), null, 2);
  const date = new Date().toISOString().slice(0, 10);
  const caption =
    "<b>🗄 POMP NET MOHAMMAD · نسخه پشتیبان روزانه</b>\n" +
    `<b>Date:</b> ${date}\n` +
    "Keep this file safe — you can restore it from the dashboard.";
  for (const chatId of cfg.chatIds) {
    await sendDocument(cfg.token, chatId, `pompnet-backup-${date}.json`, data, caption);
  }
}


interface TelegramUpdate {
  update_id: number;
  message?: {
    text?: string;
    chat: { id: number; type?: string };
    from?: { id: number; first_name?: string };
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] || c);
}

async function sendTelegramText(token: string, chatId: string, text: string): Promise<void> {
  await apiCall(token, "sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
  });
}

function telegramPublicHost(): string {
  return (getSetting("clean_address") || config.publicDomain || "").trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/$/, "")
    .split("/")[0];
}

async function sendClientConfig(token: string, chatId: string, user: ReturnType<typeof listUsers>[number]): Promise<void> {
  const host = telegramPublicHost();
  if (!host) {
    await sendTelegramText(token, chatId,
      "⚠️ دامنه عمومی پنل تنظیم نشده است. ابتدا دامنه را در تنظیمات استقرار وارد کنید؛ سپس دستور /config را بفرستید.");
    return;
  }
  const links = buildUserLinks(host, user, listInbounds());
  if (!links.length) {
    await sendTelegramText(token, chatId, "⛔ هیچ ورودی فعالی برای ساخت کانفیگ وجود ندارد. با پشتیبانی پنل تماس بگیرید.");
    return;
  }
  const lines = links.map((item, index) =>
    `<b>${index + 1}. ${escapeHtml(item.protocol.toUpperCase())} · ${escapeHtml(item.transport.toUpperCase())}</b>\n<pre>${escapeHtml(item.link)}</pre>`
  );
  await sendTelegramText(token, chatId,
    "🚀 <b>POMP NET MOHAMMAD · کانفیگ اختصاصی شما</b>\n" +
    `👤 شناسه: <code>${escapeHtml(user.email)}</code>\n` +
    `📦 حجم: ${user.data_limit > 0 ? (user.data_limit / 1073741824).toFixed(0) + " GB" : "نامحدود"}\n` +
    `🗓 اعتبار: ${user.expire_at ? new Date(user.expire_at).toLocaleDateString("fa-IR") : "نامحدود"}\n\n` +
    lines.join("\n\n") +
    "\n\n💡 لینک اشتراک در پنل شما نیز قابل استفاده است.\n/panel برای راهنما · /status برای وضعیت");
}

async function handleTelegramMessage(token: string, update: TelegramUpdate): Promise<void> {
  const message = update.message;
  const raw = message?.text?.trim();
  if (!message || !raw || !message.from || message.chat.type !== "private") return;
  const chatId = String(message.chat.id);
  const telegramId = String(message.from.id);
  const command = raw.split(/\s+/, 1)[0].split("@")[0].toLowerCase();

  if (command === "/start" || command === "/help" || command === "/panel") {
    await sendTelegramText(token, chatId,
      "🌌 <b>به ربات رسمی POMP NET MOHAMMAD خوش آمدید</b>\n" +
      "از این ربات می‌توانید کانفیگ اختصاصی بسازید و وضعیت اشتراک خود را ببینید.\n\n" +
      "🆕 /new — ساخت کانفیگ شخصی\n" +
      "🔗 /config — دریافت دوباره کانفیگ‌ها\n" +
      "📊 /status — وضعیت حجم و اعتبار\n" +
      "🆔 /myid — شناسه تلگرام شما\n" +
      "❔ /help — راهنما\n\n" +
      "هر کاربر فقط به کانفیگ متصل به شناسه تلگرام خودش دسترسی دارد.");
    return;
  }

  if (command === "/myid") {
    await sendTelegramText(token, chatId, `🆔 شناسه تلگرام شما: <code>${telegramId}</code>`);
    return;
  }

  if (command === "/new" || command === "/config" || command === "/status") {
    const existing = listUsers().find((u) => u.telegram_id === telegramId);
    if (command === "/new" && !existing) {
      const host = telegramPublicHost();
      if (!host) {
        await sendTelegramText(token, chatId,
          "⚠️ دامنه عمومی تنظیم نشده است؛ برای جلوگیری از ساخت لینک خراب، ابتدا دامنه پنل را در تنظیمات استقرار وارد کنید.");
        return;
      }
      const inbounds = listEnabledInbounds();
      if (!inbounds.length) {
        await sendTelegramText(token, chatId, "⛔ در حال حاضر هیچ ورودی فعالی برای ساخت کانفیگ وجود ندارد.");
        return;
      }
      const created = createUser({
        email: `tg-${telegramId}`,
        telegramId,
        dataLimit: 20,
        ipLimit: 2,
        expireDays: 30,
        comment: "Created by POMP NET Telegram bot",
        inboundIds: inbounds.map((item) => item.id),
        createdBy: null,
      });
      restartXray();
      await sendTelegramText(token, chatId, "✅ حساب اختصاصی شما ساخته شد؛ کانفیگ‌ها در پیام بعدی ارسال می‌شوند.");
      await sendClientConfig(token, chatId, created);
      return;
    }
    if (!existing) {
      await sendTelegramText(token, chatId, "هنوز حسابی برای این شناسه تلگرام ساخته نشده است. برای شروع /new را بفرستید.");
      return;
    }
    if (command === "/status") {
      const active = isUserActive(existing);
      const used = (existing.total / 1073741824).toFixed(2);
      const limit = existing.data_limit > 0 ? (existing.data_limit / 1073741824).toFixed(0) + " GB" : "نامحدود";
      const expiry = existing.expire_at ? new Date(existing.expire_at).toLocaleString("fa-IR") : "نامحدود";
      await sendTelegramText(token, chatId,
        "📊 <b>وضعیت اشتراک POMP NET</b>\n" +
        `وضعیت: ${active ? "🟢 فعال" : "🔴 غیرفعال یا منقضی"}\n` +
        `مصرف: ${used} GB از ${limit}\n` +
        `اعتبار تا: ${expiry}\n` +
        `اتصال اخیر: ${existing.online ? "آنلاین" : "آفلاین"}`);
      return;
    }
    if (!isUserActive(existing)) {
      await sendTelegramText(token, chatId, "⛔ اشتراک شما فعال نیست. برای تمدید با پشتیبانی پنل تماس بگیرید.");
      return;
    }
    await sendClientConfig(token, chatId, existing);
    return;
  }

  await sendTelegramText(token, chatId, "دستور شناخته نشد. برای دیدن راهنما /help را بفرستید.");
}

let polling = false;

/**
 * Long-poll Telegram so every private user can self-serve their own configuration.
 * The Telegram ID is the account key; a user can never retrieve another user's config.
 */
export async function startTelegramBot(): Promise<void> {
  if (polling) return;
  polling = true;
  void (async () => {
    let activeToken = "";
    let offset = Number(getSetting("bot_update_offset") || "0");
    while (polling) {
      const cfg = getBotConfig();
      if (!cfg.enabled || !cfg.token) {
        await sleep(4000);
        continue;
      }
      if (activeToken && activeToken !== cfg.token) {
        offset = 0;
      }
      activeToken = cfg.token;
      try {
        const response = await apiCall(cfg.token, "getUpdates", {
          offset,
          timeout: 10,
          allowed_updates: ["message"],
        });
        if (!response.ok) {
          await sleep(3000);
          continue;
        }
        const updates = Array.isArray(response.result) ? response.result as TelegramUpdate[] : [];
        for (const update of updates) {
          offset = Math.max(offset, update.update_id + 1);
          setSetting("bot_update_offset", String(offset));
          try {
            await handleTelegramMessage(cfg.token, update);
          } catch (error) {
            const chatId = update.message?.chat?.id;
            if (chatId) {
              await sendTelegramText(cfg.token, String(chatId),
                "⚠️ انجام درخواست با خطا روبه‌رو شد. کمی بعد دوباره تلاش کنید یا با پشتیبانی تماس بگیرید.");
            }
            console.error("[POMP NET Telegram]", error);
          }
        }
      } catch (error) {
        console.error("[POMP NET Telegram polling]", error);
        await sleep(3000);
      }
    }
  })();
}
