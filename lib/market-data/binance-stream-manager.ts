// ─────────────────────────────────────────────────────────────
// BinanceStreamManager — Institutional-grade multi-stream
// WebSocket manager for Binance USDT-M Futures (fstream).
//
// Streams:
//   !ticker@arr           → all tickers (watchlist prices + 24h)
//   <symbol>@aggTrade     → individual trades (last price + chart)
//   <symbol>@depth20@100ms → top-20 order book snapshot
//
// Features:
//   - Exponential backoff reconnection (1s → 30s cap)
//   - Per-stream health monitoring
//   - Clean symbol switching (unsub old → sub new)
//   - All callbacks fire raw parsed data; consumers throttle
// ─────────────────────────────────────────────────────────────

import type { Symbol as TradingSymbol } from "@/types/trading"

// ── Symbol mapping: internal → Binance ──────────────────────

const SYMBOL_MAP: Record<TradingSymbol, string> = {
  "BTC-PERP": "btcusdt",
  "ETH-PERP": "ethusdt",
  "SOL-PERP": "solusdt",
  "BNB-PERP": "bnbusdt",
  "ARB-PERP": "arbusdt",
  "DOGE-PERP": "dogeusdt",
  "AVAX-PERP": "avaxusdt",
  "LINK-PERP": "linkusdt",
  "OP-PERP": "opusdt",
  "INJ-PERP": "injusdt",
}

// Reverse map for incoming events
const REVERSE_SYMBOL_MAP: Record<string, TradingSymbol> = {}
for (const [k, v] of Object.entries(SYMBOL_MAP)) {
  REVERSE_SYMBOL_MAP[v.toUpperCase()] = k as TradingSymbol
}

export function toBinanceSymbol(sym: TradingSymbol): string {
  return SYMBOL_MAP[sym] ?? sym.replace("-PERP", "usdt").toLowerCase()
}

export function fromBinanceSymbol(raw: string): TradingSymbol | null {
  return REVERSE_SYMBOL_MAP[raw.toUpperCase()] ?? null
}

// ── Binance raw message types ───────────────────────────────

export interface BinanceAggTrade {
  /** Symbol e.g. "BTCUSDT" */
  s: string
  /** Price */
  p: string
  /** Quantity */
  q: string
  /** Trade time (ms) */
  T: number
  /** Is buyer maker */
  m: boolean
}

export interface BinanceDepthSnapshot {
  /** Last update ID */
  lastUpdateId: number
  /** Asks [price, qty][] */
  asks: [string, string][]
  /** Bids [price, qty][] */
  bids: [string, string][]
}

export interface BinanceMiniTicker {
  /** Event type */
  e: string
  /** Symbol e.g. "BTCUSDT" */
  s: string
  /** Close price */
  c: string
  /** Open price */
  o: string
  /** High price */
  h: string
  /** Low price */
  l: string
  /** Total traded base asset volume */
  v: string
  /** Total traded quote asset volume */
  q: string
}

// ── Parsed callback types ───────────────────────────────────

export interface ParsedTrade {
  symbol: TradingSymbol
  price: number
  quantity: number
  timestamp: number
  isSell: boolean
}

export interface ParsedDepth {
  asks: { price: number; size: number }[]
  bids: { price: number; size: number }[]
}

export interface ParsedTicker {
  symbol: TradingSymbol
  price: number
  change24h: number
  high24h: number
  low24h: number
  volume24h: number
}

// ── Connection state ────────────────────────────────────────

export type StreamConnectionState = "disconnected" | "connecting" | "connected" | "reconnecting"

export interface StreamManagerCallbacks {
  onTrade: (trade: ParsedTrade) => void
  onDepth: (depth: ParsedDepth) => void
  onTickers: (tickers: ParsedTicker[]) => void
  onConnectionChange: (state: StreamConnectionState) => void
}

// ── Exponential Backoff config ──────────────────────────────

