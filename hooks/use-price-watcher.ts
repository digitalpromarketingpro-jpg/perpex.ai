"use client"

// ─────────────────────────────────────────────────────────────
// usePriceWatcher — monitors marketPrice from TradingContext
// against all pending limit orders. When price crosses the
// limit_price threshold, triggers execution via Supabase RPC
// and moves the order from pendingOrders → active_positions.
//
// Trigger logic:
//   BUY/LONG  limit: fires when marketPrice <= limitPrice
//   SELL/SHORT limit: fires when marketPrice >= limitPrice
// ─────────────────────────────────────────────────────────────

import { useEffect, useRef, useCallback } from "react"
import { useTrading } from "@/context/trading-context"
import { useAuth } from "@/context/auth-context"
import { executePendingOrder } from "@/lib/supabase/queries"
import { applyOpenPosition, buildOpenPosition } from "@/lib/trading/open-position-state"
import { playSound } from "@/lib/audio"
import { toast } from "@/hooks/use-toast"

export function usePriceWatcher() {
  const { state, actions } = useTrading()
  const { auth } = useAuth()
  const { marketPrice, pendingOrders, positions, userBalance } = state

  // Track orders currently being executed to prevent double-fires
  const executingRef = useRef<Set<string>>(new Set())

  const checkOrders = useCallback(async () => {
    if (!auth.user || pendingOrders.length === 0) return

    let nextPositions = positions
    let nextBalance = userBalance
    const filledOrderIds: string[] = []

    for (const order of pendingOrders) {
      if (order.status !== "pending") continue
      if (executingRef.current.has(order.id)) continue

      // Skip optimistic orders (not yet persisted)
      if (order.id.startsWith("pending-")) continue

      let triggered = false

      // BUY/LONG limit: market drops to or below limit price
      if (order.side === "long" && marketPrice <= order.limitPrice) {
        triggered = true
      }
      // SELL/SHORT limit: market rises to or above limit price
      if (order.side === "short" && marketPrice >= order.limitPrice) {
        triggered = true
      }

      if (!triggered) continue

      executingRef.current.add(order.id)

      const result = await executePendingOrder({
        userId: auth.user.id,
        orderId: order.id,
        fillPrice: order.limitPrice,
      })

      if (result.ok) {
        filledOrderIds.push(order.id)

        const newPosition = buildOpenPosition({
          id: result.data,
          symbol: order.symbol,
          side: order.side,
          size: order.size,
          entryPrice: order.limitPrice,
          leverage: order.leverage,
          markPrice: marketPrice,
        })
        const opened = applyOpenPosition(nextPositions, nextBalance, newPosition)
        nextPositions = opened.positions
        nextBalance = opened.userBalance

        playSound("success")
        toast({
          title: "Ordem Limit executada!",
          description: `${order.side.toUpperCase()} ${order.size} ${order.symbol} @ ${order.limitPrice.toLocaleString("en-US", { minimumFractionDigits: 1 })}`,
        })
      } else {
        console.error(`[PriceWatcher] Failed to execute order ${order.id}:`, result.error)
        toast({
          title: "Erro na execução da ordem",
          description: result.error,
          variant: "destructive",
        })
      }

      setTimeout(() => {
        executingRef.current.delete(order.id)
      }, 5000)
    }

    if (filledOrderIds.length > 0) {
      for (const orderId of filledOrderIds) {
        actions.removePendingOrder(orderId)
      }
      actions.setPositions(nextPositions)
      actions.setUserBalance(nextBalance)
    }
  }, [auth.user, pendingOrders, marketPrice, positions, userBalance, actions])

  useEffect(() => {
    checkOrders()
  }, [checkOrders])
}
