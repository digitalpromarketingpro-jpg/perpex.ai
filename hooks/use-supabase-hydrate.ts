"use client"

// ─────────────────────────────────────────────────────────────
// useSupabaseHydrate — Reactive auth-aware hydration.
//
// Listens to onAuthStateChange so it can:
//   • SIGNED_IN / TOKEN_REFRESHED / INITIAL_SESSION → fetch profile,
//     positions, trade history & pending orders → hydrate TradingContext
//   • SIGNED_OUT → reset context to clean defaults
//
// If Supabase is not configured (dev mode), silently skips
// and the context retains its default/mock values.
// ─────────────────────────────────────────────────────────────

import { useEffect, useRef } from "react"
import { useTrading } from "@/context/trading-context"
import { useAuth } from "@/context/auth-context"
import { isSupabaseConfigured } from "@/lib/supabase/client"
import {
  fetchProfile,
  fetchActivePositions,
  fetchTradeHistory,
  fetchPendingOrders,
} from "@/lib/supabase/queries"
import type { Position, TradeHistoryEntry, PendingOrder } from "@/types/trading"
import { logger } from "@/lib/logger"

// ── Defaults (unauthenticated / spectator) ────────────────────

const SPECTATOR_BALANCE = {
  available: 0,
  inPositions: 0,
  total: 0,
  currency: "USDT" as const,
}

// ── Hook ──────────────────────────────────────────────────────

export function useSupabaseHydrate() {
  const { actions } = useTrading()
  const { auth } = useAuth()
  const lastHydratedUserId = useRef<string | null>(null)

  useEffect(() => {
    // Supabase not configured → keep mock/demo data
    if (!isSupabaseConfigured()) return

    const user = auth.user

    // ── User logged out → reset to spectator ─────────────────
    if (!user) {
      if (lastHydratedUserId.current !== null) {
        // Was previously logged in — reset
        actions.setUserBalance(SPECTATOR_BALANCE)
        actions.setPositions([])
        actions.setTradeHistory([])
        actions.setPendingOrders([])
        lastHydratedUserId.current = null
        logger.info("[Supabase] Signed out — state reset")
      }
      return
    }

    // ── Same user already hydrated → skip ────────────────────
    if (lastHydratedUserId.current === user.id) return

    // ── New user detected → fetch & hydrate ──────────────────
    lastHydratedUserId.current = user.id
    const userId = user.id

    async function hydrate() {
      const [profileResult, positionsResult, historyResult, pendingResult] =
        await Promise.all([
          fetchProfile(userId),
          fetchActivePositions(userId),
          fetchTradeHistory(userId),
          fetchPendingOrders(userId),
        ])

      // Balance from profile
      if (profileResult.ok) {
        const p = profileResult.data
        actions.setUserBalance({
          available: Number(p.available_margin),
          inPositions: Number(p.equity) - Number(p.available_margin),
          total: Number(p.equity),
          currency: "USDT",
        })
        logger.info("[Supabase] Profile loaded", {
          user: p.display_name ?? p.username,
          equity: Number(p.equity).toFixed(2),
        })
      } else {
        logger.warn("[Supabase] Failed to load profile", { error: profileResult.error })
      }

      // Positions
      if (positionsResult.ok) {
        const mapped: Position[] = positionsResult.data.map((row) => ({
          id: row.id,
          symbol: row.symbol as Position["symbol"],
          side: row.side,
          size: Number(row.size),
          entryPrice: Number(row.entry_price),
          markPrice: Number(row.entry_price),
          pnl: 0,
          pnlPct: 0,
          leverage: row.leverage,
          liqPrice: Number(row.liq_price),
          margin: Number(row.margin),
        }))
        actions.setPositions(mapped)
      } else {
        logger.warn("[Supabase] Failed to load positions", { error: positionsResult.error })
      }

      // Trade history
      if (historyResult.ok) {
        const mapped: TradeHistoryEntry[] = historyResult.data.map((row, idx) => ({
          id: row.id ?? idx + 1,
          symbol: row.symbol as TradeHistoryEntry["symbol"],
          side: row.side,
          type:
            row.status === "FUNDING"
              ? "Funding"
              : row.status === "LIQUIDATED"
                ? "Liquidação"
                : "Market",
          price: Number(row.price),
          size: Number(row.qty),
          fee: Number(row.fee),
          pnl: Number(row.realized_pnl),
          status: row.status ?? "CLOSED",
          time: new Date(row.closed_at).toLocaleTimeString("pt-BR", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          }),
        }))
        actions.setTradeHistory(mapped)
      } else {
        logger.warn("[Supabase] Failed to load trade history", { error: historyResult.error })
      }

      // Pending orders
      if (pendingResult.ok) {
        const mapped: PendingOrder[] = pendingResult.data.map((row) => ({
          id: row.id,
          symbol: row.symbol as PendingOrder["symbol"],
          side: row.side,
          orderType: row.order_type,
          size: Number(row.size),
          limitPrice: Number(row.limit_price),
          leverage: row.leverage,
          stopLoss: row.stop_loss ? Number(row.stop_loss) : null,
          takeProfit: row.take_profit ? Number(row.take_profit) : null,
          status: row.status,
          createdAt: row.created_at,
        }))
        actions.setPendingOrders(mapped)
      } else {
        logger.warn("[Supabase] Failed to load pending orders", { error: pendingResult.error })
      }

      logger.info("[Supabase] User state hydrated successfully")
    }

    hydrate()
  }, [auth.user, actions])
}
