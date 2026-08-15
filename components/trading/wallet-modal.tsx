"use client"

import { useState, useCallback } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { useTrading } from "@/context/trading-context"
import {
  ArrowDownLeft,
  ArrowUpRight,
  Clock,
  Wallet,
  TrendingUp,
  Shield,
  Zap,
  AlertTriangle,
  DollarSign,
  Loader2,
} from "lucide-react"
import { toast } from "@/hooks/use-toast"
import { playSound } from "@/lib/audio"

interface WalletModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function WalletModal({ open, onOpenChange }: WalletModalProps) {
  const { state, actions } = useTrading()
  const { userBalance, tradeHistory } = state
  const [tab, setTab] = useState<"overview" | "history">("overview")
  const [depositAmount, setDepositAmount] = useState("")
  const [withdrawAmount, setWithdrawAmount] = useState("")
  const [processing, setProcessing] = useState(false)

  // PnL from trade history (sum of realized PnL)
  const totalPnl = tradeHistory.reduce((sum, tx) => sum + tx.pnl, 0)
  const initialEquity = userBalance.total - totalPnl
  const pnlPct = initialEquity > 0 ? (totalPnl / initialEquity) * 100 : 0

  const handleDeposit = useCallback(() => {
    // Sanitize input: remove non-numeric characters except decimal point
    const sanitized = depositAmount.replace(/[^0-9.]/g, '')
    const amt = parseFloat(sanitized)
    
    if (!amt || isNaN(amt) || amt <= 0 || amt > 100000) {
      toast({ title: "Valor inválido", description: "Digite um valor entre 1 e 100.000 USDT", variant: "destructive" })
      return
    }
    setProcessing(true)
    // Simulate network delay
    setTimeout(() => {
      actions.setUserBalance({
        ...userBalance,
        available: userBalance.available + amt,
        total: userBalance.total + amt,
      })
      playSound("success")
      toast({ title: "Depósito realizado", description: `+${amt.toLocaleString("en-US")} USDT adicionados ao saldo` })
      setDepositAmount("")
      setProcessing(false)
    }, 800)
  }, [depositAmount, userBalance, actions])

  const handleWithdraw = useCallback(() => {
    // Sanitize input: remove non-numeric characters except decimal point
    const sanitized = withdrawAmount.replace(/[^0-9.]/g, '')
    const amt = parseFloat(sanitized)
    
    if (!amt || isNaN(amt) || amt <= 0) {
      toast({ title: "Valor inválido", description: "Digite um valor positivo", variant: "destructive" })
      return
    }
    if (amt > userBalance.available) {
      toast({ title: "Saldo insuficiente", description: `Disponível: ${userBalance.available.toFixed(2)} USDT`, variant: "destructive" })
      return
    }
    setProcessing(true)
    setTimeout(() => {
      actions.setUserBalance({
        ...userBalance,
        available: userBalance.available - amt,
        total: userBalance.total - amt,
      })
      playSound("warning")
      toast({ title: "Saque realizado", description: `-${amt.toLocaleString("en-US")} USDT retirados do saldo` })
      setWithdrawAmount("")
      setProcessing(false)
    }, 800)
  }, [withdrawAmount, userBalance, actions])

