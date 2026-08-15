"use client"

import { useState, useEffect, useRef } from "react"
import {
  Search,
  ChevronDown,
  Wifi,
  Settings,
  Wallet,
  Bell,
  TrendingUp,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useTrading } from "@/context/trading-context"
import { useAuth } from "@/context/auth-context"
import { useFundingRateContext } from "@/components/trading/trading-terminal"
import type { Symbol as TradingSymbol } from "@/types/trading"
import { WalletModal } from "./wallet-modal"
import { SettingsModal } from "./settings-modal"
import { AuthModal } from "./auth-modal"

const TICKERS: { symbol: TradingSymbol; name: string }[] = [
  { symbol: "BTC-PERP", name: "Bitcoin" },
  { symbol: "ETH-PERP", name: "Ethereum" },
  { symbol: "SOL-PERP", name: "Solana" },
  { symbol: "BNB-PERP", name: "BNB" },
  { symbol: "ARB-PERP", name: "Arbitrum" },
  { symbol: "DOGE-PERP", name: "Dogecoin" },
  { symbol: "AVAX-PERP", name: "Avalanche" },
  { symbol: "LINK-PERP", name: "Chainlink" },
  { symbol: "OP-PERP", name: "Optimism" },
  { symbol: "INJ-PERP", name: "Injective" },
]

function FundingCountdown() {
  const funding = useFundingRateContext()
  if (!funding) {
    return <span className="font-mono text-xs text-muted-foreground">--:--:--</span>
  }
  return (
    <span className="font-mono text-xs text-muted-foreground">
      {funding.nextFundingTime}
    </span>
  )
}

