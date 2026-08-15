"use client"

import React, { useState, useCallback, useRef, useEffect } from "react"
import { Star } from "lucide-react"
import { cn } from "@/lib/utils"
import { useTrading } from "@/context/trading-context"
import type { Symbol as TradingSymbol, WatchlistItem } from "@/types/trading"

/**
 * Sparkline — memoized SVG mini-chart.
 * Only re-renders when its data array or positive flag changes.
 */
const Sparkline = React.memo(function Sparkline({
  data,
  positive,
}: {
  data: number[]
  positive: boolean
}) {
  const W = 52, H = 20
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const pts = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * W
      const y = H - ((v - min) / range) * H
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(" ")

  return (
    <svg width={W} height={H} className="shrink-0">
      <polyline
        points={pts}
        fill="none"
        stroke={positive ? "var(--trade-long)" : "var(--trade-short)"}
        strokeWidth="1.2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
})

export function Watchlist() {
  const { state, actions } = useTrading()
  const { watchlist, activeSymbol } = state
  const [tab, setTab] = useState<"favorites" | "all">("favorites")

  const handleTickerChange = useCallback(
    (symbol: TradingSymbol) => actions.setActiveSymbol(symbol),
    [actions]
  )

  const handleToggleFavorite = useCallback(
    (symbol: TradingSymbol) => actions.toggleFavorite(symbol),
    [actions]
  )

  const displayed = tab === "favorites" ? watchlist.filter((i) => i.favorite) : watchlist

  return (
    <aside className="flex flex-col bg-card border-r border-border h-full w-full overflow-hidden">
      {/* Tabs */}
      <div className="flex border-b border-border shrink-0">
        {(["favorites", "all"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "flex-1 py-2 text-[11px] font-medium transition-colors",
              tab === t
                ? "text-foreground border-b-2 border-primary -mb-px"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t === "favorites" ? "Favoritos" : "Todos"}
          </button>
        ))}
      </div>

      {/* Column headers */}
      <div className="grid grid-cols-[1fr_auto_auto] gap-1 px-2 py-1.5 border-b border-border shrink-0">
        <span className="text-[10px] text-muted-foreground">Par</span>
        <span className="text-[10px] text-muted-foreground text-right">Preço</span>
        <span className="text-[10px] text-muted-foreground text-right w-12">24h</span>
      </div>

      {/* Items */}
      <ul className="flex-1 overflow-y-auto">
        {displayed.map((item) => (
          <WatchlistRow
            key={item.symbol}
            item={item}
            isSelected={item.symbol === activeSymbol}
            onSelect={handleTickerChange}
            onToggleFavorite={handleToggleFavorite}
          />
        ))}
      </ul>
    </aside>
  )
}

/**
 * WatchlistRow — memoized for high-frequency watchlist updates.
 * Only re-renders when its own item data or selection state changes.
 */
const PUMP_DUMP_THRESHOLD = 0.003 // 0.3% move in one tick

const WatchlistRow = React.memo(function WatchlistRow({
  item,
  isSelected,
  onSelect,
  onToggleFavorite,
}: {
  item: WatchlistItem
  isSelected: boolean
  onSelect: (symbol: TradingSymbol) => void
  onToggleFavorite: (symbol: TradingSymbol) => void
}) {
  const prevPriceRef = useRef<number>(item.price)
  const [glowKey, setGlowKey] = useState(0)
  const [glowClass, setGlowClass] = useState<"" | "glow-pump" | "glow-dump">("")

  useEffect(() => {
    const prev = prevPriceRef.current
    if (prev > 0 && prev !== item.price) {
      const pctMove = (item.price - prev) / prev
      if (Math.abs(pctMove) >= PUMP_DUMP_THRESHOLD) {
        const cls = pctMove > 0 ? "glow-pump" : "glow-dump"
        setGlowClass(cls)
        setGlowKey((k) => k + 1)
      }
    }
    prevPriceRef.current = item.price
  }, [item.price])

  return (
    <li
      key={glowKey || undefined}
      onClick={() => onSelect(item.symbol)}
      onAnimationEnd={() => setGlowClass("")}
      className={cn(
        "group flex flex-col gap-0.5 px-2 py-1.5 cursor-pointer border-b border-border/50 hover:bg-secondary transition-colors",
        isSelected && "bg-secondary",
        glowClass
      )}
    >
      <div className="flex items-center justify-between gap-1">
        <div className="flex items-center gap-1 min-w-0">
          <button
            onClick={(e) => {
              e.stopPropagation()
              onToggleFavorite(item.symbol)
            }}
            className="shrink-0"
            aria-label={item.favorite ? "Remover dos favoritos" : "Adicionar aos favoritos"}
          >
            <Star
              className={cn(
                "w-2.5 h-2.5 transition-colors",
                item.favorite
                  ? "fill-yellow-400 text-yellow-400"
                  : "text-muted-foreground hover:text-yellow-400"
              )}
            />
          </button>
          <span className="font-mono text-[11px] font-semibold text-foreground truncate">
            {item.symbol}
          </span>
        </div>
        <Sparkline data={item.sparkline} positive={item.change >= 0} />
      </div>
      <div className="flex items-center justify-between pl-3.5">
        <span className="font-mono text-[11px] text-foreground">
          {item.price.toLocaleString("en-US", {
            minimumFractionDigits: item.price < 1 ? 4 : item.price < 10 ? 3 : 2,
            maximumFractionDigits: item.price < 1 ? 4 : item.price < 10 ? 3 : 2,
          })}
        </span>
        <span
          className={cn(
            "font-mono text-[11px] font-medium",
            item.change >= 0 ? "text-trade-long" : "text-trade-short"
          )}
        >
          {item.change >= 0 ? "+" : ""}
          {item.change.toFixed(2)}%
        </span>
      </div>
    </li>
  )
})
