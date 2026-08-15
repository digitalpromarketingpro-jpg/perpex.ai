"use client"

import { useState, useEffect, useCallback } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import {
  Settings,
  Moon,
  Sun,
  Volume2,
  VolumeX,
  Globe,
  Monitor,
  LogOut,
  User,
} from "lucide-react"
import { useAuth } from "@/context/auth-context"

interface SettingsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type Theme = "dark" | "light" | "system"

// ── Theme helpers ─────────────────────────────────────────────

function getStoredTheme(): Theme {
  if (typeof window === "undefined") return "dark"
  return (localStorage.getItem("perpex-theme") as Theme) ?? "dark"
}

function applyTheme(theme: Theme) {
  if (typeof window === "undefined") return
  const root = document.documentElement

  let resolved: "dark" | "light" = "dark"
  if (theme === "system") {
    resolved = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
  } else {
    resolved = theme
  }

  root.classList.remove("dark", "light")
  root.classList.add(resolved)
  localStorage.setItem("perpex-theme", theme)
}

// ── Sound preference ──────────────────────────────────────────

function getStoredSound(): boolean {
  if (typeof window === "undefined") return true
  return localStorage.getItem("perpex-sound") !== "false"
}

export function SettingsModal({ open, onOpenChange }: SettingsModalProps) {
  const { auth, authActions } = useAuth()

  const [theme, setTheme] = useState<Theme>(getStoredTheme)
  const [orderSound, setOrderSound] = useState(getStoredSound)

  // Apply theme on change
  useEffect(() => { applyTheme(theme) }, [theme])

  // Persist sound preference
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("perpex-sound", String(orderSound))
    }
  }, [orderSound])

  const handleLogout = useCallback(async () => {
    await authActions.signOut()
    onOpenChange(false)
  }, [authActions, onOpenChange])

  const displayName =
    (auth.user?.user_metadata?.full_name as string) ??
    (auth.user?.user_metadata?.username as string) ??
    "Trader"
  const displayEmail = auth.user?.email ?? ""
  const avatarUrl = auth.user?.user_metadata?.avatar_url as string | undefined

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm bg-card border-border p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <Settings className="w-4.5 h-4.5 text-primary" />
            Configurações
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-xs">
            Personalize sua experiência no terminal
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1 px-5 pb-5">
          {/* ── User Profile ─────────────────────────────── */}
          {auth.isAuthenticated && (
            <SettingSection label="Conta" icon={<User className="w-3.5 h-3.5" />}>
              <div className="flex items-center gap-3 p-2.5 rounded-md bg-secondary/50">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt=""
                    className="w-9 h-9 rounded-full object-cover shrink-0"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center text-sm font-bold text-primary shrink-0">
                    {displayName[0]?.toUpperCase()}
                  </div>
                )}
                <div className="flex flex-col min-w-0">
                  <span className="text-[12px] font-semibold text-foreground truncate">{displayName}</span>
                  {displayEmail && (
                    <span className="text-[10px] text-muted-foreground font-mono truncate">{displayEmail}</span>
                  )}
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="flex items-center gap-1.5 px-3 py-1.5 mt-1 rounded-md text-[11px] font-medium bg-trade-short/10 text-trade-short hover:bg-trade-short/20 transition-colors"
              >
                <LogOut className="w-3 h-3" />
                Sair da Conta
              </button>
            </SettingSection>
          )}

          {/* ── Theme ────────────────────────────────────── */}
          <SettingSection label="Tema" icon={<Moon className="w-3.5 h-3.5" />}>
            <div className="flex gap-1">
              {([
                { value: "dark" as Theme, icon: <Moon className="w-3 h-3" />, label: "Escuro" },
                { value: "light" as Theme, icon: <Sun className="w-3 h-3" />, label: "Claro" },
                { value: "system" as Theme, icon: <Monitor className="w-3 h-3" />, label: "Sistema" },
              ]).map((t) => (
                <button
                  key={t.value}
                  onClick={() => setTheme(t.value)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-medium transition-all",
                    theme === t.value
                      ? "bg-primary/15 text-primary border border-primary/30"
                      : "bg-secondary text-muted-foreground border border-transparent hover:text-foreground hover:border-border"
                  )}
                >
                  {t.icon}
                  {t.label}
                </button>
              ))}
            </div>
          </SettingSection>

          {/* ── Order Sound ───────────────────────────────── */}
          <SettingSection
            label="Som de Ordem"
            icon={orderSound ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
          >
            <ToggleSwitch
              checked={orderSound}
              onChange={setOrderSound}
              label={orderSound ? "Ativado" : "Desativado"}
            />
          </SettingSection>

          {/* ── Language (visual, MVP) ────────────────────── */}
          <SettingSection label="Idioma" icon={<Globe className="w-3.5 h-3.5" />}>
            <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-primary/15 text-primary border border-primary/30 text-[11px] font-medium">
              <span className="text-sm">🇧🇷</span>
              Português (BR)
            </div>
          </SettingSection>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Expose sound pref for audio system ────────────────────────
export function isSoundEnabled(): boolean {
  return getStoredSound()
}

function SettingSection({ label, icon, children }: {
  label: string
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2 py-3 border-b border-border/50 last:border-0">
      <span className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
        {icon} {label}
      </span>
      {children}
    </div>
  )
}

function ToggleSwitch({ checked, onChange, label }: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className="flex items-center gap-2"
      role="switch"
      aria-checked={checked}
    >
      <div className={cn(
        "relative w-8 h-[18px] rounded-full transition-colors",
        checked ? "bg-primary" : "bg-secondary"
      )}>
        <div className={cn(
          "absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white shadow-sm transition-transform",
          checked ? "translate-x-[16px]" : "translate-x-[2px]"
        )} />
      </div>
      <span className={cn(
        "text-[11px] font-mono",
        checked ? "text-foreground" : "text-muted-foreground"
      )}>
        {label}
      </span>
    </button>
  )
}