  // Status icon helper
  const statusIcon = (status: string) => {
    if (status === "LIQUIDATED") return <AlertTriangle className="w-3 h-3 text-trade-short" />
    if (status === "FUNDING") return <Zap className="w-3 h-3 text-amber-400" />
    return <DollarSign className="w-3 h-3 text-primary" />
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-card border-border p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <Wallet className="w-4.5 h-4.5 text-primary" />
            Carteira
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-xs">
            Seu saldo e histórico de transações
          </DialogDescription>
        </DialogHeader>

        {/* Balance Card */}
        <div className="mx-5 rounded-lg border border-border bg-background/50 p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] text-muted-foreground font-medium">Patrimônio Total</span>
            <span className={cn(
              "flex items-center gap-1 text-[11px] font-mono font-bold",
              totalPnl >= 0 ? "text-trade-long" : "text-trade-short"
            )}>
              <TrendingUp className="w-3 h-3" />
              {totalPnl >= 0 ? "+" : ""}{pnlPct.toFixed(2)}%
            </span>
          </div>
          <p className="font-mono text-2xl font-bold text-foreground tracking-tight">
            {userBalance.total.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            <span className="text-sm text-muted-foreground ml-1.5">USDT</span>
          </p>

          <div className="grid grid-cols-2 gap-3 mt-4">
            <BalanceItem
              label="Disponível"
              value={userBalance.available}
              icon={<Shield className="w-3 h-3 text-trade-long" />}
            />
            <BalanceItem
              label="Em Posições"
              value={userBalance.inPositions}
              icon={<Clock className="w-3 h-3 text-primary" />}
            />
          </div>
        </div>

        {/* Deposit / Withdraw */}
        <div className="flex gap-2 px-5 pt-3">
          <div className="flex-1 flex gap-1">
            <input
              type="number"
              placeholder="Valor"
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
              className="flex-1 min-w-0 bg-secondary text-foreground text-xs font-mono rounded-l-md px-2.5 py-2 border border-border outline-none focus:border-trade-long"
            />
            <button
              onClick={handleDeposit}
              disabled={processing}
              className="flex items-center gap-1 px-3 py-2 rounded-r-md text-xs font-medium bg-trade-long/15 text-trade-long hover:bg-trade-long/25 border border-trade-long/20 transition-all active:scale-[0.97] disabled:opacity-50"
            >
              {processing ? <Loader2 className="w-3 h-3 animate-spin" /> : <ArrowDownLeft className="w-3 h-3" />}
              Dep.
            </button>
          </div>
          <div className="flex-1 flex gap-1">
            <input
              type="number"
              placeholder="Valor"
              value={withdrawAmount}
              onChange={(e) => setWithdrawAmount(e.target.value)}
              className="flex-1 min-w-0 bg-secondary text-foreground text-xs font-mono rounded-l-md px-2.5 py-2 border border-border outline-none focus:border-trade-short"
            />
            <button
              onClick={handleWithdraw}
              disabled={processing}
              className="flex items-center gap-1 px-3 py-2 rounded-r-md text-xs font-medium bg-secondary text-foreground hover:bg-accent border border-border transition-all active:scale-[0.97] disabled:opacity-50"
            >
              {processing ? <Loader2 className="w-3 h-3 animate-spin" /> : <ArrowUpRight className="w-3 h-3" />}
              Saq.
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border mt-4 px-5">
          {(["overview", "history"] as const).map((t) => (
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
              {t === "overview" ? "Resumo" : `Histórico (${tradeHistory.length})`}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="px-5 pb-5 max-h-52 overflow-y-auto">
          {tab === "overview" && (
            <div className="flex flex-col gap-2 pt-3">
              <InfoRow label="Moeda Base" value="USDT (Tether)" />
              <InfoRow label="Rede" value="Simulação PerpEx" />
              <InfoRow label="Margem Requerida" value={`${userBalance.inPositions.toFixed(2)} USDT`} />
              <InfoRow label="Razão de Margem" value={`${userBalance.total > 0 ? ((userBalance.inPositions / userBalance.total) * 100).toFixed(1) : "0.0"}%`} />
              <InfoRow label="PnL Total" value={`${totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(2)} USDT`} color={totalPnl >= 0 ? "text-trade-long" : "text-trade-short"} />
              <InfoRow label="Trades Executados" value={`${tradeHistory.length}`} />
            </div>
          )}

          {tab === "history" && (
            <div className="flex flex-col gap-1 pt-2">
              {tradeHistory.length === 0 ? (
                <p className="text-center text-muted-foreground text-[11px] py-6">Nenhuma transação ainda</p>
              ) : (
                tradeHistory.slice(0, 20).map((tx) => (
                  <div
                    key={tx.id}
                    className="flex items-center justify-between py-2 border-b border-border/50 last:border-0"
                  >
                    <div className="flex items-center gap-2">
                      <div className={cn(
                        "w-6 h-6 rounded-full flex items-center justify-center",
                        tx.pnl >= 0 ? "bg-trade-long/15" : "bg-trade-short/15"
                      )}>
                        {statusIcon(tx.status)}
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[11px] font-medium text-foreground">
                          {tx.type} · {tx.symbol}
                        </span>
                        <span className="text-[9px] text-muted-foreground font-mono">{tx.time}</span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className={cn(
                        "font-mono text-[11px] font-bold",
                        tx.pnl >= 0 ? "text-trade-long" : "text-trade-short"
                      )}>
                        {tx.pnl >= 0 ? "+" : ""}{tx.pnl.toFixed(2)} USDT
                      </span>
                      {tx.fee > 0 && (
                        <span className="text-[9px] text-muted-foreground font-mono">Taxa: -{tx.fee.toFixed(2)}</span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function BalanceItem({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 p-2.5 rounded-md bg-secondary/50">
      <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
        {icon} {label}
      </span>
      <span className="font-mono text-sm font-bold text-foreground">
        {value.toLocaleString("en-US", { minimumFractionDigits: 2 })}
      </span>
    </div>
  )
}

function InfoRow({ label, value, color = "text-foreground" }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className={cn("font-mono text-[11px] font-medium", color)}>{value}</span>
    </div>
  )
}
