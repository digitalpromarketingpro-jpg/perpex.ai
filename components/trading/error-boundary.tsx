"use client"

// ─────────────────────────────────────────────────────────────
// Granular Error Boundaries for the Trading Terminal.
// Each critical section (chart, order book, execution panel)
// gets its own boundary so a crash in one does NOT propagate
// to others — the order system stays operational even if the
// chart component throws.
// ─────────────────────────────────────────────────────────────

import { Component, type ReactNode, type ErrorInfo } from "react"
import { AlertTriangle, RefreshCw } from "lucide-react"
import { cn } from "@/lib/utils"

// ── Generic Trading Error Boundary ──────────────────────────

interface ErrorBoundaryProps {
  children: ReactNode
  /** Display name shown in the fallback UI (e.g. "Gráfico", "Book de Ordens") */
  name: string
  /** Compact mode for smaller panels */
  compact?: boolean
  /** Optional callback when an error is caught */
  onError?: (error: Error, errorInfo: ErrorInfo) => void
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

export class TradingErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error(`[ErrorBoundary:${this.props.name}]`, error, errorInfo)
    this.props.onError?.(error, errorInfo)
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      return (
        <ErrorFallback
          name={this.props.name}
          error={this.state.error}
          compact={this.props.compact}
          onRetry={this.handleRetry}
        />
      )
    }
    return this.props.children
  }
}

// ── Error Fallback UI ───────────────────────────────────────

function ErrorFallback({
  name,
  error,
  compact = false,
  onRetry,
}: {
  name: string
  error: Error | null
  compact?: boolean
  onRetry: () => void
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center h-full bg-background/80 border border-border/50 rounded",
        compact ? "gap-2 p-3" : "gap-3 p-6"
      )}
    >
      <AlertTriangle
        className={cn(
          "text-yellow-500",
          compact ? "w-5 h-5" : "w-8 h-8"
        )}
      />
      <div className="text-center">
        <p className={cn("font-semibold text-foreground", compact ? "text-xs" : "text-sm")}>
          {name} — Erro
        </p>
        <p className={cn("text-muted-foreground mt-1", compact ? "text-[10px]" : "text-xs")}>
          {error?.message || "Um erro inesperado ocorreu neste componente."}
        </p>
      </div>
      <button
        onClick={onRetry}
        className={cn(
          "flex items-center gap-1.5 rounded border border-border bg-secondary hover:bg-secondary/80 text-foreground transition-colors",
          compact ? "px-2 py-1 text-[10px]" : "px-3 py-1.5 text-xs"
        )}
      >
        <RefreshCw className={compact ? "w-3 h-3" : "w-3.5 h-3.5"} />
        Tentar novamente
      </button>
    </div>
  )
}
