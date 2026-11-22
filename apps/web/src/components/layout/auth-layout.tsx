import * as React from "react";
import { Github, Star, Tag, Languages, Send, CalendarDays, Clock3, ShieldCheck } from "lucide-react";
import { RailLogo } from "@/components/rail-logo";
import { useGitHubStars } from "@/components/github-button";
import { useToast } from "@/components/ui/toast";
import { useI18n, LANGUAGES, type Lang } from "@/lib/i18n";
import { GITHUB_URL, GITHUB_REPO, TELEGRAM_URL, PANEL_VERSION } from "@/lib/brand";
import { cn } from "@/lib/utils";

/**
 * A bold, modern shell for the Setup and Login pages. A split layout: a loud
 * neobrutalist brand panel on the left (desktop) and a frosted form panel on
 * the right. On mobile it stacks into a single centred column. Includes the
 * GitHub / version / language controls at the bottom.
 */
export function AuthShell({
  children,
  heading,
  sub,
  highlights,
}: {
  children: React.ReactNode;
  heading: string;
  sub: string;
  highlights?: { icon: React.ElementType; text: string }[];
}) {
  const { lang, setLang, t } = useI18n();
  const toast = useToast();
  const stars = useGitHubStars();
  const [now, setNow] = React.useState(() => new Date());
  React.useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const tehranDate = now.toLocaleDateString("fa-IR-u-ca-persian", { timeZone: "Asia/Tehran", weekday: "long", day: "numeric", month: "long" });
  const tehranTime = now.toLocaleTimeString("fa-IR", { timeZone: "Asia/Tehran", hour: "2-digit", minute: "2-digit", second: "2-digit" });

  const changeLang = (l: Lang) => {
    if (l === lang) return;
    setLang(l);
    toast.push("success", t("languageChanged"));
  };

  return (
    <div dir="rtl" className="pn-auth relative min-h-screen overflow-hidden bg-bg">
      {/* animated blobs + grid */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute inset-0 grid-dots opacity-50" />
        <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-main/30 blur-[110px] animate-[drift1_26s_ease-in-out_infinite]" />
        <div className="absolute -right-24 top-1/3 h-96 w-96 rounded-full bg-sky-400/25 blur-[120px] animate-[drift2_32s_ease-in-out_infinite]" />
        <div className="absolute bottom-[-10%] left-1/3 h-80 w-80 rounded-full bg-blue-500/20 blur-[110px] animate-[drift3_36s_ease-in-out_infinite]" />
      </div>

      <div className="relative mx-auto flex min-h-screen max-w-6xl flex-col justify-center gap-5 p-4 sm:p-6 lg:p-8">
        <div className="pn-auth-frame grid w-full overflow-hidden rounded-[28px] border border-white/10 shadow-[0_30px_100px_rgba(0,0,0,.55)] lg:grid-cols-[1.05fr_1fr]">
          {/* Brand / hero panel */}
          <div className="pn-auth-hero relative hidden min-h-[620px] flex-col justify-between overflow-hidden p-10 text-white lg:flex">
            <div className="pointer-events-none absolute inset-0 opacity-30 [background-image:radial-gradient(rgba(168,110,255,.28)_1px,transparent_1px)] [background-size:24px_24px]" />
            <div className="relative flex items-center gap-3">
              <div className="grid h-14 w-14 place-items-center rounded-2xl border border-white/15 bg-white/10 text-white shadow-[0_0_35px_rgba(139,53,255,.35)] backdrop-blur-xl animate-float">
                <RailLogo className="h-8 w-8" />
              </div>
              <div>
                <div className="font-heading text-2xl font-black leading-none tracking-tight xl:text-3xl">POMP NET MOHAMMAD</div>
                <div className="mt-2 text-sm font-base text-white/65">
                  SELFVERSE · Xray Management
                </div>
              </div>
            </div>

            <div className="relative space-y-5">
              <div className="mb-3 h-px w-36 bg-gradient-to-l from-[#168cff] via-[#8b35ff] to-transparent shadow-[0_0_12px_rgba(139,53,255,.7)]" />\n              <h2 className="max-w-[16ch] font-heading text-4xl leading-[1.2] xl:text-5xl">{heading}</h2>
              <p className="max-w-[34ch] font-base text-base leading-8 text-white/70">{sub}</p>
              {highlights && (
                <ul className="space-y-3 pt-3">
                  {highlights.map((h, i) => (
                    <li
                      key={h.text}
                      className="flex items-center gap-3 animate-slide-up"
                      style={{ animationDelay: `${120 + i * 90}ms` }}
                    >
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/10 text-[#b78cff]">
                        <h.icon className="h-4 w-4" />
                      </span>
                      <span className="font-base text-sm text-white/85">{h.text}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="relative border-t border-white/10 pt-5 text-[10px] font-heading uppercase tracking-[.28em] text-white/40">
              POMP NET MOHAMMAD · SELFVERSE
            </div>
          </div>

          {/* Form panel */}
          <div className="pn-auth-form flex flex-col justify-center gap-6 p-6 sm:p-10 lg:p-12">
            <div className="animate-slide-up">
              <div className="mb-5 flex items-center gap-3 lg:hidden">
                <div className="grid h-12 w-12 place-items-center rounded-2xl border border-white/15 bg-gradient-to-br from-[#8b35ff] to-[#168cff] text-white shadow-[0_0_28px_rgba(139,53,255,.35)] animate-float">
                  <RailLogo className="h-7 w-7" />
                </div>
                <div className="font-heading text-xl tracking-tight text-white">POMP NET MOHAMMAD</div>
              </div>
              <h1 className="font-heading text-3xl tracking-tight text-white">{heading}</h1>
              <p className="mt-2 text-sm font-base leading-7 text-white/55">{sub}</p>
            </div>

            <div className="animate-slide-up" style={{ animationDelay: "80ms" }}>
              {children}
            </div>

            <div className="flex flex-col gap-2 animate-slide-up" style={{ animationDelay: "160ms" }}>
              <div className="grid grid-cols-2 gap-2">
                <a
                  href={GITHUB_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[.04] px-3 py-3 font-heading text-xs text-white/75 transition-all hover:-translate-y-0.5 hover:border-[#8b35ff]/50 hover:bg-[#8b35ff]/10 hover:text-white"
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    <Github className="h-4 w-4 shrink-0" />
                    <span className="truncate">{GITHUB_REPO}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1 rounded-[4px] border-2 border-border bg-main px-1.5 text-mtext">
                    <Star className="h-3 w-3" fill="currentColor" />
                    {stars ?? 0}
                  </span>
                </a>
                <a
                  href={TELEGRAM_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/[.04] px-3 py-3 font-heading text-xs text-white/75 transition-all hover:-translate-y-0.5 hover:border-[#8b35ff]/50 hover:bg-[#8b35ff]/10 hover:text-white"
                >
                  <Send className="h-4 w-4 shrink-0" />
                  <span className="truncate">Telegram</span>
                </a>
                <a
                  href={`${GITHUB_URL}/releases`}
                  target="_blank"
                  rel="noreferrer"
                  className="col-span-2 flex items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/[.04] px-3 py-3 font-heading text-xs text-white/75 transition-all hover:-translate-y-0.5 hover:border-[#8b35ff]/50 hover:bg-[#8b35ff]/10 hover:text-white"
                >
                  <Tag className="h-4 w-4 shrink-0" />
                  <span className="truncate">v{PANEL_VERSION}</span>
                </a>
              </div>

              <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/[.04] p-1">
                <Languages className="ml-1 h-4 w-4 shrink-0 text-text/50" />
                {LANGUAGES.map((l) => (
                  <button
                    key={l.code}
                    type="button"
                    onClick={() => changeLang(l.code)}
                    className={cn(
                      "flex-1 rounded-lg px-1 py-2 text-xs font-heading text-white/65 transition-colors",
                      lang === l.code ? "bg-[#8b35ff] text-white shadow-[0_0_18px_rgba(139,53,255,.3)]" : "hover:bg-white/10 hover:text-white",
                    )}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
