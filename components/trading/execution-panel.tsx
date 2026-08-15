"use client"

import { useState, useMemo, useCallback, useEffect } from "react"
import { cn } from "@/lib/utils"
import { Info, AlertTriangle, LogIn, Shield, Target, Zap } from "lucide-react"
import { useTrading } from "@/context/trading-context"
import { useAuth } from "@/context/auth-context"
import { AuthModal } from "./auth-modal"
import type { OrderType, OrderSide, PendingOrder } from "@/types/trading"
import {
  validateOrder,
  validateOrderBusinessRules,
  type OrderInput,
} from "@/lib/validation/order-schema"
import {
  calcLiquidationPrice,
  calcMaxPositionSize,
  calcOrderCost,
  calcUnrealizedPnl,
} from "@/lib/trade-engine"
import { toast } from "@/hooks/use-toast"
import { insertPendingOrder, openPosition } from "@/lib/supabase/queries"
import { isSupabaseConfigured } from "@/lib/supabase/client"
import {
  applyOpenPosition,
  buildOpenPosition,
  revertOpenPosition,
} from "@/lib/trading/open-position-state"
import { playSound } from "@/lib/audio"
import { rateLimiter } from "@/lib/rate-limiter"
import { logger } from "@/lib/logger"

export function ExecutionPanel() {
  const { state, actions } = useTrading()
  const { marketPrice: midPrice, userBalance, activeSymbol, quickFill, positions } = state
  const { auth } = useAuth()
  const [authOpen, setAuthOpen] = useState(false)

  const [orderType, setOrderType] = useState<OrderType>("limit")
  const [leverage, setLeverage] = useState(10)
  const [price, setPrice] = useState(midPrice.toFixed(1))
  const [size, setSize] = useState("")
  const [stopPrice, setStopPrice] = useState("")
  const [stopLoss, setStopLoss] = useState("")
  const [takeProfit, setTakeProfit] = useState("")
  const [sizePercent, setSizePercent] = useState(0)
  const [prefSide, setPrefSide] = useState<"buy" | "sell" | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  // ── Quick Fill: react to Order Book click ─────────────────
  useEffect(() => {
    if (!quickFill) return
    setPrice(quickFill.price.toFixed(1))
    setPrefSide(quickFill.side)
    setOrderType("limit")
    setFieldErrors({})
    actions.setQuickFill(null)
  }, [quickFill, actions])

  // ── Leverage risk level ───────────────────────────────────
  const leverageRisk = leverage <= 20 ? "safe" : leverage <= 50 ? "moderate" : "high"
  const leverageColor =
    leverageRisk === "safe" ? "text-primary" :
    leverageRisk === "moderate" ? "text-amber-400" :
    "text-red-500"

  const walletBalance = userBalance.available

  // ── TradeEngine pure function computations ──────────────
  const maxBuy = useMemo(
    () => calcMaxPositionSize(walletBalance, leverage, midPrice).toFixed(4),
    [walletBalance, leverage, midPrice]
  )

  const liqPriceLong = useMemo(
    () => calcLiquidationPrice("long", midPrice, leverage),
    [midPrice, leverage]
  )

  const liqPriceShort = useMemo(
    () => calcLiquidationPrice("short", midPrice, leverage),
    [midPrice, leverage]
  )

  const orderCost = useMemo(() => {
    const qty = parseFloat(size) || 0
    const px = orderType === "market" ? midPrice : (parseFloat(price) || midPrice)
    if (qty <= 0) return null
    return calcOrderCost(qty, px, leverage)
  }, [size, price, orderType, midPrice, leverage])

  // ── SL/TP estimated PnL computation ──────────────────────
  const slTpEstimate = useMemo(() => {
    const qty = parseFloat(size) || 0
    const entryPx = orderType === "market" ? midPrice : (parseFloat(price) || midPrice)
    if (qty <= 0 || entryPx <= 0) return null

    const slPx = parseFloat(stopLoss) || 0
    const tpPx = parseFloat(takeProfit) || 0
    const margin = (qty * entryPx) / leverage

    const result: {
      slPnl: number | null; slPct: number | null;
      tpPnl: number | null; tpPct: number | null;
    } = { slPnl: null, slPct: null, tpPnl: null, tpPct: null }

    // We compute for both long and short — the actual side is chosen at submit time
    // For preview, we show "long" estimates (SL below entry, TP above)
    if (slPx > 0) {
      const pnlLong = calcUnrealizedPnl("long", qty, entryPx, slPx)
      const pnlShort = calcUnrealizedPnl("short", qty, entryPx, slPx)
      // Use the one that is a loss (SL is protection)
      result.slPnl = slPx < entryPx ? pnlLong : pnlShort
      result.slPct = margin > 0 ? (result.slPnl / margin) * 100 : 0
    }
    if (tpPx > 0) {
      const pnlLong = calcUnrealizedPnl("long", qty, entryPx, tpPx)
      const pnlShort = calcUnrealizedPnl("short", qty, entryPx, tpPx)
      // Use the one that is a gain (TP is target)
      result.tpPnl = tpPx > entryPx ? pnlLong : pnlShort
      result.tpPct = margin > 0 ? (result.tpPnl / margin) * 100 : 0
    }
    return result
  }, [size, price, stopLoss, takeProfit, orderType, midPrice, leverage])

  const handleSizePercent = useCallback((pct: number) => {
    setSizePercent(pct)
    // Use limit price when available, fall back to market price
    const effectivePrice = orderType !== "market" && parseFloat(price) > 0
      ? parseFloat(price)
      : midPrice
    // qty = (balance × leverage × pct%) / price
    const s = calcMaxPositionSize(walletBalance * pct / 100, leverage, effectivePrice).toFixed(4)
    setSize(s)
    setFieldErrors({})
  }, [walletBalance, leverage, midPrice, orderType, price])

  // ── Zod-validated order submission ──────────────────────
  const handleSubmit = useCallback(async (side: OrderSide) => {
    setFieldErrors({})

    // Rate limit check
    const rateCheck = rateLimiter.check("trade:order")
    if (!rateCheck.allowed) {
      toast({
        title: "Limite de ordens excedido",
        description: `Aguarde ${rateCheck.retryAfter}s antes de enviar outra ordem`,
        variant: "destructive",
      })
      return
    }

    // Build the raw input object
    const rawInput: Record<string, unknown> = {
      type: orderType,
      symbol: activeSymbol,
      side,
      quantity: parseFloat(size) || 0,
      leverage,
    }

    if (orderType !== "market") {
      rawInput.price = parseFloat(price) || 0
    }
    if (orderType === "stop-limit") {
      rawInput.stopPrice = parseFloat(stopPrice) || 0
    }

    // Phase 1: Schema validation (Zod)
    const schemaResult = validateOrder(rawInput)
    if (!schemaResult.success) {
      setFieldErrors(schemaResult.errors ?? {})
      return
    }

    // Phase 2: Business rules validation
    const bizResult = validateOrderBusinessRules(schemaResult.data!, {
      marketPrice: midPrice,
      availableBalance: walletBalance,
      maxLeverage: 125,
    })
    if (!bizResult.success) {
      setFieldErrors(bizResult.errors ?? {})
      return
    }

    const qty = parseFloat(size) || 0
    const positionSide = side === "buy" ? "long" as const : "short" as const
    const effectivePx = orderType === "market" ? midPrice : (parseFloat(price) || midPrice)
    const requiredMargin = (qty * effectivePx) / leverage

    // ── Margin insufficient check ─────────────────────────
    if (requiredMargin > walletBalance) {
      playSound("error")
      toast({
        title: "Margem Insuficiente",
        description: `Necessário: $${requiredMargin.toFixed(2)} — Disponível: $${walletBalance.toFixed(2)}`,
        variant: "destructive",
      })
      setFieldErrors({ quantity: "Saldo insuficiente para esta posição" })
      return
    }

    // ── LIMIT ORDER → save as pending order ──────────────
    if (orderType === "limit" || orderType === "stop-limit") {
      const limitPx = parseFloat(price) || 0
      const slPx = parseFloat(stopLoss) || null
      const tpPx = parseFloat(takeProfit) || null

      // Optimistic: add to local state immediately
      const optimisticId = `pending-${Date.now()}`
      const pendingOrder: PendingOrder = {
        id: optimisticId,
        symbol: activeSymbol,
        side: positionSide,
        orderType: orderType as "limit" | "stop-limit",
        size: qty,
        limitPrice: limitPx,
        leverage,
        stopLoss: slPx,
        takeProfit: tpPx,
        status: "pending",
        createdAt: new Date().toISOString(),
      }

      actions.addPendingOrder(pendingOrder)
      playSound("success")
      toast({
        title: `✓ Ordem Limit ${positionSide === "long" ? "Compra" : "Venda"} criada`,
        description: `${qty} ${activeSymbol} @ $${limitPx.toLocaleString("en-US", { minimumFractionDigits: 1 })} · Margem: $${requiredMargin.toFixed(2)}`,
      })

      // Persist to Supabase (async, non-blocking for UI)
      if (auth.user) {
        setSubmitting(true)
        const result = await insertPendingOrder({
          user_id: auth.user.id,
          symbol: activeSymbol,
          side: positionSide,
          order_type: orderType as "limit" | "stop-limit",
          size: qty,
          limit_price: limitPx,
          leverage,
          stop_loss: slPx,
          take_profit: tpPx,
        })
        setSubmitting(false)

        if (result.ok) {
          actions.removePendingOrder(optimisticId)
          actions.addPendingOrder({
            ...pendingOrder,
            id: result.data.id,
            createdAt: result.data.created_at,
          })
        } else {
          actions.removePendingOrder(optimisticId)
          playSound("error")
          toast({
            title: "Erro ao salvar ordem",
            description: result.error,
            variant: "destructive",
          })
        }
      }

      setSize(""); setSizePercent(0); setStopLoss(""); setTakeProfit(""); setPrefSide(null)
      return
    }

    // ── MARKET ORDER → immediate execution ────────────────
    setSubmitting(true)
    const optimisticId = `market-${Date.now()}`
    const newPosition = buildOpenPosition({
      id: optimisticId,
      symbol: activeSymbol,
      side: positionSide,
      size: qty,
      entryPrice: midPrice,
      leverage,
      markPrice: midPrice,
    })
    const opened = applyOpenPosition(positions, userBalance, newPosition)
    actions.setPositions(opened.positions)
    actions.setUserBalance(opened.userBalance)

    playSound("success")
    toast({
      title: `✓ Ordem ${side === "buy" ? "Compra" : "Venda"} enviada`,
      description: `MARKET ${qty} ${activeSymbol} @ $${midPrice.toLocaleString("en-US", { minimumFractionDigits: 1 })} · Margem: $${requiredMargin.toFixed(2)}`,
    })

    if (auth.user && isSupabaseConfigured()) {
      const result = await openPosition({
        userId: auth.user.id,
        symbol: activeSymbol,
        side: positionSide,
        size: qty,
        entryPrice: midPrice,
        leverage,
      })

      if (result.ok) {
        actions.setPositions(
          opened.positions.map((p) =>
            p.id === optimisticId ? { ...p, id: result.data } : p
          )
        )
      } else {
        const reverted = revertOpenPosition(opened.positions, opened.userBalance, optimisticId)
        actions.setPositions(reverted.positions)
        actions.setUserBalance(reverted.userBalance)
        playSound("error")
        toast({
          title: "Erro ao abrir posição",
          description: result.error,
          variant: "destructive",
        })
        logger.error("[ExecutionPanel] openPosition failed", undefined, { error: result.error })
      }
    }

    setSubmitting(false)
    setSize(""); setSizePercent(0); setStopLoss(""); setTakeProfit(""); setPrefSide(null)
  }, [orderType, activeSymbol, size, leverage, price, stopPrice, stopLoss, takeProfit, midPrice, walletBalance, userBalance, positions, actions, auth.user])

  const fmtPrice = (n: number) =>
    n.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })

  // ── Auth gate: spectator mode ─────────────────────────────
  if (!auth.isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 p-4 h-full">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <LogIn className="w-6 h-6 text-primary" />
          </div>
          <p className="text-sm font-medium text-foreground">Modo Espectador</p>
          <p className="text-[11px] text-muted-foreground leading-relaxed max-w-[200px]">
            Faça login para acessar a boleta de negociação e começar a operar
          </p>
        </div>
        <button
          onClick={() => setAuthOpen(true)}
          className="flex items-center justify-center gap-2 w-full h-11 rounded-md text-sm font-bold bg-primary text-primary-foreground hover:bg-primary/90 transition-all active:scale-[0.97]"
        >
          <LogIn className="w-4 h-4" />
          Faça Login para Operar
        </button>
        <AuthModal open={authOpen} onOpenChange={setAuthOpen} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2 p-2 h-full overflow-y-auto">
      {/* Leverage */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground">Alavancagem</span>
          <div className="flex items-center gap-1.5">
            {leverageRisk !== "safe" && (
              <span className={cn(
                "text-[9px] font-mono px-1 py-0.5 rounded flex items-center gap-0.5",
                leverageRisk === "moderate"
                  ? "bg-amber-400/15 text-amber-400"
                  : "bg-red-500/15 text-red-500"
              )}>
                <Zap className="w-2 h-2" />
                {leverageRisk === "moderate" ? "Risco Moderado" : "Alto Risco"}
              </span>
            )}
            <span className={cn("font-mono text-xs font-bold", leverageColor)}>{leverage}x</span>
          </div>
        </div>
        <input
          type="range"
          min={1}
          max={125}
          value={leverage}
          onChange={(e) => setLeverage(Number(e.target.value))}
          className={cn(
            "w-full h-1 cursor-pointer",
            leverageRisk === "safe" ? "accent-primary" :
            leverageRisk === "moderate" ? "accent-amber-400" :
            "accent-red-500"
          )}
          aria-label="Alavancagem"
        />
        <div className="flex justify-between text-[9px] text-muted-foreground font-mono">
          {[1, 10, 25, 50, 125].map((v) => (
            <button
              key={v}
              onClick={() => setLeverage(v)}
              className={cn(
                "hover:text-foreground transition-colors",
                leverage === v && "font-bold",
                leverage === v && leverageColor
              )}
            >
              {v}x
            </button>
          ))}
        </div>
        <FieldError error={fieldErrors["leverage"]} />
      </div>

      {/* Order type toggle */}
      <div className="flex rounded overflow-hidden border border-border">
        {(["limit", "market", "stop-limit"] as OrderType[]).map((t) => (
          <button
            key={t}
            onClick={() => { setOrderType(t); setFieldErrors({}) }}
            className={cn(
              "flex-1 py-1.5 text-[10px] font-medium capitalize transition-colors",
              orderType === t
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t === "stop-limit" ? "Stop-Limit" : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Stop Price (stop-limit only) */}
      {orderType === "stop-limit" && (
        <div className="flex flex-col gap-0.5">
          <label className="text-[10px] text-muted-foreground">Preço Stop (USDT)</label>
          <input
            type="number"
            value={stopPrice}
            onChange={(e) => { setStopPrice(e.target.value); setFieldErrors({}) }}
            placeholder="0.00"
            className={cn(
              "bg-secondary text-foreground font-mono text-xs rounded px-2 py-1.5 outline-none border w-full",
              fieldErrors["stopPrice"] ? "border-trade-short" : "border-transparent focus:border-primary"
            )}
          />
          <FieldError error={fieldErrors["stopPrice"]} />
        </div>
      )}

      {/* Price (limit & stop-limit) */}
      {orderType !== "market" && (
        <div className="flex flex-col gap-0.5">
          <label className="text-[10px] text-muted-foreground flex items-center justify-between">
            <span>Preço (USDT)</span>
            {prefSide && (
              <span className={cn(
                "text-[9px] font-mono px-1.5 py-0.5 rounded flex items-center gap-1",
                prefSide === "buy"
                  ? "bg-trade-long/15 text-trade-long"
                  : "bg-trade-short/15 text-trade-short"
              )}>
                <Zap className="w-2 h-2" />
                Book → {prefSide === "buy" ? "Compra" : "Venda"}
              </span>
            )}
          </label>
          <input
            type="number"
            value={price}
            onChange={(e) => { setPrice(e.target.value); setFieldErrors({}) }}
            placeholder="0.00"
            className={cn(
              "bg-secondary text-foreground font-mono text-xs rounded px-2 py-1.5 outline-none border w-full",
              prefSide === "buy" ? "border-trade-long/50" :
              prefSide === "sell" ? "border-trade-short/50" :
              fieldErrors["price"] ? "border-trade-short" :
              "border-transparent focus:border-primary"
            )}
          />
          <FieldError error={fieldErrors["price"]} />
        </div>
      )}

      {/* Size */}
      <div className="flex flex-col gap-0.5">
        <label className="text-[10px] text-muted-foreground">Quantidade (BTC)</label>
        <input
          type="number"
          value={size}
          onChange={(e) => { setSize(e.target.value); setFieldErrors({}) }}
          placeholder="0.0000"
          className={cn(
            "bg-secondary text-foreground font-mono text-xs rounded px-2 py-1.5 outline-none border w-full",
            fieldErrors["quantity"] ? "border-trade-short" : "border-transparent focus:border-primary"
          )}
        />
        <FieldError error={fieldErrors["quantity"]} />
      </div>

      {/* Size % presets */}
      <div className="flex gap-1">
        {[25, 50, 75, 100].map((pct) => (
          <button
            key={pct}
            onClick={() => handleSizePercent(pct)}
            className={cn(
              "flex-1 py-1 text-[10px] font-mono rounded border transition-colors",
              sizePercent === pct
                ? "border-primary text-primary bg-primary/10"
                : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
            )}
          >
            {pct}%
          </button>
        ))}
      </div>

      {/* Stop Loss / Take Profit */}
      <div className="flex gap-1.5">
        <div className="flex-1 flex flex-col gap-0.5">
          <label className="text-[10px] text-muted-foreground flex items-center gap-1">
            <Shield className="w-2.5 h-2.5 text-trade-short" /> Stop Loss
          </label>
          <input
            type="number"
            value={stopLoss}
            onChange={(e) => setStopLoss(e.target.value)}
            placeholder="Opcional"
            className="bg-secondary text-foreground font-mono text-xs rounded px-2 py-1.5 outline-none border border-transparent focus:border-trade-short w-full"
          />
          {slTpEstimate?.slPnl != null && (
            <span className={cn("text-[9px] font-mono", slTpEstimate.slPnl >= 0 ? "text-trade-long" : "text-trade-short")}>
              {slTpEstimate.slPnl >= 0 ? "+" : ""}{slTpEstimate.slPnl.toFixed(2)} ({slTpEstimate.slPct!.toFixed(1)}%)
            </span>
          )}
        </div>
        <div className="flex-1 flex flex-col gap-0.5">
          <label className="text-[10px] text-muted-foreground flex items-center gap-1">
            <Target className="w-2.5 h-2.5 text-trade-long" /> Take Profit
          </label>
          <input
            type="number"
            value={takeProfit}
            onChange={(e) => setTakeProfit(e.target.value)}
            placeholder="Opcional"
            className="bg-secondary text-foreground font-mono text-xs rounded px-2 py-1.5 outline-none border border-transparent focus:border-trade-long w-full"
          />
          {slTpEstimate?.tpPnl != null && (
            <span className={cn("text-[9px] font-mono", slTpEstimate.tpPnl >= 0 ? "text-trade-long" : "text-trade-short")}>
              {slTpEstimate.tpPnl >= 0 ? "+" : ""}{slTpEstimate.tpPnl.toFixed(2)} ({slTpEstimate.tpPct!.toFixed(1)}%)
            </span>
          )}
        </div>
      </div>

      {/* Summary — powered by TradeEngine pure functions */}
      <div className="rounded border border-border p-2 flex flex-col gap-1.5 bg-background/30">
        <SummaryRow label="Máx. Compra" value={`${maxBuy} BTC`} />
        <SummaryRow label="Liq. Long" value={fmtPrice(liqPriceLong)} color="text-trade-short" />
        <SummaryRow label="Liq. Short" value={fmtPrice(liqPriceShort)} color="text-trade-long" />
        {orderCost && (
          <>
            <SummaryRow label="Margem Req." value={`${orderCost.margin.toFixed(2)} USDT`} />
            <SummaryRow label="Taxa Est." value={`${orderCost.fee.toFixed(2)} USDT`} color="text-muted-foreground" />
          </>
        )}
        {!orderCost && (
          <SummaryRow label="Taxa Estimada" value="0.0400%" color="text-muted-foreground" />
        )}
      </div>

      {/* Buy / Sell Buttons */}
      <div className="flex gap-1.5 mt-auto pt-1">
        <button
          onClick={() => handleSubmit("buy")}
          disabled={submitting}
          className={cn(
            "flex-1 py-2.5 rounded text-xs font-bold font-mono text-white tracking-wider transition-all active:scale-95",
            submitting && "opacity-60",
            prefSide === "buy" && "ring-2 ring-offset-1 ring-offset-card ring-[color:var(--trade-long)]"
          )}
          style={{ background: "var(--trade-long)" }}
        >
          {orderType === "market" ? "COMPRAR / LONG" : "LIMIT LONG"}
        </button>
        <button
          onClick={() => handleSubmit("sell")}
          disabled={submitting}
          className={cn(
            "flex-1 py-2.5 rounded text-xs font-bold font-mono text-white tracking-wider transition-all active:scale-95",
            submitting && "opacity-60",
            prefSide === "sell" && "ring-2 ring-offset-1 ring-offset-card ring-[color:var(--trade-short)]"
          )}
          style={{ background: "var(--trade-short)" }}
        >
          {orderType === "market" ? "VENDER / SHORT" : "LIMIT SHORT"}
        </button>
      </div>
    </div>
  )
}

function FieldError({ error }: { error?: string }) {
  if (!error) return null
  return (
    <span className="flex items-center gap-1 text-[9px] text-trade-short font-mono mt-0.5">
      <AlertTriangle className="w-2.5 h-2.5 shrink-0" />
      {error}
    </span>
  )
}

function SummaryRow({
  label,
  value,
  color = "text-foreground",
}: {
  label: string
  value: string
  color?: string
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[10px] text-muted-foreground flex items-center gap-1">
        {label}
        <Info className="w-2.5 h-2.5 opacity-50" />
      </span>
      <span className={cn("font-mono text-[11px]", color)}>{value}</span>
    </div>
  )
}
