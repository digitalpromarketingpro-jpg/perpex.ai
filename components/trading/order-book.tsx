"use client"

import React, { useCallback } from "react"
import { cn } from "@/lib/utils"
import { useTrading } from "@/context/trading-context"
import type { OrderBookLevel } from "@/types/trading"

export function OrderBook() {
  const { state, actions } = useTrading()
  const { orderBookData } = state
  const { asks, bids, markPrice, indexPrice } = orderBookData

  const handleAskClick = useCallback(
    (price: number) => actions.setQuickFill({ price, side: "sell" }),
    [actions]
  )

  const handleBidClick = useCallback(
    (price: number) => actions.setQuickFill({ price, side: "buy" }),
    [actions]
  )

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-2 py-1.5 border-b border-border shrink-0">
        <span className="text-[11px] font-semibold text-foreground tracking-wider uppercase">
          Book de Ordens
        </span>
      </div>

      {/* Column Labels */}
      <div className="grid grid-cols-3 px-2 py-1 border-b border-border shrink-0">
        <span className="text-[10px] text-muted-foreground">Tamanho</span>
        <span className="text-[10px] text-muted-foreground text-center" title="Clique para preencher boleta">Preço ↗</span>
        <span className="text-[10px] text-muted-foreground text-right">Total</span>
      </div>

      {/* Asks */}
      <div className="flex-1 overflow-hidden flex flex-col">
        <div className="flex flex-col overflow-hidden" style={{ flex: "1 1 0" }}>
          {asks.map((row, i) => (
            <BookRowItem key={`ask-${i}`} row={row} side="ask" onSelect={handleAskClick} />
          ))}
        </div>

        {/* Spread / Mark Price */}
        <div className="px-2 py-1.5 border-y border-border bg-background/50 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-[10px] text-muted-foreground">Mark Price</span>
              <span className="font-mono text-xs font-bold text-primary">
                {markPrice.toLocaleString("en-US", { minimumFractionDigits: 1 })}
              </span>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-[10px] text-muted-foreground">Index Price</span>
              <span className="font-mono text-xs text-foreground">
                {indexPrice.toLocaleString("en-US", { minimumFractionDigits: 1 })}
              </span>
            </div>
          </div>
        </div>

        {/* Bids */}
        <div className="overflow-hidden" style={{ flex: "1 1 0" }}>
          {bids.map((row, i) => (
            <BookRowItem key={`bid-${i}`} row={row} side="bid" onSelect={handleBidClick} />
          ))}
        </div>
      </div>
    </div>
  )
}

/**
 * BookRowItem — memoized for high-frequency update performance.
 * Only re-renders when its own price/size/total/depth/flash change,
 * not when unrelated state in the trading context changes.
 */
const BookRowItem = React.memo(function BookRowItem({
  row,
  side,
  onSelect,
}: {
  row: OrderBookLevel
  side: "ask" | "bid"
  onSelect: (price: number) => void
}) {
  const isAsk = side === "ask"
  const flashClass = row.flash === "up" ? "flash-green" : row.flash === "down" ? "flash-red" : ""

  return (
    <div
      onClick={() => onSelect(row.price)}
      title={`Preencher boleta: ${row.price.toLocaleString("en-US", { minimumFractionDigits: 1 })}`}
      className={cn(
        "relative grid grid-cols-3 px-2 py-[2px] text-[11px] cursor-pointer hover:brightness-125 transition-all group",
        flashClass
      )}
      style={{ minHeight: "18px" }}
    >
      {/* Depth bar */}
      <div
        className="absolute inset-y-0 right-0 opacity-80 pointer-events-none"
        style={{
          width: `${row.depth}%`,
          background: isAsk ? "var(--depth-ask)" : "var(--depth-bid)",
        }}
      />
      <span className="font-mono text-muted-foreground relative z-10">
        {row.size.toFixed(3)}
      </span>
      <span
        className={cn(
          "font-mono font-medium text-center relative z-10",
          isAsk ? "text-trade-short" : "text-trade-long"
        )}
      >
        {row.price.toLocaleString("en-US", { minimumFractionDigits: 1 })}
      </span>
      <span className="font-mono text-muted-foreground text-right relative z-10">
        {row.total.toFixed(3)}
      </span>
    </div>
  )
})
