import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Server, Plus, Copy, RefreshCw, Trash2, Power, ShieldCheck, Activity } from "lucide-react";
import { api, type NodeRecord } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const time = (value: number | null) => value ? new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "هنوز متصل نشده";
const stateText: Record<NodeRecord["status"], string> = { online: "آنلاین", pending: "در انتظار اتصال", error: "دارای خطا", disabled: "غیرفعال", offline: "آفلاین" };

export default function NodesPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const [name, setName] = React.useState("");
  const [endpoint, setEndpoint] = React.useState("");
  const [newToken, setNewToken] = React.useState("");
  const [tokenNode, setTokenNode] = React.useState("");
  const [selected, setSelected] = React.useState<number[]>([]);
  const nodesQuery = useQuery({ queryKey: ["managed-nodes"], queryFn: api.nodes, refetchInterval: 10000 });
  const inboundQuery = useQuery({ queryKey: ["inbounds"], queryFn: api.inbounds });
  const nodes = nodesQuery.data?.nodes ?? [];
  const inbounds = (inboundQuery.data ?? []).filter(ib => ib.protocol === "wireguard");
  const refresh = () => qc.invalidateQueries({ queryKey: ["managed-nodes"] });

  const create = useMutation({
    mutationFn: () => api.createNode({ name: name.trim(), endpoint: endpoint.trim() || undefined, inboundIds: selected }),
    onSuccess: result => {
      setNewToken(result.token); setTokenNode(result.name); setName(""); setEndpoint(""); setSelected([]);
      toast.push("success", "نود ثبت شد. توکن فقط همین یک‌بار نمایش داده می‌شود.");
      refresh();
    },
    onError: (e: Error) => toast.push("error", e.message),
  });
  const toggle = useMutation({
    mutationFn: (node: NodeRecord) => api.updateNode(node.id, { enabled: !node.enabled }),
    onSuccess: refresh, onError: (e: Error) => toast.push("error", e.message),
  });
  const rotate = useMutation({
    mutationFn: (node: NodeRecord) => api.rotateNodeToken(node.id),
    onSuccess: (result, node) => { setNewToken(result.token); setTokenNode(node.name); toast.push("success", "توکن جدید ساخته شد؛ توکن قبلی دیگر معتبر نیست."); refresh(); },
    onError: (e: Error) => toast.push("error", e.message),
  });
  const remove = useMutation({
    mutationFn: (id: number) => api.deleteNode(id),
    onSuccess: () => { toast.push("success", "نود از رجیستری حذف شد."); refresh(); },
    onError: (e: Error) => toast.push("error", e.message),
  });

  const copy = async (value: string) => {
    try { await navigator.clipboard.writeText(value); toast.push("success", "کپی شد."); }
    catch { toast.push("error", "مرورگر اجازه کپی نداد؛ متن را دستی انتخاب کنید."); }
  };
  const installText = `POMP_CONTROLLER_URL=https://YOUR-PANEL-DOMAIN
POMP_NODE_TOKEN=${newToken}
POMP_NODE_POLL_MS=30000
POMP_NODE_DATA_DIR=/var/lib/pompnet-node
XRAY_BIN=/usr/local/bin/xray`;

  return <div className="space-y-6" dir="rtl">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="font-heading text-3xl">مدیریت نودهای مستقل</h1><p className="mt-1 text-sm text-text/60">اتصال امن نودهای لینوکسی، همگام‌سازی WireGuard UDP و پایش heartbeat</p></div>
      <Button variant="neutral" onClick={refresh}><RefreshCw className="h-4 w-4"/> تازه‌سازی</Button>
    </div>
    <div className="grid gap-3 sm:grid-cols-3">
      <Card><CardContent className="p-4"><div className="text-xs text-text/60">کل نودها</div><div className="mt-1 text-2xl font-heading">{nodes.length}</div></CardContent></Card>
      <Card><CardContent className="p-4"><div className="text-xs text-text/60">آنلاین</div><div className="mt-1 text-2xl font-heading">{nodes.filter(n=>n.status==="online" && n.enabled).length}</div></CardContent></Card>
      <Card><CardContent className="p-4"><div className="text-xs text-text/60">نیازمند بررسی</div><div className="mt-1 text-2xl font-heading">{nodes.filter(n=>n.status==="error" || n.status==="pending").length}</div></CardContent></Card>
    </div>
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><Plus className="h-5 w-5"/> ثبت نود جدید</CardTitle></CardHeader>
      <CardContent><form className="grid gap-3 md:grid-cols-2" onSubmit={e=>{e.preventDefault();create.mutate();}}>
        <label className="space-y-1 text-xs text-text/60">نام نود<input value={name} onChange={e=>setName(e.target.value)} required minLength={2} maxLength={64} placeholder="مثلاً POMP-NODE-DE-01" className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-text"/></label>
        <label className="space-y-1 text-xs text-text/60">آدرس عمومی نود (برای لینک WireGuard لازم است)<input value={endpoint} onChange={e=>setEndpoint(e.target.value)} required placeholder="https://node.example.com" className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-text"/></label>
        <div className="md:col-span-2 space-y-2"><div className="text-xs text-text/60">اینباندهای WireGuard این نود · انتخاب‌نکردن = همه ورودی‌های WireGuard</div><div className="flex flex-wrap gap-2">{inbounds.map(ib=><button key={ib.id} type="button" onClick={()=>setSelected(old=>old.includes(ib.id)?old.filter(x=>x!==ib.id):[...old,ib.id])} className={"rounded-lg border px-3 py-2 text-xs "+(selected.includes(ib.id)?"border-violet-400 bg-violet-500/15":"border-border bg-background")}>{ib.tag}</button>)}</div></div>
        <div className="md:col-span-2"><Button type="submit" disabled={create.isPending || name.trim().length<2}><Plus className="h-4 w-4"/>{create.isPending?"در حال ثبت…":"ثبت نود و ساخت توکن امن"}</Button></div>
      </form></CardContent>
    </Card>
    {newToken && <Card className="border-emerald-400/40"><CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-emerald-400"/> توکن نود {tokenNode}</CardTitle></CardHeader><CardContent className="space-y-3">
      <p className="text-sm text-amber-200">این توکن فقط یک‌بار نمایش داده می‌شود. همین حالا آن را در فایل env نود قرار بده؛ در دیتابیس فقط هش توکن ذخیره شده است.</p>
      <div className="break-all rounded-lg border border-border bg-black/30 p-3 font-mono text-xs" dir="ltr">{newToken}</div>
      <Button onClick={()=>copy(newToken)}><Copy className="h-4 w-4"/> کپی توکن</Button>
      <div className="text-xs text-text/60">مقادیر پایه فایل /etc/pompnet-node.env</div>
      <pre dir="ltr" className="overflow-x-auto rounded-lg border border-border bg-black/30 p-3 text-xs">{installText}</pre>
      <Button variant="neutral" onClick={()=>copy(installText)}><Copy className="h-4 w-4"/> کپی تنظیمات نصب</Button>
      <Button variant="neutral" onClick={()=>setNewToken("")}>بستن نمایش توکن</Button>
    </CardContent></Card>}
    <div className="space-y-3">
      {nodesQuery.isLoading && <p className="text-center text-sm text-text/50">در حال دریافت نودها…</p>}
      {nodesQuery.isError && <p className="text-center text-sm text-red-300">دریافت نودها ناموفق بود.</p>}
      {!nodesQuery.isLoading && nodes.length===0 && <Card><CardContent className="p-8 text-center text-sm text-text/50">هنوز نودی ثبت نشده است.</CardContent></Card>}
      {nodes.map(node=><Card key={node.id}><CardContent className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><Server className="h-5 w-5 text-violet-300"/><span className="font-heading">{node.name}</span><Badge variant={node.status==="online"?"success":node.status==="error"?"warning":"neutral"}>{stateText[node.status] || node.status}</Badge>{!node.enabled&&<Badge variant="neutral">غیرفعال</Badge>}</div>
          <div className="mt-2 grid gap-1 text-xs text-text/55 sm:grid-cols-2"><span>آخرین ارتباط: {time(node.last_seen)}</span><span>Agent: {node.agent_version || "—"}</span><span>Xray: {node.xray_version || "—"}</span><span>سیستم: {[node.platform,node.arch].filter(Boolean).join(" / ") || "—"}</span><span>اینباندها: {node.inbound_ids.length ? node.inbound_ids.join(", ") : "همه فعال‌ها"}</span></div>
          {node.last_error&&<p className="mt-2 break-words text-xs text-amber-300">{node.last_error}</p>}
          {node.endpoint&&<p className="mt-1 break-all text-xs text-text/40" dir="ltr">{node.endpoint}</p>}
        </div>
        <div className="flex flex-wrap gap-2"><Button size="sm" variant="neutral" onClick={()=>toggle.mutate(node)} disabled={toggle.isPending}><Power className="h-4 w-4"/>{node.enabled?"غیرفعال‌سازی":"فعال‌سازی"}</Button><Button size="sm" variant="neutral" onClick={()=>rotate.mutate(node)} disabled={rotate.isPending}><ShieldCheck className="h-4 w-4"/>تعویض توکن</Button><Button size="sm" variant="neutral" onClick={()=>{if(confirm("این نود از پنل حذف شود؟"))remove.mutate(node.id);}} disabled={remove.isPending}><Trash2 className="h-4 w-4"/>حذف</Button></div>
      </CardContent></Card>)}
    </div>
    <Card><CardContent className="flex items-start gap-3 p-4 text-xs leading-6 text-text/60"><Activity className="mt-1 h-5 w-5 shrink-0 text-sky-300"/><div>وضعیت آنلاین فقط از heartbeat احراز هویت‌شده Agent به‌دست می‌آید؛ برای اطمینان از اتصال کاربر، پس از نصب باید پورت‌های انتخاب‌شده را در فایروال نود باز کنی و با یک کلاینت واقعی تست کنی.</div></CardContent></Card>
  </div>;
}
