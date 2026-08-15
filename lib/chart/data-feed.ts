// ─────────────────────────────────────────────────────────────
// Decoupled DataFeed for lightweight-charts.
// Abstracts the data source so the chart component doesn't care
// whether candles come from REST (historical) or WS (live).
//
// Two concrete implementations:
//   MockDataFeed   — generates synthetic candles for development
//   BinanceDataFeed — (future) fetches from Binance REST + WS
// ─────────────────────────────────────────────────────────────

import type { Interval } from "@/types/trading"

export interface OHLCData {
  time: number // Unix timestamp in seconds (required by lightweight-charts)
  open: number
  high: number
  low: number
  close: number
}

export interface VolumeData {
  time: number
  value: number
  color: string
}

export interface DataFeed {
  /** Fetch historical candles for a given symbol and interval */
  getHistoricalCandles(
    symbol: string,
    interval: Interval,
    count: number,
  ): Promise<OHLCData[]>

  /** Subscribe to live candle updates. Returns unsubscribe function. */
  subscribeLive(
    symbol: string,
    interval: Interval,
    onUpdate: (candle: OHLCData) => void,
  ): () => void

  /** Destroy the feed and clean up resources */
  destroy(): void
}

// ── Interval → milliseconds mapping ─────────────────────────

const INTERVAL_MS: Record<Interval, number> = {
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
  "1h": 3_600_000,
  "4h": 14_400_000,
  "1D": 86_400_000,
}

// ── Mock DataFeed ───────────────────────────────────────────

export class MockDataFeed implements DataFeed {
  private _liveTimers: ReturnType<typeof setInterval>[] = []
  private _lastPrice = 0
  private _lastBarTime = 0

  async getHistoricalCandles(
    _symbol: string,
    interval: Interval,
    count: number,
  ): Promise<OHLCData[]> {
    // Simulate network latency
    await new Promise((r) => setTimeout(r, 50))

    const intervalSec = INTERVAL_MS[interval] / 1000
    // Align "now" to the current interval boundary (integer seconds)
    const nowAligned = Math.floor(Date.now() / 1000 / intervalSec) * intervalSec
    const candles: OHLCData[] = []

    // Derive a base price from the symbol
    let price = this._basePrice(_symbol)

    // Use a Set to guarantee no duplicate timestamps
    const usedTimes = new Set<number>()

    for (let i = count - 1; i >= 0; i--) {
      // Each candle is aligned to an integer interval boundary
      const time = nowAligned - i * intervalSec
      if (usedTimes.has(time)) continue
      usedTimes.add(time)

      const open = price
      const change = (Math.random() - 0.48) * price * 0.008
      const close = open + change
      const high = Math.max(open, close) + Math.random() * price * 0.003
      const low = Math.min(open, close) - Math.random() * price * 0.003

      candles.push({
        time,
        open: parseFloat(open.toFixed(2)),
        high: parseFloat(high.toFixed(2)),
        low: parseFloat(low.toFixed(2)),
        close: parseFloat(close.toFixed(2)),
      })
      price = close
    }

    // Sort ascending by time (defensive)
    candles.sort((a, b) => a.time - b.time)

    this._lastPrice = price
    this._lastBarTime = candles.length > 0 ? candles[candles.length - 1].time : 0
    return candles
  }

  subscribeLive(
    _symbol: string,
    interval: Interval,
    onUpdate: (candle: OHLCData) => void,
  ): () => void {
    const intervalSec = INTERVAL_MS[interval] / 1000
    // Start live bar time at the current interval boundary,
    // but never before the last historical bar
    let currentBarTime = Math.max(
      Math.floor(Date.now() / 1000 / intervalSec) * intervalSec,
      this._lastBarTime,
    )
    let currentBar: OHLCData = {
      time: currentBarTime,
      open: this._lastPrice,
      high: this._lastPrice,
      low: this._lastPrice,
      close: this._lastPrice,
    }

    const timer = setInterval(() => {
      const delta = (Math.random() - 0.48) * this._lastPrice * 0.002
      this._lastPrice = parseFloat((this._lastPrice + delta).toFixed(2))

      const now = Math.floor(Date.now() / 1000)
      const barTime = Math.floor(now / intervalSec) * intervalSec

      if (barTime > currentBarTime) {
        // New candle — must be strictly after the previous one
        currentBarTime = barTime
        currentBar = {
          time: barTime,
          open: this._lastPrice,
          high: this._lastPrice,
          low: this._lastPrice,
          close: this._lastPrice,
        }
      } else {
        // Update current candle in-place
        currentBar = {
          ...currentBar,
          high: Math.max(currentBar.high, this._lastPrice),
          low: Math.min(currentBar.low, this._lastPrice),
          close: this._lastPrice,
        }
      }

      onUpdate(currentBar)
    }, 1_500)

    this._liveTimers.push(timer)

    return () => {
      clearInterval(timer)
      this._liveTimers = this._liveTimers.filter((t) => t !== timer)
    }
  }

  destroy(): void {
    for (const timer of this._liveTimers) {
      clearInterval(timer)
    }
    this._liveTimers = []
  }

  private _basePrice(symbol: string): number {
    const prices: Record<string, number> = {
      "BTC-PERP": 67_432.5,
      "ETH-PERP": 3_512.8,
      "SOL-PERP": 178.42,
      "BNB-PERP": 582.1,
      "ARB-PERP": 1.234,
      "DOGE-PERP": 0.1782,
      "AVAX-PERP": 39.21,
      "LINK-PERP": 17.85,
      "OP-PERP": 2.541,
      "INJ-PERP": 24.82,
    }
    return prices[symbol] ?? 100
  }
}
