import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageCircle, Send, RefreshCw, CheckCircle2, Clock3 } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";

type Ticket = {
  id: number; user_id: number | null; user_email: string | null; telegram_id: string;
  subject: string; status: "open" | "pending" | "closed"; priority: "low" | "normal" | "high";
  created_at: number; updated_at: number; message_count: number;
};
type Message = { id: number; ticket_id: number; sender_type: string; sender_id: string; message: string; created_at: number };

const date = (value: number) => new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
const statusText: Record<Ticket["status"], string> = { open: "باز", pending: "در انتظار کاربر", closed: "بسته‌شده" };
const priorityText: Record<Ticket["priority"], string> = { low: "کم", normal: "عادی", high: "مهم" };

export default function SupportPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const [selected, setSelected] = React.useState<number | null>(null);
  const [message, setMessage] = React.useState("");
  const [filter, setFilter] = React.useState<"all" | Ticket["status"]>("all");
  const ticketsQuery = useQuery({ queryKey: ["support-tickets"], queryFn: api.supportTickets, refetchInterval: 12000 });
  const tickets = ticketsQuery.data?.tickets ?? [];
  React.useEffect(() => {
    if (selected === null && tickets.length) setSelected(tickets[0].id);
    if (selected !== null && !tickets.some(t => t.id === selected)) setSelected(tickets[0]?.id ?? null);
  }, [tickets, selected]);
  const detailQuery = useQuery({
    queryKey: ["support-ticket", selected],
    queryFn: () => api.supportTicket(selected!),
    enabled: selected !== null,
    refetchInterval: 12000,
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["support-tickets"] });
    if (selected !== null) void qc.invalidateQueries({ queryKey: ["support-ticket", selected] });
  };
  const reply = useMutation({
    mutationFn: () => api.replySupportTicket(selected!, message.trim()),
    onSuccess: result => {
      setMessage("");
      toast.push(result.telegramDelivered ? "success" : "warning", result.telegramDelivered ? "پاسخ ثبت و در تلگرام ارسال شد." : "پاسخ ثبت شد؛ ارسال تلگرام تأیید نشد.");
      refresh();
    },
    onError: (e: Error) => toast.push("error", e.message),
  });
  const update = useMutation({
    mutationFn: (status: Ticket["status"]) => api.updateSupportTicket(selected!, status),
    onSuccess: () => { toast.push("success", "وضعیت تیکت به‌روزرسانی شد."); refresh(); },
    onError: (e: Error) => toast.push("error", e.message),
  });
  const visible = tickets.filter(t => filter === "all" || t.status === filter);
  const detail = detailQuery.data;
  const messages = detail?.messages ?? [];
  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-3xl">مرکز پشتیبانی POMP NET</h1>
          <p className="mt-1 text-sm text-text/60">مدیریت تیکت‌های واقعی کاربران و پاسخ‌گویی از طریق تلگرام</p>
        </div>
        <Button variant="neutral" onClick={refresh}><RefreshCw className="h-4 w-4" /> تازه‌سازی</Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardContent className="p-4"><div className="text-xs text-text/60">کل تیکت‌ها</div><div className="mt-1 text-2xl font-heading">{tickets.length}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-text/60">باز</div><div className="mt-1 text-2xl font-heading">{tickets.filter(t=>t.status==="open").length}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-text/60">در انتظار</div><div className="mt-1 text-2xl font-heading">{tickets.filter(t=>t.status==="pending").length}</div></CardContent></Card>
      </div>
      <div className="grid min-h-[560px] gap-4 lg:grid-cols-[minmax(260px,360px)_1fr]">
        <Card className="min-w-0 overflow-hidden">
          <CardHeader className="border-b border-border/30 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base">صندوق تیکت‌ها</CardTitle>
              <select aria-label="فیلتر تیکت‌ها" className="rounded-base border-2 border-border bg-bw px-2 py-1 text-xs" value={filter} onChange={e=>setFilter(e.target.value as typeof filter)}>
                <option value="all">همه</option><option value="open">باز</option><option value="pending">در انتظار</option><option value="closed">بسته</option>
              </select>
            </div>
          </CardHeader>
          <CardContent className="max-h-[620px] space-y-2 overflow-y-auto p-3">
            {ticketsQuery.isLoading && <p className="p-5 text-center text-sm text-text/50">در حال دریافت تیکت‌ها…</p>}
            {ticketsQuery.isError && <p className="p-5 text-center text-sm text-red-300">دریافت تیکت‌ها ناموفق بود. اتصال و مجوز کاربران را بررسی کنید.</p>}
            {!ticketsQuery.isLoading && visible.length===0 && <p className="p-6 text-center text-sm text-text/50">تیکتی در این فیلتر وجود ندارد.</p>}
            {visible.map(ticket=><button key={ticket.id} onClick={()=>setSelected(ticket.id)} className={"w-full rounded-base border-2 p-3 text-right transition "+(selected===ticket.id?"border-violet-400/70 bg-violet-500/10":"border-border/50 bg-bg/30 hover:border-violet-400/40")}>
              <div className="flex items-center justify-between gap-2"><span className="font-heading text-sm">#{ticket.id} · {ticket.subject}</span><Badge variant={ticket.status==="open"?"warning":ticket.status==="closed"?"neutral":"info"}>{statusText[ticket.status]}</Badge></div>
              <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-text/55"><span>{ticket.user_email || ticket.telegram_id || "کاربر ناشناس"}</span><span>{ticket.message_count} پیام</span></div>
              <div className="mt-1 text-[10px] text-text/40">{date(ticket.updated_at)}</div>
            </button>)}
          </CardContent>
        </Card>
        <Card className="min-w-0 overflow-hidden">
          {!selected ? <CardContent className="grid min-h-[500px] place-items-center text-center text-text/50"><div><MessageCircle className="mx-auto mb-3 h-10 w-10"/><p>برای مشاهده گفتگو یک تیکت را انتخاب کنید.</p></div></CardContent> : <>
            <CardHeader className="border-b border-border/30 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><CardTitle className="text-lg">{String(detail?.ticket.subject ?? "در حال دریافت…")}</CardTitle><p className="mt-1 text-xs text-text/50">تیکت #{selected} · {String(detail?.ticket.user_email ?? detail?.ticket.telegram_id ?? "")}</p></div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="neutral" disabled={update.isPending || detail?.ticket.status==="pending"} onClick={()=>update.mutate("pending")}><Clock3 className="h-4 w-4"/>در انتظار</Button>
                  <Button size="sm" variant="neutral" disabled={update.isPending || detail?.ticket.status==="closed"} onClick={()=>update.mutate("closed")}><CheckCircle2 className="h-4 w-4"/>بستن تیکت</Button>
                  <Button size="sm" variant="neutral" disabled={update.isPending || detail?.ticket.status==="open"} onClick={()=>update.mutate("open")}>بازگشایی</Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex min-h-[470px] flex-col p-4">
              <div className="flex-1 space-y-3 overflow-y-auto pb-4">
                {detailQuery.isLoading && <p className="text-center text-sm text-text/50">در حال بارگذاری گفتگو…</p>}
                {detailQuery.isError && <p className="text-center text-sm text-red-300">گفتگو بارگذاری نشد.</p>}
                {messages.map((m: Message)=><div key={m.id} className={"max-w-[90%] rounded-xl border p-3 "+(m.sender_type==="admin"?"mr-auto border-sky-400/30 bg-sky-500/10":"ml-auto border-violet-400/30 bg-violet-500/10")}>
                  <div className="mb-1 flex items-center justify-between gap-3 text-[10px] text-text/50"><span>{m.sender_type==="admin"?"پشتیبانی · "+m.sender_id:"کاربر · "+m.sender_id}</span><span>{date(m.created_at)}</span></div>
                  <p className="whitespace-pre-wrap break-words text-sm leading-7">{m.message}</p>
                </div>)}
              </div>
              <div className="space-y-2 border-t border-border/30 pt-3">
                <Textarea value={message} onChange={e=>setMessage(e.target.value)} placeholder="پاسخ خود را بنویسید…" rows={3} maxLength={4000} disabled={detail?.ticket.status==="closed"}/>
                <div className="flex items-center justify-between gap-2"><span className="text-[10px] text-text/40">{message.length}/4000 · پاسخ از طریق تلگرام نیز ارسال می‌شود.</span><Button disabled={!message.trim() || reply.isPending || detail?.ticket.status==="closed"} onClick={()=>reply.mutate()}><Send className="h-4 w-4"/>{reply.isPending?"در حال ارسال…":"ارسال پاسخ"}</Button></div>
              </div>
            </CardContent>
          </>}
        </Card>
      </div>
    </div>
  );
}
