import { describe, it, expect } from "vitest"
import {
  buildOpenPosition,
  applyOpenPosition,
  revertOpenPosition,
} from "@/lib/trading/open-position-state"
import type { UserBalance } from "@/types/trading"

const baseBalance: UserBalance = {
  available: 5000,
  inPositions: 1000,
  total: 6000,
  currency: "USDT",
}

describe("open-position-state", () => {
  it("buildOpenPosition computes margin and liquidation price", () => {
    const position = buildOpenPosition({
      id: "pos-1",
      symbol: "BTC-PERP",
      side: "long",
      size: 0.1,
      entryPrice: 50000,
      leverage: 10,
    })

    expect(position.margin).toBe(500)
    expect(position.liqPrice).toBeGreaterThan(0)
    expect(position.pnl).toBe(0)
  })

  it("applyOpenPosition deducts margin from available balance", () => {
    const position = buildOpenPosition({
      id: "pos-1",
      symbol: "BTC-PERP",
      side: "long",
      size: 0.1,
      entryPrice: 50000,
      leverage: 10,
    })

    const result = applyOpenPosition([], baseBalance, position)

    expect(result.positions).toHaveLength(1)
    expect(result.userBalance.available).toBe(4500)
    expect(result.userBalance.inPositions).toBe(1500)
    expect(result.userBalance.total).toBe(6000)
  })

  it("revertOpenPosition restores balance after failed persistence", () => {
    const position = buildOpenPosition({
      id: "market-123",
      symbol: "ETH-PERP",
      side: "short",
      size: 1,
      entryPrice: 3000,
      leverage: 5,
    })
    const opened = applyOpenPosition([], baseBalance, position)
    const reverted = revertOpenPosition(opened.positions, opened.userBalance, "market-123")

    expect(reverted.positions).toHaveLength(0)
    expect(reverted.userBalance).toEqual(baseBalance)
  })
})
