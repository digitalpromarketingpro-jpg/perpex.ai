"use client"

import { useState, useCallback } from "react"
import { cn } from "@/lib/utils"
import { X, ChevronUp, ChevronDown, Inbox, ClipboardList, Clock, History, Loader2, FileText, Zap, AlertTriangle, DollarSign } from "lucide-react"
import { useTrading } from "@/context/trading-context"
import { useAuth } from "@/context/auth-context"
import { cancelPendingOrder, closePosition } from "@/lib/supabase/queries"
import { playSound } from "@/lib/audio"
import { toast } from "@/hooks/use-toast"
import type { TradeHistoryEntry } from "@/types/trading"

type Tab = "positions" | "orders" | "conditional" | "history" | "extrato"

const TABS: { key: Tab; label: string }[] = [
  { key: "positions", label: "Posições Abertas" },
  { key: "orders", label: "Ordens Ativas" },
  { key: "conditional", label: "Condicionais" },
  { key: "history", label: "Histórico" },
  { key: "extrato", label: "Extrato" },
]

function EmptyState({ icon, message }: { icon: React.ReactNode; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-muted-foreground">
      {icon}
      <span className="text-[11px] font-medium">{message}</span>
    </div>
  )
}

function SideBadge({ side }: { side: "long" | "short" | "buy" | "sell" }) {
  const isPositive = side === "long" || side === "buy"
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold uppercase",
        isPositive
          ? "bg-trade-long/15 text-trade-long"
          : "bg-trade-short/15 text-trade-short"
      )}
    >
      {isPositive ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
      {side === "long" ? "Long" : side === "short" ? "Short" : side === "buy" ? "Compra" : "Venda"}
    </span>
  )
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { icon: React.ReactNode; label: string; cls: string }> = {
    CLOSED:     { icon: <DollarSign className="w-2.5 h-2.5" />, label: "Fechado",    cls: "bg-primary/10 text-primary" },
    LIQUIDATED: { icon: <AlertTriangle className="w-2.5 h-2.5" />, label: "Liquidado", cls: "bg-trade-short/15 text-trade-short" },
    FUNDING:    { icon: <Zap className="w-2.5 h-2.5" />, label: "Funding",           cls: "bg-amber-400/15 text-amber-400" },
  }
  const c = config[status] ?? config.CLOSED
  return (
    <span className={cn("inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold", c.cls)}>
      {c.icon} {c.label}
    </span>
  )
}

