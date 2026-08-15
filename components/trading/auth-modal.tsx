"use client"

import { useState, useCallback } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { useAuth } from "@/context/auth-context"
import {
  validateLogin,
  validateRegister,
  type LoginInput,
  type RegisterInput,
} from "@/lib/validation/auth-schema"
import { toast } from "@/hooks/use-toast"
import {
  LogIn,
  UserPlus,
  Mail,
  Lock,
  User,
  Eye,
  EyeOff,
  Loader2,
  ShieldCheck,
  AlertTriangle,
} from "lucide-react"
import { isSupabaseConfigured } from "@/lib/supabase/client"
import { rateLimiter } from "@/lib/rate-limiter"

interface AuthModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type AuthTab = "login" | "register"

export function AuthModal({ open, onOpenChange }: AuthModalProps) {
  const [tab, setTab] = useState<AuthTab>("login")

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px] bg-card border-border p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle className="flex items-center gap-2 text-foreground text-lg">
            <ShieldCheck className="w-5 h-5 text-primary" />
            {tab === "login" ? "Acessar Terminal" : "Criar Conta"}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-xs">
            {tab === "login"
              ? "Entre com suas credenciais para operar"
              : "Crie sua conta e receba 10.000 USDT para simulação"
            }
          </DialogDescription>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex border-b border-border mx-6 mt-1">
          {([
            { key: "login" as AuthTab, label: "Login", icon: <LogIn className="w-3.5 h-3.5" /> },
            { key: "register" as AuthTab, label: "Cadastro", icon: <UserPlus className="w-3.5 h-3.5" /> },
          ]).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[12px] font-medium transition-colors",
                tab === t.key
                  ? "text-foreground border-b-2 border-primary -mb-px"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        {/* Google OAuth */}
        <div className="px-6 pt-4">
          <GoogleButton />
          <div className="flex items-center gap-3 my-3">
            <div className="flex-1 h-px bg-border" />
            <span className="text-[10px] text-muted-foreground font-medium">ou com e-mail</span>
            <div className="flex-1 h-px bg-border" />
          </div>
        </div>

        {/* Tab Content */}
        <div className="px-6 pb-6">
          {tab === "login" ? (
            <LoginForm onSuccess={() => onOpenChange(false)} />
          ) : (
            <RegisterForm onSuccess={() => { setTab("login"); }} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Login Form ───────────────────────────────────────────────

function LoginForm({ onSuccess }: { onSuccess: () => void }) {
  const { authActions } = useAuth()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    setErrors({})

    // Client-side validation
    const validation = validateLogin({ email, password })
    if (!validation.success) {
      setErrors(validation.errors ?? {})
      return
    }

    setLoading(true)
    const result = await authActions.signIn(email, password)
    setLoading(false)

    if (!result.success) {
      toast({
        title: "Erro ao entrar",
        description: result.error,
        variant: "destructive",
      })
      return
    }

    toast({
      title: "Login realizado",
      description: "Bem-vindo de volta ao PerpEx!",
    })
    onSuccess()
  }, [email, password, authActions, onSuccess])

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <FormField
        label="E-mail"
        icon={<Mail className="w-3.5 h-3.5" />}
        error={errors.email}
      >
        <input
          type="email"
          value={email}
          onChange={(e) => { setEmail(e.target.value); setErrors({}) }}
          placeholder="seu@email.com"
          autoComplete="email"
          className={cn(
            "w-full bg-transparent text-foreground text-xs font-mono placeholder:text-muted-foreground outline-none",
          )}
        />
      </FormField>

      <FormField
        label="Senha"
        icon={<Lock className="w-3.5 h-3.5" />}
        error={errors.password}
        suffix={
          <button
            type="button"
            onClick={() => setShowPassword((s) => !s)}
            className="text-muted-foreground hover:text-foreground transition-colors"
            tabIndex={-1}
          >
            {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </button>
        }
      >
        <input
          type={showPassword ? "text" : "password"}
          value={password}
          onChange={(e) => { setPassword(e.target.value); setErrors({}) }}
          placeholder="Sua senha"
          autoComplete="current-password"
          className="w-full bg-transparent text-foreground text-xs font-mono placeholder:text-muted-foreground outline-none"
        />
      </FormField>

      <button
        type="submit"
        disabled={loading}
        className={cn(
          "flex items-center justify-center gap-2 h-10 rounded-md text-sm font-semibold transition-all",
          "bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.98]",
          loading && "opacity-70 cursor-not-allowed"
        )}
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
        {loading ? "Entrando..." : "Entrar"}
      </button>
    </form>
  )
}

// ── Register Form ────────────────────────────────────────────

function RegisterForm({ onSuccess }: { onSuccess: () => void }) {
  const { authActions } = useAuth()
  const [username, setUsername] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    setErrors({})

    // Client-side validation
    const validation = validateRegister({ username, email, password, confirmPassword })
    if (!validation.success) {
      setErrors(validation.errors ?? {})
      return
    }

    setLoading(true)
    const result = await authActions.signUp(email, password, username)
    setLoading(false)

    if (!result.success) {
      toast({
        title: "Erro ao cadastrar",
        description: result.error,
        variant: "destructive",
      })
      return
    }

    toast({
      title: "Conta criada!",
      description: "Verifique seu e-mail para confirmar o cadastro e faça login.",
    })
    onSuccess()
  }, [username, email, password, confirmPassword, authActions, onSuccess])

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <FormField
        label="Nome de Usuário"
        icon={<User className="w-3.5 h-3.5" />}
        error={errors.username}
      >
        <input
          type="text"
          value={username}
          onChange={(e) => { setUsername(e.target.value); setErrors({}) }}
          placeholder="trader_pro"
          autoComplete="username"
          className="w-full bg-transparent text-foreground text-xs font-mono placeholder:text-muted-foreground outline-none"
        />
      </FormField>

      <FormField
        label="E-mail"
        icon={<Mail className="w-3.5 h-3.5" />}
        error={errors.email}
      >
        <input
          type="email"
          value={email}
          onChange={(e) => { setEmail(e.target.value); setErrors({}) }}
          placeholder="seu@email.com"
          autoComplete="email"
          className="w-full bg-transparent text-foreground text-xs font-mono placeholder:text-muted-foreground outline-none"
        />
      </FormField>

      <FormField
        label="Senha"
        icon={<Lock className="w-3.5 h-3.5" />}
        error={errors.password}
        suffix={
          <button
            type="button"
            onClick={() => setShowPassword((s) => !s)}
            className="text-muted-foreground hover:text-foreground transition-colors"
            tabIndex={-1}
          >
            {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </button>
        }
      >
        <input
          type={showPassword ? "text" : "password"}
          value={password}
          onChange={(e) => { setPassword(e.target.value); setErrors({}) }}
          placeholder="Min. 8 caracteres, A-z, 0-9, !@#"
          autoComplete="new-password"
          className="w-full bg-transparent text-foreground text-xs font-mono placeholder:text-muted-foreground outline-none"
        />
      </FormField>

      <FormField
        label="Confirmar Senha"
        icon={<Lock className="w-3.5 h-3.5" />}
        error={errors.confirmPassword}
      >
        <input
          type={showPassword ? "text" : "password"}
          value={confirmPassword}
          onChange={(e) => { setConfirmPassword(e.target.value); setErrors({}) }}
          placeholder="Repita a senha"
          autoComplete="new-password"
          className="w-full bg-transparent text-foreground text-xs font-mono placeholder:text-muted-foreground outline-none"
        />
      </FormField>

      {/* Password strength hints */}
      <PasswordStrength password={password} />

      <button
        type="submit"
        disabled={loading}
        className={cn(
          "flex items-center justify-center gap-2 h-10 rounded-md text-sm font-semibold transition-all",
          "bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.98]",
          loading && "opacity-70 cursor-not-allowed"
        )}
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
        {loading ? "Criando conta..." : "Criar Conta"}
      </button>
    </form>
  )
}

