import * as React from "react";
import { useNavigate } from "react-router-dom";
import { LogIn, User, Lock, Eye, EyeOff, ShieldCheck, Zap, Globe2 } from "lucide-react";
import { AuthShell } from "@/components/layout/auth-layout";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/components/ui/toast";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  const { login } = useAuth();
  const toast = useToast();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPass, setShowPass] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      toast.push("error", t("enterCredentials"));
      return;
    }
    setLoading(true);
    try {
      await login(username, password);
      navigate("/");
    } catch (err) {
      toast.push("error", (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const highlights = [
    { icon: ShieldCheck, text: t("tlsFeature") },
    { icon: Globe2, text: t("protocolsFeature") },
    { icon: Zap, text: t("subPagesFeature") },
  ];

  return (
    <AuthShell heading={t("welcomeBack")} sub={t("signInPanel")} highlights={highlights}>
      <form onSubmit={submit} className="pn-login-form space-y-5" noValidate>
        <div className="space-y-2">
          <Label htmlFor="username" className="text-sm font-semibold text-white/80">{t("username")}</Label>
          <div className="relative">
            <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text/40" />
            <Input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              className="pn-auth-input h-12 rounded-xl border-white/10 bg-white/[.05] pl-10 text-white placeholder:text-white/30 focus-visible:ring-[#8b35ff]"
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="password" className="text-sm font-semibold text-white/80">{t("password")}</Label>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text/40" />
            <Input
              id="password"
              type={showPass ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="pn-auth-input h-12 rounded-xl border-white/10 bg-white/[.05] px-10 text-white placeholder:text-white/30 focus-visible:ring-[#8b35ff]"
            />
            <button
              type="button"
              onClick={() => setShowPass((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text/40 transition-colors hover:text-text"
              tabIndex={-1}
              aria-label={showPass ? "Hide password" : "Show password"}
            >
              {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
        <Button type="submit" className="pn-login-submit h-12 w-full rounded-xl border-0 bg-gradient-to-l from-[#168cff] via-[#713cff] to-[#a43cff] font-bold text-white shadow-[0_10px_30px_rgba(113,60,255,.25)] transition hover:-translate-y-0.5 hover:shadow-[0_14px_36px_rgba(113,60,255,.38)]" disabled={loading}>
          <LogIn className="h-4 w-4" />
          {loading ? t("signingIn") : t("signIn")}
        </Button>
      </form>
    </AuthShell>
  );
}
