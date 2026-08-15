// ─────────────────────────────────────────────────────────────
// BinanceWS — WebSocket client for Binance Futures streams.
// Features: auto-reconnect with exponential backoff, heartbeat,
// circuit breaker integration, typed event emissions.
//
// In development/demo mode, falls back to mock data generation
// so the terminal works without a real Binance connection.
// ─────────────────────────────────────────────────────────────

import { TypedEventEmitter } from "./event-emitter"
import { CircuitBreaker, type CircuitState } from "./circuit-breaker"
import type {
  Symbol,
  OrderBookLevel,
  OrderBookData,
  WatchlistItem,
} from "@/types/trading"

// ── Stream event types ──────────────────────────────────────

export interface BinanceStreamEvents {
  /** Real-time price tick */
  price: { symbol: Symbol; price: number; timestamp: number }
  /** Full order book snapshot */
  orderbook: OrderBookData
  /** Watchlist batch update */
  watchlist: WatchlistItem[]
  /** Connection state change */
  connectionState: ConnectionState
  /** Circuit breaker state */
  circuitState: CircuitState
  /** Error */
  error: { code: string; message: string; recoverable: boolean }
}

export type ConnectionState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "degraded"

export interface BinanceWSConfig {
  /** Base URL for Binance WS (default: wss://fstream.binance.com/ws/) */
  baseUrl: string
  /** Max reconnection attempts before circuit opens */
  maxReconnectAttempts: number
  /** Base delay for exponential backoff in ms */
  reconnectBaseMs: number
  /** Max backoff delay in ms */
  reconnectMaxMs: number
  /** Enable mock data mode (no real WS connection) */
  mockMode: boolean
  /** Mock data tick intervals */
  mockIntervals: {
    priceMs: number
    bookMs: number
    watchlistMs: number
  }
}

const DEFAULT_CONFIG: BinanceWSConfig = {
  baseUrl: "wss://fstream.binance.com/ws/",
  maxReconnectAttempts: 10,
  reconnectBaseMs: 1_000,
  reconnectMaxMs: 30_000,
  mockMode: true, // Default to mock in development
  mockIntervals: {
    priceMs: 800,
    bookMs: 600,
    watchlistMs: 2_000,
  },
}

// ── Binance WebSocket Client ────────────────────────────────

export class BinanceWS extends TypedEventEmitter<BinanceStreamEvents> {
  private _config: BinanceWSConfig
  private _ws: WebSocket | null = null
  private _circuit: CircuitBreaker
  private _reconnectAttempts = 0
  private _reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private _heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private _connectionState: ConnectionState = "disconnected"
  private _activeSymbol: Symbol = "BTC-PERP"
  private _destroyed = false

  // Mock mode timers
  private _mockTimers: ReturnType<typeof setInterval>[] = []
  private _mockPriceRef = 67_432.5
  private _mockWatchlist: WatchlistItem[] = []

  constructor(config: Partial<BinanceWSConfig> = {}) {
    super()
    this._config = { ...DEFAULT_CONFIG, ...config }
    this._circuit = new CircuitBreaker({
      failureThreshold: this._config.maxReconnectAttempts,
      cooldownMs: this._config.reconnectMaxMs,
      onStateChange: (_from, to) => {
        this.emit("circuitState", to)
        if (to === "OPEN") {
          this._setConnectionState("degraded")
        }
      },
    })
  }

  // ── Public API ──────────────────────────────────────────

  get connectionState(): ConnectionState {
    return this._connectionState
  }

  get circuitState(): CircuitState {
    return this._circuit.state
  }

  /**
   * Connect to Binance streams for the given symbol.
   * In mock mode, starts mock data generators instead.
   */
  connect(symbol: Symbol, watchlist: WatchlistItem[]): void {
    this._activeSymbol = symbol
    this._mockWatchlist = watchlist

    if (this._config.mockMode) {
      this._startMockStreams()
      return
    }

    this._connectReal()
  }

  /**
   * Switch active symbol. Tears down current streams and reconnects.
   */
  switchSymbol(symbol: Symbol): void {
    if (symbol === this._activeSymbol) return
    this._activeSymbol = symbol

    if (this._config.mockMode) {
      this._stopMockStreams()
      this._startMockStreams()
    } else {
      this._disconnect()
      this._connectReal()
    }
  }

