import * as React from "react";
import { Heart, ShieldCheck } from "lucide-react";

export function BrandSignature({ compact = false }: { compact?: boolean }) {
  return (
    <section dir="rtl" aria-label="POMP NET MOHAMMAD project signature" className={compact ? "mb-5 overflow-hidden rounded-2xl border border-violet-400/25 bg-[#100d20]/90 shadow-[0_0_28px_rgba(139,53,255,.10)]" : "w-full overflow-hidden rounded-2xl border border-violet-400/30 bg-[#100d20]/95 shadow-[0_0_38px_rgba(139,53,255,.16)]"}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" /></span>
          <span className="text-[10px] font-bold tracking-[.18em] text-emerald-300">LIVE SYSTEM · POMP NET</span>
        </div>
        <span className="text-[10px] tracking-wider text-violet-200/70">QUANTUM NEXUS</span>
      </div>
      <div className="grid gap-3 px-4 py-4 sm:grid-cols-[1fr_auto] sm:items-center sm:px-5">
        <div>
          <div className="flex items-center gap-2 text-sm font-bold text-white"><ShieldCheck className="h-4 w-4 text-sky-300" />کدنویسی و توسعه اختصاصی توسط تیم پمپ‌نت</div>
          <p className="mt-1 text-xs leading-6 text-slate-300">بنیان‌گذار و مالک پروژه: <span className="font-bold text-white">آقای محمدی</span><span className="mx-2 text-violet-300/60">✦</span>قدرت ساخت، آزادی انتخاب، کنترل در دستان تو</p>
        </div>
        <div className="rounded-xl border border-violet-300/20 bg-violet-500/10 px-3 py-2">
          <div className="flex items-center gap-2 text-xs font-bold text-violet-100"><Heart className="h-4 w-4 fill-current text-pink-300" />حمایت از توسعه پروژه</div>
          <p className="mt-1 text-[10px] text-slate-300">بانک مسکن · به نام آقای محمدی</p>
          <p className="mt-1 text-[10px] text-slate-400">اطلاعات پرداخت امن از مسیر رسمی پشتیبانی اعلام می‌شود.</p>
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-white/10 bg-black/20 px-4 py-2 text-[9px] tracking-wider text-slate-400 sm:px-5"><span>DESIGNED &amp; ENGINEERED BY POMP NET TEAM</span><span>FOUNDER · MOHAMMAD</span></div>
    </section>
  );
}
