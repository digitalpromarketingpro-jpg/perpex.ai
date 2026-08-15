"use client"

import {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useMemo,
  type ReactNode,
} from "react"
import type {
  Symbol,
  PriceDirection,
  TickerData,
  OrderBookData,
  OrderBookLevel,
  WatchlistItem,
  UserBalance,
  Position,
  Order,
  ConditionalOrder,
  TradeHistoryEntry,
  PendingOrder,
  TradingState,
  TradingActions,
  ConnectionState,
  CircuitState,
} from "@/types/trading"

// ── Default / Initial Values ──────────────────────────────────

const DEFAULT_SYMBOL: Symbol = "BTC-PERP"

const DEFAULT_BALANCE: UserBalance = {
  available: 0,
  inPositions: 0,
  total: 0,
  currency: "USDT",
}

const EMPTY_ORDER_BOOK: OrderBookData = {
  asks: [],
  bids: [],
  markPrice: 0,
  indexPrice: 0,
}

const INITIAL_WATCHLIST: WatchlistItem[] = [
  { symbol: "BTC-PERP", price: 67432.5, change: 2.34, sparkline: Array(20).fill(67000), favorite: true },
  { symbol: "ETH-PERP", price: 3512.8, change: -0.87, sparkline: Array(20).fill(3500), favorite: true },
  { symbol: "SOL-PERP", price: 178.42, change: 4.12, sparkline: Array(20).fill(175), favorite: true },
  { symbol: "BNB-PERP", price: 582.1, change: 1.05, sparkline: Array(20).fill(580), favorite: false },
  { symbol: "ARB-PERP", price: 1.234, change: -2.01, sparkline: Array(20).fill(1.2), favorite: false },
  { symbol: "DOGE-PERP", price: 0.1782, change: 3.45, sparkline: Array(20).fill(0.17), favorite: false },
  { symbol: "AVAX-PERP", price: 39.21, change: -1.22, sparkline: Array(20).fill(39), favorite: false },
  { symbol: "LINK-PERP", price: 17.85, change: 0.98, sparkline: Array(20).fill(17.5), favorite: false },
  { symbol: "OP-PERP", price: 2.541, change: -3.12, sparkline: Array(20).fill(2.5), favorite: false },
  { symbol: "INJ-PERP", price: 24.82, change: 5.67, sparkline: Array(20).fill(23), favorite: false },
]

const INITIAL_POSITIONS: Position[] = []

const INITIAL_ORDERS: Order[] = []

const INITIAL_CONDITIONAL: ConditionalOrder[] = []

const INITIAL_HISTORY: TradeHistoryEntry[] = []

const TICKER_PRICES: Record<string, number> = {
  "BTC-PERP": 67432.5,
  "ETH-PERP": 3512.8,
  "SOL-PERP": 178.42,
  "BNB-PERP": 582.1,
  "ARB-PERP": 1.234,
  "DOGE-PERP": 0.1782,
  "AVAX-PERP": 39.21,
  "LINK-PERP": 17.85,
  "OP-PERP": 2.541,
  "INJ-PERP": 24.82,
}

// ── Reducer ───────────────────────────────────────────────────

type Action =
  | { type: "SET_ACTIVE_SYMBOL"; payload: Symbol }
  | { type: "UPDATE_MARKET_PRICE"; payload: number }
  | { type: "UPDATE_ORDER_BOOK"; payload: OrderBookData }
  | { type: "UPDATE_WATCHLIST"; payload: WatchlistItem[] }
  | { type: "TOGGLE_FAVORITE"; payload: Symbol }
  | { type: "SET_CONNECTION_STATE"; payload: ConnectionState }
  | { type: "SET_CIRCUIT_STATE"; payload: CircuitState }
  | { type: "SET_POSITIONS"; payload: Position[] }
  | { type: "SET_USER_BALANCE"; payload: UserBalance }
  | { type: "SET_TRADE_HISTORY"; payload: TradeHistoryEntry[] }
  | { type: "SET_PENDING_ORDERS"; payload: PendingOrder[] }
  | { type: "ADD_PENDING_ORDER"; payload: PendingOrder }
  | { type: "REMOVE_PENDING_ORDER"; payload: string }
  | { type: "SET_QUICK_FILL"; payload: { price: number; side: "buy" | "sell" } | null }
  | { type: "HYDRATE_STATE"; payload: Partial<TradingState> }

const initialState: TradingState = {
  activeSymbol: DEFAULT_SYMBOL,
  marketPrice: TICKER_PRICES[DEFAULT_SYMBOL],
  priceDirection: null,
  tickerData: null,
  orderBookData: EMPTY_ORDER_BOOK,
  watchlist: INITIAL_WATCHLIST,
  userBalance: DEFAULT_BALANCE,
  positions: INITIAL_POSITIONS,
  openOrders: INITIAL_ORDERS,
  conditionalOrders: INITIAL_CONDITIONAL,
  tradeHistory: INITIAL_HISTORY,
  pendingOrders: [],
  quickFill: null,
  connectionState: "disconnected" as ConnectionState,
  circuitState: "CLOSED" as CircuitState,
}