export function PositionsPanel() {
  const { state, actions } = useTrading()
  const { positions, openOrders, conditionalOrders, tradeHistory, pendingOrders } = state
  const { auth } = useAuth()
  const [tab, setTab] = useState<Tab>("positions")
  const [cancellingId, setCancellingId] = useState<string | null>(null)

  const handleClosePosition = useCallback(async (positionId: string | number) => {
    const pos = positions.find((p) => p.id === positionId)
    if (!pos) return

    const marketPrice = state.marketPrice
    const fee = pos.size * marketPrice * 0.0004 // 0.04% taker fee
    const pnl = pos.pnl - fee

    // Optimistic: remove position
    actions.setPositions(positions.filter((p) => p.id !== positionId))

    // Return margin + PnL to available balance
    const { userBalance } = state
    actions.setUserBalance({
      ...userBalance,
      available: userBalance.available + pos.margin + pnl,
      inPositions: Math.max(0, userBalance.inPositions - pos.margin),
      total: userBalance.total + pnl,
    })

    // Add to trade history
    const entry: TradeHistoryEntry = {
      id: `close-${Date.now()}-${positionId}`,
      symbol: pos.symbol,
      side: pos.side === "long" ? "sell" : "buy",
      type: "Market",
      price: marketPrice,
      size: pos.size,
      fee,
      pnl,
      status: "CLOSED",
      time: new Date().toLocaleTimeString("pt-BR", { hour12: false }),
    }
    actions.setTradeHistory([entry, ...state.tradeHistory])

    playSound("success")
    toast({
      title: `Posição ${pos.side.toUpperCase()} fechada`,
      description: `${pos.size} ${pos.symbol} @ $${marketPrice.toLocaleString("en-US", { minimumFractionDigits: 1 })} · PnL: ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)} USDT`,
    })

    // Persist to Supabase if DB position
    if (auth.user && typeof positionId === "string" && !positionId.startsWith("close-")) {
      const result = await closePosition({
        userId: auth.user.id,
        positionId: positionId,
        closePrice: marketPrice,
      })
      if (!result.ok) {
        console.error("[ClosePosition] DB call failed:", result.error)
      }
    }
  }, [positions, state, actions, auth.user])

  const handleCancelOrder = useCallback(async (orderId: string) => {
    if (!auth.user) return
    setCancellingId(orderId)

    // Optimistic removal
    actions.removePendingOrder(orderId)

    // Skip DB call for optimistic orders not yet persisted
    if (!orderId.startsWith("pending-")) {
      const result = await cancelPendingOrder(auth.user.id, orderId)
      if (!result.ok) {
        toast({
          title: "Erro ao cancelar ordem",
          description: result.error,
          variant: "destructive",
        })
      }
    }

    playSound("warning")
    toast({ title: "⚠ Ordem cancelada", description: "A ordem limit foi removida." })
    setCancellingId(null)
  }, [auth.user, actions])

  const activePendingOrders = pendingOrders.filter((o) => o.status === "pending")

  return (
    <div className="flex flex-col h-full border-t border-border bg-card overflow-hidden">
      {/* Tabs */}
      <div className="flex border-b border-border shrink-0 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "px-4 py-2 text-[11px] font-medium whitespace-nowrap transition-colors shrink-0",
              tab === t.key
                ? "text-foreground border-b-2 border-primary -mb-px"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label}
            {t.key === "positions" && positions.length > 0 && (
              <span className="ml-1.5 px-1 py-0.5 bg-secondary text-muted-foreground rounded text-[9px] font-mono">
                {positions.length}
              </span>
            )}
            {t.key === "orders" && (openOrders.length + activePendingOrders.length) > 0 && (
              <span className="ml-1.5 px-1 py-0.5 bg-secondary text-muted-foreground rounded text-[9px] font-mono">
                {openOrders.length + activePendingOrders.length}
              </span>
            )}
            {t.key === "conditional" && conditionalOrders.length > 0 && (
              <span className="ml-1.5 px-1 py-0.5 bg-secondary text-muted-foreground rounded text-[9px] font-mono">
                {conditionalOrders.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {tab === "positions" && (
          positions.length === 0 ? (
            <EmptyState icon={<Inbox className="w-8 h-8 opacity-30" />} message="Nenhuma posição aberta" />
          ) : (
          <table className="w-full text-[11px]">
            <thead className="sticky top-0 bg-card z-10">
              <tr className="border-b border-border">
                {["Par", "Direção", "Tamanho", "Preço Entrada", "Preço Mark", "Liq. Price", "PnL Não Real.", "Margem", ""].map((h) => (
                  <th key={h} className="px-3 py-1.5 text-left font-medium text-muted-foreground whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {positions.map((p) => (
                <tr key={p.id} className="border-b border-border/50 hover:bg-secondary/50 transition-colors">
                  <td className="px-3 py-2 font-mono font-semibold text-foreground whitespace-nowrap">
                    {p.symbol}
                    <span className="ml-1.5 text-[9px] text-muted-foreground font-normal">
                      {p.leverage}x
                    </span>
                  </td>
                  <td className="px-3 py-2"><SideBadge side={p.side} /></td>
                  <td className="px-3 py-2 font-mono text-foreground">{p.size} BTC</td>
                  <td className="px-3 py-2 font-mono text-foreground">
                    {p.entryPrice.toLocaleString("en-US", { minimumFractionDigits: 1 })}
                  </td>
                  <td className="px-3 py-2 font-mono text-foreground">
                    {p.markPrice.toLocaleString("en-US", { minimumFractionDigits: 1 })}
                  </td>
                  <td className="px-3 py-2 font-mono text-trade-short">
                    {p.liqPrice.toLocaleString("en-US", { minimumFractionDigits: 1 })}
                  </td>
                  <td className="px-3 py-2">
                    <span className={cn("font-mono font-bold", p.pnl >= 0 ? "text-trade-long" : "text-trade-short")}>
                      {p.pnl >= 0 ? "+" : ""}
                      {p.pnl.toFixed(2)} USDT
                    </span>
                    <span className={cn("ml-1.5 text-[10px] font-mono", p.pnlPct >= 0 ? "text-trade-long" : "text-trade-short")}>
                      ({p.pnlPct >= 0 ? "+" : ""}{p.pnlPct.toFixed(2)}%)
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-foreground">
                    {p.margin.toFixed(2)} USDT
                  </td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => handleClosePosition(p.id)}
                      className="text-[10px] text-muted-foreground hover:text-trade-short transition-colors font-mono border border-border rounded px-1.5 py-0.5 active:scale-95"
                    >
                      Fechar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          )
        )}

        {tab === "orders" && (
          (openOrders.length === 0 && activePendingOrders.length === 0) ? (
            <EmptyState icon={<ClipboardList className="w-8 h-8 opacity-30" />} message="Nenhuma ordem ativa" />
          ) : (
          <table className="w-full text-[11px]">
            <thead className="sticky top-0 bg-card z-10">
              <tr className="border-b border-border">
                {["Hora", "Par", "Tipo", "Direção", "Preço Limit", "Qtd.", "SL", "TP", "Status", ""].map((h) => (
                  <th key={h} className="px-3 py-1.5 text-left font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* Pending limit orders from context */}
              {activePendingOrders.map((o) => (
                <tr key={o.id} className="border-b border-border/50 hover:bg-secondary/50 transition-colors">
                  <td className="px-3 py-2 font-mono text-muted-foreground">
                    {new Date(o.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  </td>
                  <td className="px-3 py-2 font-mono font-semibold text-foreground">
                    {o.symbol}
                    <span className="ml-1.5 text-[9px] text-muted-foreground font-normal">{o.leverage}x</span>
                  </td>
                  <td className="px-3 py-2 font-mono text-foreground capitalize">{o.orderType}</td>
                  <td className="px-3 py-2"><SideBadge side={o.side} /></td>
                  <td className="px-3 py-2 font-mono text-foreground">
                    {o.limitPrice.toLocaleString("en-US", { minimumFractionDigits: 1 })}
                  </td>
                  <td className="px-3 py-2 font-mono text-foreground">{o.size}</td>
                  <td className="px-3 py-2 font-mono text-trade-short">
                    {o.stopLoss ? o.stopLoss.toLocaleString("en-US", { minimumFractionDigits: 1 }) : "—"}
                  </td>
                  <td className="px-3 py-2 font-mono text-trade-long">
                    {o.takeProfit ? o.takeProfit.toLocaleString("en-US", { minimumFractionDigits: 1 }) : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <span className="text-[10px] font-mono text-primary">Pendente</span>
                  </td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => handleCancelOrder(o.id)}
                      disabled={cancellingId === o.id}
                      className="h-5 w-5 flex items-center justify-center rounded hover:bg-trade-short/20 text-muted-foreground hover:text-trade-short transition-colors"
                      aria-label="Cancelar ordem"
                    >
                      {cancellingId === o.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
                    </button>
                  </td>
                </tr>
              ))}
              {/* Legacy open orders (kept for backwards compat) */}
              {openOrders.map((o) => (
                <tr key={o.id} className="border-b border-border/50 hover:bg-secondary/50 transition-colors">
                  <td className="px-3 py-2 font-mono text-muted-foreground">{o.time}</td>
                  <td className="px-3 py-2 font-mono font-semibold text-foreground">{o.symbol}</td>
                  <td className="px-3 py-2 font-mono text-foreground">{o.type}</td>
                  <td className="px-3 py-2"><SideBadge side={o.side} /></td>
                  <td className="px-3 py-2 font-mono text-foreground">
                    {o.price.toLocaleString("en-US", { minimumFractionDigits: 1 })}
                  </td>
                  <td className="px-3 py-2 font-mono text-foreground">{o.size}</td>
                  <td className="px-3 py-2 font-mono text-muted-foreground">—</td>
                  <td className="px-3 py-2 font-mono text-muted-foreground">—</td>
                  <td className="px-3 py-2">
                    <span className="text-[10px] font-mono text-primary">{o.status}</span>
                  </td>
                  <td className="px-3 py-2">
                    <button className="h-5 w-5 flex items-center justify-center rounded hover:bg-trade-short/20 text-muted-foreground hover:text-trade-short transition-colors" aria-label="Cancelar ordem">
                      <X className="w-3 h-3" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          )
        )}

        {tab === "conditional" && (
          conditionalOrders.length === 0 ? (
            <EmptyState icon={<Clock className="w-8 h-8 opacity-30" />} message="Nenhuma ordem condicional" />
          ) : (
          <table className="w-full text-[11px]">
            <thead className="sticky top-0 bg-card z-10">
              <tr className="border-b border-border">
                {["Hora", "Par", "Tipo", "Direção", "Preço Gatilho", "Qtd.", "Status", ""].map((h) => (
                  <th key={h} className="px-3 py-1.5 text-left font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {conditionalOrders.map((c) => (
                <tr key={c.id} className="border-b border-border/50 hover:bg-secondary/50 transition-colors">
                  <td className="px-3 py-2 font-mono text-muted-foreground">{c.time}</td>
                  <td className="px-3 py-2 font-mono font-semibold text-foreground">{c.symbol}</td>
                  <td className="px-3 py-2 font-mono text-foreground">{c.type}</td>
                  <td className="px-3 py-2"><SideBadge side={c.side} /></td>
                  <td className="px-3 py-2 font-mono text-foreground">
                    {c.triggerPrice.toLocaleString("en-US", { minimumFractionDigits: 1 })}
                  </td>
                  <td className="px-3 py-2 font-mono text-foreground">{c.size} BTC</td>
                  <td className="px-3 py-2 font-mono text-muted-foreground">{c.status}</td>
                  <td className="px-3 py-2">
                    <button className="h-5 w-5 flex items-center justify-center rounded hover:bg-trade-short/20 text-muted-foreground hover:text-trade-short transition-colors" aria-label="Cancelar">
                      <X className="w-3 h-3" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          )
        )}

        {tab === "history" && (
          tradeHistory.length === 0 ? (
            <EmptyState icon={<History className="w-8 h-8 opacity-30" />} message="Nenhum trade no histórico" />
          ) : (
          <table className="w-full text-[11px]">
            <thead className="sticky top-0 bg-card z-10">
              <tr className="border-b border-border">
                {["Hora", "Par", "Status", "Direção", "Preço Exec.", "Qtd.", "Taxa", "PnL Realiz."].map((h) => (
                  <th key={h} className="px-3 py-1.5 text-left font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tradeHistory.map((h) => (
                <tr key={h.id} className={cn(
                  "border-b border-border/50 hover:bg-secondary/50 transition-colors",
                  h.status === "LIQUIDATED" && "bg-trade-short/5"
                )}>
                  <td className="px-3 py-2 font-mono text-muted-foreground">{h.time}</td>
                  <td className="px-3 py-2 font-mono font-semibold text-foreground">{h.symbol}</td>
                  <td className="px-3 py-2"><StatusBadge status={h.status} /></td>
                  <td className="px-3 py-2"><SideBadge side={h.side} /></td>
                  <td className="px-3 py-2 font-mono text-foreground">
                    {h.price.toLocaleString("en-US", { minimumFractionDigits: 1 })}
                  </td>
                  <td className="px-3 py-2 font-mono text-foreground">{h.size}</td>
                  <td className="px-3 py-2 font-mono text-muted-foreground">{h.fee.toFixed(2)}</td>
                  <td className="px-3 py-2">
                    <span className={cn("font-mono font-bold", h.pnl >= 0 ? "text-trade-long" : "text-trade-short")}>
                      {h.pnl >= 0 ? "+" : ""}{h.pnl.toFixed(2)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          )
        )}

        {tab === "extrato" && (
          <ExtratoTab />
        )}
      </div>
    </div>
  )
}

// ── Extrato (Account Statement) ─────────────────────────────
function ExtratoTab() {
  const { state } = useTrading()
  const { tradeHistory, userBalance } = state

  if (tradeHistory.length === 0) {
    return <EmptyState icon={<FileText className="w-8 h-8 opacity-30" />} message="Nenhuma transação registrada" />
  }

  // Build running balance from most recent to oldest
  // Reverse to calculate from oldest, then reverse back
  const sorted = [...tradeHistory].reverse()
  let runningBalance = userBalance.total
  // Walk forward to compute what balance was before each tx
  const balances: number[] = []
  for (let i = sorted.length - 1; i >= 0; i--) {
    balances[i] = runningBalance
    runningBalance -= (sorted[i].pnl - sorted[i].fee)
  }
  // Reverse everything back to display newest first
  const entries = sorted.reverse()
  const displayBalances = balances.reverse()

  // Aggregate stats
  const totalFees = tradeHistory.reduce((sum, h) => sum + h.fee, 0)
  const totalFunding = tradeHistory.filter((h) => h.status === "FUNDING").reduce((sum, h) => sum + h.pnl, 0)
  const totalLiquidations = tradeHistory.filter((h) => h.status === "LIQUIDATED").reduce((sum, h) => sum + h.pnl, 0)
  const totalRealizedPnl = tradeHistory.filter((h) => h.status === "CLOSED").reduce((sum, h) => sum + h.pnl, 0)

  return (
    <div className="flex flex-col">
      {/* Summary cards */}
      <div className="flex gap-3 px-3 py-2 border-b border-border bg-card">
        <ExtratoStat label="PnL Realizado" value={totalRealizedPnl} />
        <ExtratoStat label="Taxas Pagas" value={-totalFees} />
        <ExtratoStat label="Funding" value={totalFunding} />
        <ExtratoStat label="Liquidações" value={totalLiquidations} />
      </div>

      {/* Ledger */}
      <table className="w-full text-[11px]">
        <thead className="sticky top-0 bg-card z-10">
          <tr className="border-b border-border">
            {["Hora", "Tipo", "Par", "Descrição", "Valor", "Taxa", "Saldo"].map((h) => (
              <th key={h} className="px-3 py-1.5 text-left font-medium text-muted-foreground whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {entries.map((h, i) => (
            <tr key={h.id} className={cn(
              "border-b border-border/50 hover:bg-secondary/50 transition-colors",
              h.status === "LIQUIDATED" && "bg-trade-short/5"
            )}>
              <td className="px-3 py-2 font-mono text-muted-foreground">{h.time}</td>
              <td className="px-3 py-2"><StatusBadge status={h.status} /></td>
              <td className="px-3 py-2 font-mono font-semibold text-foreground">{h.symbol}</td>
              <td className="px-3 py-2 text-foreground">
                {h.status === "FUNDING"
                  ? `Funding ${h.pnl >= 0 ? "recebido" : "pago"} · ${h.size} unid.`
                  : h.status === "LIQUIDATED"
                    ? `Posição liquidada · ${h.size} unid. @ $${h.price.toLocaleString("en-US", { minimumFractionDigits: 1 })}`
                    : `${h.side === "buy" ? "Compra" : "Venda"} · ${h.size} unid. @ $${h.price.toLocaleString("en-US", { minimumFractionDigits: 1 })}`
                }
              </td>
              <td className="px-3 py-2">
                <span className={cn("font-mono font-bold", h.pnl >= 0 ? "text-trade-long" : "text-trade-short")}>
                  {h.pnl >= 0 ? "+" : ""}{h.pnl.toFixed(2)}
                </span>
              </td>
              <td className="px-3 py-2 font-mono text-muted-foreground">
                {h.fee > 0 ? `-${h.fee.toFixed(2)}` : "—"}
              </td>
              <td className="px-3 py-2 font-mono text-foreground">
                {displayBalances[i]?.toFixed(2) ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ExtratoStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col min-w-[80px]">
      <span className="text-[9px] text-muted-foreground">{label}</span>
      <span className={cn(
        "font-mono text-xs font-bold",
        value >= 0 ? "text-trade-long" : "text-trade-short"
      )}>
        {value >= 0 ? "+" : ""}{value.toFixed(2)} USDT
      </span>
    </div>
  )
}
