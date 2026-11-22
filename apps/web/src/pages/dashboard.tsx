import * as React from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Activity, Users, UserCheck, Database,
  CircleCheck, CircleX, RotateCw, Download, Upload, Server, Copy,
  ExternalLink, Wifi, ShieldCheck, Clock3, Router,
} from "lucide-react";
import { Link } from "react-router-dom";
import { api, exportBackupUrl } from "@/lib/api";
import { formatBytes, pct, cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { QrCode } from "@/components/qr-code";
import type { SystemStats, User, UserSummary, Inbound } from "@/lib/types";

type TrafficPoint = { ts: number; up: number; down: number };

function MetricCard({ icon: Icon, label, value, detail, tone }: {
  icon: React.ElementType; label: string; value: string; detail: string; tone: "purple" | "blue" | "green" | "pink";
}) {
  return (
    <Card className={cn("pn-metric pn-metric-" + tone, "overflow-hidden")}>
      <CardContent className="flex min-h-[132px] items-center justify-between gap-3 p-4 sm:p-5">
        <div className="min-w-0">
          <div className="text-xs text-text/65">{label}</div>
          <div className="mt-2 break-words font-heading text-2xl font-bold sm:text-3xl">{value}</div>
          <div className="mt-2 text-[11px] text-text/55">{detail}</div>
        </div>
        <div className="pn-metric-icon"><Icon className="h-7 w-7" /></div>
      </CardContent>
    </Card>
  );
}

function TrafficChart({ points }: { points: TrafficPoint[] }) {
  const valid = points.filter((p) => Number.isFinite(p.up) && Number.isFinite(p.down));
  if (valid.length < 2) {
    return <div className="grid min-h-[210px] place-items-center text-sm text-text/55">هنوز دادهٔ تاریخی کافی برای نمودار ترافیک ثبت نشده است.</div>;
  }
  const max = Math.max(1, ...valid.flatMap((p) => [p.up, p.down]));
  const x = (i: number) => 18 + (i / (valid.length - 1)) * 94;
  const y = (v: number) => 86 - (v / max) * 72;
  const path = (key: "up" | "down") => valid.map((p, i) => (i ? "L" : "M") + x(i) + " " + y(p[key])).join(" ");
  const last = valid[valid.length - 1];
  return (
    <div className="w-full">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-text/65">
        <div className="flex gap-4"><span><i className="pn-dot pn-dot-blue" />دریافت</span><span><i className="pn-dot pn-dot-purple" />ارسال</span></div>
        <span>آخرین نمونه: {new Date(last.ts).toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" })}</span>
      </div>
      <svg viewBox="0 0 120 100" role="img" aria-label="نمودار واقعی ترافیک سرور" className="pn-traffic-chart">
        {[20, 42, 64, 86].map((v) => <line key={v} x1="18" x2="112" y1={v} y2={v} className="pn-chart-grid" />)}
        <path d={path("down")} className="pn-chart-line pn-chart-blue" />
        <path d={path("up")} className="pn-chart-line pn-chart-purple" />
        <circle cx={x(valid.length - 1)} cy={y(last.down)} r="2.2" className="pn-chart-point-blue" />
        <circle cx={x(valid.length - 1)} cy={y(last.up)} r="2.2" className="pn-chart-point-purple" />
      </svg>
      <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-xl bg-blue-500/10 p-3"><span className="text-text/55">دریافت کل ثبت‌شده</span><strong className="mt-1 block text-blue-300">{formatBytes(last.down)}</strong></div>
        <div className="rounded-xl bg-purple-500/10 p-3"><span className="text-text/55">ارسال کل ثبت‌شده</span><strong className="mt-1 block text-purple-300">{formatBytes(last.up)}</strong></div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const toast = useToast();
  const { t } = useI18n();
  const { can } = useAuth();
  const [importing, setImporting] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const { data: system } = useQuery<SystemStats>({ queryKey: ["system"], queryFn: api.system, refetchInterval: 5000 });
  const { data: userData } = useQuery<{ users: User[]; summary: UserSummary }>({
    queryKey: ["users"], queryFn: api.users, enabled: can("users"), refetchInterval: 10000,
  });
  const { data: inbounds = [] } = useQuery<Inbound[]>({
    queryKey: ["inbounds"], queryFn: api.inbounds, enabled: can("inbounds"), refetchInterval: 15000,
  });
  const { data: traffic } = useQuery<{ server: TrafficPoint[]; inbounds: { inbound_tag: string; up: number; down: number }[] }>({
    queryKey: ["traffic-stats"], queryFn: api.trafficStats, refetchInterval: 10000,
  });

  const restartMut = useMutation({
    mutationFn: () => api.restartXray(),
    onSuccess: () => toast.push("success", t("xrayRestarted")),
    onError: (e: Error) => toast.push("error", e.message),
  });

  const onExport = () => { window.open(exportBackupUrl(), "_blank"); toast.push("success", t("backupExportStarted")); };
  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try { await api.importBackup(JSON.parse(await file.text())); toast.push("success", t("backupImported")); }
    catch (err) { toast.push("error", (err as Error).message || t("invalidBackup")); }
    finally { setImporting(false); if (fileRef.current) fileRef.current.value = ""; }
  };

  const users = userData?.users ?? [];
  const summary = userData?.summary;
  const usedTraffic = users.reduce((sum, user) => sum + (Number(user.total) || 0), 0);
  const latestUsers = [...users].sort((a, b) => b.created_at - a.created_at).slice(0, 5);
  const firstSub = latestUsers[0] ? window.location.origin + "/sub/" + latestUsers[0].sub_token : "";
  const onlineInbounds = inbounds.filter((item) => item.enabled === 1).length;
  const uptime = system ? Math.floor(system.uptime / 86400) + " روز" : "—";

  return (
    <div className="pn-dashboard space-y-5" dir="rtl">
      <section className="pn-hero">
        <div className="pn-hero-art"><span className="pn-hero-orbit" /><span className="pn-hero-mark">✦</span></div>
        <div className="relative z-10">
          <div className="mb-2 text-xs font-semibold tracking-[.18em] text-cyan-200">POMP NET MOHAMMAD · QUANTUM NEXUS</div>
          <h1 className="text-2xl font-black sm:text-3xl">به پنل پمپ نت محمد خوش آمدید</h1>
          <p className="mt-3 max-w-2xl text-sm text-slate-300">قدرت ساخت، آزادی انتخاب، کنترل در دستان تو</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Badge variant={system?.xray.running ? "success" : "danger"} className="gap-1.5 px-3 py-1.5">
              {system?.xray.running ? <CircleCheck className="h-4 w-4" /> : <CircleX className="h-4 w-4" />}
              Xray · {system?.xray.running ? "فعال" : "متوقف"}
            </Badge>
            <Badge variant="neutral" className="gap-1.5 px-3 py-1.5"><Clock3 className="h-4 w-4" /> uptime: {uptime}</Badge>
            <Button size="sm" variant="neutral" onClick={() => restartMut.mutate()} disabled={restartMut.isPending}>
              <RotateCw className={cn("ml-2 h-4 w-4", restartMut.isPending && "animate-spin")} />راه‌اندازی مجدد Xray
            </Button>
          </div>
        </div>
        <div className="pn-hero-brand" aria-hidden="true">POMP NET<br/><b>MOHAMMAD</b><small>SELFVERSE</small></div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {can("users") && <MetricCard icon={Users} label="کل کاربران" value={summary ? summary.clients.toLocaleString("fa-IR") : "—"} detail={summary ? summary.online.toLocaleString("fa-IR") + " آنلاین" : "دادهٔ کاربران در دسترس نیست"} tone="purple" />}
        {can("users") && <MetricCard icon={Database} label="مصرف ثبت‌شده کاربران" value={formatBytes(usedTraffic)} detail="جمع مصرف آپلود و دانلود کاربران" tone="blue" />}
        {can("users") && <MetricCard icon={UserCheck} label="کاربران فعال" value={summary ? summary.active.toLocaleString("fa-IR") : "—"} detail={summary ? summary.depleting.toLocaleString("fa-IR") + " نزدیک سقف حجم" : "وضعیت کاربران"} tone="pink" />}
        <MetricCard icon={Server} label="وضعیت سرویس" value={system?.xray.running ? "آنلاین" : system ? "متوقف" : "در حال بررسی"} detail={system?.xray.version ? "Xray " + system.xray.version : "وضعیت واقعی پردازش"} tone="green" />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.7fr_1fr]">
        <Card className="pn-panel-card">
          <CardContent className="p-4 sm:p-5">
            <div className="mb-4 flex items-center justify-between gap-3"><div><h2 className="font-heading text-lg">آمار ترافیک سرور</h2><p className="mt-1 text-xs text-text/55">داده‌های ثبت‌شده توسط Xray · به‌روزرسانی خودکار</p></div><Activity className="h-5 w-5 text-blue-300" /></div>
            <TrafficChart points={traffic?.server ?? []} />
          </CardContent>
        </Card>
        <Card className="pn-panel-card">
          <CardContent className="p-4 sm:p-5">
            <div className="mb-4 flex items-center gap-2"><Server className="h-5 w-5 text-purple-300" /><h2 className="font-heading text-lg">اطلاعات سرور و منابع</h2></div>
            <div className="space-y-4">
              <div className="pn-resource"><div className="flex justify-between text-sm"><span>پردازنده CPU</span><b>{system ? pct(system.cpu.usage) : "—"}</b></div><div className="pn-resource-track"><i style={{width: (system?.cpu.usage ?? 0) + "%"}} /></div></div>
              <div className="pn-resource"><div className="flex justify-between text-sm"><span>حافظه RAM</span><b>{system ? pct(system.ram.usage) : "—"}</b></div><div className="pn-resource-track blue"><i style={{width: (system?.ram.usage ?? 0) + "%"}} /></div><small>{system ? formatBytes(system.ram.used) + " / " + formatBytes(system.ram.total) : "—"}</small></div>
              <div className="pn-resource"><div className="flex justify-between text-sm"><span>فضای ذخیره‌سازی</span><b>{system ? pct(system.storage.usage) : "—"}</b></div><div className="pn-resource-track"><i style={{width: (system?.storage.usage ?? 0) + "%"}} /></div><small>{system ? formatBytes(system.storage.free) + " آزاد" : "—"}</small></div>
              <div className="pn-server-meta"><span>IP سرور</span><b>{system?.ip.address || "نامشخص"}</b><span>موقعیت</span><b>{system?.ip.location || "نامشخص"}</b><span>نسخه Xray</span><b>{system?.xray.version || "—"}</b><span>این‌باندهای فعال</span><b>{can("inbounds") ? onlineInbounds.toLocaleString("fa-IR") : "بدون دسترسی"}</b></div>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
        {can("users") && <Card className="pn-panel-card overflow-hidden"><CardContent className="p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between"><h2 className="font-heading text-lg">آخرین کاربران ثبت‌شده</h2><Link to="/users" className="text-xs text-cyan-300 hover:text-white">مدیریت کاربران ←</Link></div>
          {latestUsers.length ? <div className="overflow-x-auto"><table className="pn-user-table w-full text-sm"><thead><tr><th>کاربر</th><th>مصرف</th><th>تاریخ ثبت</th><th>وضعیت</th></tr></thead><tbody>{latestUsers.map((user) => <tr key={user.id}><td className="font-semibold">{user.email}</td><td>{formatBytes(user.total)}</td><td>{new Date(user.created_at).toLocaleDateString("fa-IR")}</td><td><span className={user.enabled ? "pn-status-on" : "pn-status-off"}>{user.enabled ? "فعال" : "غیرفعال"}</span></td></tr>)}</tbody></table></div> : <div className="py-8 text-center text-sm text-text/55">هنوز کاربری ثبت نشده است.</div>}
        </CardContent></Card>}

        <Card className="pn-panel-card"><CardContent className="p-4 sm:p-5">
          <div className="mb-4 flex items-center gap-2"><Wifi className="h-5 w-5 text-cyan-300" /><h2 className="font-heading text-lg">اشتراک سریع</h2></div>
          {firstSub ? <div className="flex flex-wrap items-center gap-4"><QrCode value={firstSub} size={116} className="shrink-0" /><div className="min-w-0 flex-1"><p className="text-xs text-text/55">لینک اشتراک آخرین کاربر</p><p className="mt-2 break-all rounded-lg border border-white/10 bg-black/30 p-2 text-xs" dir="ltr">{firstSub}</p><Button size="sm" className="mt-3 w-full" onClick={() => { void navigator.clipboard.writeText(firstSub); toast.push("success", "لینک اشتراک کپی شد"); }}><Copy className="ml-2 h-4 w-4" />کپی لینک اشتراک</Button><a href={firstSub} target="_blank" rel="noreferrer" className="mt-3 flex items-center justify-center gap-1 text-xs text-cyan-300"><ExternalLink className="h-3 w-3" />مشاهده صفحه اشتراک</a></div></div> : <div className="py-8 text-center text-sm text-text/55">برای نمایش QR واقعی، ابتدا یک کاربر و اشتراک بسازید.</div>}
          <div className="mt-4 grid grid-cols-2 gap-2"><Link to="/users" className="pn-quick-link"><Users className="h-4 w-4"/>کاربران</Link><Link to="/inbounds" className="pn-quick-link"><Router className="h-4 w-4"/>این‌باندها</Link></div>
        </CardContent></Card>
      </section>

      <Card className="pn-panel-card"><CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div><h2 className="font-heading">پشتیبان‌گیری و بازیابی</h2><p className="mt-1 text-xs text-text/55">خروجی و بازیابی داده‌های پنل</p></div>
        <div className="flex flex-wrap gap-2"><Button variant="neutral" onClick={onExport}><Download className="ml-2 h-4 w-4"/>دریافت نسخه پشتیبان</Button><Button variant="neutral" onClick={() => fileRef.current?.click()} disabled={importing}><Upload className="ml-2 h-4 w-4"/>{importing ? "در حال بازیابی…" : "بازیابی نسخه پشتیبان"}</Button><input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={onFile}/></div>
      </CardContent></Card>
      <div className="flex flex-wrap items-center justify-center gap-3 pb-2 text-[11px] text-text/45"><span><ShieldCheck className="ml-1 inline h-3.5 w-3.5 text-emerald-400"/>اتصال API پنل</span><span>•</span><span>{system?.xray.running ? "Xray فعال" : "وضعیت Xray نامشخص یا متوقف"}</span><span>•</span><span>© POMP NET MOHAMMAD</span></div>
    </div>
  );
}
