"use client"

import { useState, useEffect, useRef, useCallback, type MutableRefObject } from "react"
import { cn } from "@/lib/utils"
import { useTrading } from "@/context/trading-context"
import type { PendingOrder } from "@/types/trading"
import {
  BarChart2,
  Crosshair,
  Maximize2,
  Settings2,
  TrendingUp,
} from "lucide-react"
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type IPriceLine,
  type Time,
  ColorType,
  CrosshairMode,
} from "lightweight-charts"
import { MockDataFeed, type DataFeed, type OHLCData } from "@/lib/chart/data-feed"
import type { Interval } from "@/types/trading"

const INTERVALS: Interval[] = ["1m", "5m", "15m", "1h", "4h", "1D"]

// ── lightweight-charts theme (dark terminal) ────────────────

const CHART_COLORS = {
  background: "#09090b",
  textColor: "#71717a",
  gridColor: "#27272a",
  upColor: "#22c55e",
  downColor: "#ef4444",
  borderUpColor: "#22c55e",
  borderDownColor: "#ef4444",
  wickUpColor: "#22c55e80",
  wickDownColor: "#ef444480",
  crosshairColor: "#525252",
} as const

export interface ChartLiveTradeHandler {
  (price: number, timestamp: number, isSell: boolean): void
}

