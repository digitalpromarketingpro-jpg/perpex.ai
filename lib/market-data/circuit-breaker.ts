// ─────────────────────────────────────────────────────────────
// Circuit Breaker — protects against cascading failures when
// upstream APIs (Binance WS/REST) become unresponsive.
//
// States: CLOSED → OPEN → HALF_OPEN → CLOSED
//   CLOSED    = normal operation, requests pass through
//   OPEN      = failures exceeded threshold, all requests fail-fast
//   HALF_OPEN = after cooldown, one probe request is allowed through
// ─────────────────────────────────────────────────────────────

export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN"

export interface CircuitBreakerConfig {
  /** Number of consecutive failures before opening the circuit */
  failureThreshold: number
  /** Time in ms to wait before transitioning OPEN → HALF_OPEN */
  cooldownMs: number
  /** Optional callback when state changes */
  onStateChange?: (from: CircuitState, to: CircuitState) => void
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  cooldownMs: 30_000,
}

export class CircuitBreaker {
  private _state: CircuitState = "CLOSED"
  private _failureCount = 0
  private _lastFailureTime = 0
  private _config: CircuitBreakerConfig

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this._config = { ...DEFAULT_CONFIG, ...config }
  }

  get state(): CircuitState {
    // Check if cooldown has elapsed for auto-transition to HALF_OPEN
    if (
      this._state === "OPEN" &&
      Date.now() - this._lastFailureTime >= this._config.cooldownMs
    ) {
      this._transition("HALF_OPEN")
    }
    return this._state
  }

  get failureCount(): number {
    return this._failureCount
  }

  /**
   * Returns true if the circuit allows a request to pass through.
   */
  canExecute(): boolean {
    const current = this.state // triggers auto-transition check
    return current === "CLOSED" || current === "HALF_OPEN"
  }

  /**
   * Record a successful operation. Resets failure count and
   * closes the circuit if it was half-open.
   */
  recordSuccess(): void {
    if (this._state === "HALF_OPEN") {
      this._transition("CLOSED")
    }
    this._failureCount = 0
  }

  /**
   * Record a failed operation. Increments failure count and
   * opens the circuit if threshold is exceeded.
   */
  recordFailure(): void {
    this._failureCount++
    this._lastFailureTime = Date.now()

    if (this._state === "HALF_OPEN") {
      // Probe request failed, go back to OPEN
      this._transition("OPEN")
    } else if (
      this._state === "CLOSED" &&
      this._failureCount >= this._config.failureThreshold
    ) {
      this._transition("OPEN")
    }
  }

  /**
   * Force-reset the breaker to CLOSED state.
   */
  reset(): void {
    this._failureCount = 0
    this._lastFailureTime = 0
    if (this._state !== "CLOSED") {
      this._transition("CLOSED")
    }
  }

  /**
   * Execute an async function through the circuit breaker.
   * Throws CircuitOpenError if the circuit is open.
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.canExecute()) {
      throw new CircuitOpenError(this._failureCount, this._config.cooldownMs)
    }

    try {
      const result = await fn()
      this.recordSuccess()
      return result
    } catch (error) {
      this.recordFailure()
      throw error
    }
  }

  private _transition(to: CircuitState): void {
    const from = this._state
    this._state = to
    this._config.onStateChange?.(from, to)
  }
}

export class CircuitOpenError extends Error {
  readonly failureCount: number
  readonly cooldownMs: number

  constructor(failureCount: number, cooldownMs: number) {
    super(
      `Circuit breaker is OPEN after ${failureCount} failures. ` +
      `Retry after ${cooldownMs}ms cooldown.`
    )
    this.name = "CircuitOpenError"
    this.failureCount = failureCount
    this.cooldownMs = cooldownMs
  }
}