// ── Shared Components ────────────────────────────────────────

function FormField({
  label,
  icon,
  error,
  suffix,
  children,
}: {
  label: string
  icon: React.ReactNode
  error?: string
  suffix?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] text-muted-foreground font-medium">{label}</label>
      <div className={cn(
        "flex items-center gap-2 px-3 py-2 rounded-md border transition-colors",
        error
          ? "border-trade-short bg-trade-short/5"
          : "border-border bg-secondary focus-within:border-primary"
      )}>
        <span className="text-muted-foreground shrink-0">{icon}</span>
        {children}
        {suffix}
      </div>
      {error && (
        <span className="text-[10px] text-trade-short font-mono">{error}</span>
      )}
    </div>
  )
}

function GoogleButton() {
  const { authActions } = useAuth()
  const [loading, setLoading] = useState(false)
  const supabaseReady = isSupabaseConfigured()

  const handleGoogle = useCallback(async () => {
    if (!supabaseReady) {
      toast({
        title: "Supabase não configurado",
        description: "Verifique as variáveis NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY no .env.local",
        variant: "destructive",
      })
      return
    }

    // Rate limit check
    const rateCheck = rateLimiter.check("auth:login")
    if (!rateCheck.allowed) {
      toast({
        title: "Muitas tentativas",
        description: `Aguarde ${rateCheck.retryAfter}s antes de tentar novamente`,
        variant: "destructive",
      })
      return
    }

    setLoading(true)
    const result = await authActions.signInWithGoogle()
    if (!result.success) {
      toast({
        title: "Erro ao conectar com Google",
        description: result.error ?? "Erro desconhecido — veja o console (F12) para detalhes.",
        variant: "destructive",
      })
      setLoading(false)
    }
    // On success, browser redirects — no need to setLoading(false)
  }, [authActions, supabaseReady])

  if (!supabaseReady) {
    return (
      <div className="w-full flex items-center justify-center gap-2 h-10 rounded-md text-[11px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/30">
        <AlertTriangle className="w-3.5 h-3.5" />
        Google OAuth — Supabase não configurado
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={handleGoogle}
      disabled={loading}
      className={cn(
        "w-full flex items-center justify-center gap-2.5 h-10 rounded-md text-sm font-medium transition-all",
        "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 active:scale-[0.98] shadow-sm",
        "dark:bg-secondary dark:text-foreground dark:border-border dark:hover:bg-accent",
        loading && "opacity-70 cursor-not-allowed"
      )}
    >
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <svg className="w-4 h-4" viewBox="0 0 24 24">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
      )}
      {loading ? "Redirecionando..." : "Continuar com Google"}
    </button>
  )
}

