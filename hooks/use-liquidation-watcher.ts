"use client"

// ─────────────────────────────────────────────────────────────
// useLiquidationWatcher — monitors marketPrice against all
// open positions. When markPrice crosses a position's liqPrice,
// the position is forcibly closed and the user loses their margin.
//
// Trigger logic:
//   LONG:  liquidated when marketPrice <= liqPrice
//   SHORT: liquidated when marketPrice >= liqPrice
//
// For DB positions (string UUID id), calls the liquidate_position
// RPC. For mock positions (numeric id), performs local-only removal.
// ─────────────────────────────────────────────────────────────

import { useEffect, useRef, useCallback } from "react"
import { useTrading } from "@/context/trading-context"
import { useAuth } from "@/context/auth-context"
import { liquidatePosition } from "@/lib/supabase/queries"
import { playLiquidationSound } from "@/lib/audio"
import { toast } from "@/hooks/use-toast"
import type { Position, TradeHistoryEntry } from "@/types/trading"

export function useLiquidationWatcher() {
  const { state, actions } = useTrading()
  const { auth } = useAuth()
  const { marketPrice, positions, userBalance } = state

  // Track positions currently being liquidated to prevent double-fires
  const liquidatingRef = useRef<Set<string | number>>(new Set())

  const checkPositions = useCallback(async () => {
    if (positions.length === 0) return

    for (const pos of positions) {
      if (liquidatingRef.current.has(pos.id)) continue

      let isLiquidated = false

      // LONG: liquidated when market drops to or below liq price
      if (pos.side === "long" && marketPrice <= pos.liqPrice && pos.liqPrice > 0) {
        isLiquidated = true
      }
      // SHORT: liquidated when market rises to or above liq price
      if (pos.side === "short" && marketPrice >= pos.liqPrice && pos.liqPrice > 0) {
        isLiquidated = true
      }

      if (!isLiquidated) continue

      // Mark as liquidating to prevent duplicate fires
      liquidatingRef.current.add(pos.id)

      const loss = -pos.margin

      // ── Optimistic UI update ────────────────────────────
      // Remove position from state immediately
      const updatedPositions = positions.filter((p) => p.id !== pos.id)
      actions.setPositions(updatedPositions)

      // Update balance: margin is lost, not returned
      actions.setUserBalance({
        ...userBalance,
        available: userBalance.available, // margin was already locked
        inPositions: Math.max(0, userBalance.inPositions - pos.margin),
        total: userBalance.total + loss,
      })

      // Add to trade history
      const liqEntry: TradeHistoryEntry = {
        id: `liq-${Date.now()}-${pos.id}`,
        symbol: pos.symbol,
        side: pos.side === "long" ? "sell" : "buy",
        type: "Liquidação",
        price: marketPrice,
        size: pos.size,
        fee: 0,
        pnl: loss,
        status: "LIQUIDATED",
        time: new Date().toLocaleTimeString("pt-BR", { hour12: false }),
      }
      actions.setTradeHistory([liqEntry, ...state.tradeHistory])

      // ── Sound + Toast ────────────────────────────────────
      playLiquidationSound()
      toast({
        title: "⚠ LIQUIDAÇÃO",
        description: `${pos.side.toUpperCase()} ${pos.size} ${pos.symbol} liquidado @ $${marketPrice.toLocaleString("en-US", { minimumFractionDigits: 1 })} · Perda: -$${pos.margin.toFixed(2)}`,
        variant: "destructive",
      })

      // ── Persist to Supabase (if DB position) ────────────
      if (auth.user && typeof pos.id === "string" && !pos.id.startsWith("liq-")) {
        const result = await liquidatePosition({
          userId: auth.user.id,
          positionId: pos.id,
          markPrice: marketPrice,
        })

        if (!result.ok) {
          console.error(`[LiquidationWatcher] DB liquidation failed for ${pos.id}:`, result.error)
        }
      }

      // Allow re-check after cooldown (in case optimistic removal was rolled back)
      setTimeout(() => {
        liquidatingRef.current.delete(pos.id)
      }, 10_000)
    }
  }, [positions, marketPrice, actions, userBalance, state.tradeHistory, auth.user])

  // Run check on every marketPrice update
  useEffect(() => {
    checkPositions()
  }, [checkPositions])
}
