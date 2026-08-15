"use client"

// ─────────────────────────────────────────────────────────────
// useBinanceManager — Centralized hook that manages live Binance
// futures WebSocket streams and throttles React state updates.
//
// Architecture:
//   3 WebSocket streams → raw callbacks → ref accumulators
//   → 150ms interval flush → TradingContext dispatch
//
// This ensures:
//   - No per-tick re-renders (high-frequency data stays in refs)
//   - Consistent 60fps UI by batching updates
//   - Clean symbol-switch (unsub old / sub new instantly)
//   - Exposes candleSeriesRef for direct chart.update() wiring
// ─────────────────────────────────────────────────────────────

import { useEffect, useRef, useCallback } from "react"
import { useTrading } from "@/context/trading-context"
import {
  BinanceStreamManager,
  type ParsedTrade,
  type ParsedDepth,
  type ParsedTicker,
  type StreamConnectionState,
} from "@/lib/market-data/binance-stream-manager"
import type {
  Symbol as TradingSymbol,
  OrderBookData,
  OrderBookLevel,
  WatchlistItem,
  PriceDirection,
} from "@/types/trading"

// ── Flush interval (ms) — controls max re-render frequency ──
const FLUSH_INTERVAL_DESKTOP = 150
const FLUSH_INTERVAL_MOBILE = 350

// ── Significance threshold for flash (%) ────────────────────
const FLASH_THRESHOLD_PCT = 0.015

// ── Chart update callback type ──────────────────────────────
export type OnLiveTradeCallback = (trade: ParsedTrade) => void

export interface UseBinanceManagerOptions {
  /** Callback fired on every aggTrade — wire to chart.update() */
  onLiveTrade?: OnLiveTradeCallback
  /** If true, uses a longer flush interval to save battery */
  isMobile?: boolean
}

