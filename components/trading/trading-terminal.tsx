"use client"

import { useRef, useCallback, useState, useEffect } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { useIsMobile } from "@/hooks/use-is-mobile"
import { MobileTerminal } from "@/components/trading/mobile-terminal"
import { Header } from "@/components/trading/header"
import { Watchlist } from "@/components/trading/watchlist"
import { ChartPanel, type ChartLiveTradeHandler } from "@/components/trading/chart-panel"
import { PositionsPanel } from "@/components/trading/positions-panel"
import { OrderBook } from "@/components/trading/order-book"
import { ExecutionPanel } from "@/components/trading/execution-panel"
import { TradingErrorBoundary } from "@/components/trading/error-boundary"
import { ConnectionStatusBar } from "@/components/trading/connection-status"
import { installAudioUnlock } from "@/lib/audio"
import { useBinanceManager } from "@/hooks/use-binance-manager"
import { useSupabaseHydrate } from "@/hooks/use-supabase-hydrate"
import { usePriceWatcher } from "@/hooks/use-price-watcher"
import { useLiquidationWatcher } from "@/hooks/use-liquidation-watcher"
import { useFundingRate, type FundingRateState } from "@/hooks/use-funding-rate"
import { createContext, useContext } from "react"

// ── FundingRate context so Header can consume without prop drilling ──
const FundingRateContext = createContext<FundingRateState | null>(null)
export function useFundingRateContext() {
  return useContext(FundingRateContext)
}

/**
 * TradingTerminal — must be rendered inside <TradingProvider>.
 *
 * Architecture:
 *   BinanceStreamManager (3 WS) → ref accumulators → 150ms flush → Context
 *   aggTrade → liveTradeRef → ChartPanel.candleSeries.update() (direct, no throttle)
 *
 * Resilience:
 *   - Each panel wrapped in its own TradingErrorBoundary
 *   - Chart crash does NOT affect order execution
 *   - ConnectionStatusBar shows degraded state on WS failures
 *   - Exponential backoff reconnection per stream
 */
export function TradingTerminal() {
  // Ref that ChartPanel registers its live trade handler into
  const liveTradeRef = useRef<ChartLiveTradeHandler | null>(null)

  // Callback that useBinanceManager calls on every aggTrade
  // → pipes directly into chart (no React state, no throttle)
  const handleLiveTrade = useCallback((trade: { price: number; timestamp: number; isSell: boolean }) => {
    liveTradeRef.current?.(trade.price, trade.timestamp, trade.isSell)
  }, [])

  // Collapsible panel state
  const [leftCollapsed, setLeftCollapsed] = useState(false)
  const [rightCollapsed, setRightCollapsed] = useState(false)

  // Install audio gesture-unlock (Chrome autoplay policy)
  useEffect(() => { installAudioUnlock() }, [])

  // Responsive breakpoint (must be before hooks that use it)
  const isMobile = useIsMobile()

  // Hydrate user data (balance, positions, history) from Supabase
  useSupabaseHydrate()

  // Bootstrap the Binance WebSocket streams (mobile gets longer flush interval)
  useBinanceManager({ onLiveTrade: handleLiveTrade, isMobile })

  // Monitor pending limit orders against live price
  usePriceWatcher()

  // Monitor positions for liquidation
  useLiquidationWatcher()

  // Funding rate 8h cycle
  const fundingState = useFundingRate()

  // Mobile layout — completely different navigation model
  if (isMobile) {
    return (
      <FundingRateContext.Provider value={fundingState}>
        <MobileTerminal liveTradeRef={liveTradeRef} />
      </FundingRateContext.Provider>
    )
  }

  const gridCols = `${leftCollapsed ? "0px" : "160px"} 1fr ${rightCollapsed ? "0px" : "280px"}`

  return (
    <FundingRateContext.Provider value={fundingState}>
    <main
      className="flex flex-col bg-background text-foreground"
      style={{ height: "100dvh", overflow: "hidden" }}
    >
      {/* Connection health banner — only visible when unhealthy */}
      <ConnectionStatusBar />

      {/* Global Header */}
      <TradingErrorBoundary name="Header" compact>
        <Header />
      </TradingErrorBoundary>

      {/* Body: 3-column grid */}
      <div
        className="flex flex-1 min-h-0 overflow-hidden transition-all duration-300"
        style={{ display: "grid", gridTemplateColumns: gridCols }}
      >
        {/* Left Panel — Watchlist */}
        <div className={cn("relative overflow-hidden transition-all duration-300", leftCollapsed && "w-0")}>
          {!leftCollapsed && (
            <TradingErrorBoundary name="Watchlist" compact>
              <Watchlist />
            </TradingErrorBoundary>
          )}
        </div>

        {/* Center Panel — Chart + Positions */}
        <div className="flex flex-col min-h-0 overflow-hidden border-x border-border relative">
          {/* Collapse toggles */}
          <button
            onClick={() => setLeftCollapsed((c) => !c)}
            className="absolute left-0 top-1/2 -translate-y-1/2 z-20 w-5 h-10 flex items-center justify-center bg-card border border-border border-l-0 rounded-r-md hover:bg-accent transition-colors opacity-60 hover:opacity-100"
            aria-label={leftCollapsed ? "Expandir watchlist" : "Recolher watchlist"}
          >
            {leftCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
          </button>
          <button
            onClick={() => setRightCollapsed((c) => !c)}
            className="absolute right-0 top-1/2 -translate-y-1/2 z-20 w-5 h-10 flex items-center justify-center bg-card border border-border border-r-0 rounded-l-md hover:bg-accent transition-colors opacity-60 hover:opacity-100"
            aria-label={rightCollapsed ? "Expandir painel" : "Recolher painel"}
          >
            {rightCollapsed ? <ChevronLeft className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </button>
          {/* Chart: takes ~65% of the center height */}
          <div className="relative" style={{ flex: "65 65 0", minHeight: 0, overflow: "hidden" }}>
            <TradingErrorBoundary name="Gráfico">
              <ChartPanel liveTradeRef={liveTradeRef} />
            </TradingErrorBoundary>
          </div>

          {/* Positions / Orders: takes ~35% */}
          <div style={{ flex: "35 35 0", minHeight: 0, overflow: "hidden" }}>
            <TradingErrorBoundary name="Posições" compact>
              <PositionsPanel />
            </TradingErrorBoundary>
          </div>
        </div>

        {/* Right Panel — Order Book + Execution */}
        <div className={cn("overflow-hidden transition-all duration-300", rightCollapsed && "w-0")}>
          {!rightCollapsed && (
            <div
              className="flex flex-col min-h-0 h-full"
              style={{ display: "grid", gridTemplateRows: "1fr 1fr" }}
            >
              {/* Order Book — top half */}
              <div className="overflow-hidden border-b border-border">
                <TradingErrorBoundary name="Book de Ordens" compact>
                  <OrderBook />
                </TradingErrorBoundary>
              </div>

              {/* Execution Panel — bottom half */}
              <div className="overflow-hidden">
                <TradingErrorBoundary name="Boleta de Ordens" compact>
                  <ExecutionPanel />
                </TradingErrorBoundary>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
    </FundingRateContext.Provider>
  )
}