export function Header() {
  const { state, actions } = useTrading()
  const { activeSymbol, marketPrice, priceDirection, userBalance, watchlist } = state

  // Real ticker stats from Binance WS via watchlist
  const activeItem = watchlist.find((w) => w.symbol === activeSymbol)
  const change24h = activeItem?.change ?? 0
  const high24h = activeItem?.high24h ?? 0
  const low24h = activeItem?.low24h ?? 0

  const [tickerOpen, setTickerOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [walletOpen, setWalletOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [authOpen, setAuthOpen] = useState(false)
  const tickerRef = useRef<HTMLDivElement>(null)

  const { auth, authActions } = useAuth()

  // Close ticker dropdown on outside click
  useEffect(() => {
    if (!tickerOpen) return
    const handler = (e: MouseEvent) => {
      if (tickerRef.current && !tickerRef.current.contains(e.target as Node)) {
        setTickerOpen(false)
        setSearch("")
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [tickerOpen])

  const filtered = TICKERS.filter(
    (t) =>
      t.symbol.toLowerCase().includes(search.toLowerCase()) ||
      t.name.toLowerCase().includes(search.toLowerCase())
  )

  const funding = useFundingRateContext()
  const fundingRate = funding ? funding.fundingRate * 100 : 0.0102

  return (
    <header className="h-12 flex items-center border-b border-border bg-card px-3 gap-4 z-50 relative shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-1.5 shrink-0">
        <TrendingUp className="w-4 h-4 text-primary" />
        <span className="font-mono font-bold text-sm text-foreground tracking-widest">
          PERPEX
        </span>
      </div>

      <div className="w-px h-6 bg-border" />

      {/* Ticker Selector */}
      <div className="relative shrink-0" ref={tickerRef}>
        <button
          onClick={() => setTickerOpen((o) => !o)}
          className="flex items-center gap-1.5 h-8 px-2.5 rounded bg-secondary hover:bg-accent transition-colors"
          aria-haspopup="listbox"
          aria-expanded={tickerOpen}
        >
          <Search className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="font-mono text-sm font-semibold text-foreground">
            {activeSymbol}
          </span>
          <ChevronDown
            className={cn(
              "w-3.5 h-3.5 text-muted-foreground transition-transform",
              tickerOpen && "rotate-180"
            )}
          />
        </button>

        {tickerOpen && (
          <div className="absolute top-full mt-1 left-0 w-52 bg-card border border-border rounded shadow-xl z-50">
            <div className="p-1.5 border-b border-border">
              <input
                autoFocus
                type="text"
                placeholder="Buscar par..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-secondary text-foreground text-xs font-mono placeholder:text-muted-foreground rounded px-2 py-1.5 outline-none border border-transparent focus:border-primary"
              />
            </div>
            <ul role="listbox" className="max-h-48 overflow-y-auto py-1">
              {filtered.map((t) => (
                <li
                  key={t.symbol}
                  role="option"
                  aria-selected={t.symbol === activeSymbol}
                  onClick={() => {
                    actions.setActiveSymbol(t.symbol)
                    setTickerOpen(false)
                    setSearch("")
                  }}
                  className={cn(
                    "flex items-center justify-between px-3 py-1.5 cursor-pointer text-xs hover:bg-secondary",
                    t.symbol === activeSymbol && "bg-secondary"
                  )}
                >
                  <span className="font-mono font-semibold text-foreground">
                    {t.symbol}
                  </span>
                  <span className="text-muted-foreground">{t.name}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="w-px h-6 bg-border" />

      {/* Market Stats */}
      <div className="flex items-center gap-4 flex-1 overflow-hidden min-w-0">
        {/* Last Price */}
        <div className="flex flex-col shrink-0">
          <span className="text-[10px] text-muted-foreground leading-none mb-0.5">
            Último Preço
          </span>
          <span
            className={cn(
              "font-mono text-base font-bold leading-none transition-colors duration-300",
              priceDirection === "up" ? "text-trade-long" : priceDirection === "down" ? "text-trade-short" : "text-foreground"
            )}
          >
            {marketPrice.toLocaleString("en-US", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </span>
        </div>

        <StatItem
          label="Var. 24h"
          value={`${change24h > 0 ? "+" : ""}${change24h.toFixed(2)}%`}
          color={change24h >= 0 ? "text-trade-long" : "text-trade-short"}
        />
        <StatItem
          label="Máx. 24h"
          value={high24h.toLocaleString("en-US", { minimumFractionDigits: 2 })}
        />
        <StatItem
          label="Mín. 24h"
          value={low24h.toLocaleString("en-US", { minimumFractionDigits: 2 })}
        />
        <StatItem
          label="Funding Rate"
          value={`${fundingRate > 0 ? "+" : ""}${fundingRate.toFixed(4)}%`}
          color={fundingRate >= 0 ? "text-trade-long" : "text-trade-short"}
          title={funding ? `Último pagamento: $${funding.lastPaymentTotal.toFixed(4)}` : undefined}
        />
        <div className="flex flex-col shrink-0">
          <span className="text-[10px] text-muted-foreground leading-none mb-0.5">
            Próx. Funding
          </span>
          <FundingCountdown />
        </div>
      </div>

      {/* Right side controls */}
      <div className="flex items-center gap-2 shrink-0 ml-auto">
        {auth.isAuthenticated ? (
          <>
            {/* Wallet Balance — opens modal */}
            <button
              onClick={() => setWalletOpen(true)}
              className="flex items-center gap-1.5 h-8 px-2.5 rounded bg-secondary hover:bg-accent transition-colors cursor-pointer"
            >
              <Wallet className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="font-mono text-xs text-foreground">
                {userBalance.available.toLocaleString("en-US", { minimumFractionDigits: 2 })}{" "}
                <span className="text-muted-foreground">{userBalance.currency}</span>
              </span>
            </button>

            {/* User badge — shows Google avatar if available */}
            <div className="flex items-center gap-1.5 h-8 px-2 rounded bg-secondary text-xs">
              {auth.user?.user_metadata?.avatar_url ? (
                <img
                  src={auth.user.user_metadata.avatar_url as string}
                  alt=""
                  className="w-5 h-5 rounded-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary">
                  {((auth.user?.user_metadata?.username ?? auth.user?.user_metadata?.full_name ?? "U") as string)[0]?.toUpperCase()}
                </div>
              )}
              <span className="font-mono text-foreground text-[11px] max-w-[80px] truncate">
                {(auth.user?.user_metadata?.username as string) ?? (auth.user?.user_metadata?.full_name as string) ?? "Trader"}
              </span>
            </div>
          </>
        ) : (
          <button
            onClick={() => setAuthOpen(true)}
            className="flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors active:scale-[0.97]"
          >
            <Wallet className="w-3.5 h-3.5" />
            Conectar
          </button>
        )}

        {/* Connectivity LED — reads live state from context */}
        <ConnectionLED />

        <NotificationsDropdown />

        <button
          onClick={() => setSettingsOpen(true)}
          className="h-8 w-8 flex items-center justify-center rounded bg-secondary hover:bg-accent transition-colors"
          aria-label="Configurações"
        >
          <Settings className="w-3.5 h-3.5 text-muted-foreground" />
        </button>

        {auth.isAuthenticated && (
          <button
            onClick={async () => {
              await authActions.signOut()
            }}
            className="h-8 px-2 flex items-center justify-center rounded bg-secondary hover:bg-trade-short/20 text-muted-foreground hover:text-trade-short transition-colors text-[10px] font-mono"
            aria-label="Sair"
          >
            Sair
          </button>
        )}
      </div>

      {/* Modals */}
      <WalletModal open={walletOpen} onOpenChange={setWalletOpen} />
      <SettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} />
      <AuthModal open={authOpen} onOpenChange={setAuthOpen} />
    </header>
  )
}

function ConnectionLED() {
  const { state } = useTrading()
  const { connectionState } = state

  const config: Record<string, { color: string; pulse: boolean; label: string }> = {
    connected:    { color: "bg-trade-long",    pulse: false, label: "Live" },
    connecting:   { color: "bg-yellow-500",    pulse: true,  label: "Conectando" },
    reconnecting: { color: "bg-yellow-500",    pulse: true,  label: "Reconectando" },
    disconnected: { color: "bg-trade-short",   pulse: false, label: "Offline" },
    degraded:     { color: "bg-orange-500",    pulse: true,  label: "Degradado" },
  }

  const { color, pulse, label } = config[connectionState] ?? config.disconnected

  return (
    <div
      className="flex items-center gap-1.5 h-8 px-2 rounded bg-secondary"
      title={label}
    >
      <span className={cn("w-1.5 h-1.5 rounded-full", color, pulse && "animate-pulse")} />
      <Wifi className={cn(
        "w-3.5 h-3.5",
        connectionState === "connected" ? "text-trade-long" : "text-muted-foreground"
      )} />
      <span className={cn(
        "text-[10px] font-mono font-medium",
        connectionState === "connected" ? "text-trade-long" : "text-muted-foreground"
      )}>
        {label}
      </span>
    </div>
  )
}

function NotificationsDropdown() {
  const { state } = useTrading()
  const { tradeHistory } = state
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open])

  const recent = tradeHistory.slice(0, 5)

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="h-8 w-8 flex items-center justify-center rounded bg-secondary hover:bg-accent transition-colors relative"
        aria-label="Notificações"
      >
        <Bell className="w-3.5 h-3.5 text-muted-foreground" />
        {recent.length > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-primary text-primary-foreground text-[8px] font-bold flex items-center justify-center">
            {recent.length}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute top-full mt-1 right-0 w-72 bg-card border border-border rounded-lg shadow-xl z-50 overflow-hidden">
          <div className="px-3 py-2 border-b border-border text-[11px] font-semibold text-foreground">
            Últimas Atividades
          </div>
          {recent.length === 0 ? (
            <p className="text-center text-muted-foreground text-[11px] py-4">Sem atividades recentes</p>
          ) : (
            <div className="max-h-48 overflow-y-auto">
              {recent.map((tx) => (
                <div key={tx.id} className="flex items-center gap-2 px-3 py-2 border-b border-border/50 last:border-0 hover:bg-secondary/50">
                  <span className={cn(
                    "w-1.5 h-1.5 rounded-full shrink-0",
                    tx.status === "LIQUIDATED" ? "bg-trade-short" : tx.status === "FUNDING" ? "bg-amber-400" : tx.pnl >= 0 ? "bg-trade-long" : "bg-trade-short"
                  )} />
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-[10px] text-foreground font-medium truncate">
                      {tx.type} · {tx.symbol} · {tx.size} unid.
                    </span>
                    <span className="text-[9px] text-muted-foreground font-mono">{tx.time}</span>
                  </div>
                  <span className={cn(
                    "text-[10px] font-mono font-bold shrink-0",
                    tx.pnl >= 0 ? "text-trade-long" : "text-trade-short"
                  )}>
                    {tx.pnl >= 0 ? "+" : ""}{tx.pnl.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function StatItem({
  label,
  value,
  color = "text-foreground",
  title,
}: {
  label: string
  value: string
  color?: string
  title?: string
}) {
  return (
    <div className="flex flex-col shrink-0" title={title}>
      <span className="text-[10px] text-muted-foreground leading-none mb-0.5">
        {label}
      </span>
      <span className={cn("font-mono text-xs font-medium leading-none", color)}>
        {value}
      </span>
    </div>
  )
}