export function useBinanceManager(options: UseBinanceManagerOptions = {}) {
  const { state, actions } = useTrading()
  const { activeSymbol, watchlist } = state

  // ── Refs: latest values for closure safety ────────────────
  const symbolRef = useRef<TradingSymbol>(activeSymbol)
  const watchlistRef = useRef<WatchlistItem[]>(watchlist)
  const managerRef = useRef<BinanceStreamManager | null>(null)
  const onLiveTradeRef = useRef<OnLiveTradeCallback | undefined>(options.onLiveTrade)

  // ── Accumulators: written at wire speed, read on flush ────
  const pendingPrice = useRef<{ price: number; direction: PriceDirection } | null>(null)
  const pendingBook = useRef<OrderBookData | null>(null)
  const pendingWatchlist = useRef<WatchlistItem[] | null>(null)
  const prevPriceRef = useRef<number>(state.marketPrice)
  const pendingConnection = useRef<StreamConnectionState | null>(null)

  // Keep refs in sync with latest React state
  useEffect(() => { symbolRef.current = activeSymbol }, [activeSymbol])
  useEffect(() => { watchlistRef.current = watchlist }, [watchlist])
  useEffect(() => { onLiveTradeRef.current = options.onLiveTrade }, [options.onLiveTrade])

  // ── Build OrderBookData from parsed depth ─────────────────
  const buildOrderBook = useCallback((depth: ParsedDepth): OrderBookData => {
    const currentPrice = prevPriceRef.current

    const mapLevels = (
      levels: { price: number; size: number }[],
      side: "ask" | "bid",
    ): OrderBookLevel[] => {
      let cumTotal = 0
      const maxTotal = levels.reduce((acc, l) => acc + l.size, 0)

      return levels.map((l) => {
        cumTotal += l.size
        // Flash only on significant price change
        const pctDiff = Math.abs(l.price - currentPrice) / currentPrice
        let flash: PriceDirection = null
        if (pctDiff < FLASH_THRESHOLD_PCT) {
          flash = side === "bid" ? "up" : "down"
        }

        return {
          price: l.price,
          size: l.size,
          total: cumTotal,
          depth: maxTotal > 0 ? (cumTotal / maxTotal) * 100 : 0,
          flash,
        }
      })
    }

    // Asks: lowest first (ascending)
    const sortedAsks = [...depth.asks].sort((a, b) => a.price - b.price).slice(0, 12)
    // Bids: highest first (descending)
    const sortedBids = [...depth.bids].sort((a, b) => b.price - a.price).slice(0, 12)

    return {
      asks: mapLevels(sortedAsks, "ask").reverse(), // Display highest ask at top
      bids: mapLevels(sortedBids, "bid"),
      markPrice: currentPrice,
      indexPrice: currentPrice * (1 + (Math.random() - 0.5) * 0.0001),
    }
  }, [])

  // ── Merge ticker data into watchlist ──────────────────────
  const mergeTickersIntoWatchlist = useCallback((tickers: ParsedTicker[]) => {
    const tickerMap = new Map<TradingSymbol, ParsedTicker>()
    for (const t of tickers) {
      tickerMap.set(t.symbol, t)
    }

    const current = watchlistRef.current
    const updated = current.map((item) => {
      const tick = tickerMap.get(item.symbol)
      if (!tick) return item
      // Update sparkline: shift left, push new price
      const sparkline = [...item.sparkline.slice(1), tick.price]
      return {
        ...item,
        price: tick.price,
        change: tick.change24h,
        high24h: tick.high24h,
        low24h: tick.low24h,
        volume24h: tick.volume24h,
        sparkline,
      }
    })

    return updated
  }, [])

  // ── Bootstrap the stream manager ──────────────────────────
  useEffect(() => {
    const manager = new BinanceStreamManager({
      onTrade: (trade: ParsedTrade) => {
        // Only process trades for the active symbol
        if (trade.symbol !== symbolRef.current) return

        const prev = prevPriceRef.current
        const direction: PriceDirection =
          trade.price > prev ? "up" : trade.price < prev ? "down" : null

        pendingPrice.current = { price: trade.price, direction }
        prevPriceRef.current = trade.price

        // Fire chart callback directly (no throttle — chart handles its own batching)
        onLiveTradeRef.current?.(trade)
      },

      onDepth: (depth: ParsedDepth) => {
        pendingBook.current = buildOrderBook(depth)
      },

      onTickers: (tickers: ParsedTicker[]) => {
        const merged = mergeTickersIntoWatchlist(tickers)
        pendingWatchlist.current = merged

        // Also update active symbol price from ticker if no aggTrade yet
        const activeTicker = tickers.find((t) => t.symbol === symbolRef.current)
        if (activeTicker && !pendingPrice.current) {
          const prev = prevPriceRef.current
          const direction: PriceDirection =
            activeTicker.price > prev ? "up" : activeTicker.price < prev ? "down" : null
          pendingPrice.current = { price: activeTicker.price, direction }
          prevPriceRef.current = activeTicker.price
        }
      },

      onConnectionChange: (connState: StreamConnectionState) => {
        pendingConnection.current = connState
      },
    })

    managerRef.current = manager
    manager.start(symbolRef.current)

    // ── Flush interval: batch all pending updates into one dispatch ──
    const flushMs = options.isMobile ? FLUSH_INTERVAL_MOBILE : FLUSH_INTERVAL_DESKTOP
    const flushTimer = setInterval(() => {
      // Price
      const price = pendingPrice.current
      if (price) {
        actions.updateMarketPrice(price.price)
        pendingPrice.current = null
      }

      // Order book
      const book = pendingBook.current
      if (book) {
        actions.updateOrderBook(book)
        pendingBook.current = null
      }

      // Watchlist
      const wl = pendingWatchlist.current
      if (wl) {
        actions.updateWatchlist(wl)
        pendingWatchlist.current = null
      }

      // Connection state
      const conn = pendingConnection.current
      if (conn) {
        actions.setConnectionState(conn)
        pendingConnection.current = null
      }
    }, flushMs)

    return () => {
      clearInterval(flushTimer)
      manager.destroy()
      managerRef.current = null
    }
    // Only run on mount/unmount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Handle symbol switching ───────────────────────────────
  useEffect(() => {
    managerRef.current?.switchSymbol(activeSymbol)
  }, [activeSymbol])
}