  /**
   * Graceful shutdown — closes WS, clears timers, removes listeners.
   */
  destroy(): void {
    this._destroyed = true
    this._stopMockStreams()
    this._disconnect()
    this._clearReconnectTimer()
    this._clearHeartbeat()
    this.removeAllListeners()
  }

  // ── Real WebSocket connection ─────────────────────────

  private _connectReal(): void {
    if (this._destroyed) return
    if (!this._circuit.canExecute()) {
      this._setConnectionState("degraded")
      this.emit("error", {
        code: "CIRCUIT_OPEN",
        message: "Circuit breaker is open. Connection in degraded mode.",
        recoverable: true,
      })
      return
    }

    this._setConnectionState(
      this._reconnectAttempts > 0 ? "reconnecting" : "connecting"
    )

    try {
      const streamName = this._symbolToStream(this._activeSymbol)
      const url = `${this._config.baseUrl}${streamName}`
      this._ws = new WebSocket(url)
      this._ws.onopen = this._handleOpen.bind(this)
      this._ws.onmessage = this._handleMessage.bind(this)
      this._ws.onerror = this._handleError.bind(this)
      this._ws.onclose = this._handleClose.bind(this)
    } catch (err) {
      this._circuit.recordFailure()
      this._scheduleReconnect()
    }
  }

  private _handleOpen(): void {
    this._reconnectAttempts = 0
    this._circuit.recordSuccess()
    this._setConnectionState("connected")
    this._startHeartbeat()
  }

  private _handleMessage(event: MessageEvent): void {
    try {
      const data = JSON.parse(event.data as string)
      this._routeMessage(data)
    } catch {
      // Malformed JSON — ignore silently
    }
  }

  private _handleError(): void {
    this._circuit.recordFailure()
    this.emit("error", {
      code: "WS_ERROR",
      message: `WebSocket error for ${this._activeSymbol}`,
      recoverable: true,
    })
  }

  private _handleClose(): void {
    this._clearHeartbeat()
    if (!this._destroyed) {
      this._scheduleReconnect()
    }
  }

  private _routeMessage(data: Record<string, unknown>): void {
    const eventType = data.e as string | undefined

    if (eventType === "24hrMiniTicker" || eventType === "markPriceUpdate") {
      this.emit("price", {
        symbol: this._activeSymbol,
        price: parseFloat(data.c as string || data.p as string || "0"),
        timestamp: Date.now(),
      })
    }

    if (eventType === "depthUpdate") {
      const asks = (data.a as [string, string][] || []).map(
        ([p, s]: [string, string]) => parseFloat(p)
      )
      // Full depth processing would happen here
      // For now, emit raw and let the engine process
    }
  }

  private _disconnect(): void {
    if (this._ws) {
      this._ws.onopen = null
      this._ws.onmessage = null
      this._ws.onerror = null
      this._ws.onclose = null
      if (this._ws.readyState === WebSocket.OPEN || this._ws.readyState === WebSocket.CONNECTING) {
        this._ws.close(1000, "Client disconnect")
      }
      this._ws = null
    }
    this._setConnectionState("disconnected")
  }

  private _scheduleReconnect(): void {
    if (this._destroyed) return
    this._clearReconnectTimer()

    this._reconnectAttempts++
    const delay = Math.min(
      this._config.reconnectBaseMs * Math.pow(2, this._reconnectAttempts - 1),
      this._config.reconnectMaxMs
    )

    this._reconnectTimer = setTimeout(() => {
      this._connectReal()
    }, delay)
  }

  private _startHeartbeat(): void {
    this._clearHeartbeat()
    this._heartbeatTimer = setInterval(() => {
      if (this._ws?.readyState === WebSocket.OPEN) {
        this._ws.send(JSON.stringify({ method: "ping" }))
      }
    }, 30_000)
  }

  private _clearHeartbeat(): void {
    if (this._heartbeatTimer) {
      clearInterval(this._heartbeatTimer)
      this._heartbeatTimer = null
    }
  }

