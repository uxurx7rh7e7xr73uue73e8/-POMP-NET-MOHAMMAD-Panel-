import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Router, Waypoints, Network, Lock, Plus, Trash2, Gamepad2, CalendarClock } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { useI18n } from "@/lib/i18n";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import type { Inbound, Protocol, Transport } from "@/lib/types";

const protocolAccent: Record<string, string> = {
  vless: "#8b35ff",
  vmess: "#168cff",
  trojan: "#b18cff",
};

export default function InboundsPage() {
  const toast = useToast();
  const { t } = useI18n();
  const qc = useQueryClient();
  const [tag, setTag] = useState("POMP-VLESS-PREMIUM");
  const [protocol, setProtocol] = useState<Protocol>("vless");
  const [transport, setTransport] = useState<Transport>("xhttp");
  const [expireDays, setExpireDays] = useState(0);

  const { data: inbounds = [] } = useQuery<Inbound[]>({
    queryKey: ["inbounds"],
    queryFn: api.inbounds,
    refetchInterval: 10000,
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["inbounds"] });

  const toggle = useMutation({
    mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) =>
      api.toggleInbound(id, enabled),
    onSuccess: () => {
      refresh();
      toast.push("success", t("inboundUpdated"));
    },
    onError: (e: Error) => toast.push("error", e.message),
  });

  const create = useMutation({
    mutationFn: api.createInbound,
    onSuccess: (ib) => {
      refresh();
      toast.push("success", `Inbound واقعی ${ib.tag} روی پورت ${ib.port} ساخته شد؛ اعمال نهایی پس از بارگذاری مجدد Xray.`);
      setTag("POMP-VLESS-PREMIUM");
    },
    onError: (e: Error) => toast.push("error", e.message),
  });

  const remove = useMutation({
    mutationFn: api.deleteInbound,
    onSuccess: () => {
      refresh();
      toast.push("success", "Inbound حذف شد.");
    },
    onError: (e: Error) => toast.push("error", e.message),
  });

  const createGamePreset = () => {
    create.mutate({ tag: "POMP-GAME-ROUTE", protocol: "vless", transport: "xhttp", expireDays: 0 });
  };

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    create.mutate({ tag, protocol, transport, expireDays });
  };

  const enabledCount = inbounds.filter((i) => i.enabled && (!i.expires_at || i.expires_at > Date.now())).length;

  return (
    <div className="pn-sub-page space-y-6" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-3xl">{t("inbounds")}</h1>
          <p className="text-sm font-base text-text/60">مدیریت ورودی‌های واقعی Xray، پورت‌ها و زمان اعتبار</p>
        </div>
        <Badge variant="info" className="h-9 gap-1.5 px-3">
          <Waypoints className="h-4 w-4 shrink-0" />
          {enabledCount} / {inbounds.length} فعال
        </Badge>
      </div>

      <Card className="pn-sub-card">
        <CardContent className="space-y-4 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-heading text-lg">ساخت Inbound جدید</h2>
              <p className="text-xs text-text/60">این فرم رکورد واقعی می‌سازد و تنظیمات آن وارد کانفیگ Xray می‌شود.</p>
            </div>
            <button type="button" onClick={createGamePreset} disabled={create.isPending}
              className="inline-flex items-center gap-2 rounded-xl border border-purple-400/40 bg-purple-500/10 px-3 py-2 text-xs text-purple-200 disabled:opacity-50">
              <Gamepad2 className="h-4 w-4" /> ساخت Game Route
            </button>
          </div>
          <form onSubmit={submit} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <label className="space-y-1 text-xs text-text/70">
              نام / Tag
              <input value={tag} onChange={(e) => setTag(e.target.value)} required minLength={2} maxLength={48}
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-text" />
            </label>
            <label className="space-y-1 text-xs text-text/70">
              پروتکل
              <select value={protocol} onChange={(e) => setProtocol(e.target.value as Protocol)}
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-text">
                <option value="vless">VLESS</option><option value="vmess">VMess</option><option value="trojan">Trojan</option>
              </select>
            </label>
            <label className="space-y-1 text-xs text-text/70">
              ترنسپورت
              <select value={transport} onChange={(e) => setTransport(e.target.value as Transport)}
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-text">
                <option value="xhttp">XHTTP</option><option value="ws">WebSocket</option><option value="httpupgrade">HTTP Upgrade</option>
              </select>
            </label>
            <label className="space-y-1 text-xs text-text/70">
              اعتبار Inbound (روز) · صفر = نامحدود
              <input type="number" min={0} max={3650} value={expireDays} onChange={(e) => setExpireDays(Number(e.target.value))}
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-text" />
            </label>
            <div className="flex items-end">
              <button type="submit" disabled={create.isPending || !tag.trim()}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-purple-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
                <Plus className="h-4 w-4" /> ایجاد Inbound
              </button>
            </div>
          </form>
          <p className="text-[11px] leading-6 text-text/50">
            پورت به‌صورت خودکار از محدوده XRAY_INBOUND_BASE_PORT انتخاب می‌شود. «Game Route» یک ورودی VLESS/XHTTP با مسیر خروجی Direct فعلی است؛ کاهش پینگ تضمین‌شدنی نیست و به موقعیت سرور، مسیر اپراتور و شبکه کاربر بستگی دارد.
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {inbounds.map((ib) => {
          const expired = !!ib.expires_at && ib.expires_at <= Date.now();
          return (
            <Card key={ib.id} className="overflow-hidden transition-transform hover:-translate-y-0.5">
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-base border-2 border-border font-heading text-sm uppercase text-black"
                      style={{ background: protocolAccent[ib.protocol] || "#8b35ff" }}>
                      {ib.protocol.slice(0, 2)}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate font-heading text-sm">{ib.tag}</div>
                      <div className="text-[10px] text-text/50">ID: {ib.id}</div>
                    </div>
                  </div>
                  <Switch checked={!!ib.enabled && !expired} disabled={expired}
                    onCheckedChange={(v) => toggle.mutate({ id: ib.id, enabled: v })} />
                </div>
                <div className="mt-3 grid grid-cols-3 gap-1.5">
                  <Badge variant="neutral" className="justify-center truncate text-[10px] uppercase">{ib.protocol}</Badge>
                  <Badge variant="default" className="justify-center truncate text-[10px] uppercase">{ib.transport}</Badge>
                  <Badge variant={expired ? "danger" : ib.enabled ? "success" : "neutral"} className="justify-center gap-1 text-[10px]">
                    <Lock className="h-3 w-3 shrink-0" /> {expired ? "منقضی" : ib.enabled ? "فعال" : "خاموش"}
                  </Badge>
                </div>
                <div className="mt-3 space-y-1.5 border-t border-border/30 pt-2.5 text-[11px] text-text/60">
                  <div className="flex items-center gap-2"><Network className="h-3.5 w-3.5" /><span>پورت داخلی</span><span className="mr-auto font-mono text-text/80">{ib.port}</span></div>
                  <div className="flex items-center gap-2"><Router className="h-3.5 w-3.5" /><span>Path</span><span className="mr-auto min-w-0 truncate font-mono text-text/80">{ib.path}</span></div>
                  <div className="flex items-center gap-2"><CalendarClock className="h-3.5 w-3.5" /><span>انقضا</span>
                    <span className="mr-auto text-text/80">{ib.expires_at ? new Date(ib.expires_at).toLocaleString("fa-IR") : "بدون انقضا"}</span>
                  </div>
                </div>
                <button type="button" onClick={() => {
                  if (window.confirm("این Inbound حذف شود؟ فقط وقتی قابل حذف است که به هیچ کاربری اختصاص نداشته باشد.")) remove.mutate(ib.id);
                }} disabled={remove.isPending}
                  className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-red-500/30 px-3 py-2 text-xs text-red-300 hover:bg-red-500/10 disabled:opacity-50">
                  <Trash2 className="h-3.5 w-3.5" /> حذف امن Inbound
                </button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
