// __tests__/lib/rate-limiter.test.ts
// Unit tests for the client-side RateLimiter class

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest"

// ── Mock localStorage ──────────────────────────────────────────
// RateLimiter uses localStorage which doesn't exist in Node/jsdom by default
// Vitest + jsdom provides it, but we control it via spies for predictability.

const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value },
    removeItem: (key: string) => { delete store[key] },
    clear: () => { store = {} },
  }
})()

// Apply mock before importing the module
Object.defineProperty(globalThis, "localStorage", {
  value: localStorageMock,
  writable: true,
})

// Import AFTER setting up localStorage mock
import { rateLimiter } from "@/lib/rate-limiter"

describe("RateLimiter", () => {
  beforeEach(() => {
    // Clear all stored rate limit data before each test
    localStorageMock.clear()
    rateLimiter.resetAll()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ── Basic allow/deny ──────────────────────────────────────────

  it("allows the first request for a known action", () => {
    const result = rateLimiter.check("auth:login")
    expect(result.allowed).toBe(true)
    expect(result.retryAfter).toBeUndefined()
  })

  it("allows requests up to the configured limit", () => {
    // auth:login limit = 5 per minute
    for (let i = 0; i < 5; i++) {
      const result = rateLimiter.check("auth:login")
      expect(result.allowed).toBe(true)
    }
  })

  it("blocks the request after limit is exceeded", () => {
    // Exhaust limit
    for (let i = 0; i < 5; i++) {
      rateLimiter.check("auth:login")
    }
    // 6th request should be blocked
    const result = rateLimiter.check("auth:login")
    expect(result.allowed).toBe(false)
    expect(result.retryAfter).toBeGreaterThan(0)
  })

  it("returns a retryAfter value in seconds when blocked", () => {
    for (let i = 0; i <= 5; i++) rateLimiter.check("auth:register")
    const result = rateLimiter.check("auth:register")
    expect(result.allowed).toBe(false)
    // Window is 60 seconds — retryAfter should be ≤ 60
    expect(result.retryAfter).toBeLessThanOrEqual(60)
  })

  // ── Different action limits ────────────────────────────────────

  it("trade:order allows 20 requests per minute", () => {
    for (let i = 0; i < 20; i++) {
      expect(rateLimiter.check("trade:order").allowed).toBe(true)
    }
    expect(rateLimiter.check("trade:order").allowed).toBe(false)
  })

  it("limits are independent per action key", () => {
    // Exhaust auth:login
    for (let i = 0; i < 5; i++) rateLimiter.check("auth:login")
    const loginBlocked = rateLimiter.check("auth:login")
    expect(loginBlocked.allowed).toBe(false)

    // trade:order should still be allowed
    const tradeAllowed = rateLimiter.check("trade:order")
    expect(tradeAllowed.allowed).toBe(true)
  })

  // ── Unknown actions ───────────────────────────────────────────

  it("allows any request for an unknown action (no config = no limit)", () => {
    const result = rateLimiter.check("unknown:action")
    expect(result.allowed).toBe(true)
  })

  // ── Reset ──────────────────────────────────────────────────────

  it("reset() clears a specific action's counter", () => {
    // Exhaust limit
    for (let i = 0; i < 5; i++) rateLimiter.check("auth:login")
    expect(rateLimiter.check("auth:login").allowed).toBe(false)

    // Reset only this action
    rateLimiter.reset("auth:login")
    expect(rateLimiter.check("auth:login").allowed).toBe(true)
  })

  it("reset() on one action doesn't affect another", () => {
    // Exhaust both
    for (let i = 0; i < 5; i++) rateLimiter.check("auth:login")
    for (let i = 0; i < 3; i++) rateLimiter.check("auth:register")

    // Reset only login
    rateLimiter.reset("auth:login")
    expect(rateLimiter.check("auth:login").allowed).toBe(true)

    // register should still have its counter
    // (3 out of 3 already used — should be blocked)
    expect(rateLimiter.check("auth:register").allowed).toBe(false)
  })

  it("resetAll() clears all counters", () => {
    for (let i = 0; i < 5; i++) rateLimiter.check("auth:login")
    for (let i = 0; i < 3; i++) rateLimiter.check("auth:register")

    rateLimiter.resetAll()

    expect(rateLimiter.check("auth:login").allowed).toBe(true)
    expect(rateLimiter.check("auth:register").allowed).toBe(true)
  })

  // ── Time window expiry ────────────────────────────────────────

  it("allows new requests after the time window has expired", () => {
    vi.useFakeTimers()

    // Exhaust the limit
    for (let i = 0; i < 5; i++) rateLimiter.check("auth:login")
    expect(rateLimiter.check("auth:login").allowed).toBe(false)

    // Advance time past the 60s window
    vi.advanceTimersByTime(61_000)

    // Should be allowed again
    expect(rateLimiter.check("auth:login").allowed).toBe(true)
  })

  // ── Wallet limits (longer window) ─────────────────────────────

  it("wallet:withdraw allows 5 per 5 minutes", () => {
    for (let i = 0; i < 5; i++) {
      expect(rateLimiter.check("wallet:withdraw").allowed).toBe(true)
    }
    const result = rateLimiter.check("wallet:withdraw")
    expect(result.allowed).toBe(false)
    expect(result.retryAfter).toBeLessThanOrEqual(300) // 5 minute window
  })
})
