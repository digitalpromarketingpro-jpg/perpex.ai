// ─────────────────────────────────────────────────────────────
// Market Data Engine — barrel export
// ─────────────────────────────────────────────────────────────

export { TypedEventEmitter } from "./event-emitter"
export { createRAFThrottle, createIntervalThrottle } from "./throttle"
export {
  CircuitBreaker,
  CircuitOpenError,
  type CircuitState,
  type CircuitBreakerConfig,
} from "./circuit-breaker"
export {
  BinanceWS,
  type BinanceWSConfig,
  type BinanceStreamEvents,
  type ConnectionState,
} from "./binance-ws"
