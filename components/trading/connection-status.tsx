"use client"

// ─────────────────────────────────────────────────────────────
// Connection Status Bar — Graceful Degradation UI.
// Shows a persistent banner when the WebSocket connection is
// unhealthy or the circuit breaker has tripped. The rest of
// the terminal remains fully operational with stale data.
// ─────────────────────────────────────────────────────────────

import { useTrading } from "@/context/trading-context"
import { cn } from "@/lib/utils"
import { Wifi, WifiOff, AlertTriangle, Loader2 } from "lucide-react"
import type { ConnectionState, CircuitState } from "@/types/trading"

const STATUS_CONFIG: Record<
  ConnectionState,
  { label: string; icon: typeof Wifi; className: string; show: boolean }
> = {
  connected: {
    label: "Conectado",
    icon: Wifi,
    className: "text-trade-long",
    show: false, // Don't show banner when healthy
  },
  connecting: {
    label: "Conectando...",
    icon: Loader2,
    className: "text-yellow-500",
    show: true,
  },
  reconnecting: {
    label: "Reconectando...",
    icon: Loader2,
    className: "text-yellow-500",
    show: true,
  },
  disconnected: {
    label: "Desconectado",
    icon: WifiOff,
    className: "text-trade-short",
    show: true,
  },
  degraded: {
    label: "Modo Degradado — dados podem estar desatualizados",
    icon: AlertTriangle,
    className: "text-orange-500",
    show: true,
  },
}

export function ConnectionStatusBar() {
  const { state } = useTrading()
  const { connectionState, circuitState } = state

  const config = STATUS_CONFIG[connectionState]
  if (!config.show) return null

  const Icon = config.icon
  const isAnimated = connectionState === "connecting" || connectionState === "reconnecting"

  return (
    <div
      className={cn(
        "flex items-center justify-center gap-2 px-3 py-1 text-[11px] font-mono shrink-0 border-b border-border",
        connectionState === "degraded" && "bg-orange-500/5",
        connectionState === "disconnected" && "bg-trade-short/5",
        (connectionState === "connecting" || connectionState === "reconnecting") && "bg-yellow-500/5"
      )}
    >
      <Icon
        className={cn(
          "w-3 h-3",
          config.className,
          isAnimated && "animate-spin"
        )}
      />
      <span className={config.className}>{config.label}</span>
      {circuitState === "OPEN" && (
        <span className="text-orange-500 ml-2">
          [Circuit Breaker ABERTO]
        </span>
      )}
      {circuitState === "HALF_OPEN" && (
        <span className="text-yellow-500 ml-2">
          [Testando reconexão...]
        </span>
      )}
    </div>
  )
}
