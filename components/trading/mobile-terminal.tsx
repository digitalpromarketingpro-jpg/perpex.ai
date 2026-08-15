"use client"

// ─────────────────────────────────────────────────────────────
// MobileTerminal — mobile-first layout for screens < 768px.
//
// Architecture:
//   - Compact header with price + symbol only
//   - Full-screen content area switching via bottom tabs
//   - Bottom Navigation: [Gráfico, Book, Trade, Posições]
//   - Trade tab opens ExecutionPanel in a Sheet (drawer)
//   - Order Book uses compact side-by-side layout
// ─────────────────────────────────────────────────────────────

import { useState, useRef, useCallback, useMemo } from "react"
import {
  BarChart3,
  BookOpen,
  ArrowUpDown,
  LayoutList,
  TrendingUp,
  ChevronDown,
  Wallet,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useTrading } from "@/context/trading-context"
import { useAuth } from "@/context/auth-context"
import { useFundingRateContext } from "@/components/trading/trading-terminal"
import { ChartPanel, type ChartLiveTradeHandler } from "@/components/trading/chart-panel"
import { OrderBook } from "@/components/trading/order-book"
import { ExecutionPanel } from "@/components/trading/execution-panel"
import { PositionsPanel } from "@/components/trading/positions-panel"
import { TradingErrorBoundary } from "@/components/trading/error-boundary"
import { AuthModal } from "@/components/trading/auth-modal"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { useSwipe } from "@/hooks/use-swipe"

type MobileTab = "chart" | "book" | "trade" | "positions"

const TAB_CONFIG: { key: MobileTab; label: string; icon: React.ReactNode }[] = [
  { key: "chart", label: "Gráfico", icon: <BarChart3 className="w-5 h-5" /> },
  { key: "book", label: "Book", icon: <BookOpen className="w-5 h-5" /> },
  { key: "trade", label: "Trade", icon: <ArrowUpDown className="w-5 h-5" /> },
  { key: "positions", label: "Posições", icon: <LayoutList className="w-5 h-5" /> },
]

interface MobileTerminalProps {
  liveTradeRef: React.MutableRefObject<ChartLiveTradeHandler | null>
}