  private _clearReconnectTimer(): void {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer)
      this._reconnectTimer = null
    }
  }

  private _symbolToStream(symbol: Symbol): string {
    // Convert BTC-PERP → btcusdt
    const base = symbol.replace("-PERP", "").toLowerCase()
    return `${base}usdt@miniTicker`
  }

  // ── Mock Data Streams ─────────────────────────────────

  private _startMockStreams(): void {
    this._stopMockStreams()
    this._setConnectionState("connected")

    const { priceMs, bookMs, watchlistMs } = this._config.mockIntervals

    // Initialize mock price from watchlist
    const watchItem = this._mockWatchlist.find(
      (w) => w.symbol === this._activeSymbol
    )
    if (watchItem) {
      this._mockPriceRef = watchItem.price
    }

    // ── Price stream ──
    const priceTimer = setInterval(() => {
      const variance = this._mockPriceRef * 0.0007
      const delta = (Math.random() - 0.5) * variance
      this._mockPriceRef = parseFloat(
        (this._mockPriceRef + delta).toFixed(2)
      )
      this.emit("price", {
        symbol: this._activeSymbol,
        price: this._mockPriceRef,
        timestamp: Date.now(),
      })
    }, priceMs)
    this._mockTimers.push(priceTimer)

    // ── Order book stream ──
    const bookTimer = setInterval(() => {
      const mid = this._mockPriceRef
      const newMid = mid + (Math.random() - 0.5) * 8
      const asks = generateBookSide(newMid, "ask")
      const bids = generateBookSide(newMid, "bid")
      this.emit("orderbook", {
        asks,
        bids,
        markPrice: newMid + 1.2,
        indexPrice: newMid - 0.8,
      })
    }, bookMs)
    this._mockTimers.push(bookTimer)

    // ── Watchlist stream ──
    // Initialize sparklines
    this._mockWatchlist = this._mockWatchlist.map((item) => ({
      ...item,
      sparkline: generateSparkline(item.price),
    }))
    this.emit("watchlist", this._mockWatchlist)

    const watchlistTimer = setInterval(() => {
      this._mockWatchlist = this._mockWatchlist.map((item) => {
        const delta = (Math.random() - 0.5) * item.price * 0.002
        const decimals = item.price < 1 ? 4 : item.price < 10 ? 3 : 2
        const newPrice = parseFloat((item.price + delta).toFixed(decimals))
        const newSparkline = [...item.sparkline.slice(1), newPrice]
        const initialPrice = item.sparkline[0]
        const newChange = parseFloat(
          (((newPrice - initialPrice) / initialPrice) * 100).toFixed(2)
        )
        return {
          ...item,
          price: newPrice,
          sparkline: newSparkline,
          change: newChange,
        }
      })
      this.emit("watchlist", this._mockWatchlist)
    }, watchlistMs)
    this._mockTimers.push(watchlistTimer)
  }

  private _stopMockStreams(): void {
    for (const timer of this._mockTimers) {
      clearInterval(timer)
    }
    this._mockTimers = []
  }

  private _setConnectionState(state: ConnectionState): void {
    if (this._connectionState !== state) {
      this._connectionState = state
      this.emit("connectionState", state)
    }
  }
}

// ── Mock data helpers (shared with original use-binance-data) ──

function generateSparkline(base: number, length = 20): number[] {
  const data: number[] = []
  let val = base
  for (let i = 0; i < length; i++) {
    val = val + (Math.random() - 0.5) * base * 0.01
    data.push(val)
  }
  return data
}

function generateBookSide(
  midPrice: number,
  side: "ask" | "bid",
  levels = 14
): OrderBookLevel[] {
  const rows: OrderBookLevel[] = []
  let cumTotal = 0
  for (let i = 0; i < levels; i++) {
    const price =
      side === "ask"
        ? midPrice + (i + 1) * (0.5 + Math.random() * 1.5)
        : midPrice - (i + 1) * (0.5 + Math.random() * 1.5)
    const size = parseFloat((0.1 + Math.random() * 4.5).toFixed(3))
    cumTotal += size
    rows.push({
      price: parseFloat(price.toFixed(1)),
      size,
      total: cumTotal,
      depth: 0,
      flash: null,
    })
  }
  const maxTotal = rows[rows.length - 1].total
  rows.forEach((r) => (r.depth = Math.round((r.total / maxTotal) * 100)))
  return side === "ask" ? rows.reverse() : rows
}
