// ─────────────────────────────────────────────────────────────
// Domain types for PerpEx Trading Terminal
// ─────────────────────────────────────────────────────────────

/** Supported trading symbols (perpetual futures) */
export type Symbol =
  | "BTC-PERP"
  | "ETH-PERP"
  | "SOL-PERP"
  | "BNB-PERP"
  | "ARB-PERP"
  | "DOGE-PERP"
  | "AVAX-PERP"
  | "LINK-PERP"
  | "OP-PERP"
  | "INJ-PERP"

/** Price direction for flash / color indicators */
export type PriceDirection = "up" | "down" | null

/** Chart time-frame intervals */
export type Interval = "1m" | "5m" | "15m" | "1h" | "4h" | "1D"

/** Order side */
export type OrderSide = "buy" | "sell"

/** Position side */
export type PositionSide = "long" | "short"

/** Order types supported by the execution panel */
export type OrderType = "limit" | "market" | "stop-limit"

// ── Ticker / Market Data ──────────────────────────────────────

export interface TickerData {
  symbol: Symbol
  name: string
  price: number
  change24h: number
  high24h: number
  low24h: number
  volume24h: number
  fundingRate: number
  fundingCountdown: number // seconds until next funding
}

export interface TickerPriceMap {
  [symbol: string]: number
}

// ── Watchlist ─────────────────────────────────────────────────

export interface WatchlistItem {
  symbol: Symbol
  price: number
  change: number
  high24h?: number
  low24h?: number
  volume24h?: number
  sparkline: number[]
  favorite: boolean
}

// ── Order Book ────────────────────────────────────────────────

export interface OrderBookLevel {
  price: number
  size: number
  total: number
  /** Depth percentage 0–100 for the bar visualization */
  depth: number
  flash: PriceDirection
}

export interface OrderBookData {
  asks: OrderBookLevel[]
  bids: OrderBookLevel[]
  markPrice: number
  indexPrice: number
}

// ── Candle / Chart ────────────────────────────────────────────

export interface Candle {
  time: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface ChartDataPoint extends Candle {
  range: [number, number]
  body: [number, number]
  isUp: boolean
}

// ── Orders ────────────────────────────────────────────────────

export interface Order {
  id: number
  symbol: Symbol
  type: string
  side: OrderSide
  price: number
  size: number
  filled: number
  status: string
  time: string
}

export interface ConditionalOrder {
  id: number
  symbol: Symbol
  type: string
  side: OrderSide
  triggerPrice: number
  size: number
  status: string
  time: string
}

// ── Positions ─────────────────────────────────────────────────

export interface Position {
  id: string | number
  symbol: Symbol
  side: PositionSide
  size: number
  entryPrice: number
  markPrice: number
  pnl: number
  pnlPct: number
  leverage: number
  liqPrice: number
  margin: number
}

// ── Trade History ─────────────────────────────────────────────

export type TradeStatus = "CLOSED" | "LIQUIDATED" | "FUNDING"

export interface TradeHistoryEntry {
  id: number | string
  symbol: Symbol
  side: OrderSide
  type: string
  price: number
  size: number
  fee: number
  pnl: number
  status: TradeStatus
  time: string
}

// ── Pending Orders (Limit) ────────────────────────────────────

export interface PendingOrder {
  id: string
  symbol: Symbol
  side: PositionSide
  orderType: "limit" | "stop-limit"
  size: number
  limitPrice: number
  leverage: number
  stopLoss: number | null
  takeProfit: number | null
  status: "pending" | "filled" | "cancelled"
  createdAt: string
}

// ── User Balance ──────────────────────────────────────────────

export interface UserBalance {
  available: number
  inPositions: number
  total: number
  currency: string
}

// ── WebSocket message types (prepared for real integration) ───

export interface WsTickerMessage {
  type: "ticker"
  symbol: string
  price: number
  change24h: number
  high24h: number
  low24h: number
  volume24h: number
}

export interface WsOrderBookMessage {
  type: "orderbook"
  symbol: string
  asks: Array<[number, number]> // [price, size]
  bids: Array<[number, number]>
}

export interface WsTradeMessage {
  type: "trade"
  symbol: string
  price: number
  size: number
  side: OrderSide
  timestamp: number
}

export type WsMessage = WsTickerMessage | WsOrderBookMessage | WsTradeMessage

// ── Connection Health ────────────────────────────────────────

export type ConnectionState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "degraded"

export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN"

// ── Trading Context State ─────────────────────────────────────

export interface TradingState {
  activeSymbol: Symbol
  marketPrice: number
  priceDirection: PriceDirection
  tickerData: TickerData | null
  orderBookData: OrderBookData
  watchlist: WatchlistItem[]
  userBalance: UserBalance
  positions: Position[]
  openOrders: Order[]
  conditionalOrders: ConditionalOrder[]
  tradeHistory: TradeHistoryEntry[]
  pendingOrders: PendingOrder[]
  /** Quick-fill from Order Book click: price + pre-selected side */
  quickFill: { price: number; side: "buy" | "sell" } | null
  /** WebSocket connection state */
  connectionState: ConnectionState
  /** Circuit breaker state for upstream APIs */
  circuitState: CircuitState
}

export interface TradingActions {
  setActiveSymbol: (symbol: Symbol) => void
  updateMarketPrice: (price: number) => void
  updateOrderBook: (data: OrderBookData) => void
  updateWatchlist: (items: WatchlistItem[]) => void
  toggleFavorite: (symbol: Symbol) => void
  setConnectionState: (state: ConnectionState) => void
  setCircuitState: (state: CircuitState) => void
  setPositions: (positions: Position[]) => void
  setUserBalance: (balance: UserBalance) => void
  setTradeHistory: (history: TradeHistoryEntry[]) => void
  setPendingOrders: (orders: PendingOrder[]) => void
  addPendingOrder: (order: PendingOrder) => void
  removePendingOrder: (orderId: string) => void
  setQuickFill: (fill: { price: number; side: "buy" | "sell" } | null) => void
  /** Hydrate full state from Supabase on initial load */
  hydrateState: (patch: Partial<TradingState>) => void
}