export function MobileTerminal({ liveTradeRef }: MobileTerminalProps) {
  const { state, actions } = useTrading()
  const { auth } = useAuth()
  const { activeSymbol, marketPrice, priceDirection, userBalance } = state
  const funding = useFundingRateContext()

  const [activeTab, setActiveTab] = useState<MobileTab>("chart")
  const [tradeDrawerOpen, setTradeDrawerOpen] = useState(false)
  const [authOpen, setAuthOpen] = useState(false)

  // Swipe between favorite pairs on chart tab
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const favorites = useMemo(
    () => state.watchlist.filter((w) => w.favorite).map((w) => w.symbol),
    [state.watchlist]
  )

  const swipeToSymbol = useCallback(
    (direction: "left" | "right") => {
      if (favorites.length < 2) return
      const idx = favorites.indexOf(activeSymbol)
      if (idx === -1) return
      const next =
        direction === "left"
          ? favorites[(idx + 1) % favorites.length]
          : favorites[(idx - 1 + favorites.length) % favorites.length]
      state.watchlist.length > 0 && actions.setActiveSymbol(next)
    },
    [favorites, activeSymbol, actions, state.watchlist]
  )

  useSwipe({
    ref: chartContainerRef,
    onSwipeLeft: () => swipeToSymbol("left"),
    onSwipeRight: () => swipeToSymbol("right"),
  })

  const handleTabPress = useCallback((tab: MobileTab) => {
    if (tab === "trade") {
      setTradeDrawerOpen(true)
    } else {
      setActiveTab(tab)
    }
  }, [])

  return (
    <div
      className="flex flex-col bg-background text-foreground"
      style={{ height: "100dvh", overflow: "hidden" }}
    >
      {/* ── Compact Mobile Header ──────────────────────── */}
      <header className="h-11 flex items-center border-b border-border bg-card px-3 gap-3 shrink-0 z-40">
        <div className="flex items-center gap-1.5">
          <TrendingUp className="w-3.5 h-3.5 text-primary" />
          <span className="font-mono font-bold text-xs text-foreground tracking-wider">
            PERPEX
          </span>
        </div>

        <div className="w-px h-5 bg-border" />

        {/* Symbol + Price */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="font-mono text-xs font-semibold text-foreground">
            {activeSymbol}
          </span>
          <span
            className={cn(
              "font-mono text-sm font-bold transition-colors duration-300",
              priceDirection === "up"
                ? "text-trade-long"
                : priceDirection === "down"
                  ? "text-trade-short"
                  : "text-foreground"
            )}
          >
            {marketPrice.toLocaleString("en-US", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </span>
          {funding && (
            <span className="text-[9px] font-mono text-muted-foreground ml-auto">
              F: {(funding.fundingRate * 100).toFixed(4)}% · {funding.nextFundingTime}
            </span>
          )}
        </div>

        {/* Auth button */}
        {auth.isAuthenticated ? (
          <div className="flex items-center gap-1 shrink-0">
            <Wallet className="w-3 h-3 text-muted-foreground" />
            <span className="font-mono text-[10px] text-foreground">
              {userBalance.available.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </span>
          </div>
        ) : (
          <button
            onClick={() => setAuthOpen(true)}
            className="shrink-0 px-2.5 py-1 rounded text-[10px] font-semibold bg-primary text-primary-foreground active:scale-95 transition-transform"
          >
            Login
          </button>
        )}
      </header>

      {/* ── Content Area ───────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-hidden relative">
        {/* Chart Tab — swipeable to cycle favorite pairs */}
        <div
          ref={chartContainerRef}
          className={cn("absolute inset-0", activeTab !== "chart" && "hidden")}
        >
          {/* Favorite pair indicator */}
          {favorites.length > 1 && activeTab === "chart" && (
            <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 flex gap-1">
              {favorites.map((sym) => (
                <div
                  key={sym}
                  className={cn(
                    "w-1.5 h-1.5 rounded-full transition-colors",
                    sym === activeSymbol ? "bg-primary" : "bg-muted-foreground/30"
                  )}
                />
              ))}
            </div>
          )}
          <TradingErrorBoundary name="Gr\u00e1fico">
            <ChartPanel liveTradeRef={liveTradeRef} />
          </TradingErrorBoundary>
        </div>

        {/* Order Book Tab */}
        <div className={cn("absolute inset-0 overflow-auto", activeTab !== "book" && "hidden")}>
          <TradingErrorBoundary name="Book de Ordens" compact>
            <OrderBook />
          </TradingErrorBoundary>
        </div>

        {/* Positions Tab */}
        <div className={cn("absolute inset-0 overflow-hidden", activeTab !== "positions" && "hidden")}>
          <TradingErrorBoundary name="Posições" compact>
            <PositionsPanel />
          </TradingErrorBoundary>
        </div>
      </div>

      {/* ── Bottom Navigation ──────────────────────────── */}
      <nav className="h-14 flex items-stretch border-t border-border bg-card shrink-0 z-40 safe-area-bottom">
        {TAB_CONFIG.map((t) => {
          const isActive = t.key === "trade"
            ? tradeDrawerOpen
            : activeTab === t.key
          return (
            <button
              key={t.key}
              onClick={() => handleTabPress(t.key)}
              className={cn(
                "flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors active:scale-95",
                t.key === "trade"
                  ? "text-primary"
                  : isActive
                    ? "text-foreground"
                    : "text-muted-foreground"
              )}
            >
              {t.key === "trade" ? (
                <div className="w-10 h-7 rounded-lg bg-primary flex items-center justify-center">
                  <ArrowUpDown className="w-4 h-4 text-primary-foreground" />
                </div>
              ) : (
                t.icon
              )}
              <span className="text-[9px] font-medium leading-none">
                {t.label}
              </span>
              {isActive && t.key !== "trade" && (
                <div className="absolute bottom-1 w-6 h-0.5 rounded-full bg-primary" />
              )}
            </button>
          )
        })}
      </nav>

      {/* ── Trade Drawer (Sheet from bottom) ───────────── */}
      <Sheet open={tradeDrawerOpen} onOpenChange={setTradeDrawerOpen}>
        <SheetContent
          side="bottom"
          className="max-h-[85dvh] overflow-auto bg-card border-t border-border rounded-t-2xl p-0"
        >
          <SheetHeader className="px-4 pt-4 pb-2">
            <div className="mx-auto w-10 h-1 rounded-full bg-border mb-2" />
            <SheetTitle className="text-sm font-mono">
              {activeSymbol} — Nova Ordem
            </SheetTitle>
          </SheetHeader>
          <div className="px-0 pb-4">
            <TradingErrorBoundary name="Boleta" compact>
              <ExecutionPanel />
            </TradingErrorBoundary>
          </div>
        </SheetContent>
      </Sheet>

      {/* Auth Modal */}
      <AuthModal open={authOpen} onOpenChange={setAuthOpen} />
    </div>
  )
}