interface BackoffConfig {
  baseMs: number
  maxMs: number
  multiplier: number
}

const DEFAULT_BACKOFF: BackoffConfig = {
  baseMs: 1_000,
  maxMs: 30_000,
  multiplier: 2,
}

// ── Managed WebSocket wrapper ───────────────────────────────

class ManagedSocket {
  private ws: WebSocket | null = null
  private attempt = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private destroyed = false
  private backoff: BackoffConfig

  constructor(
    private url: string,
    private onMessage: (data: unknown) => void,
    private onStateChange: (state: "connected" | "disconnected" | "connecting" | "reconnecting") => void,
    backoff?: Partial<BackoffConfig>,
  ) {
    this.backoff = { ...DEFAULT_BACKOFF, ...backoff }
  }

  connect(): void {
    if (this.destroyed) return
    this.cleanup()

    this.onStateChange(this.attempt === 0 ? "connecting" : "reconnecting")

    try {
      this.ws = new WebSocket(this.url)
    } catch {
      this.scheduleReconnect()
      return
    }

    this.ws.onopen = () => {
      this.attempt = 0
      this.onStateChange("connected")
    }

    this.ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data as string)
        this.onMessage(data)
      } catch {
        // Malformed frame — ignore
      }
    }

    this.ws.onerror = () => {
      // Error fires before close; close handler will reconnect
    }

    this.ws.onclose = () => {
      if (this.destroyed) return
      this.onStateChange("disconnected")
      this.scheduleReconnect()
    }
  }

  private scheduleReconnect(): void {
    if (this.destroyed) return
    const delay = Math.min(
      this.backoff.baseMs * Math.pow(this.backoff.multiplier, this.attempt),
      this.backoff.maxMs,
    )
    this.attempt++
    this.onStateChange("reconnecting")
    this.reconnectTimer = setTimeout(() => this.connect(), delay)
  }

  private cleanup(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.ws) {
      this.ws.onopen = null
      this.ws.onmessage = null
      this.ws.onerror = null
      this.ws.onclose = null
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close()
      }
      this.ws = null
    }
  }

  destroy(): void {
    this.destroyed = true
    this.cleanup()
  }
}

// ── BinanceStreamManager ────────────────────────────────────

const FSTREAM_BASE = "wss://fstream.binance.com"

export class BinanceStreamManager {
  private tickerSocket: ManagedSocket | null = null
  private tradeSocket: ManagedSocket | null = null
  private depthSocket: ManagedSocket | null = null
  private currentSymbol: TradingSymbol | null = null
  private callbacks: StreamManagerCallbacks
  private connectionStates = {
    ticker: "disconnected" as StreamConnectionState,
    trade: "disconnected" as StreamConnectionState,
    depth: "disconnected" as StreamConnectionState,
  }

  constructor(callbacks: StreamManagerCallbacks) {
    this.callbacks = callbacks
  }

  // ── Public API ──────────────────────────────────────────

  /**
   * Start all streams. Ticker stream starts immediately.
   * Trade + depth streams start for the given symbol.
   */
  start(symbol: TradingSymbol): void {
    this.currentSymbol = symbol
    this.startTickerStream()
    this.startSymbolStreams(symbol)
  }

  /**
   * Switch the active symbol. Tears down old trade/depth sockets
   * and starts new ones. Ticker stream stays alive (it covers all symbols).
   */
  switchSymbol(symbol: TradingSymbol): void {
    if (this.currentSymbol === symbol) return
    this.currentSymbol = symbol

    // Tear down old symbol-specific streams
    this.tradeSocket?.destroy()
    this.depthSocket?.destroy()
    this.tradeSocket = null
    this.depthSocket = null

    // Start new ones
    this.startSymbolStreams(symbol)
  }