function PasswordStrength({ password }: { password: string }) {
  if (!password) return null

  const checks = [
    { label: "8+ caracteres", met: password.length >= 8 },
    { label: "Maiúscula", met: /[A-Z]/.test(password) },
    { label: "Minúscula", met: /[a-z]/.test(password) },
    { label: "Número", met: /[0-9]/.test(password) },
    { label: "Especial", met: /[^A-Za-z0-9]/.test(password) },
  ]

  const metCount = checks.filter((c) => c.met).length

  return (
    <div className="flex flex-col gap-1.5">
      {/* Strength bar */}
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className={cn(
              "h-1 flex-1 rounded-full transition-colors",
              i <= metCount
                ? metCount <= 2
                  ? "bg-trade-short"
                  : metCount <= 3
                    ? "bg-yellow-500"
                    : "bg-trade-long"
                : "bg-secondary"
            )}
          />
        ))}
      </div>
      {/* Criteria */}
      <div className="flex flex-wrap gap-x-3 gap-y-0.5">
        {checks.map((c) => (
          <span
            key={c.label}
            className={cn(
              "text-[9px] font-mono transition-colors",
              c.met ? "text-trade-long" : "text-muted-foreground"
            )}
          >
            {c.met ? "✓" : "○"} {c.label}
          </span>
        ))}
      </div>
    </div>
  )
}
