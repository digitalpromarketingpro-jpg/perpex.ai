"use client"

// ─────────────────────────────────────────────────────────────
// useFundingRate — manages the 8-hour funding rate cycle.
//
// Every 8 hours (simulated via countdown), calculates the
// funding payment for each open position:
//   payment = positionSize × markPrice × fundingRate
//
// If fundingRate > 0:
//   LONG positions PAY (negative PnL)
//   SHORT positions RECEIVE (positive PnL)
//
// If fundingRate < 0:
//   SHORT positions PAY
//   LONG positions RECEIVE
//
// Returns countdown state for the header display and exposes
// the current funding rate for UI consumption.
// ─────────────────────────────────────────────────────────────

import { useState, useEffect, useRef, useCallback } from "react"
import { useTrading } from "@/context/trading-context"
import { useAuth } from "@/context/auth-context"
import { applyFundingPayment } from "@/lib/supabase/queries"
import { toast } from "@/hooks/use-toast"
import type { TradeHistoryEntry } from "@/types/trading"

// 8 hours = 28800 seconds. Start at a random offset for realism.
const FUNDING_INTERVAL = 28_800
const INITIAL_COUNTDOWN = 3247 // ~54 minutes into a cycle

// Simulated funding rate — oscillates slightly around 0.01%
function generateFundingRate(): number {
  const base = 0.0001 // 0.01%
  const noise = (Math.random() - 0.5) * 0.00015
  return base + noise
}

export interface FundingRateState {
  countdown: number          // seconds until next funding
  fundingRate: number        // current rate (e.g. 0.0001 = 0.01%)
  nextFundingTime: string    // formatted HH:MM:SS
  lastPaymentTotal: number   // last cycle's total payment
}

export function useFundingRate(): FundingRateState {
  const { state, actions } = useTrading()
  const { auth } = useAuth()
  const { positions, marketPrice } = state

  const [countdown, setCountdown] = useState(INITIAL_COUNTDOWN)
  const [fundingRate, setFundingRate] = useState(0.0001) // stable SSR value
  const [lastPaymentTotal, setLastPaymentTotal] = useState(0)
  const processingRef = useRef(false)

  // Generate random rate on client mount to avoid hydration mismatch
  useEffect(() => {
    setFundingRate(generateFundingRate())
  }, [])

  // ── Countdown tick ──────────────────────────────────────
  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) return FUNDING_INTERVAL
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  // ── Apply funding when countdown reaches 0 ─────────────
  const applyFunding = useCallback(async () => {
    if (processingRef.current) return
    if (positions.length === 0) return
    processingRef.current = true

    let totalPayment = 0
    const newHistoryEntries: TradeHistoryEntry[] = []

    for (const pos of positions) {
      // payment = size × markPrice × fundingRate
      const notional = pos.size * marketPrice
      let payment: number

      if (fundingRate > 0) {
        // Positive rate: longs pay, shorts receive
        payment = pos.side === "long"
          ? -(notional * fundingRate)
          : (notional * fundingRate)
      } else {
        // Negative rate: shorts pay, longs receive
        payment = pos.side === "short"
          ? (notional * fundingRate) // negative × negative = pay
          : -(notional * fundingRate) // negative × negative for longs = receive
      }

      totalPayment += payment

      // Record in local trade history
      const entry: TradeHistoryEntry = {
        id: `funding-${Date.now()}-${pos.id}`,
        symbol: pos.symbol,
        side: pos.side === "long" ? "buy" : "sell",
        type: "Funding",
        price: marketPrice,
        size: pos.size,
        fee: 0,
        pnl: payment,
        status: "FUNDING",
        time: new Date().toLocaleTimeString("pt-BR", { hour12: false }),
      }
      newHistoryEntries.push(entry)

      // Persist to Supabase if authenticated and DB position
      if (auth.user && typeof pos.id === "string" && !pos.id.startsWith("funding-")) {
        await applyFundingPayment({
          userId: auth.user.id,
          positionId: String(pos.id),
          symbol: pos.symbol,
          side: pos.side,
          size: pos.size,
          markPrice: marketPrice,
          fundingRate: fundingRate,
        }).catch((err) => {
          console.error(`[FundingRate] DB funding failed for ${pos.id}:`, err)
        })
      }
    }

    // Update local state
    if (newHistoryEntries.length > 0) {
      actions.setTradeHistory([...newHistoryEntries, ...state.tradeHistory])
    }

    // Update balance
    if (totalPayment !== 0) {
      actions.setUserBalance({
        ...state.userBalance,
        available: state.userBalance.available + totalPayment,
        total: state.userBalance.total + totalPayment,
      })
    }

    setLastPaymentTotal(totalPayment)

    // Toast notification
    const direction = totalPayment >= 0 ? "recebido" : "pago"
    const absFmt = Math.abs(totalPayment).toFixed(4)
    toast({
      title: `Funding ${direction}`,
      description: `${totalPayment >= 0 ? "+" : "-"}$${absFmt} em ${positions.length} posição(ões)`,
    })

    // Generate new rate for next cycle
    setFundingRate(generateFundingRate())
    processingRef.current = false
  }, [positions, marketPrice, fundingRate, auth.user, actions, state.tradeHistory, state.userBalance])

  // Trigger funding when countdown resets
  useEffect(() => {
    if (countdown === FUNDING_INTERVAL) {
      applyFunding()
    }
  }, [countdown, applyFunding])

  // Format countdown
  const h = String(Math.floor(countdown / 3600)).padStart(2, "0")
  const m = String(Math.floor((countdown % 3600) / 60)).padStart(2, "0")
  const s = String(countdown % 60).padStart(2, "0")

  return {
    countdown,
    fundingRate,
    nextFundingTime: `${h}:${m}:${s}`,
    lastPaymentTotal,
  }
}