function tradingReducer(state: TradingState, action: Action): TradingState {
  switch (action.type) {
    case "SET_ACTIVE_SYMBOL": {
      const newPrice = TICKER_PRICES[action.payload] ?? state.marketPrice
      return {
        ...state,
        activeSymbol: action.payload,
        marketPrice: newPrice,
        priceDirection: null,
      }
    }
    case "UPDATE_MARKET_PRICE": {
      const direction: PriceDirection =
        action.payload > state.marketPrice
          ? "up"
          : action.payload < state.marketPrice
            ? "down"
            : state.priceDirection
      return {
        ...state,
        marketPrice: action.payload,
        priceDirection: direction,
      }
    }
    case "UPDATE_ORDER_BOOK":
      return { ...state, orderBookData: action.payload }
    case "UPDATE_WATCHLIST":
      return { ...state, watchlist: action.payload }
    case "TOGGLE_FAVORITE":
      return {
        ...state,
        watchlist: state.watchlist.map((item) =>
          item.symbol === action.payload
            ? { ...item, favorite: !item.favorite }
            : item
        ),
      }
    case "SET_CONNECTION_STATE":
      return { ...state, connectionState: action.payload }
    case "SET_CIRCUIT_STATE":
      return { ...state, circuitState: action.payload }
    case "SET_POSITIONS":
      return { ...state, positions: action.payload }
    case "SET_USER_BALANCE":
      return { ...state, userBalance: action.payload }
    case "SET_TRADE_HISTORY":
      return { ...state, tradeHistory: action.payload }
    case "SET_PENDING_ORDERS":
      return { ...state, pendingOrders: action.payload }
    case "ADD_PENDING_ORDER":
      return { ...state, pendingOrders: [action.payload, ...state.pendingOrders] }
    case "REMOVE_PENDING_ORDER":
      return { ...state, pendingOrders: state.pendingOrders.filter((o) => o.id !== action.payload) }
    case "SET_QUICK_FILL":
      return { ...state, quickFill: action.payload }
    case "HYDRATE_STATE":
      return { ...state, ...action.payload }
    default:
      return state
  }
}

// ── Context ───────────────────────────────────────────────────

interface TradingContextValue {
  state: TradingState
  actions: TradingActions
}

const TradingContext = createContext<TradingContextValue | null>(null)

// ── Provider ──────────────────────────────────────────────────

export function TradingProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(tradingReducer, initialState)

  const setActiveSymbol = useCallback(
    (symbol: Symbol) => dispatch({ type: "SET_ACTIVE_SYMBOL", payload: symbol }),
    []
  )

  const updateMarketPrice = useCallback(
    (price: number) => dispatch({ type: "UPDATE_MARKET_PRICE", payload: price }),
    []
  )

  const updateOrderBook = useCallback(
    (data: OrderBookData) => dispatch({ type: "UPDATE_ORDER_BOOK", payload: data }),
    []
  )

  const updateWatchlist = useCallback(
    (items: WatchlistItem[]) => dispatch({ type: "UPDATE_WATCHLIST", payload: items }),
    []
  )

  const toggleFavorite = useCallback(
    (symbol: Symbol) => dispatch({ type: "TOGGLE_FAVORITE", payload: symbol }),
    []
  )

  const setConnectionState = useCallback(
    (connState: ConnectionState) => dispatch({ type: "SET_CONNECTION_STATE", payload: connState }),
    []
  )

  const setCircuitState = useCallback(
    (circuitState: CircuitState) => dispatch({ type: "SET_CIRCUIT_STATE", payload: circuitState }),
    []
  )

  const setPositions = useCallback(
    (positions: Position[]) => dispatch({ type: "SET_POSITIONS", payload: positions }),
    []
  )

  const setUserBalance = useCallback(
    (balance: UserBalance) => dispatch({ type: "SET_USER_BALANCE", payload: balance }),
    []
  )

  const setTradeHistory = useCallback(
    (history: TradeHistoryEntry[]) => dispatch({ type: "SET_TRADE_HISTORY", payload: history }),
    []
  )

  const setPendingOrders = useCallback(
    (orders: PendingOrder[]) => dispatch({ type: "SET_PENDING_ORDERS", payload: orders }),
    []
  )

  const addPendingOrder = useCallback(
    (order: PendingOrder) => dispatch({ type: "ADD_PENDING_ORDER", payload: order }),
    []
  )

  const removePendingOrder = useCallback(
    (orderId: string) => dispatch({ type: "REMOVE_PENDING_ORDER", payload: orderId }),
    []
  )

  const setQuickFill = useCallback(
    (fill: { price: number; side: "buy" | "sell" } | null) =>
      dispatch({ type: "SET_QUICK_FILL", payload: fill }),
    []
  )

  const hydrateState = useCallback(
    (patch: Partial<TradingState>) => dispatch({ type: "HYDRATE_STATE", payload: patch }),
    []
  )

  const actions = useMemo<TradingActions>(
    () => ({
      setActiveSymbol,
      updateMarketPrice,
      updateOrderBook,
      updateWatchlist,
      toggleFavorite,
      setConnectionState,
      setCircuitState,
      setPositions,
      setUserBalance,
      setTradeHistory,
      setPendingOrders,
      addPendingOrder,
      removePendingOrder,
      setQuickFill,
      hydrateState,
    }),
    [setActiveSymbol, updateMarketPrice, updateOrderBook, updateWatchlist, toggleFavorite, setConnectionState, setCircuitState, setPositions, setUserBalance, setTradeHistory, setPendingOrders, addPendingOrder, removePendingOrder, setQuickFill, hydrateState]
  )

  const value = useMemo<TradingContextValue>(
    () => ({ state, actions }),
    [state, actions]
  )

  return (
    <TradingContext.Provider value={value}>
      {children}
    </TradingContext.Provider>
  )
}

// ── Hook ──────────────────────────────────────────────────────

export function useTrading(): TradingContextValue {
  const ctx = useContext(TradingContext)
  if (!ctx) {
    throw new Error("useTrading must be used within a <TradingProvider>")
  }
  return ctx
}