export function ChartPanel({ liveTradeRef }: {
  liveTradeRef?: MutableRefObject<ChartLiveTradeHandler | null>
}) {
  const { state } = useTrading()
  const { activeSymbol: ticker, marketPrice, pendingOrders } = state

  const [interval, setIntervalState] = useState<Interval>("1h")
  const [ohlc, setOhlc] = useState<{ o: number; h: number; l: number; c: number } | null>(null)

  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null)
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null)
  const feedRef = useRef<DataFeed>(new MockDataFeed())
  const liveUnsubRef = useRef<(() => void) | null>(null)
  const lastBarTimeRef = useRef<number>(0)
  const currentBarRef = useRef<{ time: number; open: number; high: number; low: number; close: number } | null>(null)
  const intervalSecRef = useRef<number>(3600)

  // ── Create chart instance once ─────────────────────────
  useEffect(() => {
    const container = chartContainerRef.current
    if (!container) return

    const chart = createChart(container, {
      layout: {
        background: { type: ColorType.Solid, color: CHART_COLORS.background },
        textColor: CHART_COLORS.textColor,
        fontFamily: "var(--font-jetbrains-mono, monospace)",
        fontSize: 10,
      },
      grid: {
        vertLines: { color: "transparent" },
        horzLines: { color: CHART_COLORS.gridColor },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: CHART_COLORS.crosshairColor, width: 1, style: 3 },
        horzLine: { color: CHART_COLORS.crosshairColor, width: 1, style: 3 },
      },
      rightPriceScale: {
        borderColor: CHART_COLORS.gridColor,
        scaleMargins: { top: 0.1, bottom: 0.2 },
      },
      timeScale: {
        borderColor: CHART_COLORS.gridColor,
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: { vertTouchDrag: false },
    })

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: CHART_COLORS.upColor,
      downColor: CHART_COLORS.downColor,
      borderUpColor: CHART_COLORS.borderUpColor,
      borderDownColor: CHART_COLORS.borderDownColor,
      wickUpColor: CHART_COLORS.wickUpColor,
      wickDownColor: CHART_COLORS.wickDownColor,
    })

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
    })

    chart.priceScale("volume").applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 },
    })

    chartRef.current = chart
    candleSeriesRef.current = candleSeries
    volumeSeriesRef.current = volumeSeries

    // ── Track crosshair for OHLC display ──
    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.seriesData) {
        setOhlc(null)
        return
      }
      const data = param.seriesData.get(candleSeries) as CandlestickData | undefined
      if (data) {
        setOhlc({ o: data.open, h: data.high, l: data.low, c: data.close })
      }
    })

    // ── Resize observer ──
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        chart.applyOptions({ width, height })
      }
    })
    resizeObserver.observe(container)

    return () => {
      resizeObserver.disconnect()
      chart.remove()
      chartRef.current = null
      candleSeriesRef.current = null
      volumeSeriesRef.current = null
    }
  }, [])

  // ── Load data when symbol or interval changes ──────────
  const loadData = useCallback(
    async (sym: string, iv: Interval) => {
      // Unsubscribe previous live stream
      liveUnsubRef.current?.()
      liveUnsubRef.current = null

      const feed = feedRef.current
      const candles = await feed.getHistoricalCandles(sym, iv, 120)

      const candleSeries = candleSeriesRef.current
      const volumeSeries = volumeSeriesRef.current
      if (!candleSeries || !volumeSeries) return

      // Sort ascending by time and deduplicate (lightweight-charts requirement)
      const sorted = [...candles].sort((a, b) => a.time - b.time)
      const deduped: OHLCData[] = []
      let prevTime = -1
      for (const c of sorted) {
        if (c.time !== prevTime) {
          deduped.push(c)
          prevTime = c.time
        }
      }

      // Map to lightweight-charts format
      const candleData: CandlestickData[] = deduped.map((c) => ({
        time: c.time as Time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }))

      const volumeData = deduped.map((c) => ({
        time: c.time as Time,
        value: 50 + Math.random() * 200,
        color: c.close >= c.open
          ? CHART_COLORS.upColor + "30"
          : CHART_COLORS.downColor + "30",
      }))

      candleSeries.setData(candleData)
      volumeSeries.setData(volumeData)
      chartRef.current?.timeScale().fitContent()

      // Track the last bar time for update() guard
      lastBarTimeRef.current = deduped.length > 0 ? deduped[deduped.length - 1].time : 0

      // Update OHLC display with last candle
      const last = deduped[deduped.length - 1]
      if (last) {
        setOhlc({ o: last.open, h: last.high, l: last.low, c: last.close })
      }

      // Subscribe to live updates with timestamp guard
      const unsub = feed.subscribeLive(sym, iv, (update: OHLCData) => {
        // GUARD: only update if timestamp >= last known bar time
        if (update.time < lastBarTimeRef.current) return

        candleSeries.update({
          time: update.time as Time,
          open: update.open,
          high: update.high,
          low: update.low,
          close: update.close,
        })
        lastBarTimeRef.current = update.time
        setOhlc({ o: update.open, h: update.high, l: update.low, c: update.close })
      })
      liveUnsubRef.current = unsub

      // Store interval in seconds for live trade bar alignment
      const INTERVAL_SEC_MAP: Record<string, number> = {
        "1m": 60, "5m": 300, "15m": 900, "1h": 3600, "4h": 14400, "1D": 86400,
      }
      intervalSecRef.current = INTERVAL_SEC_MAP[iv] ?? 3600
    },
    []
  )

  useEffect(() => {
    loadData(ticker, interval)
    return () => {
      liveUnsubRef.current?.()
      liveUnsubRef.current = null
    }
  }, [ticker, interval, loadData])

  // ── Register live trade handler for external aggTrade pipe ──
  useEffect(() => {
    if (!liveTradeRef) return

    liveTradeRef.current = (price: number, timestamp: number, _isSell: boolean) => {
      const candleSeries = candleSeriesRef.current
      if (!candleSeries) return

      // Align to current interval bar
      const ivSec = intervalSecRef.current
      const barTime = Math.floor(timestamp / 1000 / ivSec) * ivSec

      // Guard: never update older than last known bar
      if (barTime < lastBarTimeRef.current) return

      const current = currentBarRef.current

      if (current && current.time === barTime) {
        // Update existing bar in-place
        current.high = Math.max(current.high, price)
        current.low = Math.min(current.low, price)
        current.close = price
      } else {
        // New bar
        currentBarRef.current = {
          time: barTime,
          open: price,
          high: price,
          low: price,
          close: price,
        }
      }

      const bar = currentBarRef.current!
      candleSeries.update({
        time: bar.time as Time,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
      })
      lastBarTimeRef.current = bar.time
      setOhlc({ o: bar.open, h: bar.high, l: bar.low, c: bar.close })
    }

    return () => {
      if (liveTradeRef) liveTradeRef.current = null
    }
  }, [liveTradeRef])

  // ── Price lines for pending orders (entry, SL, TP) ──────
  const priceLinesRef = useRef<IPriceLine[]>([])

  useEffect(() => {
    const candleSeries = candleSeriesRef.current
    if (!candleSeries) return

    // Remove existing price lines
    for (const line of priceLinesRef.current) {
      candleSeries.removePriceLine(line)
    }
    priceLinesRef.current = []

    // Filter orders for the active ticker only
    const relevantOrders = pendingOrders.filter(
      (o) => o.symbol === ticker && o.status === "pending"
    )

    for (const order of relevantOrders) {
      // Entry line (blue/primary)
      priceLinesRef.current.push(
        candleSeries.createPriceLine({
          price: order.limitPrice,
          color: "#3b82f6",
          lineWidth: 1,
          lineStyle: 2, // Dashed
          axisLabelVisible: true,
          title: `${order.side === "long" ? "BUY" : "SELL"} @ ${order.limitPrice.toFixed(1)}`,
        })
      )

      // Stop Loss line (red)
      if (order.stopLoss && order.stopLoss > 0) {
        priceLinesRef.current.push(
          candleSeries.createPriceLine({
            price: order.stopLoss,
            color: "#ef4444",
            lineWidth: 1,
            lineStyle: 2,
            axisLabelVisible: true,
            title: "SL",
          })
        )
      }

      // Take Profit line (green)
      if (order.takeProfit && order.takeProfit > 0) {
        priceLinesRef.current.push(
          candleSeries.createPriceLine({
            price: order.takeProfit,
            color: "#22c55e",
            lineWidth: 1,
            lineStyle: 2,
            axisLabelVisible: true,
            title: "TP",
          })
        )
      }
    }
  }, [pendingOrders, ticker])

  // Cleanup feed on unmount
  useEffect(() => {
    return () => {
      feedRef.current.destroy()
    }
  }, [])

  // ── Derive OHLC display color ──
  const priceColor = ohlc
    ? ohlc.c >= ohlc.o
      ? "text-trade-long"
      : "text-trade-short"
    : "text-foreground"

  const fmtPrice = (n: number) =>
    n.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">
      {/* Chart toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border shrink-0 bg-card">
        <span className="font-mono text-xs font-semibold text-foreground">{ticker}</span>
        <div className="w-px h-4 bg-border" />

        {/* Intervals */}
        <div className="flex items-center gap-0.5">
          {INTERVALS.map((iv) => (
            <button
              key={iv}
              onClick={() => setIntervalState(iv)}
              className={cn(
                "px-2 py-0.5 rounded text-[11px] font-mono transition-colors",
                interval === iv
                  ? "bg-primary/20 text-primary font-medium"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {iv}
            </button>
          ))}
        </div>

        <div className="w-px h-4 bg-border" />

        {/* Tool buttons */}
        <div className="flex items-center gap-1">
          {[
            { icon: TrendingUp, label: "Indicadores" },
            { icon: Crosshair, label: "Crosshair" },
            { icon: BarChart2, label: "Tipo de gráfico" },
            { icon: Settings2, label: "Configurações" },
            { icon: Maximize2, label: "Tela cheia" },
          ].map(({ icon: Icon, label }) => (
            <button
              key={label}
              title={label}
              className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              aria-label={label}
            >
              <Icon className="w-3.5 h-3.5" />
            </button>
          ))}
        </div>

        {/* Live OHLC pill */}
        {ohlc && (
          <div className="ml-auto flex items-center gap-3">
            <span className={cn("font-mono text-sm font-bold", priceColor)}>
              {fmtPrice(ohlc.c)}
            </span>
            <div className="text-[10px] font-mono text-muted-foreground">
              O: <span className="text-foreground">{fmtPrice(ohlc.o)}</span>{" "}
              H: <span className="text-trade-long">{fmtPrice(ohlc.h)}</span>{" "}
              L: <span className="text-trade-short">{fmtPrice(ohlc.l)}</span>
            </div>
          </div>
        )}
      </div>

      {/* lightweight-charts container */}
      <div ref={chartContainerRef} className="flex-1 min-h-0" />
    </div>
  )
}
