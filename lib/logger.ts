// ─────────────────────────────────────────────────────────────
// Production Logger — replaces console.log/warn/error
// In production: sends to monitoring service (e.g., Sentry, LogRocket)
// In development: pretty-prints to console
// ─────────────────────────────────────────────────────────────

type LogLevel = "debug" | "info" | "warn" | "error"

interface LogContext {
  [key: string]: unknown
}

class Logger {
  private isDevelopment = process.env.NODE_ENV === "development"
  private minLevel: LogLevel = this.isDevelopment ? "debug" : "info"

  private levelPriority: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
  }

  private shouldLog(level: LogLevel): boolean {
    return this.levelPriority[level] >= this.levelPriority[this.minLevel]
  }

  debug(message: string, context?: LogContext) {
    if (!this.shouldLog("debug")) return
    if (this.isDevelopment) {
      console.log(`[DEBUG] ${message}`, context ?? "")
    }
  }

  info(message: string, context?: LogContext) {
    if (!this.shouldLog("info")) return
    if (this.isDevelopment) {
      console.info(`[INFO] ${message}`, context ?? "")
    } else {
      // In production: send to monitoring service
      this.sendToMonitoring("info", message, context)
    }
  }

  warn(message: string, context?: LogContext) {
    if (!this.shouldLog("warn")) return
    if (this.isDevelopment) {
      console.warn(`[WARN] ${message}`, context ?? "")
    } else {
      this.sendToMonitoring("warn", message, context)
    }
  }

  error(message: string, error?: Error | unknown, context?: LogContext) {
    if (!this.shouldLog("error")) return
    
    const errorContext = {
      ...context,
      error: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack,
      } : error,
    }

    if (this.isDevelopment) {
      console.error(`[ERROR] ${message}`, errorContext)
    } else {
      this.sendToMonitoring("error", message, errorContext)
      // In production: also send to error tracking (Sentry)
      if (typeof window !== "undefined" && (window as any).Sentry) {
        (window as any).Sentry.captureException(error, {
          tags: { message },
          extra: context,
        })
      }
    }
  }

  private sendToMonitoring(level: LogLevel, message: string, context?: LogContext) {
    // Placeholder for production monitoring integration
    // Replace with your monitoring service (e.g., LogRocket, Datadog, New Relic)
    if (typeof window !== "undefined" && (window as any).analytics) {
      (window as any).analytics.track("Log Event", {
        level,
        message,
        ...context,
        timestamp: new Date().toISOString(),
      })
    }
  }

  // Performance timing helper
  time(label: string): () => void {
    const start = performance.now()
    return () => {
      const duration = performance.now() - start
      this.debug(`⏱ ${label}`, { duration: `${duration.toFixed(2)}ms` })
    }
  }
}

export const logger = new Logger()
