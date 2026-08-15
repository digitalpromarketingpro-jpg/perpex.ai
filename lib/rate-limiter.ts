// ─────────────────────────────────────────────────────────────
// Client-Side Rate Limiter — prevents abuse and API spam
// Uses localStorage to track request counts per time window
// ─────────────────────────────────────────────────────────────

interface RateLimitConfig {
  maxRequests: number
  windowMs: number
}

interface RateLimitEntry {
  count: number
  resetAt: number
}

const DEFAULT_LIMITS: Record<string, RateLimitConfig> = {
  "auth:login": { maxRequests: 5, windowMs: 60000 }, // 5 attempts per minute
  "auth:register": { maxRequests: 3, windowMs: 60000 }, // 3 per minute
  "trade:order": { maxRequests: 20, windowMs: 60000 }, // 20 orders per minute
  "trade:close": { maxRequests: 30, windowMs: 60000 }, // 30 closes per minute
  "wallet:deposit": { maxRequests: 10, windowMs: 300000 }, // 10 per 5 minutes
  "wallet:withdraw": { maxRequests: 5, windowMs: 300000 }, // 5 per 5 minutes
}

class RateLimiter {
  private storageKey = "perpex_rate_limits"

  private getLimits(): Record<string, RateLimitEntry> {
    if (typeof window === "undefined") return {}
    try {
      const stored = localStorage.getItem(this.storageKey)
      return stored ? JSON.parse(stored) : {}
    } catch {
      return {}
    }
  }

  private setLimits(limits: Record<string, RateLimitEntry>) {
    if (typeof window === "undefined") return
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(limits))
    } catch {
      // Ignore storage errors
    }
  }

  check(action: string): { allowed: boolean; retryAfter?: number } {
    const config = DEFAULT_LIMITS[action]
    if (!config) return { allowed: true } // No limit configured

    const now = Date.now()
    const limits = this.getLimits()
    const entry = limits[action]

    // No entry or window expired → allow and create new entry
    if (!entry || now >= entry.resetAt) {
      limits[action] = {
        count: 1,
        resetAt: now + config.windowMs,
      }
      this.setLimits(limits)
      return { allowed: true }
    }

    // Within window → check count
    if (entry.count < config.maxRequests) {
      entry.count++
      this.setLimits(limits)
      return { allowed: true }
    }

    // Rate limit exceeded
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000)
    return { allowed: false, retryAfter }
  }

  reset(action: string) {
    const limits = this.getLimits()
    delete limits[action]
    this.setLimits(limits)
  }

  resetAll() {
    if (typeof window === "undefined") return
    localStorage.removeItem(this.storageKey)
  }
}

export const rateLimiter = new RateLimiter()
