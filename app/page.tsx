"use client"

import { AuthProvider } from "@/context/auth-context"
import { TradingProvider } from "@/context/trading-context"
import { TradingTerminal } from "@/components/trading/trading-terminal"
import { ErrorBoundary } from "@/components/ui/error-boundary"

/**
 * Root page — wraps the entire terminal in AuthProvider + TradingProvider.
 * AuthProvider must be outermost so trading components can read auth state.
 * All child components consume state via useTrading() and useAuth() hooks.
 * ErrorBoundary catches runtime errors and displays fallback UI.
 */
export default function Page() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <TradingProvider>
          <TradingTerminal />
        </TradingProvider>
      </AuthProvider>
    </ErrorBoundary>
  )
}