  /**
   * Destroy all connections and clean up.
   */
  destroy(): void {
    this.tickerSocket?.destroy()
    this.tradeSocket?.destroy()
    this.depthSocket?.destroy()
    this.tickerSocket = null
    this.tradeSocket = null
    this.depthSocket = null
    this.currentSymbol = null
  }

  // ── Private: Ticker (all symbols) ─────────────────────

  private startTickerStream(): void {
    const url = `${FSTREAM_BASE}/ws/!ticker@arr`

    this.tickerSocket = new ManagedSocket(
      url,
      (data) => this.handleTickerMessage(data),
      (state) => {
        this.connectionStates.ticker = state
        this.emitAggregatedState()
      },
    )
    this.tickerSocket.connect()
  }

  private handleTickerMessage(raw: unknown): void {
    if (!Array.isArray(raw)) return

    const tickers: ParsedTicker[] = []
    for (const item of raw as BinanceMiniTicker[]) {
      const sym = fromBinanceSymbol(item.s)
      if (!sym) continue

      const closePrice = parseFloat(item.c)
      const openPrice = parseFloat(item.o)
      const change24h = openPrice > 0
        ? ((closePrice - openPrice) / openPrice) * 100
        : 0

      tickers.push({
        symbol: sym,
        price: closePrice,
        change24h: parseFloat(change24h.toFixed(2)),
        high24h: parseFloat(item.h),
        low24h: parseFloat(item.l),
        volume24h: parseFloat(item.q),
      })
    }

    if (tickers.length > 0) {
      this.callbacks.onTickers(tickers)
    }
  }

  // ── Private: Symbol-specific (aggTrade + depth) ───────

  private startSymbolStreams(symbol: TradingSymbol): void {
    const binSym = toBinanceSymbol(symbol)

    // aggTrade stream
    this.tradeSocket = new ManagedSocket(
      `${FSTREAM_BASE}/ws/${binSym}@aggTrade`,
      (data) => this.handleTradeMessage(data),
      (state) => {
        this.connectionStates.trade = state
        this.emitAggregatedState()
      },
    )
    this.tradeSocket.connect()

    // depth20 snapshot stream at 100ms
    this.depthSocket = new ManagedSocket(
      `${FSTREAM_BASE}/ws/${binSym}@depth20@100ms`,
      (data) => this.handleDepthMessage(data),
      (state) => {
        this.connectionStates.depth = state
        this.emitAggregatedState()
      },
    )
    this.depthSocket.connect()
  }

  private handleTradeMessage(raw: unknown): void {
    const msg = raw as BinanceAggTrade
    if (!msg.s || !msg.p) return

    const sym = fromBinanceSymbol(msg.s)
    if (!sym) return

    this.callbacks.onTrade({
      symbol: sym,
      price: parseFloat(msg.p),
      quantity: parseFloat(msg.q),
      timestamp: msg.T,
      isSell: msg.m,
    })
  }

  private handleDepthMessage(raw: unknown): void {
    const msg = raw as BinanceDepthSnapshot
    if (!msg.asks || !msg.bids) return

    this.callbacks.onDepth({
      asks: msg.asks.map(([p, s]) => ({ price: parseFloat(p), size: parseFloat(s) })),
      bids: msg.bids.map(([p, s]) => ({ price: parseFloat(p), size: parseFloat(s) })),
    })
  }

  // ── Private: Aggregate connection state ───────────────

  private emitAggregatedState(): void {
    const states = Object.values(this.connectionStates)

    // If all connected → connected
    if (states.every((s) => s === "connected")) {
      this.callbacks.onConnectionChange("connected")
      return
    }
    // If any reconnecting → reconnecting
    if (states.some((s) => s === "reconnecting")) {
      this.callbacks.onConnectionChange("reconnecting")
      return
    }
    // If any connecting → connecting
    if (states.some((s) => s === "connecting")) {
      this.callbacks.onConnectionChange("connecting")
      return
    }
    this.callbacks.onConnectionChange("disconnected")
  }
}
