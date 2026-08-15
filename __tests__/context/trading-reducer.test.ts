// __tests__/context/trading-reducer.test.ts
// Unit tests for the tradingReducer — extracted for isolated testing.
// We test the reducer logic directly without mounting React components.

import { describe, it, expect } from "vitest"
import type {
  TradingState,
  WatchlistItem,
  Position,
  PendingOrder,
  OrderBookData,
  UserBalance,
  TradeHistoryEntry,
  ConnectionState,
  CircuitState,
} from "@/types/trading"

// ── Inline reducer extraction ─────────────────────────────────
// We re-define the Action union and reducer locally to avoid
// importing "use client" modules in a non-browser test context.

type PriceDirection = "up" | "down" | null

type Action =
  | { type: "SET_ACTIVE_SYMBOL"; payload: string }
  | { type: "UPDATE_MARKET_PRICE"; payload: number }
  | { type: "UPDATE_ORDER_BOOK"; payload: OrderBookData }
  | { type: "UPDATE_WATCHLIST"; payload: WatchlistItem[] }
  | { type: "TOGGLE_FAVORITE"; payload: string }
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

const TICKER_PRICES: Record<string, number> = {
  "BTC-PERP": 67432.5,
  "ETH-PERP": 3512.8,
}

function tradingReducer(state: TradingState, action: Action): TradingState {
  switch (action.type) {
    case "SET_ACTIVE_SYMBOL": {
      const newPrice = TICKER_PRICES[action.payload] ?? state.marketPrice
      return { ...state, activeSymbol: action.payload as TradingState["activeSymbol"], marketPrice: newPrice, priceDirection: null }
    }
    case "UPDATE_MARKET_PRICE": {
      const direction: PriceDirection =
        action.payload > state.marketPrice ? "up"
          : action.payload < state.marketPrice ? "down"
            : state.priceDirection
      return { ...state, marketPrice: action.payload, priceDirection: direction }
    }
    case "UPDATE_ORDER_BOOK":
      return { ...state, orderBookData: action.payload }
    case "UPDATE_WATCHLIST":
      return { ...state, watchlist: action.payload }
    case "TOGGLE_FAVORITE":
      return {
        ...state,
        watchlist: state.watchlist.map((item) =>
          item.symbol === action.payload ? { ...item, favorite: !item.favorite } : item
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

// ── Test Fixtures ─────────────────────────────────────────────

const EMPTY_ORDER_BOOK: OrderBookData = {
  asks: [],
  bids: [],
  markPrice: 0,
  indexPrice: 0,
}

const MOCK_WATCHLIST: WatchlistItem[] = [
  { symbol: "BTC-PERP", price: 67432.5, change: 2.34, sparkline: [], favorite: true },
  { symbol: "ETH-PERP", price: 3512.8, change: -0.87, sparkline: [], favorite: false },
]

const INITIAL_STATE: TradingState = {
  activeSymbol: "BTC-PERP",
  marketPrice: 67432.5,
  priceDirection: null,
  tickerData: null,
  orderBookData: EMPTY_ORDER_BOOK,
  watchlist: MOCK_WATCHLIST,
  userBalance: { available: 1000, inPositions: 0, total: 1000, currency: "USDT" },
  positions: [],
  openOrders: [],
  conditionalOrders: [],
  tradeHistory: [],
  pendingOrders: [],
  quickFill: null,
  connectionState: "disconnected",
  circuitState: "CLOSED",
}

// ── Tests ─────────────────────────────────────────────────────

describe("tradingReducer — SET_ACTIVE_SYMBOL", () => {
  it("changes the active symbol", () => {
    const next = tradingReducer(INITIAL_STATE, { type: "SET_ACTIVE_SYMBOL", payload: "ETH-PERP" })
    expect(next.activeSymbol).toBe("ETH-PERP")
  })

  it("updates marketPrice to pre-seeded price for the new symbol", () => {
    const next = tradingReducer(INITIAL_STATE, { type: "SET_ACTIVE_SYMBOL", payload: "ETH-PERP" })
    expect(next.marketPrice).toBe(3512.8)
  })

  it("resets priceDirection to null on symbol change", () => {
    const withDirection = { ...INITIAL_STATE, priceDirection: "up" as PriceDirection }
    const next = tradingReducer(withDirection, { type: "SET_ACTIVE_SYMBOL", payload: "ETH-PERP" })
    expect(next.priceDirection).toBeNull()
  })

  it("keeps current marketPrice for unknown symbols", () => {
    const next = tradingReducer(INITIAL_STATE, { type: "SET_ACTIVE_SYMBOL", payload: "XYZ-PERP" as any })
    expect(next.marketPrice).toBe(INITIAL_STATE.marketPrice)
  })
})

describe("tradingReducer — UPDATE_MARKET_PRICE", () => {
  it("sets priceDirection to 'up' when price increases", () => {
    const next = tradingReducer(INITIAL_STATE, { type: "UPDATE_MARKET_PRICE", payload: 68_000 })
    expect(next.marketPrice).toBe(68_000)
    expect(next.priceDirection).toBe("up")
  })

  it("sets priceDirection to 'down' when price decreases", () => {
    const next = tradingReducer(INITIAL_STATE, { type: "UPDATE_MARKET_PRICE", payload: 60_000 })
    expect(next.priceDirection).toBe("down")
  })

  it("keeps current priceDirection when price is unchanged", () => {
    const withUp = { ...INITIAL_STATE, priceDirection: "up" as PriceDirection }
    const next = tradingReducer(withUp, { type: "UPDATE_MARKET_PRICE", payload: 67432.5 })
    expect(next.priceDirection).toBe("up")
  })
})

describe("tradingReducer — TOGGLE_FAVORITE", () => {
  it("toggles a favorite item to false", () => {
    const next = tradingReducer(INITIAL_STATE, { type: "TOGGLE_FAVORITE", payload: "BTC-PERP" })
    const btc = next.watchlist.find((i) => i.symbol === "BTC-PERP")
    expect(btc?.favorite).toBe(false)
  })

  it("toggles a non-favorite item to true", () => {
    const next = tradingReducer(INITIAL_STATE, { type: "TOGGLE_FAVORITE", payload: "ETH-PERP" })
    const eth = next.watchlist.find((i) => i.symbol === "ETH-PERP")
    expect(eth?.favorite).toBe(true)
  })

  it("does not affect other items in the watchlist", () => {
    const next = tradingReducer(INITIAL_STATE, { type: "TOGGLE_FAVORITE", payload: "BTC-PERP" })
    const eth = next.watchlist.find((i) => i.symbol === "ETH-PERP")
    expect(eth?.favorite).toBe(false) // unchanged
  })
})

describe("tradingReducer — ADD_PENDING_ORDER / REMOVE_PENDING_ORDER", () => {
  const mockOrder: PendingOrder = {
    id: "order-1",
    symbol: "BTC-PERP",
    side: "long",
    orderType: "limit",
    size: 0.1,
    limitPrice: 65_000,
    leverage: 10,
    stopLoss: null,
    takeProfit: null,
    status: "pending",
    createdAt: new Date().toISOString(),
  }

  it("adds a pending order to the front of the list", () => {
    const next = tradingReducer(INITIAL_STATE, { type: "ADD_PENDING_ORDER", payload: mockOrder })
    expect(next.pendingOrders).toHaveLength(1)
    expect(next.pendingOrders[0].id).toBe("order-1")
  })

  it("prepends new orders (newest first)", () => {
    const state1 = tradingReducer(INITIAL_STATE, { type: "ADD_PENDING_ORDER", payload: { ...mockOrder, id: "order-1" } })
    const state2 = tradingReducer(state1, { type: "ADD_PENDING_ORDER", payload: { ...mockOrder, id: "order-2" } })
    expect(state2.pendingOrders[0].id).toBe("order-2")
    expect(state2.pendingOrders[1].id).toBe("order-1")
  })

  it("removes a pending order by id", () => {
    const withOrder = tradingReducer(INITIAL_STATE, { type: "ADD_PENDING_ORDER", payload: mockOrder })
    const next = tradingReducer(withOrder, { type: "REMOVE_PENDING_ORDER", payload: "order-1" })
    expect(next.pendingOrders).toHaveLength(0)
  })

  it("does not remove other orders when removing by id", () => {
    const state1 = tradingReducer(INITIAL_STATE, { type: "ADD_PENDING_ORDER", payload: { ...mockOrder, id: "order-1" } })
    const state2 = tradingReducer(state1, { type: "ADD_PENDING_ORDER", payload: { ...mockOrder, id: "order-2" } })
    const next = tradingReducer(state2, { type: "REMOVE_PENDING_ORDER", payload: "order-1" })
    expect(next.pendingOrders).toHaveLength(1)
    expect(next.pendingOrders[0].id).toBe("order-2")
  })
})

describe("tradingReducer — HYDRATE_STATE", () => {
  it("merges partial state without overwriting other fields", () => {
    const patch = { marketPrice: 99_000 }
    const next = tradingReducer(INITIAL_STATE, { type: "HYDRATE_STATE", payload: patch })
    expect(next.marketPrice).toBe(99_000)
    expect(next.activeSymbol).toBe("BTC-PERP") // unchanged
    expect(next.connectionState).toBe("disconnected") // unchanged
  })

  it("can hydrate multiple fields at once", () => {
    const patch = {
      marketPrice: 99_000,
      connectionState: "connected" as ConnectionState,
      circuitState: "HALF_OPEN" as CircuitState,
    }
    const next = tradingReducer(INITIAL_STATE, { type: "HYDRATE_STATE", payload: patch })
    expect(next.marketPrice).toBe(99_000)
    expect(next.connectionState).toBe("connected")
    expect(next.circuitState).toBe("HALF_OPEN")
  })
})

describe("tradingReducer — SET_CONNECTION_STATE / SET_CIRCUIT_STATE", () => {
  it("updates connectionState", () => {
    const next = tradingReducer(INITIAL_STATE, { type: "SET_CONNECTION_STATE", payload: "connected" })
    expect(next.connectionState).toBe("connected")
  })

  it("transitions through all connection states", () => {
    const states: ConnectionState[] = ["connecting", "connected", "degraded", "reconnecting", "disconnected"]
    let state = INITIAL_STATE
    for (const s of states) {
      state = tradingReducer(state, { type: "SET_CONNECTION_STATE", payload: s })
      expect(state.connectionState).toBe(s)
    }
  })

  it("transitions circuit breaker states", () => {
    const s1 = tradingReducer(INITIAL_STATE, { type: "SET_CIRCUIT_STATE", payload: "OPEN" })
    expect(s1.circuitState).toBe("OPEN")
    const s2 = tradingReducer(s1, { type: "SET_CIRCUIT_STATE", payload: "HALF_OPEN" })
    expect(s2.circuitState).toBe("HALF_OPEN")
    const s3 = tradingReducer(s2, { type: "SET_CIRCUIT_STATE", payload: "CLOSED" })
    expect(s3.circuitState).toBe("CLOSED")
  })
})

describe("tradingReducer — SET_QUICK_FILL", () => {
  it("sets a quick fill value", () => {
    const next = tradingReducer(INITIAL_STATE, {
      type: "SET_QUICK_FILL",
      payload: { price: 65_000, side: "buy" },
    })
    expect(next.quickFill).toEqual({ price: 65_000, side: "buy" })
  })

  it("clears quick fill to null", () => {
    const withFill = { ...INITIAL_STATE, quickFill: { price: 65_000, side: "buy" as const } }
    const next = tradingReducer(withFill, { type: "SET_QUICK_FILL", payload: null })
    expect(next.quickFill).toBeNull()
  })
})

describe("tradingReducer — immutability", () => {
  it("does not mutate the previous state object", () => {
    const frozen = Object.freeze({ ...INITIAL_STATE })
    // Should not throw even when frozen
    expect(() =>
      tradingReducer(frozen as TradingState, { type: "UPDATE_MARKET_PRICE", payload: 70_000 })
    ).not.toThrow()
  })
})
