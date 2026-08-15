// __tests__/lib/circuit-breaker.test.ts
// Unit tests for the CircuitBreaker — CLOSED → OPEN → HALF_OPEN → CLOSED

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest"
import { CircuitBreaker, CircuitOpenError } from "@/lib/market-data/circuit-breaker"

describe("CircuitBreaker", () => {
  let breaker: CircuitBreaker

  beforeEach(() => {
    vi.useFakeTimers()
    // Default: 3 failures to open, 10s cooldown (shorter for testing)
    breaker = new CircuitBreaker({ failureThreshold: 3, cooldownMs: 10_000 })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ── Initial state ─────────────────────────────────────────────

  it("starts in CLOSED state", () => {
    expect(breaker.state).toBe("CLOSED")
  })

  it("allows execution in CLOSED state", () => {
    expect(breaker.canExecute()).toBe(true)
  })

  it("starts with 0 failure count", () => {
    expect(breaker.failureCount).toBe(0)
  })

  // ── CLOSED → OPEN transition ──────────────────────────────────

  it("opens the circuit after reaching failureThreshold", () => {
    breaker.recordFailure()
    breaker.recordFailure()
    expect(breaker.state).toBe("CLOSED") // not yet
    breaker.recordFailure() // threshold reached
    expect(breaker.state).toBe("OPEN")
  })

  it("blocks execution when OPEN", () => {
    for (let i = 0; i < 3; i++) breaker.recordFailure()
    expect(breaker.canExecute()).toBe(false)
  })

  it("increments failureCount on each failure", () => {
    breaker.recordFailure()
    breaker.recordFailure()
    expect(breaker.failureCount).toBe(2)
  })

  // ── OPEN → HALF_OPEN transition ───────────────────────────────

  it("transitions to HALF_OPEN after cooldown period", () => {
    for (let i = 0; i < 3; i++) breaker.recordFailure()
    expect(breaker.state).toBe("OPEN")

    vi.advanceTimersByTime(10_001) // past cooldown
    expect(breaker.state).toBe("HALF_OPEN")
  })

  it("remains OPEN before cooldown period", () => {
    for (let i = 0; i < 3; i++) breaker.recordFailure()
    vi.advanceTimersByTime(9_999) // just before cooldown
    expect(breaker.state).toBe("OPEN")
  })

  it("allows execution in HALF_OPEN state (probe request)", () => {
    for (let i = 0; i < 3; i++) breaker.recordFailure()
    vi.advanceTimersByTime(10_001)
    expect(breaker.canExecute()).toBe(true)
  })

  // ── HALF_OPEN → CLOSED (success) ─────────────────────────────

  it("closes circuit on success from HALF_OPEN", () => {
    for (let i = 0; i < 3; i++) breaker.recordFailure()
    vi.advanceTimersByTime(10_001)
    expect(breaker.state).toBe("HALF_OPEN")

    breaker.recordSuccess()
    expect(breaker.state).toBe("CLOSED")
  })

  it("resets failureCount on success in HALF_OPEN", () => {
    for (let i = 0; i < 3; i++) breaker.recordFailure()
    vi.advanceTimersByTime(10_001)
    breaker.recordSuccess()
    expect(breaker.failureCount).toBe(0)
  })

  // ── HALF_OPEN → OPEN (failure) ────────────────────────────────

  it("reopens circuit on failure from HALF_OPEN", () => {
    for (let i = 0; i < 3; i++) breaker.recordFailure()
    vi.advanceTimersByTime(10_001)
    expect(breaker.state).toBe("HALF_OPEN")

    breaker.recordFailure()
    expect(breaker.state).toBe("OPEN")
  })

  // ── recordSuccess in CLOSED ───────────────────────────────────

  it("success in CLOSED state resets failure count but keeps CLOSED", () => {
    breaker.recordFailure()
    breaker.recordFailure()
    breaker.recordSuccess()
    expect(breaker.state).toBe("CLOSED")
    expect(breaker.failureCount).toBe(0)
  })

  // ── reset() ───────────────────────────────────────────────────

  it("reset() forces the breaker back to CLOSED from OPEN", () => {
    for (let i = 0; i < 3; i++) breaker.recordFailure()
    expect(breaker.state).toBe("OPEN")

    breaker.reset()
    expect(breaker.state).toBe("CLOSED")
    expect(breaker.failureCount).toBe(0)
    expect(breaker.canExecute()).toBe(true)
  })

  it("reset() is idempotent when already CLOSED", () => {
    breaker.reset()
    breaker.reset()
    expect(breaker.state).toBe("CLOSED")
  })

  // ── onStateChange callback ────────────────────────────────────

  it("calls onStateChange when circuit opens", () => {
    const onStateChange = vi.fn()
    const cb = new CircuitBreaker({ failureThreshold: 2, cooldownMs: 5_000, onStateChange })

    cb.recordFailure()
    cb.recordFailure()

    expect(onStateChange).toHaveBeenCalledOnce()
    expect(onStateChange).toHaveBeenCalledWith("CLOSED", "OPEN")
  })

  it("calls onStateChange through full cycle", () => {
    const calls: [string, string][] = []
    const cb = new CircuitBreaker({
      failureThreshold: 1,
      cooldownMs: 5_000,
      onStateChange: (from, to) => calls.push([from, to]),
    })

    cb.recordFailure() // CLOSED → OPEN
    vi.advanceTimersByTime(5_001)
    cb.state // triggers OPEN → HALF_OPEN
    cb.recordSuccess() // HALF_OPEN → CLOSED

    expect(calls).toEqual([
      ["CLOSED", "OPEN"],
      ["OPEN", "HALF_OPEN"],
      ["HALF_OPEN", "CLOSED"],
    ])
  })

  // ── execute() wrapper ─────────────────────────────────────────

  it("execute() resolves the function result on success", async () => {
    const result = await breaker.execute(() => Promise.resolve(42))
    expect(result).toBe(42)
  })

  it("execute() records failure and rethrows on error", async () => {
    const error = new Error("Network error")
    await expect(breaker.execute(() => Promise.reject(error))).rejects.toThrow("Network error")
    expect(breaker.failureCount).toBe(1)
  })

  it("execute() throws CircuitOpenError when circuit is OPEN", async () => {
    for (let i = 0; i < 3; i++) breaker.recordFailure()

    await expect(breaker.execute(() => Promise.resolve("ok"))).rejects.toBeInstanceOf(CircuitOpenError)
  })

  it("CircuitOpenError has correct name and properties", async () => {
    for (let i = 0; i < 3; i++) breaker.recordFailure()

    try {
      await breaker.execute(() => Promise.resolve())
    } catch (err) {
      expect(err).toBeInstanceOf(CircuitOpenError)
      const circuitErr = err as CircuitOpenError
      expect(circuitErr.name).toBe("CircuitOpenError")
      expect(circuitErr.failureCount).toBeGreaterThanOrEqual(3)
      expect(circuitErr.cooldownMs).toBe(10_000)
    }
  })

  it("execute() closes circuit after successful probe in HALF_OPEN", async () => {
    for (let i = 0; i < 3; i++) breaker.recordFailure()
    vi.advanceTimersByTime(10_001)
    expect(breaker.state).toBe("HALF_OPEN")

    await breaker.execute(() => Promise.resolve("probe ok"))
    expect(breaker.state).toBe("CLOSED")
  })
})
